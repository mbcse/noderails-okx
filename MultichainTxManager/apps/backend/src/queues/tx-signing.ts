import { Queue, Worker, type Job } from "bullmq";
import {
  getQueueConnection,
  getWorkerConnection,
  QUEUE_NAMES,
  DEFAULT_JOB_OPTIONS,
  WORKER_CONCURRENCY,
} from "./connection.js";
import { prisma } from "../config/database.js";
import { createKeyAdapter } from "../adapters/index.js";
import { nonceManager } from "../services/nonce-manager.js";
import { addressPool } from "../services/address-pool.js";
import { rpcManager } from "../services/rpc-manager.js";
import { solanaRpcManager } from "../services/solana-rpc-manager.js";
import { suiRpcManager } from "../services/sui-rpc-manager.js";
import {
  assertSingleSuiSigner,
  buildMoveCallTx,
  buildNativeSuiTransferTx,
  parseSuiAmountToMist,
  parseSuiTransactionBase64,
  serializeSignedSuiTx,
  signSuiTransaction,
} from "../lib/sui-transaction.js";
import { keypairFromEncodedSecret as suiKeypairFromEncodedSecret } from "../lib/sui.js";
import type { SuiMoveCall } from "../lib/sui-transaction.js";
import { webhookService } from "../services/webhook.service.js";
import { fundingService } from "../services/funding.service.js";
import { logger } from "../lib/logger.js";
import { txBroadcastingQueue } from "./tx-broadcasting.js";
import { decrypt } from "../lib/crypto.js";
import { keypairFromEncodedSecret } from "../lib/solana.js";
import { assertSingleSolanaSigner, parseSolanaTransactionBase64 } from "../lib/solana-transaction.js";
import {
  ComputeBudgetProgram,
  PublicKey,
  SystemProgram,
  Transaction as SolanaTransaction,
  TransactionInstruction,
} from "@solana/web3.js";

// ────────────────────────────────────────────────────────────
// tx-signing queue — signs raw transactions
// ────────────────────────────────────────────────────────────

const FILECOIN_MIN_GAS_LIMIT = 800000n;

function parseSolValueToLamports(raw: string): bigint {
  const trimmed = (raw ?? "0").trim();
  if (trimmed === "") return 0n;
  if (!trimmed.includes(".")) return BigInt(trimmed);
  const [whole = "0", frac = ""] = trimmed.split(".");
  const padded = frac.padEnd(9, "0").slice(0, 9);
  return BigInt(whole) * 10n ** 9n + BigInt(padded || "0");
}

function maxBigInt(a: bigint, b: bigint): bigint {
  return a > b ? a : b;
}

function isFilecoinChain(chain: { name: string; chainId: number; rpcUrls: string[] }): boolean {
  const name = chain.name.toLowerCase();
  if (name.includes("filecoin") || name.includes("calibration")) return true;
  if (chain.chainId === 314159 || chain.chainId === 314) return true;
  return chain.rpcUrls.some((u) => {
    const lower = u.toLowerCase();
    return lower.includes("filecoin") || lower.includes("calibration");
  });
}

/** Detect on-chain revert errors from estimateGas — no point retrying these. */
function isRevertError(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  const msg = err.message.toLowerCase();
  const code = (err as any).code;
  return (
    code === "CALL_EXCEPTION" ||
    code === "UNPREDICTABLE_GAS_LIMIT" ||
    msg.includes("execution reverted") ||
    msg.includes("revert") ||
    msg.includes("always failing transaction")
  );
}

/** Detect "insufficient funds" errors — the signer can't afford gas. */
function isInsufficientFundsError(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  const msg = err.message.toLowerCase();
  return msg.includes("insufficient funds") || msg.includes("insufficient balance");
}

export interface TxSigningJobData {
  transactionId: string;
}

export const txSigningQueue = new Queue<TxSigningJobData, unknown, string>(
  QUEUE_NAMES.TX_SIGNING,
  { connection: getQueueConnection(), defaultJobOptions: DEFAULT_JOB_OPTIONS },
);

export function startTxSigningWorker(): Worker<TxSigningJobData> {
  const worker = new Worker<TxSigningJobData>(
    QUEUE_NAMES.TX_SIGNING,
    async (job: Job<TxSigningJobData>) => {
      const { transactionId } = job.data;
      const log = logger.child({ queue: "tx-signing", transactionId, jobId: job.id });

      // 1. Load transaction
      const tx = await prisma.transaction.findUniqueOrThrow({
        where: { id: transactionId },
        include: { signer: true, chain: true },
      });

      // Skip if already past QUEUED (idempotency guard for retries)
      if (tx.status !== "QUEUED" && tx.status !== "SIGNING") {
        log.info({ status: tx.status }, "Transaction not in signable state, skipping");
        return;
      }

      log.info("Signing transaction");

      const updatedTx = await prisma.transaction.update({
        where: { id: transactionId },
        data: { status: "SIGNING" },
      });

      // Emit webhook for SIGNING status
      await webhookService.emitEvent("tx.signing", updatedTx);

      let nonce: number | undefined;
      let signerAddress: string | undefined;

      try {
        // 2. Resolve signer (already assigned at tx creation via round-robin)
        const signerKey = tx.signer;
        signerAddress = signerKey.address;

        // ── SOLANA path ─────────────────────────────────────────────
        if (tx.chain.chainType === "SOLANA") {
          if (signerKey.adapterType !== "ENV") {
            const failedTx = await prisma.transaction.update({
              where: { id: transactionId },
              data: { status: "FAILED", errorMessage: "SOLANA queued tx supports ENV signers only" },
            });
            await webhookService.emitEvent("tx.failed", failedTx);
            return;
          }
          if (!signerKey.encryptedKey) {
            const failedTx = await prisma.transaction.update({
              where: { id: transactionId },
              data: { status: "FAILED", errorMessage: "Signer is missing encryptedKey" },
            });
            await webhookService.emitEvent("tx.failed", failedTx);
            return;
          }

          const connection = await solanaRpcManager.getConnection(tx.chainId);

          const fromPubkey = new PublicKey(signerKey.address);

          // Advanced raw tx mode: sign the provided unsigned transaction bytes.
          if (tx.solanaRawTransactionBase64) {
            const parsed = parseSolanaTransactionBase64(tx.solanaRawTransactionBase64);
            assertSingleSolanaSigner(parsed, fromPubkey);

            const keypair = keypairFromEncodedSecret(decrypt(signerKey.encryptedKey));
            let serialized: Buffer;

            if (parsed.kind === "versioned") {
              parsed.tx.sign([keypair]);
              serialized = Buffer.from(parsed.tx.serialize());
            } else {
              parsed.tx.partialSign(keypair);
              serialized = Buffer.from(parsed.tx.serialize());
            }

            if (serialized.length > 1232) {
              throw new Error(
                `SOLANA transaction too large (${serialized.length} bytes). Maximum packet size is ~1232 bytes.`,
              );
            }

            const signedB64 = serialized.toString("base64");

            const signedTx = await prisma.transaction.update({
              where: { id: transactionId },
              data: {
                status: "SIGNED",
                signedData: signedB64,
                receipt: { rawTransaction: true } as any,
              },
            });

            log.info({ signer: signerAddress }, "SOLANA raw transaction signed");
            await webhookService.emitEvent("tx.signed", signedTx);
            await txBroadcastingQueue.add("broadcast", { transactionId });
            return;
          }

          const solTx = new SolanaTransaction();

          // Optional compute budget config for program txs
          if (tx.solanaCuLimit != null) {
            solTx.add(ComputeBudgetProgram.setComputeUnitLimit({ units: tx.solanaCuLimit }));
          }
          if (tx.solanaCuPriceMicroLamports != null) {
            solTx.add(
              ComputeBudgetProgram.setComputeUnitPrice({ microLamports: tx.solanaCuPriceMicroLamports }),
            );
          }

          if (tx.solanaInstructions) {
            const ixs = tx.solanaInstructions as Array<{
              programId: string;
              keys: Array<{ pubkey: string; isSigner: boolean; isWritable: boolean }>;
              dataBase64?: string;
            }>;

            for (const [idx, ix] of ixs.entries()) {
              const programId = new PublicKey(ix.programId);
              const keys = ix.keys.map((k) => ({
                pubkey: new PublicKey(k.pubkey),
                isSigner: k.isSigner,
                isWritable: k.isWritable,
              }));

              // Safety: only allow the assigned signer to be a signer.
              for (const k of keys) {
                if (k.isSigner && !k.pubkey.equals(fromPubkey)) {
                  throw new Error(
                    `SOLANA queued tx supports single-signer only (unexpected signer in instruction ${idx})`,
                  );
                }
              }

              const data = ix.dataBase64 ? Buffer.from(ix.dataBase64, "base64") : Buffer.alloc(0);

              solTx.add(
                new TransactionInstruction({
                  programId,
                  keys,
                  data,
                }),
              );
            }
          } else {
            // Native SOL transfer fallback (legacy behavior)
            const toPubkey = new PublicKey(tx.to);
            const lamports = parseSolValueToLamports(tx.value || "0");
            if (lamports < 0n) throw new Error("Value must be non-negative");
            if (lamports > BigInt(Number.MAX_SAFE_INTEGER)) {
              throw new Error("SOLANA lamports value too large");
            }

            solTx.add(
              SystemProgram.transfer({
                fromPubkey,
                toPubkey,
                lamports: Number(lamports),
              }),
            );
          }

          const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash("confirmed");
          solTx.recentBlockhash = blockhash;
          solTx.feePayer = fromPubkey;

          const keypair = keypairFromEncodedSecret(decrypt(signerKey.encryptedKey));
          solTx.sign(keypair);

          const serialized = solTx.serialize();
          // Legacy tx size limit is ~1232 bytes. If we exceed this, we need v0 + address lookup tables.
          if (serialized.length > 1232) {
            throw new Error(
              `SOLANA transaction too large (${serialized.length} bytes). v0/address lookup tables not supported yet.`,
            );
          }
          const signedB64 = Buffer.from(serialized).toString("base64");

          const signedTx = await prisma.transaction.update({
            where: { id: transactionId },
            data: {
              status: "SIGNED",
              signedData: signedB64,
              // Store blockhash context in receipt for debugging/expiry handling
              receipt: { blockhash, lastValidBlockHeight } as any,
            },
          });

          log.info({ signer: signerAddress }, "SOLANA transaction signed");
          await webhookService.emitEvent("tx.signed", signedTx);
          await txBroadcastingQueue.add("broadcast", { transactionId });
          return;
        }

        // ── SUI path ────────────────────────────────────────────────
        if (tx.chain.chainType === "SUI") {
          if (signerKey.adapterType !== "ENV") {
            const failedTx = await prisma.transaction.update({
              where: { id: transactionId },
              data: { status: "FAILED", errorMessage: "SUI queued tx supports ENV signers only" },
            });
            await webhookService.emitEvent("tx.failed", failedTx);
            return;
          }
          if (!signerKey.encryptedKey) {
            const failedTx = await prisma.transaction.update({
              where: { id: transactionId },
              data: { status: "FAILED", errorMessage: "Signer is missing encryptedKey" },
            });
            await webhookService.emitEvent("tx.failed", failedTx);
            return;
          }

          const client = await suiRpcManager.getClient(tx.chainId);
          const keypair = suiKeypairFromEncodedSecret(decrypt(signerKey.encryptedKey));
          const gasBudget = tx.suiGasBudget ? BigInt(tx.suiGasBudget) : undefined;
          const gasPrice = tx.suiGasPrice ? BigInt(tx.suiGasPrice) : undefined;

          let suiTx;

          if (tx.suiRawTransactionBase64) {
            suiTx = parseSuiTransactionBase64(tx.suiRawTransactionBase64);
            const txData = suiTx.getData();
            const sender = txData.sender ?? signerKey.address;
            const gasOwner = txData.gasData?.owner;
            if (gasOwner && gasOwner.toLowerCase() !== sender.toLowerCase()) {
              const failedTx = await prisma.transaction.update({
                where: { id: transactionId },
                data: {
                  status: "FAILED",
                  errorMessage: "SUI sponsored transactions must use sponsor-sign / execute-sponsored endpoints",
                },
              });
              await webhookService.emitEvent("tx.failed", failedTx);
              return;
            }
            assertSingleSuiSigner(suiTx, signerKey.address);
          } else if (tx.suiMoveCalls) {
            suiTx = buildMoveCallTx({
              sender: signerKey.address,
              moveCalls: tx.suiMoveCalls as unknown as SuiMoveCall[],
              gasBudget,
              gasPrice,
            });
          } else {
            const amountMist = parseSuiAmountToMist(tx.value || "0");
            suiTx = buildNativeSuiTransferTx({
              sender: signerKey.address,
              recipient: tx.to,
              amountMist,
              gasBudget,
              gasPrice,
            });
          }

          const signed = await signSuiTransaction(suiTx, client, keypair);

          const signedTx = await prisma.transaction.update({
            where: { id: transactionId },
            data: {
              status: "SIGNED",
              signedData: serializeSignedSuiTx(signed),
            },
          });

          log.info({ signer: signerAddress }, "SUI transaction signed");
          await webhookService.emitEvent("tx.signed", signedTx);
          await txBroadcastingQueue.add("broadcast", { transactionId });
          return;
        }

        // 3. Acquire nonce atomically from Redis
        nonce = await nonceManager.acquire(tx.chainId, signerAddress);

        // 4. Build unsigned tx
        const rawValue = tx.value || "0";
        // Safety: if the value contains a decimal point, treat it as ETH and convert to wei
        const valueBigInt = rawValue.includes(".")
          ? (() => {
              const [whole = "0", frac = ""] = rawValue.split(".");
              const padded = frac.padEnd(18, "0").slice(0, 18);
              return BigInt(whole) * 10n ** 18n + BigInt(padded);
            })()
          : BigInt(rawValue);

        const unsignedTx: Record<string, unknown> = {
          from: signerAddress,
          to: tx.to,
          value: valueBigInt,
          data: tx.data || undefined,
          nonce,
          chainId: tx.chain.chainId,
          gasLimit: tx.gasLimit ? BigInt(tx.gasLimit) : undefined,
        };

        const filecoinChain = isFilecoinChain(tx.chain);

        // 5. Resolve gas pricing — use DB values if present, otherwise fetch from network
        if (tx.maxFeePerGas) {
          unsignedTx.maxFeePerGas = BigInt(tx.maxFeePerGas);
          unsignedTx.maxPriorityFeePerGas = BigInt(tx.maxPriorityFeePerGas || "0");
          unsignedTx.type = 2;
        } else {
          const feeData = await rpcManager.callWithFailover(
            tx.chainId,
            (p) => p.getFeeData(),
            "getFeeData",
          );

          if (feeData.maxFeePerGas != null) {
            // EIP-1559 chain — add 20% buffer to base fee
            unsignedTx.maxFeePerGas =
              (feeData.maxFeePerGas * 120n) / 100n;
            unsignedTx.maxPriorityFeePerGas =
              feeData.maxPriorityFeePerGas ?? 1_500_000_000n; // 1.5 gwei default tip
            unsignedTx.type = 2;
          } else if (feeData.gasPrice != null) {
            // Legacy chain — add 20% buffer
            unsignedTx.gasPrice = (feeData.gasPrice * 120n) / 100n;
          }
        }

        // 6. Estimate gas if not provided (with failover)
        if (!unsignedTx.gasLimit) {
          try {
            const estimated = await rpcManager.callWithFailover(
              tx.chainId,
              (p) => p.estimateGas(unsignedTx),
              "estimateGas",
            );
            unsignedTx.gasLimit = (estimated * 120n) / 100n; // 20% buffer
            if (filecoinChain) {
              unsignedTx.gasLimit = maxBigInt(unsignedTx.gasLimit as bigint, FILECOIN_MIN_GAS_LIMIT);
            }
          } catch (estErr) {
            if (isRevertError(estErr)) {
              // Transaction will always revert — fail immediately, don't retry
              if (nonce !== undefined && signerAddress) {
                await nonceManager.release(tx.chainId, signerAddress);
              }
              const revertMsg = `Gas estimation reverted — transaction will always fail: ${(estErr as Error).message}`;
              log.warn({ err: estErr }, revertMsg);
              const failedTx = await prisma.transaction.update({
                where: { id: transactionId },
                data: { status: "FAILED", errorMessage: revertMsg },
              });
              await webhookService.emitEvent("tx.failed", failedTx);
              return; // Don't throw — skip BullMQ retries
            }
            throw estErr; // Non-revert errors (RPC down, timeout) → normal retry
          }
        } else if (filecoinChain) {
          // Even user-supplied gas limits must satisfy Filecoin minimum storage cost.
          unsignedTx.gasLimit = maxBigInt(unsignedTx.gasLimit as bigint, FILECOIN_MIN_GAS_LIMIT);
        }

        // 6. Sign (needs a provider for the adapter)
        const provider = await rpcManager.getProvider(tx.chainId);
        const adapter = createKeyAdapter(signerKey, provider);

        // Redact encrypted key from the loaded object AFTER adapter creation
        // to prevent accidental logging in error paths below.
        (tx.signer as any).encryptedKey = "[REDACTED]";

        const signedTxHex = await adapter.signTransaction(unsignedTx);

        // 7. Update DB — store signed hex in `signedData`, preserve original `data`
        const signedTx = await prisma.transaction.update({
          where: { id: transactionId },
          data: {
            status: "SIGNED",
            nonce,
            signedData: signedTxHex,
          },
        });

        log.info({ nonce, signer: signerAddress }, "Transaction signed");

        await webhookService.emitEvent("tx.signed", signedTx);

        // 8. Enqueue for broadcasting
        await txBroadcastingQueue.add("broadcast", { transactionId });
      } catch (err) {
        // Release nonce on failure — use the local signerAddress variable
        if (tx.chain.chainType !== "SOLANA" && tx.chain.chainType !== "SUI" && nonce !== undefined && signerAddress) {
          await nonceManager.release(tx.chainId, signerAddress);
        }

        // Reactive funding: if signer ran out of gas money, fund from master wallet
        if (isInsufficientFundsError(err) && signerAddress) {
          log.warn({ signer: signerAddress }, "Insufficient funds — requesting reactive funding from master wallet");
          try {
            await fundingService.fund(tx.projectId, tx.chainId, signerAddress);
          } catch (fundErr) {
            log.warn({ err: fundErr }, "Reactive funding attempt failed");
          }
        }

        // Increment attempts but do NOT mark FAILED — let BullMQ retry
        await prisma.transaction.update({
          where: { id: transactionId },
          data: {
            status: "QUEUED",
            errorMessage: (err as Error).message,
            attempts: { increment: 1 },
          },
        });

        log.error({ err }, "Transaction signing failed — will retry");
        throw err;
      }
    },
    {
      connection: getWorkerConnection(),
      concurrency: WORKER_CONCURRENCY,
    },
  );

  // Mark as FAILED only when all retries exhausted
  worker.on("failed", async (job, err) => {
    logger.error({ jobId: job?.id, err }, "tx-signing worker exhausted retries");
    if (job) {
      const tx = await prisma.transaction.findUnique({
        where: { id: job.data.transactionId },
        include: { signer: true },
      });

      if (tx) {
        // Re-sync nonce from on-chain to fix any gap left by the failed acquire/release cycle
        try {
          await nonceManager.sync(tx.chainId, tx.signer.address);
        } catch (_) { /* best-effort */ }

        const failedTx = await prisma.transaction.update({
          where: { id: job.data.transactionId },
          data: { status: "FAILED", errorMessage: err.message },
        });
        await webhookService.emitEvent("tx.failed", failedTx);
      }
    }
  });

  return worker;
}

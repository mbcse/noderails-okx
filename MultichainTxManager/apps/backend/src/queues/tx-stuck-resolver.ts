import { Queue, Worker } from "bullmq";
import { ethers } from "ethers";
import {
  getQueueConnection,
  getWorkerConnection,
  QUEUE_NAMES,
  DEFAULT_JOB_OPTIONS,
} from "./connection.js";
import { prisma } from "../config/database.js";
import { redis } from "../config/redis.js";
import { rpcManager } from "../services/rpc-manager.js";
import { nonceManager } from "../services/nonce-manager.js";
import { createKeyAdapter } from "../adapters/index.js";
import { webhookService } from "../services/webhook.service.js";
import { logger } from "../lib/logger.js";
import { txConfirmationQueue } from "./tx-confirmation.js";
import { settingsService } from "../services/settings.service.js";

// ────────────────────────────────────────────────────────────
// tx-stuck-resolver — handles STUCK transactions
//
// Strategy: attempt speed-up first (same nonce, higher gas).
// After N failed speed-ups, auto-cancel (0-value tx, same nonce).
// ────────────────────────────────────────────────────────────

export interface TxStuckResolverJobData {
  transactionId: string;
  action: "speed-up" | "cancel";
}

let GAS_BUMP_PERCENT = 20; // bump gas by 20%
let MAX_RESOLUTION_ATTEMPTS = 5;
let CANCEL_AFTER_ATTEMPTS = 3;
const FILECOIN_MIN_GAS_LIMIT = 800000n;

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

async function loadResolverSettings() {
  try {
    GAS_BUMP_PERCENT = await settingsService.get<number>("stuckResolver.gasBumpPercent");
    MAX_RESOLUTION_ATTEMPTS = await settingsService.get<number>("stuckResolver.maxResolutionAttempts");
    CANCEL_AFTER_ATTEMPTS = await settingsService.get<number>("stuckResolver.cancelAfterAttempts");
  } catch { /* use defaults */ }
}

/** Permanent broadcast errors where retrying won't help. */
function isPermanentBroadcastError(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  const msg = err.message.toLowerCase();
  return (
    msg.includes("intrinsic gas too low") ||
    msg.includes("intrinsicgas") ||
    msg.includes("insufficient funds") ||
    msg.includes("transaction underpriced")
  );
}

/** Check if an error is a contract revert (estimateGas). */
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

/**
 * Mark a stuck tx as permanently FAILED — emit webhook.
 */
async function markFailed(
  transactionId: string,
  errorMessage: string,
  log: { warn: (msg: string) => void },
): Promise<void> {
  log.warn(errorMessage);
  const failedTx = await prisma.transaction.update({
    where: { id: transactionId },
    data: { status: "FAILED", errorMessage },
  });
  await webhookService.emitEvent("tx.failed", failedTx);
}

export const txStuckResolverQueue = new Queue<TxStuckResolverJobData, unknown, string>(
  QUEUE_NAMES.TX_STUCK_RESOLVER,
  { connection: getQueueConnection(), defaultJobOptions: DEFAULT_JOB_OPTIONS },
);

/**
 * Statuses that mean a tx is still "in-flight" (nonce is occupied on-chain
 * or about to be). Used by the gap-check logic in the resolver.
 */
const IN_FLIGHT_STATUSES = [
  "QUEUED",
  "SIGNING",
  "SIGNED",
  "BROADCASTING",
  "BROADCAST",
  "CONFIRMING",
  "STUCK",
  "SPEED_UP",
] as const;

/**
 * Scan for stuck transactions and enqueue speed-up jobs.
 *
 * Groups stuck txs by (signerId, chainId) and only enqueues the ONE with
 * the lowest nonce per group. This avoids race conditions where multiple
 * stuck txs for the same signer compete for the same on-chain nonce slot.
 * The next scan (60 s later) will pick the next-lowest if the previous
 * one has been resolved.
 */
export async function scanForStuckTransactions(): Promise<void> {
  const log = logger.child({ task: "stuck-tx-scanner" });

  await loadResolverSettings();

  const stuckTxs = await prisma.transaction.findMany({
    where: { status: "STUCK", nonce: { not: null }, chain: { chainType: "EVM" } },
    select: { id: true, attempts: true, nonce: true, signerId: true, chainId: true },
    orderBy: { nonce: "asc" },
    take: 200, // generous upper bound
  });

  if (stuckTxs.length === 0) return;

  // Group by signer+chain, keep only the lowest-nonce tx per group
  const lowestPerSigner = new Map<string, (typeof stuckTxs)[number]>();
  for (const tx of stuckTxs) {
    const key = `${tx.signerId}:${tx.chainId}`;
    if (!lowestPerSigner.has(key)) {
      lowestPerSigner.set(key, tx); // already sorted by nonce ASC
    }
  }

  log.info(
    { totalStuck: stuckTxs.length, enqueuing: lowestPerSigner.size },
    "Found stuck transactions — enqueuing lowest-nonce per signer+chain",
  );

  for (const tx of lowestPerSigner.values()) {
    // Use separate Redis counter for resolver attempts (not shared with signing)
    const resolverKey = `resolver:attempts:${tx.id}`;
    const resolverAttempts = parseInt(await redis.get(resolverKey) ?? "0", 10);
    const action = resolverAttempts >= CANCEL_AFTER_ATTEMPTS ? "cancel" : "speed-up";
    await txStuckResolverQueue.add("resolve", {
      transactionId: tx.id,
      action,
    });
  }
}

export function startTxStuckResolverWorker(): Worker<TxStuckResolverJobData> {
  const worker = new Worker<TxStuckResolverJobData>(
    QUEUE_NAMES.TX_STUCK_RESOLVER,
    async (job) => {
      const { transactionId, action } = job.data;
      const log = logger.child({ queue: "tx-stuck-resolver", transactionId, action, jobId: job.id });

      await loadResolverSettings();

      const tx = await prisma.transaction.findUniqueOrThrow({
        where: { id: transactionId },
        include: { signer: true, chain: true },
      });

      if (tx.chain.chainType !== "EVM") {
        log.info({ chainType: tx.chain.chainType }, "Stuck resolver is EVM-only, skipping");
        return;
      }

      if (tx.status !== "STUCK") {
        log.info({ status: tx.status }, "Transaction no longer stuck, skipping");
        return;
      }

      try {
        const filecoinChain = isFilecoinChain(tx.chain);

        // ── Step 0: Check on-chain nonce vs this tx's nonce ──────────
        const onChainNonce = await rpcManager.callWithFailover(
          tx.chainId,
          (p) => p.getTransactionCount(tx.signer.address, "latest"),
          "getTransactionCount",
        );

        // Also re-sync Redis so future txs start from the right place
        await nonceManager.forceSet(tx.chainId, tx.signer.address, onChainNonce);

        const txNonce = tx.nonce!;

        if (onChainNonce > txNonce) {
          // On-chain nonce has moved past this tx — the original tx (or a
          // replacement) already landed. Just send it to confirmation to
          // fetch the receipt and mark it accordingly.
          log.info(
            { txNonce, onChainNonce },
            "On-chain nonce moved past this tx — sending to confirmation",
          );

          await prisma.transaction.update({
            where: { id: transactionId },
            data: { status: "BROADCAST" },
          });

          await txConfirmationQueue.add("confirm", { transactionId }, { delay: 2000 });
          return;
        }

        // If on-chain nonce is behind the tx nonce, there's a gap.
        // Check whether the gap is all holes (FAILED/missing) or has live txs.
        if (onChainNonce < txNonce) {
          log.info(
            { txNonce, onChainNonce, gap: txNonce - onChainNonce },
            "Nonce gap detected — checking for holes",
          );

          // Find any in-flight txs that occupy the nonce range [onChainNonce, txNonce)
          const inFlightInGap = await prisma.transaction.findMany({
            where: {
              signerId: tx.signerId,
              chainId: tx.chainId,
              nonce: { gte: onChainNonce, lt: txNonce },
              status: { in: [...IN_FLIGHT_STATUSES] },
            },
            select: { id: true, nonce: true, status: true },
          });

          if (inFlightInGap.length > 0) {
            // There are live/pending txs in the gap — we can't leapfrog them.
            // They'll land or get stuck-resolved on their own.
            log.warn(
              {
                txNonce,
                onChainNonce,
                inFlightNonces: inFlightInGap.map((t) => t.nonce),
              },
              "Gap contains in-flight txs — waiting for them to resolve",
            );
            return;
          }

          // Gap is all holes (FAILED / CANCELLED / CONFIRMED / missing records).
          // Re-sign this transaction with onChainNonce so it fills the lowest hole.
          log.info(
            { txNonce, onChainNonce },
            "Gap is all holes — re-signing tx with correct nonce",
          );

          const provider = await rpcManager.getProvider(tx.chainId);
          const adapter = createKeyAdapter(tx.signer, provider);
          (tx.signer as any).encryptedKey = "[REDACTED]";
          const feeData = await rpcManager.callWithFailover(
            tx.chainId,
            (p) => p.getFeeData(),
            "getFeeData",
          );

          const resignTx: ethers.TransactionRequest = {
            from: tx.from,
            nonce: onChainNonce,
            chainId: tx.chain.chainId,
            to: tx.to,
            value: BigInt(tx.value || "0"),
            data: tx.data || "0x",
          };

          // Set gas pricing
          if (feeData.maxFeePerGas) {
            const bump = (n: bigint) => n + (n * BigInt(GAS_BUMP_PERCENT)) / 100n;
            resignTx.maxFeePerGas = bump(feeData.maxFeePerGas);
            resignTx.maxPriorityFeePerGas = bump(feeData.maxPriorityFeePerGas || 0n);
            resignTx.type = 2;
          } else if (feeData.gasPrice) {
            resignTx.gasPrice = feeData.gasPrice + (feeData.gasPrice * BigInt(GAS_BUMP_PERCENT)) / 100n;
          }

          // Estimate gas for the re-signed tx
          try {
            const estimated = await rpcManager.callWithFailover(
              tx.chainId,
              (p) => p.estimateGas(resignTx),
              "estimateGas",
            );
            resignTx.gasLimit = (estimated * 120n) / 100n;
            if (filecoinChain) {
              resignTx.gasLimit = maxBigInt(resignTx.gasLimit, FILECOIN_MIN_GAS_LIMIT);
            }
          } catch (estErr) {
            if (isRevertError(estErr)) {
              await markFailed(transactionId, `Re-sign gas estimation reverted: ${(estErr as Error).message}`, log);
              return;
            }
            if (isPermanentBroadcastError(estErr)) {
              await markFailed(transactionId, `Re-sign estimation permanently failed: ${(estErr as Error).message}`, log);
              return;
            }
            throw estErr;
          }

          // Sign and broadcast
          const signedTx = await adapter.signTransaction(resignTx);
          let result;
          try {
            result = await rpcManager.callWithFailover(
              tx.chainId,
              (p) => p.broadcastTransaction(signedTx),
              "broadcastTransaction",
            );
          } catch (broadcastErr) {
            if (isPermanentBroadcastError(broadcastErr)) {
              await markFailed(transactionId, `Re-sign broadcast permanently failed: ${(broadcastErr as Error).message}`, log);
              return;
            }
            throw broadcastErr;
          }

          // Update DB: new nonce, new hash, clear old signedData
          await prisma.transaction.update({
            where: { id: transactionId },
            data: {
              status: "BROADCAST",
              nonce: onChainNonce,
              hash: result.hash,
              signedData: signedTx,
              attempts: { increment: 1 },
            },
          });

          // Advance Redis nonce past what we just used
          await nonceManager.forceSet(tx.chainId, tx.signer.address, onChainNonce + 1);

          log.info(
            { oldNonce: txNonce, newNonce: onChainNonce, hash: result.hash },
            "Re-signed stuck tx with correct nonce — sent to confirmation",
          );

          // Increment resolver-specific attempt counter
          const gapResolverKey = `resolver:attempts:${transactionId}`;
          await redis.incr(gapResolverKey);
          await redis.expire(gapResolverKey, 86400);

          await txConfirmationQueue.add("confirm", { transactionId }, { delay: 3000 });
          return;
        }

        // onChainNonce === txNonce → this nonce slot is free, proceed
        // with speed-up / cancel using the correct nonce.
        log.info({ txNonce, onChainNonce, action }, "Nonce matches — proceeding with resolution");

        // Track resolution attempts separately in Redis (not shared with signing retries)
        const resolverKey = `resolver:attempts:${transactionId}`;
        const resolverAttempts = parseInt(await redis.get(resolverKey) ?? "0", 10);

        // If we've exhausted resolution attempts, force-fail rather than looping forever
        if (resolverAttempts >= MAX_RESOLUTION_ATTEMPTS) {
          await markFailed(
            transactionId,
            `Stuck resolver exhausted ${MAX_RESOLUTION_ATTEMPTS} attempts — marking FAILED`,
            log,
          );
          await redis.del(resolverKey);
          return;
        }

        // ── Step 1: Build replacement tx ─────────────────────────────
        const provider = await rpcManager.getProvider(tx.chainId);
        const adapter = createKeyAdapter(tx.signer, provider);
        (tx.signer as any).encryptedKey = "[REDACTED]";
        const feeData = await rpcManager.callWithFailover(
          tx.chainId,
          (p) => p.getFeeData(),
          "getFeeData",
        );

        let resolvedAction = action; // may change from speed-up → cancel if tx reverts

        const baseTx: ethers.TransactionRequest = {
          from: tx.from,
          nonce: onChainNonce, // always use verified on-chain nonce
          chainId: tx.chain.chainId,
        };

        if (resolvedAction === "cancel") {
          // Cancel = send 0-value tx to self with same nonce
          baseTx.to = tx.from;
          baseTx.value = 0n;
          baseTx.data = "0x";
          baseTx.gasLimit = filecoinChain ? FILECOIN_MIN_GAS_LIMIT : 21000n;
          log.info("Sending cancellation tx");
        } else {
          // Speed-up = resend same tx with bumped gas
          baseTx.to = tx.to;
          baseTx.value = BigInt(tx.value || "0");
          baseTx.data = tx.data || "0x";
          log.info("Sending speed-up tx — estimating gas first");
        }

        // Bump gas price by GAS_BUMP_PERCENT
        if (feeData.maxFeePerGas) {
          const bump = (n: bigint) =>
            n + (n * BigInt(GAS_BUMP_PERCENT)) / 100n;
          baseTx.maxFeePerGas = bump(feeData.maxFeePerGas);
          baseTx.maxPriorityFeePerGas = bump(
            feeData.maxPriorityFeePerGas || 0n,
          );
          baseTx.type = 2;
        } else if (feeData.gasPrice) {
          baseTx.gasPrice =
            feeData.gasPrice +
            (feeData.gasPrice * BigInt(GAS_BUMP_PERCENT)) / 100n;
        }

        // For speed-ups, estimate gas (detects reverts before wasting gas)
        if (resolvedAction === "speed-up") {
          try {
            const estimated = await rpcManager.callWithFailover(
              tx.chainId,
              (p) => p.estimateGas(baseTx),
              "estimateGas",
            );
            baseTx.gasLimit = (estimated * 120n) / 100n;
            if (filecoinChain) {
              baseTx.gasLimit = maxBigInt(baseTx.gasLimit, FILECOIN_MIN_GAS_LIMIT);
            }
          } catch (estErr) {
            if (isRevertError(estErr)) {
              // Speed-up will also revert — switch to cancel to free the nonce
              log.warn(
                { err: estErr },
                "Speed-up tx reverts on estimateGas — switching to cancel",
              );
              resolvedAction = "cancel";
              baseTx.to = tx.from;
              baseTx.value = 0n;
              baseTx.data = "0x";
              baseTx.gasLimit = filecoinChain ? FILECOIN_MIN_GAS_LIMIT : 21000n;
            } else if (isPermanentBroadcastError(estErr)) {
              await markFailed(transactionId, `Speed-up estimation permanently failed: ${(estErr as Error).message}`, log);
              return;
            } else {
              throw estErr;
            }
          }
        }

        // Sign and broadcast replacement
        const signedTx = await adapter.signTransaction(baseTx);
        let result;
        try {
          result = await rpcManager.callWithFailover(
            tx.chainId,
            (p) => p.broadcastTransaction(signedTx),
            "broadcastTransaction",
          );
        } catch (broadcastErr) {
          if (isPermanentBroadcastError(broadcastErr)) {
            await markFailed(transactionId, `Stuck-resolver broadcast permanently failed: ${(broadcastErr as Error).message}`, log);
            return;
          }
          throw broadcastErr;
        }

        const newStatus = resolvedAction === "cancel" ? "CANCELLED" : "SPEED_UP";

        const updatedTx = await prisma.transaction.update({
          where: { id: transactionId },
          data: {
            status: newStatus,
            hash: result.hash,
            nonce: onChainNonce, // update nonce in DB to the one we actually used
            attempts: { increment: 1 },
          },
        });

        // Advance the Redis nonce counter past the one we just used
        await nonceManager.forceSet(tx.chainId, tx.signer.address, onChainNonce + 1);

        log.info({ hash: result.hash, nonce: onChainNonce }, `Transaction ${resolvedAction} sent`);

        // Increment resolver-specific attempt counter in Redis
        await redis.incr(resolverKey);
        await redis.expire(resolverKey, 86400); // 24h TTL

        // Emit webhook
        const eventType = resolvedAction === "cancel" ? "tx.cancelled" : "tx.speed_up";
        await webhookService.emitEvent(eventType, updatedTx);

        // Poll for the replacement confirmation
        await txConfirmationQueue.add("confirm", { transactionId }, { delay: 3000 });
      } catch (err) {
        log.error({ err }, `Stuck resolver ${action} failed`);
        throw err;
      }
    },
    { connection: getWorkerConnection(), concurrency: 10 },
  );

  worker.on("failed", (job, err) => {
    logger.error({ jobId: job?.id, err }, "tx-stuck-resolver worker failed");
  });

  return worker;
}

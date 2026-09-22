import { Queue, Worker, type Job } from "bullmq";
import {
  getQueueConnection,
  getWorkerConnection,
  QUEUE_NAMES,
  DEFAULT_JOB_OPTIONS,
  WORKER_CONCURRENCY,
} from "./connection.js";
import { prisma } from "../config/database.js";
import { rpcManager } from "../services/rpc-manager.js";
import { solanaRpcManager } from "../services/solana-rpc-manager.js";
import { suiRpcManager } from "../services/sui-rpc-manager.js";
import {
  deserializeSignedSuiTx,
  getSuiExecuteSignatures,
  isPermanentSuiExecuteError,
  isSponsoredTransactionMetadata,
  isSuiVersionError,
} from "../lib/sui-transaction.js";
import { nonceManager } from "../services/nonce-manager.js";
import { webhookService } from "../services/webhook.service.js";
import { logger } from "../lib/logger.js";
import { txConfirmationQueue } from "./tx-confirmation.js";
import { txSigningQueue } from "./tx-signing.js";

// ────────────────────────────────────────────────────────────
// tx-broadcasting queue — sends signed txs to the chain
// ────────────────────────────────────────────────────────────

export interface TxBroadcastingJobData {
  transactionId: string;
}

export const txBroadcastingQueue = new Queue<TxBroadcastingJobData, unknown, string>(
  QUEUE_NAMES.TX_BROADCASTING,
  { connection: getQueueConnection(), defaultJobOptions: DEFAULT_JOB_OPTIONS },
);

/** Known RPC error patterns for "nonce already used" */
const NONCE_TOO_LOW_PATTERNS = [
  "nonce too low",
  "nonce has already been used",
  "replacement transaction underpriced",
  "already known",
];

function isNonceTooLow(message: string): boolean {
  const lower = message.toLowerCase();
  return NONCE_TOO_LOW_PATTERNS.some((p) => lower.includes(p));
}

/** Permanent broadcast errors where the signed tx itself is invalid — retrying won't help. */
const PERMANENT_BROADCAST_PATTERNS = [
  "intrinsic gas too low",
  "intrinsicgas",
  "insufficient funds",
  "transaction underpriced",
];

function isPermanentBroadcastError(message: string): boolean {
  const lower = message.toLowerCase();
  return PERMANENT_BROADCAST_PATTERNS.some((p) => lower.includes(p));
}

export function startTxBroadcastingWorker(): Worker<TxBroadcastingJobData> {
  const worker = new Worker<TxBroadcastingJobData>(
    QUEUE_NAMES.TX_BROADCASTING,
    async (job: Job<TxBroadcastingJobData>) => {
      const { transactionId } = job.data;
      const log = logger.child({ queue: "tx-broadcasting", transactionId, jobId: job.id });

      const tx = await prisma.transaction.findUniqueOrThrow({
        where: { id: transactionId },
        include: { chain: true },
      });

      // Idempotency guard
      if (tx.status !== "SIGNED" && tx.status !== "BROADCASTING") {
        log.info({ status: tx.status }, "Transaction not in broadcastable state, skipping");
        return;
      }

      log.info("Broadcasting transaction");

      const updatedTx = await prisma.transaction.update({
        where: { id: transactionId },
        data: { status: "BROADCASTING" },
      });

      await webhookService.emitEvent("tx.broadcasting", updatedTx);

      try {
        // ── SOLANA path ─────────────────────────────────────────────
        if (tx.chain.chainType === "SOLANA") {
          const signedB64 = tx.signedData;
          if (!signedB64) {
            throw new Error("Transaction has no signedData — signing step may have failed");
          }

          const connection = await solanaRpcManager.getConnection(tx.chainId);
          const raw = Buffer.from(signedB64, "base64");

          try {
            const signature = await connection.sendRawTransaction(raw, {
              preflightCommitment: "confirmed",
            });

            const broadcastTx = await prisma.transaction.update({
              where: { id: transactionId },
              data: {
                status: "BROADCAST",
                hash: signature,
              },
            });

            log.info({ hash: signature }, "SOLANA transaction broadcast");
            await webhookService.emitEvent("tx.broadcast", broadcastTx);
            await txConfirmationQueue.add("confirm", { transactionId }, { delay: 3000 });
            return;
          } catch (err) {
            const msg = (err as Error).message?.toLowerCase?.() ?? "";
            const isBlockhashExpired =
              msg.includes("blockhash") ||
              msg.includes("transactionexpired") ||
              msg.includes("block height exceeded") ||
              msg.includes("blockheight") ||
              msg.includes("blockhashnotfound");

            if (isBlockhashExpired) {
              // Needs re-sign with a fresh recentBlockhash.
              log.warn({ err }, "SOLANA blockhash expired — re-queuing signing");
              await prisma.transaction.update({
                where: { id: transactionId },
                data: {
                  status: "QUEUED",
                  errorMessage: "SOLANA blockhash expired — re-signing",
                  attempts: { increment: 1 },
                },
              });
              await txSigningQueue.add("sign", { transactionId });
              return;
            }

            // Non-permanent errors: retry broadcast
            throw err;
          }
        }

        // ── SUI path ────────────────────────────────────────────────
        if (tx.chain.chainType === "SUI") {
          if (!tx.signedData) {
            throw new Error("Transaction has no signedData — signing step may have failed");
          }

          const signedPayload = deserializeSignedSuiTx(tx.signedData);
          const executeSignatures = getSuiExecuteSignatures(signedPayload);
          const client = await suiRpcManager.getClient(tx.chainId);

          try {
            const result = await client.executeTransactionBlock({
              transactionBlock: signedPayload.transactionBlockBase64,
              signature: executeSignatures,
              options: { showEffects: true, showInput: true },
            });

            const digest = result.digest;
            const broadcastTx = await prisma.transaction.update({
              where: { id: transactionId },
              data: {
                status: "BROADCAST",
                hash: digest,
              },
            });

            log.info({ hash: digest }, "SUI transaction broadcast");
            await webhookService.emitEvent("tx.broadcast", broadcastTx);
            await txConfirmationQueue.add("confirm", { transactionId }, { delay: 3000 });
            return;
          } catch (err) {
            const msg = (err as Error).message ?? "";
            const sponsored = isSponsoredTransactionMetadata(tx.metadata);

            if (isPermanentSuiExecuteError(msg)) {
              const errorMessage = sponsored && isSuiVersionError(msg)
                ? "SUI object/gas version expired — re-run sponsor-sign and execute-sponsored"
                : `SUI execute permanently failed: ${msg}`;
              log.warn({ err, sponsored }, "Permanent SUI execute error — marking FAILED");
              const failedTx = await prisma.transaction.update({
                where: { id: transactionId },
                data: { status: "FAILED", errorMessage },
              });
              await webhookService.emitEvent("tx.failed", failedTx);
              return;
            }

            if (isSuiVersionError(msg) && !sponsored) {
              log.warn({ err }, "SUI object version mismatch — re-queuing signing");
              await prisma.transaction.update({
                where: { id: transactionId },
                data: {
                  status: "QUEUED",
                  errorMessage: "SUI object version expired — re-signing",
                  attempts: { increment: 1 },
                },
              });
              await txSigningQueue.add("sign", { transactionId });
              return;
            }
            throw err;
          }
        }

        // Read signed hex from `signedData` (not `data`)
        const signedTxHex = tx.signedData;
        if (!signedTxHex) {
          throw new Error("Transaction has no signedData — signing step may have failed");
        }

        const broadcastResult = await rpcManager.callWithFailover(
          tx.chainId,
          (p) => p.broadcastTransaction(signedTxHex),
          "broadcastTransaction",
        );

        const broadcastTx = await prisma.transaction.update({
          where: { id: transactionId },
          data: {
            status: "BROADCAST",
            hash: broadcastResult.hash,
          },
        });

        log.info({ hash: broadcastResult.hash }, "Transaction broadcast");

        await webhookService.emitEvent("tx.broadcast", broadcastTx);

        // Enqueue for confirmation polling (wait 3s before first poll)
        await txConfirmationQueue.add(
          "confirm",
          { transactionId },
          { delay: 3000 },
        );
      } catch (err) {
        const errorMessage = (err as Error).message;

        if (tx.chain.chainType === "SOLANA" || tx.chain.chainType === "SUI") {
          // For SOLANA/SUI, don't try nonce sync. Allow BullMQ retry.
          await prisma.transaction.update({
            where: { id: transactionId },
            data: {
              status: "SIGNED",
              errorMessage,
              attempts: { increment: 1 },
            },
          });
          log.error({ err }, `${tx.chain.chainType} transaction broadcasting failed — will retry`);
          throw err;
        }

        if (isNonceTooLow(errorMessage)) {
          // Nonce collision — tx may already be mined or replaced; send to confirmation
          log.warn("Nonce already used — sending to confirmation queue for receipt check");
          await prisma.transaction.update({
            where: { id: transactionId },
            data: { status: "BROADCAST", errorMessage: "Nonce collision — checking receipt" },
          });
          await txConfirmationQueue.add("confirm", { transactionId }, { delay: 2000 });
          return; // Don't retry
        }

        if (isPermanentBroadcastError(errorMessage)) {
          // Signed tx is permanently invalid — fail immediately, don't waste retries
          log.warn({ err }, "Permanent broadcast error — marking FAILED immediately");
          if (tx.nonce != null && tx.from) {
            try {
              await nonceManager.sync(tx.chainId, tx.from);
            } catch (_) { /* best-effort */ }
          }
          const failedTx = await prisma.transaction.update({
            where: { id: transactionId },
            data: { status: "FAILED", errorMessage: `Broadcast permanently failed: ${errorMessage}` },
          });
          await webhookService.emitEvent("tx.failed", failedTx);
          return; // Don't throw — skip BullMQ retries
        }

        // Don't mark FAILED — let BullMQ retry
        await prisma.transaction.update({
          where: { id: transactionId },
          data: {
            status: "SIGNED", // revert to SIGNED so retry can re-broadcast
            errorMessage,
            attempts: { increment: 1 },
          },
        });

        log.error({ err }, "Transaction broadcasting failed — will retry");
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
    logger.error({ jobId: job?.id, err }, "tx-broadcasting worker exhausted retries");
    if (job) {
      const tx = await prisma.transaction.findUnique({
        where: { id: job.data.transactionId },
        include: { signer: true, chain: true },
      });

      if (tx) {
        if (tx.chain?.chainType === "SOLANA" || tx.chain?.chainType === "SUI") {
          const failedTx = await prisma.transaction.update({
            where: { id: job.data.transactionId },
            data: { status: "FAILED", errorMessage: err.message },
          });
          await webhookService.emitEvent("tx.failed", failedTx);
          return;
        }

        // The signed tx never made it on-chain — re-sync the nonce
        // from the network so the next tx doesn't hit a gap.
        try {
          await nonceManager.sync(tx.chainId, tx.signer.address);
          logger.info(
            { chainId: tx.chainId, address: tx.signer.address },
            "Nonce re-synced after broadcast failure",
          );
        } catch (syncErr) {
          logger.error({ syncErr }, "Failed to re-sync nonce after broadcast failure");
        }

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

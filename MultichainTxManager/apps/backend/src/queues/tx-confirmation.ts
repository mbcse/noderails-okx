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
import { webhookService } from "../services/webhook.service.js";
import { logger } from "../lib/logger.js";

import { Prisma } from "../generated/prisma/client.js";
import { settingsService } from "../services/settings.service.js";

// ────────────────────────────────────────────────────────────
// tx-confirmation queue — polls for receipts
// ────────────────────────────────────────────────────────────

export interface TxConfirmationJobData {
  transactionId: string;
  pollCount?: number;
}

// Defaults — overridden by DB settings at runtime
let MAX_POLLS = 30;
let POLL_INTERVAL_MS = 5_000;
let NONCE_CHECK_AFTER_POLL = 3;

async function loadSettings() {
  try {
    MAX_POLLS = await settingsService.get<number>("confirmation.maxPolls");
    POLL_INTERVAL_MS = await settingsService.get<number>("confirmation.pollIntervalMs");
    NONCE_CHECK_AFTER_POLL = await settingsService.get<number>("confirmation.nonceCheckAfterPoll");
  } catch { /* use defaults */ }
}

export const txConfirmationQueue = new Queue<TxConfirmationJobData, unknown, string>(
  QUEUE_NAMES.TX_CONFIRMATION,
  {
    connection: getQueueConnection(),
    defaultJobOptions: {
      ...DEFAULT_JOB_OPTIONS,
      attempts: 3, // fewer retries — the re-poll handles transient errors
    },
  },
);

/**
 * Safely serialize an ethers.js receipt (contains BigInt fields).
 * Converts BigInt → string to avoid JSON.stringify throwing.
 */
function serializeReceipt(receipt: unknown): Prisma.InputJsonValue {
  return JSON.parse(
    JSON.stringify(receipt, (_key, value) =>
      typeof value === "bigint" ? value.toString() : value,
    ),
  ) as Prisma.InputJsonValue;
}

export function startTxConfirmationWorker(): Worker<TxConfirmationJobData> {
  const worker = new Worker<TxConfirmationJobData>(
    QUEUE_NAMES.TX_CONFIRMATION,
    async (job: Job<TxConfirmationJobData>) => {
      const { transactionId, pollCount = 0 } = job.data;
      const log = logger.child({ queue: "tx-confirmation", transactionId, jobId: job.id });

      await loadSettings();

      const tx = await prisma.transaction.findUniqueOrThrow({
        where: { id: transactionId },
        include: { chain: true },
      });

      if (!tx.hash) {
        log.warn("Transaction has no hash — cannot confirm");
        return;
      }

      // Skip if already in a terminal state
      if (["CONFIRMED", "FAILED", "CANCELLED"].includes(tx.status)) {
        log.info({ status: tx.status }, "Transaction already in terminal state");
        return;
      }

      await prisma.transaction.update({
        where: { id: transactionId },
        data: { status: "CONFIRMING" },
      });

      try {
        // ── SOLANA path ─────────────────────────────────────────────
        if (tx.chain.chainType === "SOLANA") {
          const connection = await solanaRpcManager.getConnection(tx.chainId);
          const statusResp = await connection.getSignatureStatus(tx.hash!, { searchTransactionHistory: true });
          const status = statusResp.value;

          if (status?.confirmationStatus === "confirmed" || status?.confirmationStatus === "finalized") {
            const isSuccess = status.err == null;

            let receipt: unknown = null;
            try {
              receipt = await connection.getTransaction(tx.hash!, {
                commitment: "confirmed",
                maxSupportedTransactionVersion: 0,
              } as any);
            } catch {
              // best-effort — status is enough to finalize
            }

            const confirmedTx = await prisma.transaction.update({
              where: { id: transactionId },
              data: {
                status: isSuccess ? "CONFIRMED" : "FAILED",
                blockNumber: status.slot ?? null,
                receipt: (receipt ?? status) as any,
                confirmedAt: new Date(),
                ...(isSuccess ? {} : { errorMessage: "Transaction failed on-chain" }),
              },
            });

            log.info(
              { slot: status.slot, success: isSuccess, confirmationStatus: status.confirmationStatus },
              "SOLANA transaction confirmed",
            );

            if (isSuccess) {
              await webhookService.emitEvent("tx.confirmed", confirmedTx);
            } else {
              await webhookService.emitEvent("tx.failed", confirmedTx);
            }
            return;
          }

          if (pollCount >= MAX_POLLS) {
            const stuckTx = await prisma.transaction.update({
              where: { id: transactionId },
              data: { status: "STUCK" },
            });
            log.warn("SOLANA transaction stuck — exceeded max polls");
            await webhookService.emitEvent("tx.stuck", stuckTx);
            return;
          }

          await txConfirmationQueue.add(
            "confirm",
            { transactionId, pollCount: pollCount + 1 },
            { delay: POLL_INTERVAL_MS },
          );

          log.debug({ pollCount: pollCount + 1 }, "Re-polling SOLANA signature status");
          return;
        }

        // ── SUI path ────────────────────────────────────────────────
        if (tx.chain.chainType === "SUI") {
          const client = await suiRpcManager.getClient(tx.chainId);

          try {
            const txBlock = await client.getTransactionBlock({
              digest: tx.hash!,
              options: { showEffects: true, showInput: true, showEvents: true },
            });

            const effects = txBlock.effects;
            if (effects) {
              const status = effects.status?.status;
              const isSuccess = status === "success";
              const checkpoint = txBlock.checkpoint ? Number(txBlock.checkpoint) : null;

              const confirmedTx = await prisma.transaction.update({
                where: { id: transactionId },
                data: {
                  status: isSuccess ? "CONFIRMED" : "FAILED",
                  blockNumber: checkpoint,
                  receipt: JSON.parse(JSON.stringify(txBlock)) as Prisma.InputJsonValue,
                  confirmedAt: new Date(),
                  ...(isSuccess
                    ? {}
                    : { errorMessage: effects.status?.error ?? "Transaction failed on-chain" }),
                },
              });

              log.info({ checkpoint, success: isSuccess }, "SUI transaction confirmed");

              if (isSuccess) {
                await webhookService.emitEvent("tx.confirmed", confirmedTx);
              } else {
                await webhookService.emitEvent("tx.failed", confirmedTx);
              }
              return;
            }
          } catch (err) {
            log.debug({ err, pollCount: pollCount + 1 }, "SUI transaction not yet indexed");
          }

          if (pollCount >= MAX_POLLS) {
            const stuckTx = await prisma.transaction.update({
              where: { id: transactionId },
              data: { status: "STUCK" },
            });
            log.warn("SUI transaction stuck — exceeded max polls");
            await webhookService.emitEvent("tx.stuck", stuckTx);
            return;
          }

          await txConfirmationQueue.add(
            "confirm",
            { transactionId, pollCount: pollCount + 1 },
            { delay: POLL_INTERVAL_MS },
          );

          log.debug({ pollCount: pollCount + 1 }, "Re-polling SUI transaction");
          return;
        }

        const receipt = await rpcManager.callWithFailover(
          tx.chainId,
          (p) => p.getTransactionReceipt(tx.hash!),
          "getTransactionReceipt",
        );

        if (receipt) {
          const isSuccess = receipt.status === 1;

          const confirmedTx = await prisma.transaction.update({
            where: { id: transactionId },
            data: {
              status: isSuccess ? "CONFIRMED" : "FAILED",
              blockNumber: receipt.blockNumber,
              blockHash: receipt.blockHash,
              receipt: serializeReceipt(receipt),
              confirmedAt: new Date(),
              ...(isSuccess ? {} : { errorMessage: "Transaction reverted on-chain" }),
            },
          });

          log.info(
            { blockNumber: receipt.blockNumber, success: isSuccess },
            "Transaction confirmed",
          );

          // Emit the appropriate webhook
          if (isSuccess) {
            await webhookService.emitEvent("tx.confirmed", confirmedTx);
          } else {
            await webhookService.emitEvent("tx.failed", confirmedTx);
          }

          return;
        }

        // No receipt yet — check for nonce gap, then re-poll or mark stuck

        // After a few polls, check if the on-chain nonce has moved past this tx
        // or if there's a gap ahead of it (meaning it can never confirm)
        if (pollCount >= NONCE_CHECK_AFTER_POLL && tx.nonce != null && tx.from) {
          try {
            const onChainNonce = await rpcManager.callWithFailover(
              tx.chainId,
              (p) => p.getTransactionCount(tx.from!, "latest"),
              "getTransactionCount",
            );

            if (onChainNonce > tx.nonce) {
              // Nonce already consumed but no receipt for this hash —
              // a different tx used this nonce (e.g. replacement/cancel).
              // The original hash will never confirm.
              log.warn(
                { txNonce: tx.nonce, onChainNonce },
                "On-chain nonce moved past this tx but no receipt — likely replaced, marking FAILED",
              );
              const failedTx = await prisma.transaction.update({
                where: { id: transactionId },
                data: {
                  status: "FAILED",
                  errorMessage: `Transaction replaced — nonce ${tx.nonce} consumed by a different tx`,
                },
              });
              await webhookService.emitEvent("tx.failed", failedTx);
              return;
            }

            if (onChainNonce < tx.nonce) {
              // Gap: on-chain nonce hasn't reached this tx yet.
              // Check if any in-flight txs fill the gap — if so, keep polling.
              // If the gap is all holes (FAILED/CANCELLED/missing), mark STUCK
              // so the stuck-resolver can re-sign with the correct nonce.
              const inFlightInGap = await prisma.transaction.count({
                where: {
                  signerId: tx.signerId,
                  chainId: tx.chainId,
                  nonce: { gte: onChainNonce, lt: tx.nonce },
                  status: {
                    in: [
                      "QUEUED", "SIGNING", "SIGNED",
                      "BROADCASTING", "BROADCAST", "CONFIRMING",
                      "STUCK", "SPEED_UP",
                    ],
                  },
                },
              });

              if (inFlightInGap > 0) {
                // Earlier txs are still in-flight — they'll land and unblock us
                log.debug(
                  { txNonce: tx.nonce, onChainNonce, inFlightInGap },
                  "Nonce gap has in-flight txs — continuing to poll",
                );
              } else {
                // Gap is all holes — this tx will never confirm
                log.warn(
                  { txNonce: tx.nonce, onChainNonce, gap: tx.nonce - onChainNonce },
                  "Nonce gap is all holes — marking STUCK early",
                );
                const stuckTx = await prisma.transaction.update({
                  where: { id: transactionId },
                  data: { status: "STUCK" },
                });
                await webhookService.emitEvent("tx.stuck", stuckTx);
                return;
              }
            }
            // onChainNonce === tx.nonce → tx should be pending, keep polling
          } catch (nonceErr) {
            // Non-critical — if nonce check fails, fall through to normal polling
            log.debug({ err: nonceErr }, "Nonce check failed — continuing to poll");
          }
        }

        if (pollCount >= MAX_POLLS) {
          const stuckTx = await prisma.transaction.update({
            where: { id: transactionId },
            data: { status: "STUCK" },
          });
          log.warn("Transaction stuck — exceeded max polls");
          await webhookService.emitEvent("tx.stuck", stuckTx);
          return;
        }

        // Re-enqueue with incremented poll count
        await txConfirmationQueue.add(
          "confirm",
          { transactionId, pollCount: pollCount + 1 },
          { delay: POLL_INTERVAL_MS },
        );

        log.debug({ pollCount: pollCount + 1 }, "Re-polling for receipt");
      } catch (err) {
        log.error({ err }, "Confirmation polling failed");
        throw err;
      }
    },
    {
      connection: getWorkerConnection(),
      concurrency: WORKER_CONCURRENCY,
    },
  );

  worker.on("failed", (job, err) => {
    logger.error({ jobId: job?.id, err }, "tx-confirmation worker failed");
  });

  return worker;
}

import { startTxSigningWorker, txSigningQueue } from "./tx-signing.js";
import { startTxBroadcastingWorker, txBroadcastingQueue } from "./tx-broadcasting.js";
import { startTxConfirmationWorker, txConfirmationQueue } from "./tx-confirmation.js";
import { startTxStuckResolverWorker, txStuckResolverQueue } from "./tx-stuck-resolver.js";
import { startWebhookDeliveryWorker, webhookDeliveryQueue } from "./webhook-delivery.js";
import { logger } from "../lib/logger.js";

// Re-export queues for use in services / routes
export { txSigningQueue } from "./tx-signing.js";
export { txBroadcastingQueue } from "./tx-broadcasting.js";
export { txConfirmationQueue } from "./tx-confirmation.js";
export { txStuckResolverQueue } from "./tx-stuck-resolver.js";
export { webhookDeliveryQueue } from "./webhook-delivery.js";

// ────────────────────────────────────────────────────────────
// Start all workers
// ────────────────────────────────────────────────────────────

const workers: { close(): Promise<void> }[] = [];

export function startAllWorkers(): void {
  workers.push(
    startTxSigningWorker(),
    startTxBroadcastingWorker(),
    startTxConfirmationWorker(),
    startTxStuckResolverWorker(),
    startWebhookDeliveryWorker(),
  );
  logger.info(`Started ${workers.length} BullMQ workers`);
}

/** Gracefully close all workers AND queues to free Redis connections */
export async function stopAllWorkers(): Promise<void> {
  // Close workers first (drains in-flight jobs)
  await Promise.all(workers.map((w) => w.close()));

  // Then close queue objects to release their Redis connections
  await Promise.all([
    txSigningQueue.close(),
    txBroadcastingQueue.close(),
    txConfirmationQueue.close(),
    txStuckResolverQueue.close(),
    webhookDeliveryQueue.close(),
  ]);

  logger.info("All BullMQ workers & queues stopped");
}

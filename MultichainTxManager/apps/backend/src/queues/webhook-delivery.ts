import { Queue, Worker, type Job } from "bullmq";
import {
  getQueueConnection,
  getWorkerConnection,
  QUEUE_NAMES,
  DEFAULT_JOB_OPTIONS,
} from "./connection.js";
import { prisma } from "../config/database.js";
import { hmacSha256, canonicalJsonStringify } from "../lib/crypto.js";
import { logger } from "../lib/logger.js";

// ────────────────────────────────────────────────────────────
// webhook-delivery queue — delivers webhook payloads to endpoints
//
// Each job = one delivery attempt for one endpoint.
// Retry schedule is front-loaded for fast recovery:
//   attempts  1–5:  every 10s    (~50s cumulative)
//   attempts  6–10: every 30s    (~3min cumulative)
//   attempts 11–15: every 1min   (~8min cumulative)
//   attempts 16–20: every 2min   (~18min cumulative)
//   attempts 21–30: every 5min   (~68min cumulative ≈ 1hr)
//   attempt  31:    15min
//   attempt  32:    30min
//   attempt  33:    1hr
//   attempt  34:    2hr
//   attempt  35:    3hr
//   attempt  36:    6hr (cap)
// ~30 retries in the first hour, then gradual backoff up to 24h.
// ────────────────────────────────────────────────────────────

export interface WebhookDeliveryJobData {
  deliveryId: string;
  endpointId: string;
  url: string;
  event: string;
  payload: Record<string, unknown>;
}

/** Total attempts (1 initial + 35 retries) */
const MAX_ATTEMPTS = 36;

/**
 * Tiered backoff schedule — front-loaded for fast recovery.
 *
 *   attempt  0–4:  10s   (5× in first ~50s)
 *   attempt  5–9:  30s   (5× in next ~2.5min)
 *   attempt 10–14: 60s   (5× in next ~5min)
 *   attempt 15–19: 120s  (5× in next ~10min)
 *   attempt 20–29: 300s  (10× in next ~50min) — ~30 total in first hour
 *   attempt 30:    900s  (15min)
 *   attempt 31:    1800s (30min)
 *   attempt 32:    3600s (1hr)
 *   attempt 33:    7200s (2hr)
 *   attempt 34:    10800s(3hr)
 *   attempt 35+:   21600s(6hr cap)
 */
function computeBackoff(attempt: number): number {
  if (attempt < 5) return 10_000;            // 10s
  if (attempt < 10) return 30_000;           // 30s
  if (attempt < 15) return 60_000;           // 1min
  if (attempt < 20) return 120_000;          // 2min
  if (attempt < 30) return 300_000;          // 5min
  // Gradual ramp after the first hour
  const lateDelays = [
    900_000,      // 15min
    1_800_000,    // 30min
    3_600_000,    // 1hr
    7_200_000,    // 2hr
    10_800_000,   // 3hr
    21_600_000,   // 6hr cap
  ];
  return lateDelays[Math.min(attempt - 30, lateDelays.length - 1)];
}

export const webhookDeliveryQueue = new Queue<WebhookDeliveryJobData, unknown, string>(
  QUEUE_NAMES.WEBHOOK_DELIVERY,
  {
    connection: getQueueConnection(),
    defaultJobOptions: {
      ...DEFAULT_JOB_OPTIONS,
      attempts: MAX_ATTEMPTS,
      backoff: { type: "custom" },
    },
  },
);

export function startWebhookDeliveryWorker(): Worker<WebhookDeliveryJobData> {
  const worker = new Worker<WebhookDeliveryJobData>(
    QUEUE_NAMES.WEBHOOK_DELIVERY,
    async (job: Job<WebhookDeliveryJobData>) => {
      const { deliveryId, endpointId, event, payload } = job.data;
      const log = logger.child({ queue: "webhook-delivery", deliveryId, endpointId, jobId: job.id });

      // Always read endpoint from DB so URL/secret changes take effect on retries
      const endpoint = await prisma.webhookEndpoint.findUnique({
        where: { id: endpointId },
        select: { url: true, secret: true },
      });
      if (!endpoint) {
        log.warn("Webhook endpoint deleted — skipping delivery");
        return;
      }

      const url = endpoint.url;

      // Use canonical JSON so the same payload always produces the same string.
      // Receivers must verify using the raw request body (before JSON parsing).
      const rawBody = canonicalJsonStringify(payload);
      const signature = hmacSha256(endpoint.secret, rawBody);

      const startTime = Date.now();
      let statusCode: number | null = null;
      let responseBody: string | null = null;
      let error: string | null = null;

      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 10_000);

        const response = await fetch(url, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Signature-256": `sha256=${signature}`,
            "X-Webhook-Event": event,
            "X-Delivery-Id": deliveryId,
            "User-Agent": "MultichainTxManager/1.0",
          },
          body: rawBody,
          signal: controller.signal,
        });

        clearTimeout(timeout);
        statusCode = response.status;
        responseBody = await response.text().catch(() => null);

        if (!response.ok) {
          throw new Error(`HTTP ${statusCode}: ${responseBody?.substring(0, 200)}`);
        }

        // ── Success ───────────────────────────────────────────
        const latencyMs = Date.now() - startTime;

        await prisma.$transaction([
          prisma.webhookDelivery.update({
            where: { id: deliveryId },
            data: {
              statusCode,
              responseBody: responseBody?.substring(0, 2000),
              latencyMs,
              attempts: job.attemptsMade + 1,
              deliveredAt: new Date(),
            },
          }),
          prisma.webhookEndpoint.update({
            where: { id: endpointId },
            data: { failureCount: 0, lastDeliveredAt: new Date() },
          }),
        ]);

        log.info({ statusCode, latencyMs }, "Webhook delivered");
      } catch (err) {
        error = (err as Error).message;
        const latencyMs = Date.now() - startTime;

        // Increment the endpoint's failure counter (used for backoff calculation)
        const updatedEndpoint = await prisma.webhookEndpoint.update({
          where: { id: endpointId },
          data: { failureCount: { increment: 1 } },
        });

        // Compute next retry delay based on cumulative failure count
        const nextDelay = computeBackoff(updatedEndpoint.failureCount);

        // Update delivery record
        await prisma.webhookDelivery.update({
          where: { id: deliveryId },
          data: {
            statusCode,
            responseBody: responseBody?.substring(0, 2000),
            latencyMs,
            attempts: job.attemptsMade + 1,
            error,
            nextRetryAt: new Date(Date.now() + nextDelay),
          },
        });

        log.error(
          { err, statusCode, latencyMs, failureCount: updatedEndpoint.failureCount, nextRetryMs: nextDelay },
          "Webhook delivery failed — will retry with exponential backoff",
        );
        throw err; // BullMQ retries
      }
    },
    {
      connection: getWorkerConnection(),
      concurrency: 20,
      settings: {
        backoffStrategy: (attemptsMade: number) => {
          return computeBackoff(attemptsMade);
        },
      },
    },
  );

  worker.on("failed", (job, err) => {
    logger.error({ jobId: job?.id, err }, "webhook-delivery worker failed");
  });

  return worker;
}

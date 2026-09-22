import { config } from "../config/index.js";

// ────────────────────────────────────────────────────────────
// BullMQ shared connection factory & queue constants
//
// We pass plain config objects (not ioredis instances) to avoid
// version mismatches between our ioredis and BullMQ's bundled one.
// Each Queue creates 1 connection; each Worker creates 2.
// Total: 5 queues (5) + 5 workers (10) = 15 Redis connections.
// ────────────────────────────────────────────────────────────

function parseRedisOpts() {
  const url = new URL(config.redis.url);
  return {
    host: url.hostname,
    port: parseInt(url.port || "6379", 10),
    password: url.password || undefined,
    db: parseInt(url.pathname.replace("/", "") || "0", 10),
    maxRetriesPerRequest: null as null,
    enableReadyCheck: false,
  };
}

/** Returns a plain config for BullMQ Queue instances */
export function getQueueConnection() {
  return parseRedisOpts();
}

/** Returns a plain config for BullMQ Worker instances */
export function getWorkerConnection() {
  return parseRedisOpts();
}

export const QUEUE_NAMES = {
  TX_SIGNING: "tx-signing",
  TX_BROADCASTING: "tx-broadcasting",
  TX_CONFIRMATION: "tx-confirmation",
  TX_STUCK_RESOLVER: "tx-stuck-resolver",
  WEBHOOK_DELIVERY: "webhook-delivery",
} as const;

export const DEFAULT_JOB_OPTIONS = {
  attempts: 5,
  backoff: { type: "exponential" as const, delay: 1000 },
  removeOnComplete: { count: 1000 },
  removeOnFail: { count: 5000 },
};

export const WORKER_CONCURRENCY = 50;

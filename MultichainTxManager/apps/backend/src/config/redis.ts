import IORedis from "ioredis";
import { config } from "./index.js";
import { logger } from "../lib/logger.js";

// ────────────────────────────────────────────────────────────
// Shared Redis client (for app-level caching / nonce manager)
// ────────────────────────────────────────────────────────────

export const redis = new IORedis(config.redis.url, {
  maxRetriesPerRequest: null, // required by BullMQ
  enableReadyCheck: false,
  retryStrategy(times) {
    return Math.min(times * 200, 5000);
  },
});

redis.on("error", (err) => {
  logger.error({ err }, "Redis connection error");
});

redis.on("connect", () => {
  logger.info("Redis connected");
});

/** Graceful shutdown helper */
export async function disconnectRedis() {
  await redis.quit();
  logger.info("Redis disconnected");
}

import rateLimit from "express-rate-limit";
import RedisStore from "rate-limit-redis";
import { redis } from "../config/redis.js";

// ────────────────────────────────────────────────────────────
// Rate limiters — Redis-backed (survives restarts, works in clusters)
// ────────────────────────────────────────────────────────────

function createStore(prefix: string) {
  return new RedisStore({
    // @ts-expect-error — ioredis `call` is compatible with the expected sendCommand
    sendCommand: (...args: string[]) => redis.call(...args),
    prefix,
  });
}

/** Default API rate limit: 100 req / 15 min per IP */
export const defaultLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  store: createStore("rl:default:"),
  message: { success: false, message: "Too many requests, please try again later" },
});

/** Stricter limiter for auth endpoints: 10 req / 15 min per IP */
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  store: createStore("rl:auth:"),
  message: { success: false, message: "Too many login attempts, please try again later" },
});

/** TX send limiter: 50 req / min per IP */
export const txSendLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 50,
  standardHeaders: true,
  legacyHeaders: false,
  store: createStore("rl:tx:"),
  message: { success: false, message: "Transaction rate limit exceeded" },
});

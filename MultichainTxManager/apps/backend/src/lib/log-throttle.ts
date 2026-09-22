import { redis } from "../config/redis.js";
import { logger } from "./logger.js";

/** Repeat warn/error logs stay debug after the first hit in this window. */
export const LOG_THROTTLE_TTL_SECS = 20 * 60;

/** True on the first occurrence of `scope` in the TTL window. */
export async function shouldLogOnce(scope: string): Promise<boolean> {
  try {
    const created = await redis.set(`log-throttle:${scope}`, "1", "EX", LOG_THROTTLE_TTL_SECS, "NX");
    return created === "OK";
  } catch (err) {
    logger.debug({ err, scope }, "Log throttle write failed");
    return true;
  }
}

export async function warnOnce(
  scope: string,
  payload: object,
  message: string,
): Promise<void> {
  if (await shouldLogOnce(scope)) {
    logger.warn(payload, message);
  } else {
    logger.debug(payload, message);
  }
}

export async function errorOnce(
  scope: string,
  payload: object,
  message: string,
): Promise<void> {
  if (await shouldLogOnce(scope)) {
    logger.error(payload, message);
  } else {
    logger.debug(payload, message);
  }
}

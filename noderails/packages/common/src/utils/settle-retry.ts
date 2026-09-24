/** BullMQ jobId / name for auto-settle. One in-flight job per payment. No colon (BullMQ rejects it). */
export const SETTLE_JOB_ID_PREFIX = 'settle-';

/** Failed SETTLE rows counted toward backoff and the 8-attempt cap. */
export const SETTLE_SUBMIT_FAIL_WINDOW_MS = 30 * 60 * 1000;

/** After 8 fails in the window, wait this long from the last fail before retry. */
export const SETTLE_SUBMIT_COOLDOWN_MS = 15 * 60 * 1000;

/** Max failed settle submits in the fail window before cooldown. */
export const SETTLE_SUBMIT_MAX_ATTEMPTS_WINDOW = 8;

/** Delay after the 1st, 2nd, … fail (then last value until the cap). */
export const SETTLE_SUBMIT_BACKOFF_MS = [30_000, 60_000, 120_000, 300_000, 600_000, 900_000] as const;

export function settleJobId(paymentIntentId: string): string {
  return `${SETTLE_JOB_ID_PREFIX}${paymentIntentId}`;
}

export function settleSubmitRetryDelayMs(failedInWindow: number): number {
  if (failedInWindow <= 0) return 0;
  if (failedInWindow >= SETTLE_SUBMIT_MAX_ATTEMPTS_WINDOW) {
    return SETTLE_SUBMIT_COOLDOWN_MS;
  }
  const idx = Math.min(failedInWindow, SETTLE_SUBMIT_BACKOFF_MS.length) - 1;
  return SETTLE_SUBMIT_BACKOFF_MS[idx];
}

/** Remaining wait after `lastFailedAt` before another settle submit. */
export function settleSubmitWaitMs(input: {
  nowMs: number;
  lastFailedAtMs: number | null;
  failedInWindow: number;
}): number {
  if (input.lastFailedAtMs == null || input.failedInWindow <= 0) return 0;
  const delay = settleSubmitRetryDelayMs(input.failedInWindow);
  return Math.max(0, input.lastFailedAtMs + delay - input.nowMs);
}

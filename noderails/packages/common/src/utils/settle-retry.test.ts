import { describe, expect, it } from 'vitest';
import {
  settleJobId,
  settleSubmitRetryDelayMs,
  settleSubmitWaitMs,
  SETTLE_SUBMIT_BACKOFF_MS,
  SETTLE_SUBMIT_COOLDOWN_MS,
} from './settle-retry.js';

describe('settleSubmitRetryDelayMs', () => {
  it('is 0 when nothing has failed', () => {
    expect(settleSubmitRetryDelayMs(0)).toBe(0);
  });

  it('steps through backoff then cooldown', () => {
    expect(settleSubmitRetryDelayMs(1)).toBe(SETTLE_SUBMIT_BACKOFF_MS[0]);
    expect(settleSubmitRetryDelayMs(2)).toBe(SETTLE_SUBMIT_BACKOFF_MS[1]);
    expect(settleSubmitRetryDelayMs(6)).toBe(SETTLE_SUBMIT_BACKOFF_MS[5]);
    expect(settleSubmitRetryDelayMs(7)).toBe(SETTLE_SUBMIT_BACKOFF_MS[5]);
    expect(settleSubmitRetryDelayMs(8)).toBe(SETTLE_SUBMIT_COOLDOWN_MS);
    expect(settleSubmitRetryDelayMs(20)).toBe(SETTLE_SUBMIT_COOLDOWN_MS);
  });
});

describe('settleSubmitWaitMs', () => {
  it('is 0 with no last fail', () => {
    expect(settleSubmitWaitMs({ nowMs: 1000, lastFailedAtMs: null, failedInWindow: 3 })).toBe(0);
  });

  it('returns remaining backoff from last fail', () => {
    expect(settleSubmitWaitMs({
      nowMs: 10_000,
      lastFailedAtMs: 0,
      failedInWindow: 1,
    })).toBe(SETTLE_SUBMIT_BACKOFF_MS[0] - 10_000);
  });

  it('is 0 after backoff has elapsed', () => {
    expect(settleSubmitWaitMs({
      nowMs: SETTLE_SUBMIT_BACKOFF_MS[0] + 1,
      lastFailedAtMs: 0,
      failedInWindow: 1,
    })).toBe(0);
  });
});

describe('settleJobId', () => {
  it('is stable per payment', () => {
    expect(settleJobId('abc')).toBe('settle-abc');
  });
});

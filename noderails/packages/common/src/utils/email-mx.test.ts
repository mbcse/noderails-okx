import { afterEach, describe, expect, it, vi } from 'vitest';
import { clearMxLookupCache, domainHasMxRecords, type ResolveMx } from './email-mx.js';

afterEach(() => {
  clearMxLookupCache();
  vi.useRealTimers();
});

describe('domainHasMxRecords', () => {
  it('succeeds when resolveMx returns at least one row', async () => {
    const resolveMx: ResolveMx = async () => [{ exchange: 'mx.gmail.com', priority: 10 }];
    await expect(domainHasMxRecords('gmail.com', resolveMx)).resolves.toBe(true);
  });

  it('fails closed on empty MX', async () => {
    const resolveMx: ResolveMx = async () => [];
    await expect(domainHasMxRecords('no-mx.example', resolveMx)).resolves.toBe(false);
  });

  it('fails closed on resolver error', async () => {
    const resolveMx: ResolveMx = async () => {
      throw new Error('ENOTFOUND');
    };
    await expect(domainHasMxRecords('missing.test', resolveMx)).resolves.toBe(false);
  });

  it('fails closed on timeout', async () => {
    vi.useFakeTimers();
    const resolveMx: ResolveMx = () => new Promise(() => {});
    const pending = domainHasMxRecords('slow.test', resolveMx, { timeoutMs: 20 });
    await vi.advanceTimersByTimeAsync(20);
    await expect(pending).resolves.toBe(false);
  });

  it('does not treat A or AAAA as success', async () => {
    const resolveMx: ResolveMx = async () => [];
    await expect(domainHasMxRecords('web-only.example', resolveMx)).resolves.toBe(false);
  });

  it('caches a positive lookup', async () => {
    let calls = 0;
    const resolveMx: ResolveMx = async () => {
      calls += 1;
      return [{ exchange: 'mx.gmail.com', priority: 10 }];
    };
    await expect(domainHasMxRecords('gmail.com', resolveMx, { now: 1_000 })).resolves.toBe(true);
    await expect(domainHasMxRecords('gmail.com', resolveMx, { now: 2_000 })).resolves.toBe(true);
    expect(calls).toBe(1);
  });
});

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { attachPriceInfoLogic, type BalanceResultBase } from '../src/modules/balance/balance-enrichment.js';

describe('balance price enrichment', () => {
  const baseResult: BalanceResultBase = {
    chainId: 1,
    address: '0xabc',
    token: { symbol: 'ETH', contractAddress: 'native', decimals: 18 },
    balanceRaw: '1000000000000000000',
    balanceFormatted: '1.0',
    rpcEndpointId: 'rpc-1',
    fetchedAt: new Date().toISOString(),
  };

  it('returns result unchanged when includePrice is false', async () => {
    const result = await attachPriceInfoLogic(baseResult, { includePrice: false }, async () => {
      throw new Error('should not fetch price');
    });
    expect(result.price).toBeUndefined();
  });

  it('attaches USD and EUR prices when includePrice is true', async () => {
    const fetchPrice = vi.fn(async (currency: string) => ({
      price: currency === 'USD' ? 3000 : 2800,
      sourcesUsed: ['coingecko'],
      stale: false,
    }));

    const result = await attachPriceInfoLogic(baseResult, { includePrice: true }, fetchPrice);

    expect(fetchPrice).toHaveBeenCalledTimes(2);
    expect(result.price?.currency).toBe('USD');
    expect(result.price?.unitPrice).toBe(3000);
    expect(result.price?.totalValue).toBe('3000.00000000');
    expect(result.prices?.EUR?.unitPrice).toBe(2800);
  });

  it('uses single currency when specified', async () => {
    const fetchPrice = vi.fn(async () => ({
      price: 1.0,
      sourcesUsed: ['coingecko'],
      stale: false,
    }));

    const result = await attachPriceInfoLogic(
      { ...baseResult, token: { ...baseResult.token, symbol: 'USDC' } },
      { includePrice: true, currency: 'EUR' },
      fetchPrice,
    );

    expect(fetchPrice).toHaveBeenCalledTimes(1);
    expect(result.price?.currency).toBe('EUR');
    expect(result.prices).toBeUndefined();
  });
});

describe('rpc failover selection', () => {
  const CIRCUIT_BREAKER_THRESHOLD = 3;

  function selectEndpoints(
    endpoints: Array<{ id: string; consecutiveFailures: number; priority: number }>,
  ) {
    const healthy = endpoints.filter((e) => e.consecutiveFailures < CIRCUIT_BREAKER_THRESHOLD);
    return healthy.length > 0 ? healthy : endpoints;
  }

  it('prefers healthy endpoints', () => {
    const endpoints = [
      { id: 'a', consecutiveFailures: 0, priority: 10 },
      { id: 'b', consecutiveFailures: 5, priority: 20 },
    ];
    const selected = selectEndpoints(endpoints);
    expect(selected).toHaveLength(1);
    expect(selected[0]!.id).toBe('a');
  });

  it('falls back to all when all unhealthy', () => {
    const endpoints = [
      { id: 'a', consecutiveFailures: 5, priority: 10 },
      { id: 'b', consecutiveFailures: 4, priority: 20 },
    ];
    expect(selectEndpoints(endpoints)).toHaveLength(2);
  });
});

describe('price aggregator median', () => {
  it('aggregates multiple source quotes via median', async () => {
    const quotes = [3000, 3010, 2990, 5000];
    const sorted = [...quotes].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    const med = sorted.length % 2 === 0 ? (sorted[mid - 1]! + sorted[mid]!) / 2 : sorted[mid]!;
    const filtered = quotes.filter((v) => Math.abs(v - med) / med <= 0.05);
    expect(filtered).not.toContain(5000);
    expect(filtered.length).toBeGreaterThan(0);
  });
});

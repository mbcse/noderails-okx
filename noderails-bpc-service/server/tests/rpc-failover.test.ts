import { describe, it, expect } from 'vitest';

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

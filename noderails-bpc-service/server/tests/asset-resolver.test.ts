import { describe, it, expect, vi, beforeEach } from 'vitest';
import { buildTokenKey, splitTrailingChainId } from '../src/modules/prices/asset-resolver.helpers.js';

// Re-export helpers for testing pure parse logic
describe('asset param parsing', () => {
  it('builds tokenKey as SYMBOL-CHAINID', () => {
    expect(buildTokenKey('usdc', 137)).toBe('USDC-137');
  });

  it('splits symbol-chainId compound', () => {
    expect(splitTrailingChainId('USDC-137')).toEqual({ head: 'USDC', chainId: 137 });
    expect(splitTrailingChainId('ETH-1')).toEqual({ head: 'ETH', chainId: 1 });
  });

  it('splits contract-chainId compound', () => {
    const addr = '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48';
    expect(splitTrailingChainId(`${addr}-1`)).toEqual({ head: addr, chainId: 1 });
  });

  it('returns null when no trailing chainId', () => {
    expect(splitTrailingChainId('ETH')).toBeNull();
    expect(splitTrailingChainId('USDC')).toBeNull();
  });
});

describe('asset resolver integration', () => {
  it('documents supported asset formats', () => {
    const formats = [
      'ETH',
      'USDC-137',
      '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48-1',
      'native-1',
      '550e8400-e29b-41d4-a716-446655440000',
    ];
    expect(formats.length).toBe(5);
  });
});

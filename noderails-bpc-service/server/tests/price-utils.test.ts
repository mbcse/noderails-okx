import { describe, it, expect } from 'vitest';
import { median, filterOutliers, buildAssetKey } from '../src/modules/prices/sources/types.js';

describe('price utils', () => {
  it('computes median of odd count', () => {
    expect(median([1, 3, 5])).toBe(3);
  });

  it('computes median of even count', () => {
    expect(median([1, 2, 3, 4])).toBe(2.5);
  });

  it('filters outliers beyond threshold', () => {
    const values = [100, 101, 99, 50];
    const filtered = filterOutliers(values, 0.05);
    expect(filtered).toEqual([100, 101, 99]);
  });

  it('builds asset key from symbol', () => {
    expect(buildAssetKey({ symbol: 'eth' })).toBe('ETH');
  });

  it('builds asset key from contract', () => {
    expect(buildAssetKey({ chainId: 1, contractAddress: '0xABC' })).toBe('1:0xabc');
  });
});

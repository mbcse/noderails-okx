export type PriceSourceType = 'CEX' | 'DEX' | 'FX';

export interface PriceRequest {
  assetKey: string;
  symbol?: string;
  chainId?: number;
  contractAddress?: string;
  currency: string;
  coingeckoId?: string;
  defillamaId?: string;
  coingeckoPlatformId?: string;
}

export interface SourceQuote {
  price: number;
  source: string;
  fetchedAt: number;
}

export interface PriceSourceAdapter {
  readonly slug: string;
  readonly type: PriceSourceType;
  supports(request: PriceRequest): boolean;
  fetchQuote(request: PriceRequest): Promise<SourceQuote>;
}

export interface AggregatedPrice {
  assetKey: string;
  symbol?: string;
  currency: string;
  price: number;
  sourcesUsed: string[];
  cachedAt: string;
  stale: boolean;
}

export function buildAssetKey(input: {
  symbol?: string;
  chainId?: number;
  contractAddress?: string;
}): string {
  if (input.chainId && input.contractAddress) {
    return `${input.chainId}:${input.contractAddress.toLowerCase()}`;
  }
  return (input.symbol ?? 'UNKNOWN').toUpperCase();
}

export function median(values: number[]): number {
  if (values.length === 0) throw new Error('Cannot compute median of empty array');
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1]! + sorted[mid]!) / 2 : sorted[mid]!;
}

export function filterOutliers(values: number[], thresholdPct = 0.05): number[] {
  if (values.length <= 2) return values;
  const med = median(values);
  return values.filter((v) => Math.abs(v - med) / med <= thresholdPct);
}

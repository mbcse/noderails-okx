import type { PriceRequest, PriceSourceAdapter, SourceQuote } from './types.js';

const BASE = 'https://coins.llama.fi/prices/current';
const TIMEOUT = 10_000;

function toDefillamaKey(request: PriceRequest): string | null {
  if (request.defillamaId) return request.defillamaId;
  if (request.chainId && request.contractAddress) {
    const platformMap: Record<number, string> = {
      1: 'ethereum',
      137: 'polygon',
      8453: 'base',
      42161: 'arbitrum',
      10: 'optimism',
      103: 'solana',
      203: 'sui',
    };
    const platform = platformMap[request.chainId];
    if (platform) return `${platform}:${request.contractAddress.toLowerCase()}`;
  }
  if (request.coingeckoId) return `coingecko:${request.coingeckoId}`;
  return null;
}

export class DefiLlamaAdapter implements PriceSourceAdapter {
  readonly slug = 'defillama';
  readonly type = 'DEX' as const;

  supports(request: PriceRequest): boolean {
    return !!toDefillamaKey(request);
  }

  async fetchQuote(request: PriceRequest): Promise<SourceQuote> {
    const key = toDefillamaKey(request);
    if (!key) throw new Error('DefiLlama: no asset key');

    const url = `${BASE}/${encodeURIComponent(key)}`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), TIMEOUT);
    try {
      const res = await fetch(url, { signal: controller.signal });
      if (!res.ok) throw new Error(`DefiLlama ${res.status}`);
      const data = (await res.json()) as { coins?: Record<string, { price?: number }> };
      const price = data.coins?.[key]?.price;
      if (price === undefined) throw new Error('DefiLlama: price not found');
      return { price, source: this.slug, fetchedAt: Date.now() };
    } finally {
      clearTimeout(timeout);
    }
  }
}

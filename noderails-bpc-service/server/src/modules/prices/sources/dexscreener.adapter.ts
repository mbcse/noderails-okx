import type { PriceRequest, PriceSourceAdapter, SourceQuote } from './types.js';

const BASE = 'https://api.dexscreener.com/latest/dex/tokens';
const TIMEOUT = 10_000;

export class DexScreenerAdapter implements PriceSourceAdapter {
  readonly slug = 'dexscreener';
  readonly type = 'DEX' as const;

  supports(request: PriceRequest): boolean {
    return !!(request.contractAddress && request.chainId);
  }

  async fetchQuote(request: PriceRequest): Promise<SourceQuote> {
    const address = request.contractAddress!;
    const url = `${BASE}/${address}`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), TIMEOUT);
    try {
      const res = await fetch(url, { signal: controller.signal });
      if (!res.ok) throw new Error(`DexScreener ${res.status}`);
      const data = (await res.json()) as {
        pairs?: Array<{ priceUsd?: string; chainId?: string }>;
      };
      const pairs = data.pairs ?? [];
      if (pairs.length === 0) throw new Error('DexScreener: no pairs');

      const currency = request.currency.toUpperCase();
      const priceUsd = parseFloat(pairs[0]!.priceUsd ?? '0');
      if (!priceUsd) throw new Error('DexScreener: invalid price');

      if (currency === 'USD') {
        return { price: priceUsd, source: this.slug, fetchedAt: Date.now() };
      }

      if (currency === 'EUR') {
        const fxRes = await fetch('https://api.frankfurter.app/latest?from=USD&to=EUR');
        const fx = (await fxRes.json()) as { rates?: { EUR?: number } };
        const rate = fx.rates?.EUR;
        if (!rate) throw new Error('DexScreener: EUR conversion failed');
        return { price: priceUsd * rate, source: this.slug, fetchedAt: Date.now() };
      }

      throw new Error(`DexScreener: unsupported currency ${currency}`);
    } finally {
      clearTimeout(timeout);
    }
  }
}

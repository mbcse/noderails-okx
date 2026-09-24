import type { PriceRequest, PriceSourceAdapter, SourceQuote } from './types.js';

const BASE = 'https://api.jup.ag/price/v2';
const TIMEOUT = 10_000;

export class JupiterAdapter implements PriceSourceAdapter {
  readonly slug = 'jupiter';
  readonly type = 'DEX' as const;

  supports(request: PriceRequest): boolean {
    return request.chainId === 103 && !!request.contractAddress;
  }

  async fetchQuote(request: PriceRequest): Promise<SourceQuote> {
    const mint = request.contractAddress!;
    const url = `${BASE}?ids=${encodeURIComponent(mint)}`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), TIMEOUT);
    try {
      const res = await fetch(url, { signal: controller.signal });
      if (!res.ok) throw new Error(`Jupiter ${res.status}`);
      const data = (await res.json()) as { data?: Record<string, { price?: string }> };
      const entry = data.data?.[mint];
      const priceUsd = parseFloat(entry?.price ?? '0');
      if (!priceUsd) throw new Error('Jupiter: price not found');

      const currency = request.currency.toUpperCase();
      if (currency === 'USD') {
        return { price: priceUsd, source: this.slug, fetchedAt: Date.now() };
      }
      if (currency === 'EUR') {
        const fxRes = await fetch('https://api.frankfurter.app/latest?from=USD&to=EUR');
        const fx = (await fxRes.json()) as { rates?: { EUR?: number } };
        const rate = fx.rates?.EUR;
        if (!rate) throw new Error('Jupiter: EUR conversion failed');
        return { price: priceUsd * rate, source: this.slug, fetchedAt: Date.now() };
      }
      throw new Error(`Jupiter: unsupported currency ${currency}`);
    } finally {
      clearTimeout(timeout);
    }
  }
}

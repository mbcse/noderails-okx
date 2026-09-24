import { CHAIN_COINGECKO_PLATFORMS } from '../../../lib/constants.js';
import type { PriceRequest, PriceSourceAdapter, SourceQuote } from './types.js';

const BASE = 'https://api.geckoterminal.com/api/v2';
const TIMEOUT = 10_000;

const NETWORK_MAP: Record<number, string> = {
  1: 'eth',
  137: 'polygon_pos',
  8453: 'base',
  42161: 'arbitrum',
  10: 'optimism',
  103: 'solana',
  203: 'sui-network',
};

export class GeckoTerminalAdapter implements PriceSourceAdapter {
  readonly slug = 'geckoterminal';
  readonly type = 'DEX' as const;

  supports(request: PriceRequest): boolean {
    return !!(request.chainId && request.contractAddress);
  }

  async fetchQuote(request: PriceRequest): Promise<SourceQuote> {
    const network = NETWORK_MAP[request.chainId!];
    if (!network) throw new Error('GeckoTerminal: unsupported chain');

    const address = request.contractAddress!.toLowerCase();
    const url = `${BASE}/networks/${network}/tokens/${address}`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), TIMEOUT);
    try {
      const res = await fetch(url, { signal: controller.signal });
      if (!res.ok) throw new Error(`GeckoTerminal ${res.status}`);
      const data = (await res.json()) as {
        data?: { attributes?: { price_usd?: string } };
      };
      const priceUsd = parseFloat(data.data?.attributes?.price_usd ?? '0');
      if (!priceUsd) throw new Error('GeckoTerminal: price not found');

      const currency = request.currency.toUpperCase();
      if (currency === 'USD') {
        return { price: priceUsd, source: this.slug, fetchedAt: Date.now() };
      }
      if (currency === 'EUR') {
        const fxRes = await fetch('https://api.frankfurter.app/latest?from=USD&to=EUR');
        const fx = (await fxRes.json()) as { rates?: { EUR?: number } };
        const rate = fx.rates?.EUR;
        if (!rate) throw new Error('GeckoTerminal: EUR conversion failed');
        return { price: priceUsd * rate, source: this.slug, fetchedAt: Date.now() };
      }
      throw new Error(`GeckoTerminal: unsupported currency ${currency}`);
    } finally {
      clearTimeout(timeout);
    }
  }
}

export { CHAIN_COINGECKO_PLATFORMS };

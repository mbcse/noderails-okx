import { env } from '../../../config.js';
import { CHAIN_COINGECKO_PLATFORMS } from '../../../lib/constants.js';
import type { PriceRequest, PriceSourceAdapter, SourceQuote } from './types.js';

const BASE = 'https://api.coingecko.com/api/v3';
const TIMEOUT = 10_000;

const SYMBOL_TO_ID: Record<string, string> = {
  ETH: 'ethereum',
  BTC: 'bitcoin',
  SOL: 'solana',
  SUI: 'sui',
  MATIC: 'matic-network',
  USDC: 'usd-coin',
  USDT: 'tether',
};

async function fetchJson<T>(url: string, headers?: Record<string, string>): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT);
  try {
    const res = await fetch(url, { headers, signal: controller.signal });
    if (!res.ok) throw new Error(`CoinGecko ${res.status}`);
    return (await res.json()) as T;
  } finally {
    clearTimeout(timeout);
  }
}

function headers(): Record<string, string> {
  const h: Record<string, string> = { Accept: 'application/json' };
  if (env.COINGECKO_API_KEY) h['x-cg-demo-api-key'] = env.COINGECKO_API_KEY;
  return h;
}

export class CoinGeckoAdapter implements PriceSourceAdapter {
  readonly slug = 'coingecko';
  readonly type = 'CEX' as const;

  supports(request: PriceRequest): boolean {
    return !!(request.symbol || request.coingeckoId || (request.chainId && request.contractAddress));
  }

  async fetchQuote(request: PriceRequest): Promise<SourceQuote> {
    const currency = request.currency.toLowerCase();
    let price: number | undefined;

    if (request.chainId && request.contractAddress && !request.symbol) {
      const platform = request.coingeckoPlatformId ?? CHAIN_COINGECKO_PLATFORMS[request.chainId];
      if (platform) {
        const url = `${BASE}/simple/token_price/${platform}?contract_addresses=${request.contractAddress}&vs_currencies=${currency}`;
        const data = await fetchJson<Record<string, Record<string, number>>>(url, headers());
        const key = Object.keys(data)[0];
        price = key ? data[key]?.[currency] : undefined;
      }
    }

    if (price === undefined) {
      const id =
        request.coingeckoId ??
        (request.symbol ? SYMBOL_TO_ID[request.symbol.toUpperCase()] : undefined) ??
        request.symbol?.toLowerCase();
      if (!id) throw new Error('CoinGecko: no asset id');
      const url = `${BASE}/simple/price?ids=${encodeURIComponent(id)}&vs_currencies=${currency}`;
      const data = await fetchJson<Record<string, Record<string, number>>>(url, headers());
      price = data[id]?.[currency];
    }

    if (price === undefined) throw new Error(`CoinGecko: price not available for ${request.assetKey}`);
    return { price, source: this.slug, fetchedAt: Date.now() };
  }
}

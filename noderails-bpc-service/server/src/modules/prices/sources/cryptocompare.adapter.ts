import { env } from '../../../config.js';
import type { PriceRequest, PriceSourceAdapter, SourceQuote } from './types.js';

const BASE = 'https://min-api.cryptocompare.com/data';
const TIMEOUT = 10_000;

const ALIASES: Record<string, string> = {
  MATIC: 'MATIC',
  WETH: 'ETH',
};

async function fetchPrice(fsym: string, tsym: string): Promise<number> {
  const url = `${BASE}/price?fsym=${fsym}&tsyms=${tsym}`;
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (env.CRYPTOCOMPARE_API_KEY) headers.authorization = `Apikey ${env.CRYPTOCOMPARE_API_KEY}`;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT);
  try {
    const res = await fetch(url, { headers, signal: controller.signal });
    if (!res.ok) throw new Error(`CryptoCompare ${res.status}`);
    const data = (await res.json()) as Record<string, unknown>;
    if (data.Response === 'Error') throw new Error(String(data.Message));
    const price = data[tsym] as number | undefined;
    if (price === undefined) throw new Error('Price not found');
    return price;
  } finally {
    clearTimeout(timeout);
  }
}

export class CryptoCompareAdapter implements PriceSourceAdapter {
  readonly slug = 'cryptocompare';
  readonly type = 'CEX' as const;

  supports(request: PriceRequest): boolean {
    return !!request.symbol;
  }

  async fetchQuote(request: PriceRequest): Promise<SourceQuote> {
    const fsym = ALIASES[request.symbol!.toUpperCase()] ?? request.symbol!.toUpperCase();
    const tsym = request.currency.toUpperCase();
    const price = await fetchPrice(fsym, tsym);
    return { price, source: this.slug, fetchedAt: Date.now() };
  }
}

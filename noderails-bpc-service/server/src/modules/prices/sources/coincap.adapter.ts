import { env } from '../../../config.js';
import { BasePriceAdapter } from './base.adapter.js';
import type { PriceRequest, SourceQuote } from './types.js';

const BASE = 'https://api.coincap.io/v2';
const TIMEOUT = 10_000;

const SYMBOL_TO_ID: Record<string, string> = {
  ETH: 'ethereum',
  BTC: 'bitcoin',
  SOL: 'solana',
  SUI: 'sui',
  MATIC: 'polygon',
  USDC: 'usd-coin',
  USDT: 'tether',
};

export class CoinCapAdapter extends BasePriceAdapter {
  readonly slug = 'coincap';
  readonly type = 'CEX' as const;

  supports(request: PriceRequest): boolean {
    return request.currency.toUpperCase() === 'USD' && !!request.symbol;
  }

  async fetchQuote(request: PriceRequest): Promise<SourceQuote> {
    const id = SYMBOL_TO_ID[request.symbol!.toUpperCase()] ?? request.symbol!.toLowerCase();
    const headers: Record<string, string> = { Accept: 'application/json' };
    if (env.COINCAP_API_KEY) headers.Authorization = `Bearer ${env.COINCAP_API_KEY}`;

    const data = await this.fetchWithTimeout<{ data?: { priceUsd?: string } }>(
      `${BASE}/assets/${encodeURIComponent(id)}`,
      TIMEOUT,
      { headers },
    );
    const price = parseFloat(data.data?.priceUsd ?? '0');
    if (!price) throw new Error(`CoinCap: price not available for ${request.symbol}`);
    return { price, source: this.slug, fetchedAt: Date.now() };
  }
}

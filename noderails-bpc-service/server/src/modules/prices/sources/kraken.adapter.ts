import { BasePriceAdapter } from './base.adapter.js';
import type { PriceRequest, SourceQuote } from './types.js';

const TIMEOUT = 10_000;

/** Kraken pair names for common assets */
const KRAKEN_PAIRS: Record<string, { USD?: string; EUR?: string }> = {
  ETH: { USD: 'XETHZUSD', EUR: 'XETHZEUR' },
  BTC: { USD: 'XXBTZUSD', EUR: 'XXBTZEUR' },
  SOL: { USD: 'SOLUSD', EUR: 'SOLEUR' },
  SUI: { USD: 'SUIUSD', EUR: 'SUIEUR' },
  MATIC: { USD: 'MATICUSD', EUR: 'MATICEUR' },
  USDC: { USD: 'USDCUSD', EUR: 'USDCEUR' },
  USDT: { USD: 'USDTUSD', EUR: 'USDTEUR' },
};

export class KrakenAdapter extends BasePriceAdapter {
  readonly slug = 'kraken';
  readonly type = 'CEX' as const;

  supports(request: PriceRequest): boolean {
    const currency = request.currency.toUpperCase();
    if (currency !== 'USD' && currency !== 'EUR') return false;
    return !!request.symbol && !!KRAKEN_PAIRS[request.symbol.toUpperCase()]?.[currency];
  }

  async fetchQuote(request: PriceRequest): Promise<SourceQuote> {
    const currency = request.currency.toUpperCase() as 'USD' | 'EUR';
    const pair = KRAKEN_PAIRS[request.symbol!.toUpperCase()]?.[currency];
    if (!pair) throw new Error(`Kraken: unsupported pair ${request.symbol}/${currency}`);

    const data = await this.fetchWithTimeout<{
      error?: string[];
      result?: Record<string, { c?: [string, string] }>;
    }>(`https://api.kraken.com/0/public/Ticker?pair=${pair}`, TIMEOUT);

    if (data.error?.length) throw new Error(`Kraken: ${data.error.join(', ')}`);

    const tickerKey = Object.keys(data.result ?? {})[0];
    const priceStr = tickerKey ? data.result?.[tickerKey]?.c?.[0] : undefined;
    const price = parseFloat(priceStr ?? '0');
    if (!price) throw new Error(`Kraken: price not found for ${pair}`);

    return { price, source: this.slug, fetchedAt: Date.now() };
  }
}

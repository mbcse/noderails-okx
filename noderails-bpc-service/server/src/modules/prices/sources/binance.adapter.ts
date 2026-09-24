import type { PriceRequest, PriceSourceAdapter, SourceQuote } from './types.js';

const TIMEOUT = 5_000;

const BINANCE_SYMBOLS: Record<string, string> = {
  ETH: 'ETHUSDT',
  BTC: 'BTCUSDT',
  SOL: 'SOLUSDT',
  SUI: 'SUIUSDT',
  MATIC: 'MATICUSDT',
  USDC: 'USDCUSDT',
  USDT: 'USDTUSDT',
};

export class BinanceAdapter implements PriceSourceAdapter {
  readonly slug = 'binance';
  readonly type = 'CEX' as const;

  supports(request: PriceRequest): boolean {
    return request.currency.toUpperCase() === 'USD' && !!request.symbol && !!BINANCE_SYMBOLS[request.symbol.toUpperCase()];
  }

  async fetchQuote(request: PriceRequest): Promise<SourceQuote> {
    const pair = BINANCE_SYMBOLS[request.symbol!.toUpperCase()];
    if (!pair) throw new Error('Binance: unsupported symbol');
    const url = `https://api.binance.com/api/v3/ticker/price?symbol=${pair}`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), TIMEOUT);
    try {
      const res = await fetch(url, { signal: controller.signal });
      if (!res.ok) throw new Error(`Binance ${res.status}`);
      const data = (await res.json()) as { price?: string };
      const price = parseFloat(data.price ?? '0');
      if (!price) throw new Error('Binance: invalid price');
      return { price, source: this.slug, fetchedAt: Date.now() };
    } finally {
      clearTimeout(timeout);
    }
  }
}

export class FrankfurterAdapter implements PriceSourceAdapter {
  readonly slug = 'frankfurter';
  readonly type = 'FX' as const;

  supports(request: PriceRequest): boolean {
    const c = request.currency.toUpperCase();
    return request.symbol?.toUpperCase() === 'USD' && (c === 'EUR' || c === 'GBP');
  }

  async fetchQuote(request: PriceRequest): Promise<SourceQuote> {
    const to = request.currency.toUpperCase();
    const url = `https://api.frankfurter.app/latest?from=USD&to=${to}`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), TIMEOUT);
    try {
      const res = await fetch(url, { signal: controller.signal });
      if (!res.ok) throw new Error(`Frankfurter ${res.status}`);
      const data = (await res.json()) as { rates?: Record<string, number> };
      const price = data.rates?.[to];
      if (!price) throw new Error('Frankfurter: rate not found');
      return { price, source: this.slug, fetchedAt: Date.now() };
    } finally {
      clearTimeout(timeout);
    }
  }
}

import type { PriceSourceAdapter } from './types.js';
import { CoinGeckoAdapter } from './coingecko.adapter.js';
import { CryptoCompareAdapter } from './cryptocompare.adapter.js';
import { DefiLlamaAdapter } from './defillama.adapter.js';
import { DexScreenerAdapter } from './dexscreener.adapter.js';
import { JupiterAdapter } from './jupiter.adapter.js';
import { GeckoTerminalAdapter } from './geckoterminal.adapter.js';
import { BinanceAdapter, FrankfurterAdapter } from './binance.adapter.js';
import { CoinCapAdapter } from './coincap.adapter.js';
import { KrakenAdapter } from './kraken.adapter.js';

const ADAPTERS: PriceSourceAdapter[] = [
  new CoinGeckoAdapter(),
  new CryptoCompareAdapter(),
  new CoinCapAdapter(),
  new KrakenAdapter(),
  new DefiLlamaAdapter(),
  new DexScreenerAdapter(),
  new JupiterAdapter(),
  new GeckoTerminalAdapter(),
  new BinanceAdapter(),
  new FrankfurterAdapter(),
];

const adapterMap = new Map(ADAPTERS.map((a) => [a.slug, a]));

export function getAdapter(slug: string): PriceSourceAdapter | undefined {
  return adapterMap.get(slug);
}

export function getAllAdapters(): PriceSourceAdapter[] {
  return ADAPTERS;
}

export function registerAdapter(adapter: PriceSourceAdapter): void {
  adapterMap.set(adapter.slug, adapter);
  if (!ADAPTERS.find((a) => a.slug === adapter.slug)) {
    ADAPTERS.push(adapter);
  }
}

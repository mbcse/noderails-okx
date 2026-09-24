import type { BalanceResult } from './balance.service.js';

export type BalanceResultBase = Omit<BalanceResult, 'price' | 'prices'>;

export interface PriceFetchResult {
  price: number;
  sourcesUsed: string[];
  stale: boolean;
}

export interface EnrichmentOptions {
  includePrice?: boolean;
  currency?: string;
}

/** Extracted for unit/integration testing of price enrichment logic */
export async function attachPriceInfoLogic(
  result: BalanceResultBase,
  options: EnrichmentOptions,
  fetchPrice: (currency: string) => Promise<PriceFetchResult>,
): Promise<BalanceResult> {
  if (!options.includePrice) return result;

  const currencies = options.currency
    ? [options.currency.toUpperCase()]
    : ['USD', 'EUR'];

  const priceEntries: Record<string, {
    currency: string;
    unitPrice: number;
    totalValue: string;
    sourcesUsed: string[];
    stale: boolean;
  }> = {};

  const balanceNum = parseFloat(result.balanceFormatted);

  for (const currency of currencies) {
    try {
      const aggregated = await fetchPrice(currency);
      priceEntries[currency] = {
        currency,
        unitPrice: aggregated.price,
        totalValue: (balanceNum * aggregated.price).toFixed(8),
        sourcesUsed: aggregated.sourcesUsed,
        stale: aggregated.stale,
      };
    } catch {
      // skip failed currency
    }
  }

  if (Object.keys(priceEntries).length === 0) return result;

  const primary = priceEntries[currencies[0]!];
  return {
    ...result,
    price: primary,
    prices: Object.keys(priceEntries).length > 1 ? priceEntries : undefined,
  };
}

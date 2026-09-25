import { env } from '../config.js';

interface BpcResponse<T> {
  success: boolean;
  data?: T;
  error?: { code: string; message: string };
}

export interface BpcPriceData {
  asset?: string;
  assetKey?: string;
  symbol?: string;
  currency: string;
  price: number;
  sourcesUsed?: string[];
  cachedAt: string;
  stale?: boolean;
  resolvedVia?: string;
  tokenKey?: string;
  amountFiat?: number;
  tokenAmount?: string;
}

export interface BpcBalancePriceInfo {
  currency: string;
  unitPrice: number;
  totalValue: string;
  sourcesUsed?: string[];
  stale?: boolean;
}

export interface BpcBalanceData {
  chainId: number;
  address: string;
  token: {
    symbol: string;
    contractAddress: string;
    decimals: number;
  };
  balanceRaw: string;
  balanceFormatted: string;
  fetchedAt: string;
  price?: BpcBalancePriceInfo;
}

export interface BpcBalanceBatchItem {
  chainId: number;
  address: string;
  token?: string;
}

export interface BpcSwapQuoteData extends BpcPriceData {
  dstAsset?: string;
  cryptoAmount?: string;
  dstAmount?: string;
  minAmountOut?: string;
  src?: string;
  dst?: string;
  quote?: 'swap';
}

export interface GetPriceParams {
  asset: string;
  currency?: string;
  amountFiat?: number;
  tokenAmount?: number;
  dstAsset?: string;
}

async function bpcFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), env.BPC_SERVICE_TIMEOUT_MS);
  try {
    const res = await fetch(`${env.BPC_SERVICE_URL}${path}`, {
      ...init,
      signal: controller.signal,
      headers: {
        Accept: 'application/json',
        ...(init?.headers ?? {}),
      },
    });
    const json = (await res.json()) as BpcResponse<T>;
    if (!res.ok || !json.success || json.data === undefined) {
      throw new Error(json.error?.message ?? `BPC error ${res.status}`);
    }
    return json.data;
  } finally {
    clearTimeout(timeout);
  }
}

export async function getPrice(params: GetPriceParams): Promise<BpcSwapQuoteData> {
  const search = new URLSearchParams({
    asset: params.asset,
    currency: (params.currency ?? 'USD').toUpperCase(),
  });
  if (params.amountFiat !== undefined) {
    search.set('amountFiat', String(params.amountFiat));
  }
  if (params.tokenAmount !== undefined) {
    search.set('tokenAmount', String(params.tokenAmount));
  }
  if (params.dstAsset) {
    search.set('dstAsset', params.dstAsset);
  }
  return bpcFetch<BpcSwapQuoteData>(`/v1/prices?${search.toString()}`);
}

export async function getBalance(
  chainId: number,
  address: string,
  token = 'native',
  includePrice = false,
  currency = 'USD',
): Promise<BpcBalanceData> {
  const search = new URLSearchParams({
    chainId: String(chainId),
    address,
    token,
  });
  if (includePrice) {
    search.set('includePrice', 'true');
    search.set('currency', currency.toUpperCase());
  }
  return bpcFetch<BpcBalanceData>(`/v1/balance?${search.toString()}`);
}

export async function getBalancesBatch(
  items: BpcBalanceBatchItem[],
  includePrice = false,
  currency = 'USD',
): Promise<BpcBalanceData[]> {
  return bpcFetch<BpcBalanceData[]>('/v1/balance/batch', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      items,
      includePrice,
      currency: currency.toUpperCase(),
    }),
  });
}

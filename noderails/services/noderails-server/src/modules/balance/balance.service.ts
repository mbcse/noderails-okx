import { isNativeToken } from '@noderails/common';
import { getDatabaseClient } from '@noderails/database';
import type { Logger } from '@noderails/service-base';
import * as bpcClient from '../../clients/bpc.client.js';

export interface CheckoutBalanceResult {
  chainId: number;
  address: string;
  balanceRaw: string;
  balanceFormatted: string;
  decimals: number;
  symbol: string;
  fetchedAt: string;
  price?: {
    unitPrice: number;
    totalValue: string;
    currency: string;
  };
}

export interface BalanceQuery {
  chainId: number;
  address: string;
  token?: string;
  tokenKey?: string;
  includePrice?: boolean;
  currency?: string;
}

function normalizeBalance(data: bpcClient.BpcBalanceData): CheckoutBalanceResult {
  return {
    chainId: data.chainId,
    address: data.address,
    balanceRaw: data.balanceRaw,
    balanceFormatted: data.balanceFormatted,
    decimals: data.token.decimals,
    symbol: data.token.symbol,
    fetchedAt: data.fetchedAt,
    price: data.price
      ? {
          unitPrice: data.price.unitPrice,
          totalValue: data.price.totalValue,
          currency: data.price.currency,
        }
      : undefined,
  };
}

export function resolveBalanceTokenParam(contractAddress: string): string {
  return isNativeToken(contractAddress) ? 'native' : contractAddress.trim();
}

async function resolveTokenParam(query: BalanceQuery): Promise<string> {
  if (query.token?.trim()) {
    return query.token.trim();
  }

  if (query.tokenKey?.trim()) {
    const db = getDatabaseClient();
    const token = await db.supportedToken.findFirst({
      where: { tokenKey: query.tokenKey.trim(), chainId: query.chainId, isEnabled: true },
    });
    if (!token) {
      throw new Error(`Token ${query.tokenKey} not found on chain ${query.chainId}`);
    }
    return resolveBalanceTokenParam(token.contractAddress);
  }

  return 'native';
}

export async function getWalletBalance(
  query: BalanceQuery,
  logger: Logger,
): Promise<CheckoutBalanceResult> {
  const token = await resolveTokenParam(query);
  const currency = (query.currency ?? 'USD').toUpperCase();

  logger.debug('Fetching balance from BPC', {
    chainId: query.chainId,
    address: query.address,
    token,
    tokenKey: query.tokenKey,
  });

  const data = await bpcClient.getBalance(
    query.chainId,
    query.address,
    token,
    query.includePrice ?? false,
    currency,
  );

  return normalizeBalance(data);
}

export async function getWalletBalancesBatch(
  items: Array<{ chainId: number; address: string; token?: string; tokenKey?: string }>,
  includePrice: boolean,
  currency: string,
  logger: Logger,
): Promise<CheckoutBalanceResult[]> {
  const resolvedItems = await Promise.all(
    items.map(async (item) => ({
      chainId: item.chainId,
      address: item.address,
      token: await resolveTokenParam({
        chainId: item.chainId,
        address: item.address,
        token: item.token,
        tokenKey: item.tokenKey,
      }),
    })),
  );

  logger.debug('Fetching batch balances from BPC', { count: resolvedItems.length });

  const data = await bpcClient.getBalancesBatch(resolvedItems, includePrice, currency);
  return data.map(normalizeBalance);
}

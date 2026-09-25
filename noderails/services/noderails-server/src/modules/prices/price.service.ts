import { isNativeToken, ValidationError } from '@noderails/common';
import type { Logger } from '@noderails/service-base';
import { getDatabaseClient } from '@noderails/database';
import * as bpcClient from '../../clients/bpc.client.js';
import { getSwapQuoteTtlSeconds } from '../payments/fee-config.service.js';

export interface PriceParams {
  asset: string;
  currency?: string;
  amountFiat?: number;
  tokenAmount?: number;
  dstAsset?: string;
  quote?: 'swap';
  checkoutSessionId?: string;
}

export interface PriceResult {
  asset: string;
  symbol: string;
  currency: string;
  priceFiat: number;
  /** @deprecated Use priceFiat — kept for backward compatibility */
  priceUsd: number;
  cachedAt: string;
  stale?: boolean;
  amountFiat?: number;
  tokenAmount?: string;
  quoteId?: string;
  cryptoAmount?: string;
  minAmountOut?: string;
  dstAmount?: string;
  expiresAt?: string;
  ttlSeconds?: number;
}

export interface TokenAssetInput {
  tokenKey: string;
  symbol: string;
  contractAddress: string;
  chainId: number;
}

export function resolveAssetFromToken(token: TokenAssetInput): string {
  if (token.tokenKey?.trim()) {
    return token.tokenKey.trim();
  }
  if (token.contractAddress && !isNativeToken(token.contractAddress)) {
    return `${token.contractAddress.trim()}-${token.chainId}`;
  }
  return token.symbol.toUpperCase();
}

function mapBpcPrice(data: bpcClient.BpcPriceData, asset: string): PriceResult {
  const currency = data.currency.toUpperCase();
  const symbol = data.symbol ?? asset.split('-')[0] ?? asset;
  return {
    asset: data.asset ?? data.assetKey ?? asset,
    symbol,
    currency,
    priceFiat: data.price,
    priceUsd: currency === 'USD' ? data.price : data.price,
    cachedAt: data.cachedAt,
    stale: data.stale,
    amountFiat: data.amountFiat,
    tokenAmount: data.tokenAmount,
  };
}

export async function getPrice(params: PriceParams, logger: Logger): Promise<PriceResult> {
  const asset = params.asset.trim();
  const currency = (params.currency ?? 'USD').toUpperCase();

  if (params.quote === 'swap') {
    return bindSwapQuote(params, logger);
  }

  logger.debug('Fetching price from BPC', {
    asset,
    currency,
    amountFiat: params.amountFiat,
    tokenAmount: params.tokenAmount,
  });

  const data = await bpcClient.getPrice({
    asset,
    currency,
    amountFiat: params.amountFiat,
    tokenAmount: params.tokenAmount,
  });

  const result = mapBpcPrice(data, asset);

  if (params.amountFiat !== undefined && !result.tokenAmount) {
    result.tokenAmount = convertFiatToToken(params.amountFiat, result.priceFiat);
    result.amountFiat = params.amountFiat;
  }

  if (params.tokenAmount !== undefined && result.amountFiat === undefined) {
    result.amountFiat = Number(convertTokenToFiat(params.tokenAmount, result.priceFiat));
    result.tokenAmount = String(params.tokenAmount);
  }

  return result;
}

export function convertFiatToToken(fiatAmount: number, priceFiat: number): string {
  if (priceFiat <= 0) throw new Error('Invalid price');
  return (fiatAmount / priceFiat).toFixed(18);
}

export function convertTokenToFiat(tokenAmount: number, priceFiat: number): string {
  return (tokenAmount * priceFiat).toFixed(8);
}

/** @deprecated Use convertFiatToToken */
export const convertUsdToToken = convertFiatToToken;

/** @deprecated Use convertTokenToFiat */
export const convertTokenToUsd = convertTokenToFiat;

async function bindSwapQuote(params: PriceParams, logger: Logger): Promise<PriceResult> {
  if (!params.dstAsset || params.amountFiat === undefined) {
    throw new ValidationError('Swap quote requires dstAsset and amountFiat');
  }
  const data = await bpcClient.getPrice({
    asset: params.asset.trim(),
    currency: params.currency,
    amountFiat: params.amountFiat,
    dstAsset: params.dstAsset,
  });
  if (!data.cryptoAmount || !data.minAmountOut || !data.tokenAmount) {
    throw new ValidationError('BPC swap quote did not return a sized amount');
  }

  const ttlSeconds = await getSwapQuoteTtlSeconds();
  const expiresAt = new Date(Date.now() + ttlSeconds * 1000);
  const db = getDatabaseClient();
  const quote = await db.swapQuote.create({
    data: {
      checkoutSessionId: params.checkoutSessionId ?? null,
      asset: params.asset.trim(),
      dstAsset: params.dstAsset,
      cryptoAmount: data.cryptoAmount,
      minAmountOut: data.minAmountOut,
      expiresAt,
    },
  });

  logger.info('Bound swap quote', {
    quoteId: quote.id,
    asset: params.asset,
    dstAsset: params.dstAsset,
    expiresAt: expiresAt.toISOString(),
  });

  const mapped = mapBpcPrice(data, params.asset.trim());
  return {
    ...mapped,
    tokenAmount: data.tokenAmount,
    amountFiat: params.amountFiat,
    quoteId: quote.id,
    cryptoAmount: data.cryptoAmount,
    minAmountOut: data.minAmountOut,
    dstAmount: data.dstAmount,
    expiresAt: expiresAt.toISOString(),
    ttlSeconds,
  };
}

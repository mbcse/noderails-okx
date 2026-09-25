import { getDatabaseClient } from '@noderails/database';
import { ValidationError, isNativeToken } from '@noderails/common';
import { parseUnits } from 'viem';
import type { PayoutAuthFamily } from './payout-auth.service.js';

const HUMAN_AMOUNT = /^\d+(\.\d+)?$/;

export function nativeTokenDecimals(family: PayoutAuthFamily): number {
  return family === 'EVM' ? 18 : 9;
}

export function parseHumanTokenAmount(raw: string, decimals: number, label = 'amount'): bigint {
  const s = raw.trim();
  if (!HUMAN_AMOUNT.test(s)) {
    throw new ValidationError(`${label} must be a human decimal string`);
  }
  try {
    const n = parseUnits(s, decimals);
    if (n <= 0n) throw new ValidationError(`${label} must be greater than zero`);
    return n;
  } catch (err) {
    if (err instanceof ValidationError) throw err;
    throw new ValidationError(`${label} is not a valid token amount`);
  }
}

export async function resolvePayoutToken(input: {
  appId: string;
  chainId: number;
  tokenAddress: string;
  family: PayoutAuthFamily;
}): Promise<{ tokenAddress: string; decimals: number; symbol: string }> {
  const tokenAddr = input.tokenAddress.trim();
  if (isNativeToken(tokenAddr)) {
    return {
      tokenAddress: tokenAddr,
      decimals: nativeTokenDecimals(input.family),
      symbol: 'native',
    };
  }

  const db = getDatabaseClient();
  const catalog = await db.supportedToken.findMany({
    where: { chainId: input.chainId, isEnabled: true },
  });
  const supported = catalog.find(
    (t) => t.contractAddress.toLowerCase() === tokenAddr.toLowerCase(),
  );
  if (!supported) {
    throw new ValidationError('Token is not in the admin catalog for this chain');
  }

  const appToken = await db.appToken.findUnique({
    where: {
      appId_supportedTokenId: { appId: input.appId, supportedTokenId: supported.id },
    },
  });
  if (!appToken?.isEnabled) {
    throw new ValidationError('Token is not enabled for this app');
  }

  return {
    tokenAddress: supported.contractAddress,
    decimals: supported.decimals,
    symbol: supported.symbol,
  };
}

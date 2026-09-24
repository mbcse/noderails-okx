import { getDatabaseClient } from '../../lib/db.js';
import { isNativeToken, ValidationError } from '../../lib/constants.js';
import { oneInchClient } from '../../clients/oneinch.client.js';
import { getPriceByAsset, convertFiatToToken } from './price-aggregator.service.js';
import { resolveAsset } from './asset-resolver.service.js';
import type { Logger } from '../../lib/logger.js';

const SLIPPAGE_BPS = 100n;
const MAX_ITERS = 6;

function fiatToRaw(amountFiat: number, decimals: number): bigint {
  const fixed = amountFiat.toFixed(decimals);
  const [whole, frac = ''] = fixed.split('.');
  return BigInt(whole + frac.padEnd(decimals, '0').slice(0, decimals));
}

function rawToHuman(raw: bigint, decimals: number): string {
  const padded = raw.toString().padStart(decimals + 1, '0');
  const whole = padded.slice(0, -decimals);
  const frac = padded.slice(-decimals).replace(/0+$/, '');
  return frac ? `${whole}.${frac}` : whole;
}

async function loadToken(asset: string) {
  const resolved = await resolveAsset(asset);
  const db = getDatabaseClient();
  const token = resolved.tokenId
    ? await db.token.findUnique({ where: { id: resolved.tokenId } })
    : resolved.tokenKey
      ? await db.token.findFirst({ where: { tokenKey: resolved.tokenKey, isEnabled: true } })
      : resolved.chainId && resolved.contractAddress
        ? await db.token.findFirst({
            where: {
              chainId: resolved.chainId,
              contractAddress: resolved.contractAddress,
              isEnabled: true,
            },
          })
        : null;
  if (!token) {
    throw new ValidationError(`Token ${asset} is not registered in BPC`);
  }
  return { resolved, token };
}

export async function getExactOutSwapQuote(input: {
  asset: string;
  dstAsset: string;
  amountFiat: number;
  currency: string;
  logger: Logger;
}) {
  const src = await loadToken(input.asset);
  const dst = await loadToken(input.dstAsset);
  if (src.token.chainId !== dst.token.chainId) {
    throw new ValidationError('Swap quote requires source and destination on the same chain');
  }

  const minAmountOut = fiatToRaw(input.amountFiat, dst.token.decimals);
  const spot = await getPriceByAsset(input.asset, input.currency, input.logger);
  const spotHuman = convertFiatToToken(input.amountFiat, spot.price);
  let amountIn = fiatToRaw(Number(spotHuman), src.token.decimals);
  if (amountIn <= 0n) {
    throw new ValidationError('Spot estimate produced a zero source amount');
  }

  const srcAddress = isNativeToken(src.token.contractAddress)
    ? oneInchClient.nativeTokenAddress()
    : src.token.contractAddress;
  const dstAddress = isNativeToken(dst.token.contractAddress)
    ? oneInchClient.nativeTokenAddress()
    : dst.token.contractAddress;

  let dstAmount = 0n;
  for (let i = 0; i < MAX_ITERS; i++) {
    const quote = await oneInchClient.getQuote({
      chainId: src.token.chainId,
      src: srcAddress,
      dst: dstAddress,
      amount: amountIn.toString(),
    });
    dstAmount = BigInt(quote.dstAmount);
    const afterSlip = (dstAmount * (10_000n - SLIPPAGE_BPS)) / 10_000n;
    if (afterSlip >= minAmountOut) {
      break;
    }
    if (afterSlip <= 0n) {
      amountIn = (amountIn * 12n) / 10n;
      continue;
    }
    amountIn = (amountIn * minAmountOut) / afterSlip + 1n;
    if (i === MAX_ITERS - 1 && afterSlip < minAmountOut) {
      throw new ValidationError('Could not size a 1inch quote that covers the invoice amount');
    }
  }

  return {
    asset: input.asset,
    dstAsset: input.dstAsset,
    currency: input.currency.toUpperCase(),
    amountFiat: input.amountFiat,
    tokenAmount: rawToHuman(amountIn, src.token.decimals),
    cryptoAmount: amountIn.toString(),
    dstAmount: dstAmount.toString(),
    minAmountOut: minAmountOut.toString(),
    src: srcAddress,
    dst: dstAddress,
    price: spot.price,
    cachedAt: new Date().toISOString(),
    quote: 'swap' as const,
  };
}

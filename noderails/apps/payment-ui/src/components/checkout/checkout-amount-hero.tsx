'use client';

import { Label, Spinner } from '@heroui/react';
import { usePriceConversion } from '@/lib/checkout-hooks';

export function CheckoutAmountHero({
  tokenKey,
  tokenSymbol,
  amountUsd,
  decimals,
  currency,
  chainName,
  chainIcon,
  tokenIcon,
  swapQuote,
}: {
  tokenKey: string;
  tokenSymbol: string;
  amountUsd: number;
  decimals: number;
  currency: string;
  chainName: string;
  chainIcon?: React.ReactNode;
  tokenIcon?: React.ReactNode;
  swapQuote?: { dstAsset: string; checkoutSessionId: string } | null;
}) {
  const price = usePriceConversion(
    tokenKey,
    amountUsd,
    decimals,
    currency,
    swapQuote && swapQuote.dstAsset !== tokenKey ? swapQuote : null,
  );

  const tokenAmount = price.data ? Number(price.data.tokenAmount) : null;

  const displayAmount =
    tokenAmount != null
      ? tokenAmount >= 1
        ? tokenAmount.toFixed(2)
        : tokenAmount.toFixed(6).replace(/\.?0+$/, '')
      : null;

  return (
    <div className="checkout-amount-hero px-6 py-5 text-center">
      <Label className="mb-3 block text-xs font-bold uppercase tracking-widest text-indigo-600">
        Amount to send
      </Label>

      {price.isLoading ? (
        <div className="flex h-12 items-center justify-center">
          <Spinner size="md" className="text-indigo-600" />
        </div>
      ) : (
        <div className="flex items-center justify-center gap-2.5">
          <span className="checkout-amount-value tabular-nums">
            {displayAmount ?? '...'}
          </span>
          {tokenIcon && (
            <span className="shrink-0 [&_div]:h-7 [&_div]:w-7 [&_div]:text-[10px] [&_img]:h-7 [&_img]:w-7">
              {tokenIcon}
            </span>
          )}
          <span className="text-xl font-bold text-slate-800">{tokenSymbol}</span>
        </div>
      )}

      <div className="mt-2.5 flex items-center justify-center gap-1.5 text-sm font-medium text-slate-600">
        <span>on</span>
        {chainIcon && (
          <span className="shrink-0 [&_div]:h-4 [&_div]:w-4 [&_div]:text-[7px] [&_img]:h-4 [&_img]:w-4">
            {chainIcon}
          </span>
        )}
        <span>{chainName}</span>
      </div>

      {price.expired && (
        <div className="mt-3 space-y-1">
          <p className="text-xs font-semibold text-red-600">Quote expired — get a new quote</p>
          <button
            type="button"
            onClick={price.refetch}
            className="text-xs font-semibold text-indigo-600 underline"
          >
            Refresh quote
          </button>
        </div>
      )}
      {price.data?.expiresAt && !price.expired && (
        <p className="mt-2 text-xs font-medium text-slate-500">
          Quote expires at {new Date(price.data.expiresAt).toLocaleTimeString()}
        </p>
      )}
      {price.error && (
        <p className="mt-2 text-xs font-semibold text-red-600">Could not fetch rate</p>
      )}
    </div>
  );
}

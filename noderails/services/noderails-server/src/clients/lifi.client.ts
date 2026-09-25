import { createClient, getContractCallsQuote, getQuote, getStatus } from '@lifi/sdk';
import type { Hex, Address } from 'viem';
import { env } from '../config.js';

export interface LiFiTxRequest {
  to: Address;
  data: Hex;
  value?: string;
  gasLimit?: string;
}

export interface LiFiQuoteResult {
  tool: string;
  fromAmount: string;
  toAmount: string;
  toAmountMin: string;
  transactionRequest: LiFiTxRequest;
}

interface LiFiStepEstimate {
  fromAmount?: string;
  toAmount?: string;
  toAmountMin?: string;
}

interface LiFiStepLike {
  type?: string;
  tool?: string;
  action?: { fromAmount?: string };
  estimate?: LiFiStepEstimate;
  includedSteps?: LiFiStepLike[];
  transactionRequest?: {
    to?: string;
    data?: string;
    value?: string | bigint | number;
    gasLimit?: string | bigint | number;
  };
}

const LIFI_DEST_DELIVERY_STEP_TYPES = new Set(['cross', 'swap', 'lifi']);

function positiveAmount(value: string | undefined): string | null {
  if (!value || value === '0') return null;
  try {
    if (BigInt(value) <= 0n) return null;
  } catch {
    return null;
  }
  return value;
}

function collectErrorText(err: unknown): string {
  const parts: string[] = [];
  const seen = new Set<unknown>();
  const walk = (value: unknown, depth: number) => {
    if (value == null || depth > 5 || seen.has(value)) return;
    if (typeof value === 'string') {
      parts.push(value);
      return;
    }
    if (typeof value !== 'object') return;
    seen.add(value);
    if (value instanceof Error) {
      parts.push(value.message);
      walk(value.cause, depth + 1);
      return;
    }
    const rec = value as Record<string, unknown>;
    for (const key of ['message', 'error', 'description', 'detail', 'msg']) {
      if (typeof rec[key] === 'string') parts.push(rec[key] as string);
    }
    walk(rec.cause, depth + 1);
    walk(rec.data, depth + 1);
    walk(rec.response, depth + 1);
    walk(rec.body, depth + 1);
  };
  walk(err, 0);
  return parts.join(' ').toLowerCase();
}

export function isLiFiNoRouteError(err: unknown): boolean {
  const msg = collectErrorText(err);
  return (
    msg.includes('unable to find quote to match expected output')
    || msg.includes('no possible routes')
    || msg.includes('no available quotes')
  );
}

/**
 * Contract-call quotes report leftover after the dest call as 0.
 * Dest USDC that actually arrives is the last bridge/swap step.
 */

export function destToAmountMinFromLiFiQuote(quote: LiFiStepLike): string {
  const steps = quote.includedSteps ?? [];
  for (let i = steps.length - 1; i >= 0; i--) {
    const step = steps[i];
    if (!step?.type || !LIFI_DEST_DELIVERY_STEP_TYPES.has(step.type)) continue;
    const fromStep = positiveAmount(step.estimate?.toAmountMin) ?? positiveAmount(step.estimate?.toAmount);
    if (fromStep) return fromStep;
  }
  return (
    positiveAmount(quote.estimate?.toAmountMin)
    ?? positiveAmount(quote.estimate?.toAmount)
    ?? '0'
  );
}

export interface LiFiContractCall {
  fromAmount: string;
  fromTokenAddress: string;
  toContractAddress: string;
  toContractCallData: string;
  toContractGasLimit: string;
  toApprovalAddress?: string;
}

export interface LiFiStatusResult {
  status: string;
  sending?: { txHash?: string; chainId?: number };
  receiving?: { txHash?: string; chainId?: number; amount?: string };
  substatus?: string;
}

function normalizeLiFiApiUrl(raw: string): string {
  const trimmed = raw.replace(/\/$/, '');
  try {
    const parsed = new URL(trimmed);
    if (parsed.pathname === '' || parsed.pathname === '/') {
      parsed.pathname = '/v1';
      return parsed.toString().replace(/\/$/, '');
    }
  } catch {
    /* keep trimmed */
  }
  return trimmed;
}

/**
 * LI.FI access is isolated here. Other modules must not import `@lifi/sdk`.
 */
export class LiFiClient {
  private readonly client;

  constructor(
    apiKey = env.LIFI_API_KEY,
    apiUrl = normalizeLiFiApiUrl(env.LIFI_BASE_URL),
  ) {
    this.client = createClient({
      integrator: 'noderails',
      apiKey: apiKey || undefined,
      apiUrl,
    });
  }

  async quoteToWallet(input: {
    fromChain: number;
    toChain: number;
    fromToken: string;
    toToken: string;
    fromAmount: string;
    fromAddress: string;
    toAddress: string;
  }): Promise<LiFiQuoteResult> {
    const quote = await getQuote(this.client, {
      fromChain: input.fromChain,
      toChain: input.toChain,
      fromToken: input.fromToken,
      toToken: input.toToken,
      fromAmount: input.fromAmount,
      fromAddress: input.fromAddress,
      toAddress: input.toAddress,
    });
    return this.normalizeQuote(quote);
  }

  async quoteContractCalls(input: {
    fromChain: number;
    toChain: number;
    fromToken: string;
    toToken: string;
    toAmount: string;
    fromAddress: string;
    toFallbackAddress: string;
    contractCalls: LiFiContractCall[];
  }): Promise<LiFiQuoteResult> {
    const quote = await getContractCallsQuote(this.client, {
      fromChain: input.fromChain,
      toChain: input.toChain,
      fromToken: input.fromToken,
      toToken: input.toToken,
      toAmount: input.toAmount,
      fromAddress: input.fromAddress,
      toFallbackAddress: input.toFallbackAddress,
      contractCalls: input.contractCalls,
    });
    return this.normalizeQuote(quote);
  }

  async getTransferStatus(input: {
    txHash: string;
    fromChain: number;
    toChain: number;
    bridge?: string;
  }): Promise<LiFiStatusResult> {
    return getStatus(this.client, {
      txHash: input.txHash,
      fromChain: input.fromChain,
      toChain: input.toChain,
      bridge: input.bridge,
    }) as Promise<LiFiStatusResult>;
  }

  private normalizeQuote(quote: unknown): LiFiQuoteResult {
    const q = quote as LiFiStepLike;
    const to = q.transactionRequest?.to;
    const data = q.transactionRequest?.data;
    if (!to || !data) {
      throw new Error('LI.FI quote missing transactionRequest');
    }
    const destMin = destToAmountMinFromLiFiQuote(q);
    return {
      tool: q.tool ?? 'lifi',
      fromAmount: q.estimate?.fromAmount ?? q.action?.fromAmount ?? '0',
      toAmount: destMin,
      toAmountMin: destMin,
      transactionRequest: {
        to: to as Address,
        data: data as Hex,
        value: q.transactionRequest?.value !== undefined
          ? String(q.transactionRequest.value)
          : undefined,
        gasLimit: q.transactionRequest?.gasLimit !== undefined
          ? String(q.transactionRequest.gasLimit)
          : undefined,
      },
    };
  }
}

export const liFiClient = new LiFiClient();

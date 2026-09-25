import { getDatabaseClient } from '@noderails/database';
import { MtxmClient } from '@noderails/mtxm-client';
import {
  encodeCaptureAndConvert,
  encodeCaptureNativeAndConvert,
  buildCaptureAndConvertTypedData,
  nodeRailsEscrowAbi,
  type PermitData,
} from '@noderails/web3';
import {
  PaymentError,
  ValidationError,
  isNativeToken,
  getLeanRpcUrl,
} from '@noderails/common';
import {
  keccak256,
  encodePacked,
  createPublicClient,
  http,
  type Hex,
  type Address,
} from 'viem';
import { env } from '../../config.js';
import { oneInchClient } from '../../clients/oneinch.client.js';
import type { Logger } from '@noderails/service-base';
import { uuidToBytes32 } from '../payments/crypto-utils.js';
import type { SettlementSnapshot } from './snapshot.js';

const mtxm = new MtxmClient({
  baseUrl: env.MTXM_BASE_URL,
  projectId: env.MTXM_PROJECT_ID,
  apiKey: env.MTXM_API_KEY,
});

const SLIPPAGE_BPS = 100;
const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000' as Address;

export interface ConvertCaptureInput {
  intentId: string;
  appId: string;
  escrowAddress: string;
  chainId: number;
  mtxmChainDbId?: string | null;
  merchant: Address;
  payer: Address;
  sourceTokenAddress: string;
  sourceTokenKey: string;
  sourceTokenSymbol: string;
  amountIn: bigint;
  feeBps: number;
  timelocks: bigint;
  permitData: PermitData;
  snapshot: SettlementSnapshot;
  invoiceMinAmountOut?: string;
  logger: Logger;
}

export type ConvertCaptureResult =
  | { converted: false }
  | {
      converted: true;
      mode: 'native';
      captureData: {
        to: string;
        data: Hex;
        value: string;
        chainId: number;
      };
      convertedAmount: string;
      convertedTokenKey: string;
      swapQuoteMeta: Record<string, unknown>;
    }
  | {
      converted: true;
      mode: 'erc20';
      calldata: Hex;
      convertedAmount: string;
      convertedTokenKey: string;
      swapQuoteMeta: Record<string, unknown>;
    };

export async function resolveSourceChainSettlementToken(
  targetTokenKey: string,
  sourceChainId: number,
) {
  const db = getDatabaseClient();
  const target = await db.supportedToken.findFirst({
    where: { tokenKey: targetTokenKey, isEnabled: true },
  });
  if (!target) {
    throw new ValidationError(`Unknown target token ${targetTokenKey}`);
  }
  if (target.chainId === sourceChainId) return target;
  const match = await db.supportedToken.findFirst({
    where: {
      chainId: sourceChainId,
      symbol: target.symbol,
      isEnabled: true,
    },
  });
  if (!match) {
    throw new ValidationError(
      `No ${target.symbol} token is enabled on chain ${sourceChainId} for conversion`,
    );
  }
  return match;
}

export async function prepareConvertedCapture(input: ConvertCaptureInput): Promise<ConvertCaptureResult> {
  if (!input.snapshot.conversionEnabled || !input.snapshot.targetTokenKey) {
    return { converted: false };
  }

  const destToken = await resolveSourceChainSettlementToken(
    input.snapshot.targetTokenKey,
    input.chainId,
  );
  const sourceIsNative = isNativeToken(input.sourceTokenAddress);
  const sameToken =
    !sourceIsNative
    && destToken.contractAddress.toLowerCase() === input.sourceTokenAddress.toLowerCase();
  if (sameToken) {
    return { converted: false };
  }

  const escrow = input.escrowAddress as Address;
  const rpc = createPublicClient({ transport: http(getLeanRpcUrl(input.chainId)) });
  const destAllowed = await rpc.readContract({
    address: escrow,
    abi: nodeRailsEscrowAbi,
    functionName: 'allowedSettlementTokens',
    args: [destToken.contractAddress as Address],
  });
  if (!destAllowed) {
    throw new PaymentError(
      `Token ${destToken.tokenKey} is not allowlisted on the escrow`,
      input.intentId,
    );
  }

  const src = sourceIsNative
    ? oneInchClient.nativeTokenAddress()
    : input.sourceTokenAddress;
  const quote = await oneInchClient.getQuote({
    chainId: input.chainId,
    src,
    dst: destToken.contractAddress,
    amount: input.amountIn.toString(),
  });
  const dstAmount = BigInt(quote.dstAmount);
  if (dstAmount <= 0n) {
    throw new PaymentError('1inch quote returned zero destination amount', input.intentId);
  }
  const quotedMin = (dstAmount * BigInt(10_000 - SLIPPAGE_BPS)) / 10_000n;
  const invoiceMin = input.invoiceMinAmountOut ? BigInt(input.invoiceMinAmountOut) : 0n;
  const minAmountOut = invoiceMin > 0n ? invoiceMin : quotedMin;
  const origin = sourceIsNative
    ? input.payer
    : ((env.MTXM_EVM_TRANSACTION_KEY_ADDRESS as Address) || escrow);

  const swap = await oneInchClient.getSwap({
    chainId: input.chainId,
    src,
    dst: destToken.contractAddress,
    amount: input.amountIn.toString(),
    from: escrow,
    origin,
    receiver: escrow,
    minReturn: minAmountOut.toString(),
  });

  const router = swap.tx.to as Address;
  const routerAllowed = await rpc.readContract({
    address: escrow,
    abi: nodeRailsEscrowAbi,
    functionName: 'allowedSwapRouters',
    args: [router],
  });
  if (!routerAllowed) {
    throw new PaymentError(
      `1inch router ${router} is not allowlisted on the escrow`,
      input.intentId,
    );
  }

  const swapCalldata = swap.tx.data as Hex;
  const swapCalldataHash = keccak256(swapCalldata);
  const paymentIntentId = uuidToBytes32(input.intentId);
  const nonce = keccak256(
    encodePacked(['bytes32', 'string'], [paymentIntentId, sourceIsNative ? 'native' : 'erc20']),
  );
  const sourceToken = sourceIsNative ? ZERO_ADDRESS : (input.sourceTokenAddress as Address);

  const typedData = buildCaptureAndConvertTypedData(
    {
      paymentIntentId,
      merchant: input.merchant,
      sourceToken,
      amountIn: input.amountIn,
      settlementToken: destToken.contractAddress as Address,
      minAmountOut,
      router,
      swapCalldataHash,
      feeBps: input.feeBps,
      timelocks: input.timelocks,
      nonce,
    },
    input.chainId,
    escrow,
  );

  const sigResult = await mtxm.signTypedData({
    chainId: String(input.chainId),
    domain: typedData.domain,
    types: typedData.types,
    value: serializeBigInts(typedData.message),
  });

  const swapQuoteMeta = {
    provider: '1inch',
    src,
    dst: destToken.contractAddress,
    dstAmount: quote.dstAmount,
    minAmountOut: minAmountOut.toString(),
    router,
    slippageBps: SLIPPAGE_BPS,
  };

  if (sourceIsNative) {
    const calldata = encodeCaptureNativeAndConvert({
      paymentIntentId,
      merchant: input.merchant,
      settlementToken: destToken.contractAddress as Address,
      minAmountOut,
      router,
      swapCalldataHash,
      feeBps: input.feeBps,
      timelocks: input.timelocks,
      swapCalldata,
      noderailsSignature: sigResult.signature as Hex,
    });
    return {
      converted: true,
      mode: 'native',
      captureData: {
        to: input.escrowAddress,
        data: calldata,
        value: input.amountIn.toString(),
        chainId: input.chainId,
      },
      convertedAmount: quote.dstAmount,
      convertedTokenKey: destToken.tokenKey,
      swapQuoteMeta,
    };
  }

  const calldata = encodeCaptureAndConvert({
    paymentIntentId,
    merchant: input.merchant,
    sourceToken,
    amountIn: input.amountIn,
    settlementToken: destToken.contractAddress as Address,
    minAmountOut,
    router,
    swapCalldataHash,
    feeBps: input.feeBps,
    timelocks: input.timelocks,
    permitData: input.permitData,
    payer: input.payer,
    swapCalldata,
    noderailsSignature: sigResult.signature as Hex,
  });

  return {
    converted: true,
    mode: 'erc20',
    calldata,
    convertedAmount: quote.dstAmount,
    convertedTokenKey: destToken.tokenKey,
    swapQuoteMeta,
  };
}

function serializeBigInts(obj: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj)) {
    result[key] = typeof value === 'bigint' ? value.toString() : value;
  }
  return result;
}

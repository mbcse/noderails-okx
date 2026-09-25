import { getDatabaseClient } from '@noderails/database';
import { MtxmClient } from '@noderails/mtxm-client';
import {
  encodeSettle,
  encodeSettleToMerchantBalance,
  encodeRetrySettleToMerchantBalance,
  encodeCreditMerchantBalance,
  encodeSettleStuckMerchantBalance,
  buildSettleToMerchantBalanceTypedData,
  buildRetrySettleToMerchantBalanceTypedData,
  buildCreditMerchantBalanceTypedData,
  nodeRailsEscrowAbi,
} from '@noderails/web3';
import { PaymentError, ValidationError, getLeanRpcUrl, QUEUE_NAMES, SETTLE_BRIDGE_RETRY_DELAY_MS } from '@noderails/common';
import { queueRegistry } from '@noderails/queue';
import type {
  SettlementTrackBridgeTransferJob,
  SettlementRetryBridgeTransferJob,
} from '@noderails/queue';
import {
  keccak256,
  createPublicClient,
  http,
  erc20Abi,
  type Hex,
  type Address,
} from 'viem';
import { env } from '../../config.js';
import { isLiFiNoRouteError, liFiClient } from '../../clients/lifi.client.js';
import type { LiFiQuoteResult } from '../../clients/lifi.client.js';
import type { Logger } from '@noderails/service-base';
import { uuidToBytes32 } from '../payments/crypto-utils.js';
import {
  resolveSettlementPath,
  escrowAmount,
  promisedFromIntent,
  resolveCreditDestination,
} from './path.js';

const mtxm = new MtxmClient({
  baseUrl: env.MTXM_BASE_URL,
  projectId: env.MTXM_PROJECT_ID,
  apiKey: env.MTXM_API_KEY,
});

const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000' as Address;
const DEST_CREDIT_GAS_LIMIT = '400000';
const MAX_SETTLE_BRIDGE_RETRIES = 4;

type BridgeQuoteMode = 'dest_call' | 'fallback_bridge';

async function quoteSettlementBridge(input: {
  paymentIntentId: string;
  sourceChainId: number;
  destChainId: number;
  sourceEscrow: string;
  destEscrow: string;
  sourceToken: string;
  destToken: string;
  settleAmount: bigint;
  promised: bigint;
  destCalldata: string;
  logger: Logger;
}): Promise<{ quote: LiFiQuoteResult; mode: BridgeQuoteMode }> {
  try {
    const quote = await liFiClient.quoteContractCalls({
      fromChain: input.sourceChainId,
      toChain: input.destChainId,
      fromToken: input.sourceToken,
      toToken: input.destToken,
      toAmount: input.promised.toString(),
      fromAddress: input.sourceEscrow,
      toFallbackAddress: input.destEscrow,
      contractCalls: [
        {
          fromAmount: input.promised.toString(),
          fromTokenAddress: input.destToken,
          toContractAddress: input.destEscrow,
          toContractCallData: input.destCalldata,
          toContractGasLimit: DEST_CREDIT_GAS_LIMIT,
          toApprovalAddress: input.destEscrow,
        },
      ],
    });
    const quotedFrom = BigInt(quote.fromAmount || '0');
    if (quotedFrom > 0n && quotedFrom > input.settleAmount) {
      input.logger.warn('LI.FI dest-call needs more source than settleAmount; falling back to settleAmount bridge', {
        paymentIntentId: input.paymentIntentId,
        quotedFrom: quotedFrom.toString(),
        settleAmount: input.settleAmount.toString(),
      });
    } else {
      return { quote, mode: 'dest_call' };
    }
  } catch (err) {
    if (!isLiFiNoRouteError(err)) {
      throw err;
    }
    input.logger.warn('LI.FI dest-call quote has no route; falling back to settleAmount bridge', {
      paymentIntentId: input.paymentIntentId,
      promised: input.promised.toString(),
      error: err instanceof Error ? err.message : String(err),
    });
  }

  const quote = await liFiClient.quoteToWallet({
    fromChain: input.sourceChainId,
    toChain: input.destChainId,
    fromToken: input.sourceToken,
    toToken: input.destToken,
    fromAmount: input.settleAmount.toString(),
    fromAddress: input.sourceEscrow,
    toAddress: input.destEscrow,
  });
  const destMin = BigInt(quote.toAmountMin || quote.toAmount || '0');
  if (destMin < input.promised) {
    throw new PaymentError(
      `Fallback dest delivery ${destMin} is below promised ${input.promised}`,
      input.paymentIntentId,
    );
  }
  return { quote, mode: 'fallback_bridge' };
}

function serializeBigInts(obj: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj)) {
    result[key] = typeof value === 'bigint' ? value.toString() : value;
  }
  return result;
}

function requireEvmSignature(sig: string | undefined, paymentIntentId: string, what: string): Hex {
  const raw = (sig ?? '').trim();
  const hex = raw.startsWith('0x') || raw.startsWith('0X') ? raw.slice(2) : raw;
  if (!/^[0-9a-fA-F]{130}$/.test(hex)) {
    throw new PaymentError(`MTXM ${what} signature must be 65 bytes`, paymentIntentId);
  }
  return (`0x${hex}`) as Hex;
}

function paddedLifiGasLimit(gasLimit: string | undefined): string | undefined {
  if (!gasLimit) return undefined;
  try {
    const n = BigInt(gasLimit);
    if (n <= 0n) return undefined;
    return ((n * 13n) / 10n).toString();
  } catch {
    return undefined;
  }
}

async function requireToken(tokenKey: string, chainId: number) {
  const db = getDatabaseClient();
  const token = await db.supportedToken.findFirst({
    where: { tokenKey, chainId, isEnabled: true },
  });
  if (!token) {
    throw new ValidationError(`Token ${tokenKey} is not enabled on chain ${chainId}`);
  }
  return token;
}

async function assertBridgeRouterAllowed(escrow: Address, chainId: number, router: Address) {
  const rpc = createPublicClient({ transport: http(getLeanRpcUrl(chainId)) });
  const allowed = await rpc.readContract({
    address: escrow,
    abi: nodeRailsEscrowAbi,
    functionName: 'allowedBridgeRouters',
    args: [router],
  });
  if (!allowed) {
    throw new PaymentError(`LI.FI router ${router} is not allowlisted on the escrow`, 'bridge');
  }
}

async function readDestCreditConsumed(destEscrow: Address, destChainId: number, paymentIntentId: Hex) {
  const rpc = createPublicClient({ transport: http(getLeanRpcUrl(destChainId)) });
  return rpc.readContract({
    address: destEscrow,
    abi: nodeRailsEscrowAbi,
    functionName: 'settlementCreditConsumed',
    args: [paymentIntentId],
  });
}

async function readSourceTokenBalance(escrow: Address, chainId: number, token: Address) {
  const rpc = createPublicClient({ transport: http(getLeanRpcUrl(chainId)) });
  return rpc.readContract({
    address: token,
    abi: erc20Abi,
    functionName: 'balanceOf',
    args: [escrow],
  });
}

async function resolveBridgeTxHash(
  job: SettlementTrackBridgeTransferJob,
): Promise<{ txHash: string; source: 'job' | 'mtxm' | 'bridge_transfer_id' | 'settle_row' }> {
  if (job.txHash) {
    return { txHash: job.txHash, source: 'job' };
  }
  if (job.mtxmTxId) {
    const mtxmTx = await mtxm.getTransaction(job.mtxmTxId);
    const fromMtxm = mtxmTx.txHash;
    if (fromMtxm) {
      return { txHash: fromMtxm, source: 'mtxm' };
    }
  }
  const db = getDatabaseClient();
  const intent = await db.paymentIntent.findUnique({
    where: { id: job.paymentIntentId },
    select: { bridgeTransferId: true },
  });
  if (intent?.bridgeTransferId) {
    return { txHash: intent.bridgeTransferId, source: 'bridge_transfer_id' };
  }
  const settleTx = await db.transaction.findFirst({
    where: {
      paymentIntentId: job.paymentIntentId,
      type: 'SETTLE',
      txHash: { not: null },
    },
    orderBy: { createdAt: 'desc' },
    select: { txHash: true },
  });
  if (settleTx?.txHash) {
    return { txHash: settleTx.txHash, source: 'settle_row' };
  }
  if (job.mtxmTxId) {
    throw new Error(`MTXM tx ${job.mtxmTxId} has no hash yet`);
  }
  throw new Error('Bridge track job is missing txHash');
}

async function recoverDestCreditIfNeeded(input: {
  paymentIntentId: string;
  destinationChainId: number;
  logger: Logger;
}): Promise<'consumed' | 'stuck_submitted' | 'unfunded'> {
  const db = getDatabaseClient();
  const intent = await db.paymentIntent.findUnique({ where: { id: input.paymentIntentId } });
  if (!intent) {
    throw new PaymentError('PaymentIntent not found', input.paymentIntentId);
  }
  const destChain = await db.supportedChain.findUnique({
    where: { chainId: input.destinationChainId },
  });
  if (!destChain?.escrowAddress) {
    throw new PaymentError(`No escrow on dest chain ${input.destinationChainId}`, intent.id);
  }
  const destEscrow = destChain.escrowAddress as Address;
  const consumed = await readDestCreditConsumed(
    destEscrow,
    input.destinationChainId,
    uuidToBytes32(intent.id),
  );
  if (consumed) {
    await db.paymentIntent.update({
      where: { id: intent.id },
      data: { settlementCreditConsumed: true, bridgeStatus: 'done', bridgeRetryMtxmTxId: null },
    });
    return 'consumed';
  }
  const destTokenKey = intent.settlementTokenKey ?? intent.convertedTokenKey ?? intent.cryptoTokenKey;
  if (!destTokenKey) {
    return 'unfunded';
  }
  const destToken = await requireToken(destTokenKey, input.destinationChainId);
  const promised = promisedFromIntent(intent);
  const balance = await readSourceTokenBalance(
    destEscrow,
    input.destinationChainId,
    destToken.contractAddress as Address,
  );
  if (balance < promised) {
    return 'unfunded';
  }
  await submitStuckDestCredit({
    paymentIntentId: intent.id,
    destinationChainId: input.destinationChainId,
    logger: input.logger,
  });
  return 'stuck_submitted';
}

function liFiStatusBucket(status: string | undefined, pollAttempt = 0): 'done' | 'failed' | 'refunded' | 'pending' {
  const upper = (status ?? '').toUpperCase();
  if (['DONE', 'COMPLETED', 'SUCCESS'].includes(upper)) return 'done';
  if (['REFUNDED', 'REFUND', 'REFUNDED_ON_SOURCE'].includes(upper)) return 'refunded';
  if (upper === 'NOT_FOUND' && pollAttempt < 5) return 'pending';
  if (['FAILED', 'NOT_FOUND'].includes(upper)) return 'failed';
  return 'pending';
}

async function enqueueBridgeTrackJob(
  job: SettlementTrackBridgeTransferJob,
  delayMs = 30_000,
  uniqueJob = false,
) {
  const queue = queueRegistry.getOrCreateQueue<SettlementTrackBridgeTransferJob>(
    QUEUE_NAMES.SETTLEMENT_TRACK_BRIDGE_TRANSFER,
  );
  const base = job.mtxmTxId ?? job.txHash ?? 'pending';
  const suffix = uniqueJob ? `${base}-${Date.now()}` : base;
  await queue.add(
    `bridge-${job.paymentIntentId}-${suffix}`,
    job,
    {
      jobId: `bridge-${job.paymentIntentId}-${suffix}`,
      delay: delayMs,
      attempts: 20,
      backoff: { type: 'exponential', delay: 30_000 },
      removeOnComplete: true,
      removeOnFail: true,
    },
  );
}

function bridgeRetryAvailableAt(from = new Date()): Date {
  return new Date(from.getTime() + SETTLE_BRIDGE_RETRY_DELAY_MS);
}

function remainingRetryDelayMs(availableAt: Date | null | undefined): number {
  if (!availableAt) return 0;
  return Math.max(0, availableAt.getTime() - Date.now());
}

async function enqueueSourceRetryJob(
  job: SettlementRetryBridgeTransferJob,
  delayMs: number,
  logger: Logger,
): Promise<void> {
  const queue = queueRegistry.getOrCreateQueue<SettlementRetryBridgeTransferJob>(
    QUEUE_NAMES.SETTLEMENT_RETRY_BRIDGE_TRANSFER,
  );
  const availableAt = Date.now() + Math.max(0, delayMs);
  await queue.add(
    `retry-bridge-${job.paymentIntentId}`,
    job,
    {
      jobId: `retry-bridge-${job.paymentIntentId}-${availableAt}`,
      delay: Math.max(0, delayMs),
      attempts: 5,
      backoff: { type: 'exponential', delay: 30_000 },
      removeOnComplete: true,
      removeOnFail: true,
    },
  );
  logger.info('Scheduled source bridge retry', {
    paymentIntentId: job.paymentIntentId,
    delayMs: Math.max(0, delayMs),
  });
}

export async function submitEvmSettlement(input: {
  paymentIntentId: string;
  sourceChainId: number;
  sourceEscrow: string;
  mtxmChainId: string;
  logger: Logger;
}): Promise<{ mtxmTxId: string; txHash: string | null; bridged: boolean }> {
  const db = getDatabaseClient();
  const intent = await db.paymentIntent.findUnique({ where: { id: input.paymentIntentId } });
  if (!intent) {
    throw new PaymentError('PaymentIntent not found', input.paymentIntentId);
  }

  const path = resolveSettlementPath(intent, input.sourceChainId);
  const paymentIntentBytes32 = uuidToBytes32(intent.id);
  const sourceEscrow = input.sourceEscrow as Address;

  if (path === 'source_wallet') {
    const calldata = encodeSettle(paymentIntentBytes32);
    const txResult = await mtxm.sendTransaction({
      chainId: input.mtxmChainId,
      to: input.sourceEscrow,
      data: calldata,
    });
    return { mtxmTxId: txResult.id, txHash: txResult.txHash ?? null, bridged: false };
  }

  const tokenKey = intent.convertedTokenKey ?? intent.cryptoTokenKey;
  if (!tokenKey) {
    throw new PaymentError('Converted token is missing', intent.id);
  }
  const sourceToken = await requireToken(tokenKey, input.sourceChainId);
  const amount = escrowAmount(intent);
  const promised = promisedFromIntent(intent);
  if (promised <= 0n || promised > amount) {
    throw new PaymentError('Promised settlement amount is invalid', intent.id);
  }
  const destination = resolveCreditDestination(intent);
  const merchant = (intent.captureMerchantAddress ?? ZERO_ADDRESS) as Address;
  if (merchant === ZERO_ADDRESS) {
    throw new PaymentError('Capture merchant address is missing', intent.id);
  }

  const settlementChainId = BigInt(intent.settlementChainId ?? input.sourceChainId);
  let router = ZERO_ADDRESS;
  let bridgeCalldata = '0x' as Hex;
  let destEscrow = sourceEscrow;
  let tool: string | undefined;
  let lifiGasLimit: string | undefined;

  if (path === 'settlement_wallet_bridge' || path === 'merchant_balance_bridge') {
    if (!intent.settlementChainId) {
      throw new PaymentError('Settlement chain is missing on the payment snapshot', intent.id);
    }
    const destChain = await db.supportedChain.findUnique({
      where: { chainId: intent.settlementChainId },
    });
    if (!destChain?.escrowAddress) {
      throw new PaymentError(
        `No escrow on settlement chain ${intent.settlementChainId}`,
        intent.id,
      );
    }
    destEscrow = destChain.escrowAddress as Address;
    const destTokenKey = intent.settlementTokenKey ?? tokenKey;
    const destToken = await requireToken(destTokenKey, intent.settlementChainId);

    const creditTyped = buildCreditMerchantBalanceTypedData(
      {
        paymentIntentId: paymentIntentBytes32,
        merchant,
        token: destToken.contractAddress as Address,
        minAmount: promised,
        destination,
      },
      intent.settlementChainId,
      destEscrow,
    );
    const creditSig = await mtxm.signTypedData({
      chainId: String(intent.settlementChainId),
      domain: creditTyped.domain,
      types: creditTyped.types,
      value: serializeBigInts(creditTyped.message),
    });
    const creditCalldata = encodeCreditMerchantBalance({
      paymentIntentId: paymentIntentBytes32,
      merchant,
      token: destToken.contractAddress as Address,
      minAmount: promised,
      destination,
      noderailsSignature: requireEvmSignature(creditSig.signature, intent.id, 'dest credit'),
    });

    const { quote, mode } = await quoteSettlementBridge({
      paymentIntentId: intent.id,
      sourceChainId: input.sourceChainId,
      destChainId: intent.settlementChainId,
      sourceEscrow: input.sourceEscrow,
      destEscrow,
      sourceToken: sourceToken.contractAddress,
      destToken: destToken.contractAddress,
      settleAmount: amount,
      promised,
      destCalldata: creditCalldata,
      logger: input.logger,
    });
    router = quote.transactionRequest.to;
    bridgeCalldata = quote.transactionRequest.data;
    tool = quote.tool;
    lifiGasLimit = paddedLifiGasLimit(quote.transactionRequest.gasLimit);
    input.logger.info('Settlement: LI.FI quote ready', {
      paymentIntentId: intent.id,
      mode,
      destDelivery: quote.toAmountMin,
      promised: promised.toString(),
      quotedFrom: quote.fromAmount,
      settleAmount: amount.toString(),
      gasLimit: lifiGasLimit,
    });
    await assertBridgeRouterAllowed(sourceEscrow, input.sourceChainId, router);
  }

  const bridgeCalldataHash = keccak256(bridgeCalldata);
  const typedData = buildSettleToMerchantBalanceTypedData(
    {
      paymentIntentId: paymentIntentBytes32,
      merchantAmount: amount,
      token: sourceToken.contractAddress as Address,
      settlementChainId,
      settlementEscrow: destEscrow,
      router,
      bridgeCalldataHash,
      minDestinationAmount: promised,
      destination,
    },
    input.sourceChainId,
    sourceEscrow,
  );
  const sigResult = await mtxm.signTypedData({
    chainId: String(input.sourceChainId),
    domain: typedData.domain,
    types: typedData.types,
    value: serializeBigInts(typedData.message),
  });

  const calldata = encodeSettleToMerchantBalance({
    paymentIntentId: paymentIntentBytes32,
    token: sourceToken.contractAddress as Address,
    settlementChainId,
    settlementEscrow: destEscrow,
    router,
    bridgeCalldataHash,
    minDestinationAmount: promised,
    destination,
    bridgeCalldata,
    noderailsSignature: requireEvmSignature(sigResult.signature, intent.id, 'settle'),
  });

  const txResult = await mtxm.sendTransaction({
    chainId: input.mtxmChainId,
    to: input.sourceEscrow,
    data: calldata,
    gasLimit: lifiGasLimit,
  });

  const bridged = path === 'settlement_wallet_bridge' || path === 'merchant_balance_bridge';
  if (bridged) {
    await db.paymentIntent.update({
      where: { id: intent.id },
      data: {
        bridgeTransferId: txResult.txHash ?? intent.bridgeTransferId,
        bridgeStatus: 'pending',
        bridgeRetryAvailableAt: bridgeRetryAvailableAt(),
      },
    });
    await enqueueBridgeTrackJob({
      paymentIntentId: intent.id,
      sourceChainId: input.sourceChainId,
      destinationChainId: intent.settlementChainId ?? input.sourceChainId,
      txHash: txResult.txHash ?? undefined,
      mtxmTxId: txResult.id,
      tool,
    });
  }

  return { mtxmTxId: txResult.id, txHash: txResult.txHash ?? null, bridged };
}

export async function submitStuckDestCredit(input: {
  paymentIntentId: string;
  destinationChainId: number;
  logger: Logger;
}): Promise<void> {
  const db = getDatabaseClient();
  const intent = await db.paymentIntent.findUnique({ where: { id: input.paymentIntentId } });
  if (!intent) {
    throw new PaymentError('PaymentIntent not found', input.paymentIntentId);
  }
  const destChain = await db.supportedChain.findUnique({
    where: { chainId: input.destinationChainId },
  });
  if (!destChain?.escrowAddress) {
    throw new PaymentError(`No escrow on dest chain ${input.destinationChainId}`, intent.id);
  }
  const destEscrow = destChain.escrowAddress as Address;
  const paymentIntentBytes32 = uuidToBytes32(intent.id);
  const consumed = await readDestCreditConsumed(destEscrow, input.destinationChainId, paymentIntentBytes32);
  if (consumed) {
    await db.paymentIntent.update({
      where: { id: intent.id },
      data: { settlementCreditConsumed: true, bridgeStatus: 'done' },
    });
    return;
  }

  const destTokenKey = intent.settlementTokenKey ?? intent.convertedTokenKey ?? intent.cryptoTokenKey;
  if (!destTokenKey) {
    throw new PaymentError('Dest token is missing', intent.id);
  }
  const destToken = await requireToken(destTokenKey, input.destinationChainId);
  const promised = promisedFromIntent(intent);
  const destination = resolveCreditDestination(intent);
  const merchant = (intent.captureMerchantAddress ?? ZERO_ADDRESS) as Address;
  if (merchant === ZERO_ADDRESS) {
    throw new PaymentError('Capture merchant address is missing', intent.id);
  }

  const creditTyped = buildCreditMerchantBalanceTypedData(
    {
      paymentIntentId: paymentIntentBytes32,
      merchant,
      token: destToken.contractAddress as Address,
      minAmount: promised,
      destination,
    },
    input.destinationChainId,
    destEscrow,
  );
  const creditSig = await mtxm.signTypedData({
    chainId: String(input.destinationChainId),
    domain: creditTyped.domain,
    types: creditTyped.types,
    value: serializeBigInts(creditTyped.message),
  });
  const calldata = encodeSettleStuckMerchantBalance({
    paymentIntentId: paymentIntentBytes32,
    merchant,
    token: destToken.contractAddress as Address,
    minAmount: promised,
    destination,
    noderailsSignature: requireEvmSignature(creditSig.signature, intent.id, 'stuck dest credit'),
  });
  const mtxmChainId = destChain.mtxmChainDbId?.trim() || String(input.destinationChainId);
  const txResult = await mtxm.sendTransaction({
    chainId: mtxmChainId,
    to: destEscrow,
    data: calldata,
  });
  await db.paymentIntent.update({
    where: { id: intent.id },
    data: {
      settlementCreditTxHash: txResult.txHash ?? undefined,
      settlementCreditedAt: txResult.txHash ? new Date() : undefined,
      settlementCreditConsumed: false,
      bridgeStatus: 'stuck_settling',
    },
  });
  input.logger.info('Dest stuck credit submitted', {
    paymentIntentId: intent.id,
    mtxmTxId: txResult.id,
    txHash: txResult.txHash,
  });
}

export async function submitSourceRetry(input: {
  paymentIntentId: string;
  sourceChainId: number;
  destinationChainId: number;
  logger: Logger;
}): Promise<void> {
  const db = getDatabaseClient();
  const intent = await db.paymentIntent.findUnique({ where: { id: input.paymentIntentId } });
  if (!intent) {
    throw new PaymentError('PaymentIntent not found', input.paymentIntentId);
  }
  if ((intent.settleBridgeRetryCount ?? 0) >= MAX_SETTLE_BRIDGE_RETRIES) {
    throw new PaymentError('Bridge retry limit reached', intent.id);
  }
  const delayMs = remainingRetryDelayMs(intent.bridgeRetryAvailableAt);
  if (delayMs > 0) {
    await enqueueSourceRetryJob({
      paymentIntentId: intent.id,
      sourceChainId: input.sourceChainId,
      destinationChainId: input.destinationChainId,
    }, delayMs, input.logger);
    return;
  }
  if (intent.bridgeRetryMtxmTxId) {
    input.logger.info('Bridge retry already in flight', {
      paymentIntentId: intent.id,
      mtxmTxId: intent.bridgeRetryMtxmTxId,
    });
    return;
  }

  const sourceChain = await db.supportedChain.findUnique({ where: { chainId: input.sourceChainId } });
  const destChain = await db.supportedChain.findUnique({ where: { chainId: input.destinationChainId } });
  if (!sourceChain?.escrowAddress || !destChain?.escrowAddress) {
    throw new PaymentError('Source or dest escrow is missing', intent.id);
  }
  const sourceEscrow = sourceChain.escrowAddress as Address;
  const destEscrow = destChain.escrowAddress as Address;
  const paymentIntentBytes32 = uuidToBytes32(intent.id);

  const destConsumed = await readDestCreditConsumed(destEscrow, input.destinationChainId, paymentIntentBytes32);
  if (destConsumed) {
    await db.paymentIntent.update({
      where: { id: intent.id },
      data: { settlementCreditConsumed: true, bridgeStatus: 'done' },
    });
    return;
  }
  if (intent.settlementCreditTxHash) {
    return;
  }

  const tokenKey = intent.convertedTokenKey ?? intent.cryptoTokenKey;
  if (!tokenKey) {
    throw new PaymentError('Converted token is missing', intent.id);
  }
  const sourceToken = await requireToken(tokenKey, input.sourceChainId);
  const destTokenKey = intent.settlementTokenKey ?? tokenKey;
  const destToken = await requireToken(destTokenKey, input.destinationChainId);
  const amount = escrowAmount(intent);
  const promised = promisedFromIntent(intent);
  const destination = resolveCreditDestination(intent);
  const merchant = (intent.captureMerchantAddress ?? ZERO_ADDRESS) as Address;
  if (merchant === ZERO_ADDRESS) {
    throw new PaymentError('Capture merchant address is missing', intent.id);
  }

  const sourceBalance = await readSourceTokenBalance(
    sourceEscrow,
    input.sourceChainId,
    sourceToken.contractAddress as Address,
  );
  if (sourceBalance < amount) {
    throw new PaymentError(
      `Source escrow balance ${sourceBalance} is below payment amount ${amount}`,
      intent.id,
    );
  }

  const creditTyped = buildCreditMerchantBalanceTypedData(
    {
      paymentIntentId: paymentIntentBytes32,
      merchant,
      token: destToken.contractAddress as Address,
      minAmount: promised,
      destination,
    },
    input.destinationChainId,
    destEscrow,
  );
  const creditSig = await mtxm.signTypedData({
    chainId: String(input.destinationChainId),
    domain: creditTyped.domain,
    types: creditTyped.types,
    value: serializeBigInts(creditTyped.message),
  });
  const creditCalldata = encodeCreditMerchantBalance({
    paymentIntentId: paymentIntentBytes32,
    merchant,
    token: destToken.contractAddress as Address,
    minAmount: promised,
    destination,
    noderailsSignature: requireEvmSignature(creditSig.signature, intent.id, 'retry dest credit'),
  });

  const { quote, mode } = await quoteSettlementBridge({
    paymentIntentId: intent.id,
    sourceChainId: input.sourceChainId,
    destChainId: input.destinationChainId,
    sourceEscrow,
    destEscrow,
    sourceToken: sourceToken.contractAddress,
    destToken: destToken.contractAddress,
    settleAmount: amount,
    promised,
    destCalldata: creditCalldata,
    logger: input.logger,
  });
  await assertBridgeRouterAllowed(sourceEscrow, input.sourceChainId, quote.transactionRequest.to);
  input.logger.info('Settlement: LI.FI retry quote ready', {
    paymentIntentId: intent.id,
    mode,
    destDelivery: quote.toAmountMin,
    promised: promised.toString(),
    quotedFrom: quote.fromAmount,
    settleAmount: amount.toString(),
  });

  const bridgeCalldata = quote.transactionRequest.data;
  const bridgeCalldataHash = keccak256(bridgeCalldata);
  const typedData = buildRetrySettleToMerchantBalanceTypedData(
    {
      paymentIntentId: paymentIntentBytes32,
      merchantAmount: amount,
      token: sourceToken.contractAddress as Address,
      settlementChainId: BigInt(input.destinationChainId),
      settlementEscrow: destEscrow,
      router: quote.transactionRequest.to,
      bridgeCalldataHash,
      minDestinationAmount: promised,
      destination,
      retryNonce: BigInt(intent.settleBridgeRetryCount ?? 0),
    },
    input.sourceChainId,
    sourceEscrow,
  );
  const sigResult = await mtxm.signTypedData({
    chainId: String(input.sourceChainId),
    domain: typedData.domain,
    types: typedData.types,
    value: serializeBigInts(typedData.message),
  });
  const calldata = encodeRetrySettleToMerchantBalance({
    paymentIntentId: paymentIntentBytes32,
    token: sourceToken.contractAddress as Address,
    settlementChainId: BigInt(input.destinationChainId),
    settlementEscrow: destEscrow,
    router: quote.transactionRequest.to,
    bridgeCalldataHash,
    minDestinationAmount: promised,
    destination,
    bridgeCalldata,
    noderailsSignature: requireEvmSignature(sigResult.signature, intent.id, 'retry settle'),
  });

  const mtxmChainId = sourceChain.mtxmChainDbId?.trim() || String(input.sourceChainId);
  const txResult = await mtxm.sendTransaction({
    chainId: mtxmChainId,
    to: sourceEscrow,
    data: calldata,
    gasLimit: paddedLifiGasLimit(quote.transactionRequest.gasLimit),
  });

  await db.paymentIntent.update({
    where: { id: intent.id },
    data: {
      bridgeRetryMtxmTxId: txResult.id,
      settleBridgeRetryCount: { increment: 1 },
      bridgeTransferId: txResult.txHash ?? intent.bridgeTransferId,
      bridgeStatus: 'retrying',
      bridgeRetryAvailableAt: bridgeRetryAvailableAt(),
    },
  });

  await enqueueBridgeTrackJob({
    paymentIntentId: intent.id,
    sourceChainId: input.sourceChainId,
    destinationChainId: input.destinationChainId,
    txHash: txResult.txHash ?? undefined,
    mtxmTxId: txResult.id,
    tool: quote.tool,
  });

  input.logger.info('Source bridge retry submitted', {
    paymentIntentId: intent.id,
    mtxmTxId: txResult.id,
    txHash: txResult.txHash,
  });
}

export async function trackBridgeTransfer(
  job: SettlementTrackBridgeTransferJob,
  logger: Logger,
): Promise<void> {
  const resolved = await resolveBridgeTxHash(job);
  const txHash = resolved.txHash;
  if (resolved.source !== 'job') {
    const dbEarly = getDatabaseClient();
    await dbEarly.paymentIntent.update({
      where: { id: job.paymentIntentId },
      data: { bridgeTransferId: txHash },
    });
  }
  logger.info('Tracking LI.FI bridge', {
    paymentIntentId: job.paymentIntentId,
    txHash,
    hashSource: resolved.source,
    pollAttempt: job.pollAttempt ?? 0,
  });

  const pollAttempt = job.pollAttempt ?? 0;
  const status = await liFiClient.getTransferStatus({
    txHash,
    fromChain: job.sourceChainId,
    toChain: job.destinationChainId,
    bridge: job.tool,
  });
  const bucket = liFiStatusBucket(status.status, pollAttempt);
  const db = getDatabaseClient();
  const payload = status as unknown as Record<string, unknown>;

  await db.paymentIntent.update({
    where: { id: job.paymentIntentId },
    data: {
      bridgeLiFiStatus: status.status ?? null,
      bridgeLiFiSubstatus: status.substatus ?? null,
      bridgeLastStatusPayload: payload as object,
      bridgeStatus: bucket,
      bridgeLastError: bucket === 'failed' || bucket === 'refunded'
        ? `LI.FI ${status.status ?? 'unknown'}`
        : null,
    },
  });

  const isPartial = (status.status ?? '').toUpperCase() === 'PARTIAL'
    || (status.substatus ?? '').toUpperCase() === 'PARTIAL';
  if (bucket === 'done' || isPartial) {
    const recovery = await recoverDestCreditIfNeeded({
      paymentIntentId: job.paymentIntentId,
      destinationChainId: job.destinationChainId,
      logger,
    });
    if (recovery === 'consumed') {
      await db.paymentIntent.update({
        where: { id: job.paymentIntentId },
        data: {
          settlementCreditTxHash: status.receiving?.txHash ?? txHash,
          settlementCreditedAt: new Date(),
          settlementCreditConsumed: true,
          bridgeRetryMtxmTxId: null,
        },
      });
      logger.info('LI.FI bridge completed', {
        paymentIntentId: job.paymentIntentId,
        destTx: status.receiving?.txHash,
      });
      return;
    }
    if (recovery === 'stuck_submitted') {
      logger.warn('LI.FI dest credit missing; submitted stuck dest credit', {
        paymentIntentId: job.paymentIntentId,
        destTx: status.receiving?.txHash,
        status: status.status,
        substatus: status.substatus,
      });
      return;
    }
    if (bucket === 'done') {
      await db.paymentIntent.update({
        where: { id: job.paymentIntentId },
        data: { settlementCreditConsumed: false, bridgeStatus: 'pending' },
      });
      throw new Error(
        `LI.FI DONE but dest credit not consumed (${status.substatus ?? status.status ?? 'DONE'})`,
      );
    }
  }

  if (bucket === 'pending') {
    throw new Error(`LI.FI bridge still ${status.status ?? 'PENDING'}`);
  }

  const intent = await db.paymentIntent.findUnique({ where: { id: job.paymentIntentId } });
  if (!intent) {
    throw new PaymentError('PaymentIntent not found', job.paymentIntentId);
  }

  const destChain = await db.supportedChain.findUnique({
    where: { chainId: job.destinationChainId },
  });
  if (destChain?.escrowAddress) {
    const consumed = await readDestCreditConsumed(
      destChain.escrowAddress as Address,
      job.destinationChainId,
      uuidToBytes32(intent.id),
    );
    if (consumed) {
      await db.paymentIntent.update({
        where: { id: intent.id },
        data: { settlementCreditConsumed: true, bridgeStatus: 'done', bridgeRetryMtxmTxId: null },
      });
      return;
    }
  }

  if (bucket === 'failed') {
    try {
      await submitStuckDestCredit({
        paymentIntentId: intent.id,
        destinationChainId: job.destinationChainId,
        logger,
      });
      return;
    } catch (err) {
      logger.error('Dest stuck credit failed; checking source refund path', {
        paymentIntentId: intent.id,
        error: String(err),
      });
    }
  }

  if (bucket === 'refunded' || bucket === 'failed') {
    await db.paymentIntent.update({
      where: { id: intent.id },
      data: { bridgeRetryMtxmTxId: null },
    });
    const delayMs = remainingRetryDelayMs(intent.bridgeRetryAvailableAt);
    if (delayMs > 0) {
      await enqueueSourceRetryJob({
        paymentIntentId: intent.id,
        sourceChainId: job.sourceChainId,
        destinationChainId: job.destinationChainId,
      }, delayMs, logger);
      return;
    }
    await submitSourceRetry({
      paymentIntentId: intent.id,
      sourceChainId: job.sourceChainId,
      destinationChainId: job.destinationChainId,
      logger,
    });
    return;
  }

  throw new Error(`LI.FI bridge status ${status.status}`);
}

const BRIDGE_STALE_MS = 10 * 60 * 1000;
const FALSE_DONE_LOOKBACK_MS = 24 * 60 * 60 * 1000;

export async function reconcileStaleBridges(logger: Logger): Promise<void> {
  const db = getDatabaseClient();
  const cutoff = new Date(Date.now() - BRIDGE_STALE_MS);
  const recentDoneCutoff = new Date(Date.now() - FALSE_DONE_LOOKBACK_MS);
  const stale = await db.paymentIntent.findMany({
    where: {
      OR: [
        {
          bridgeStatus: { in: ['pending', 'retrying', 'stuck_settling'] },
          updatedAt: { lt: cutoff },
        },
        { bridgeLiFiSubstatus: 'PARTIAL' },
        {
          bridgeStatus: 'done',
          settlementCreditConsumed: true,
          updatedAt: { gte: recentDoneCutoff },
        },
      ],
    },
    select: {
      id: true,
      authorizationChainId: true,
      settlementChainId: true,
      bridgeTransferId: true,
      bridgeRetryMtxmTxId: true,
      bridgeStatus: true,
      bridgeLiFiSubstatus: true,
    },
  });

  let requeued = 0;
  let confirmedStuck = 0;
  let stuckSubmitted = 0;

  for (const intent of stale) {
    const destChainId = intent.settlementChainId ?? intent.authorizationChainId;
    if (destChainId) {
      try {
        const recovery = await recoverDestCreditIfNeeded({
          paymentIntentId: intent.id,
          destinationChainId: destChainId,
          logger,
        });
        if (recovery === 'consumed') {
          if (intent.bridgeStatus === 'stuck_settling') {
            await db.paymentIntent.update({
              where: { id: intent.id },
              data: {
                settlementCreditConsumed: true,
                bridgeStatus: 'stuck_settled',
                bridgeRetryMtxmTxId: null,
              },
            });
            confirmedStuck++;
          }
          continue;
        }
        if (recovery === 'stuck_submitted') {
          stuckSubmitted++;
          continue;
        }
      } catch (err) {
        logger.warn('Bridge recon dest recovery failed', {
          paymentIntentId: intent.id,
          error: String(err),
        });
      }
    }

    const sourceChainId = intent.authorizationChainId;
    if (!sourceChainId || !destChainId) continue;

    const settleTx = await db.transaction.findFirst({
      where: { paymentIntentId: intent.id, type: 'SETTLE' },
      orderBy: { createdAt: 'desc' },
    });
    const mtxmTxId = settleTx?.mtxmTxId?.startsWith('claim:')
      ? undefined
      : (settleTx?.mtxmTxId ?? intent.bridgeRetryMtxmTxId ?? undefined);
    const txHash = settleTx?.txHash ?? intent.bridgeTransferId ?? undefined;
    if (!txHash && !mtxmTxId) continue;

    await enqueueBridgeTrackJob({
      paymentIntentId: intent.id,
      sourceChainId,
      destinationChainId: destChainId,
      txHash,
      mtxmTxId,
    }, Math.floor(Math.random() * 10_000), true);
    requeued++;
  }

  logger.info('Bridge stale reconciliation complete', {
    found: stale.length,
    requeued,
    confirmedStuck,
    stuckSubmitted,
  });
}

function chainSummary(chain: { chainId: number; displayName: string; explorerUrl: string | null; escrowAddress: string } | null) {
  if (!chain) return null;
  return {
    chainId: chain.chainId,
    displayName: chain.displayName,
    explorerUrl: chain.explorerUrl,
    escrowAddress: chain.escrowAddress,
  };
}

async function lookupToken(tokenKey: string, chainId: number) {
  const db = getDatabaseClient();
  return db.supportedToken.findFirst({
    where: { tokenKey, chainId },
    select: { symbol: true, decimals: true, contractAddress: true, tokenKey: true },
  });
}

/**
 * Read-only operator view. Polls LI.FI and dest escrow; does not write payment rows.
 */
export async function getAdminBridgeSnapshot(paymentIntentId: string, logger: Logger) {
  const db = getDatabaseClient();
  const intent = await db.paymentIntent.findUnique({
    where: { id: paymentIntentId },
    include: {
      app: { select: { id: true, name: true, merchant: { select: { id: true, orgName: true, email: true } } } },
      transactions: {
        where: { type: { in: ['CAPTURE', 'SETTLE'] } },
        orderBy: { createdAt: 'desc' },
      },
    },
  });
  if (!intent) {
    return null;
  }

  const sourceChainId = intent.authorizationChainId;
  const destChainId = intent.settlementChainId;
  const [sourceChain, destChain] = await Promise.all([
    sourceChainId
      ? db.supportedChain.findUnique({
          where: { chainId: sourceChainId },
          select: { chainId: true, displayName: true, explorerUrl: true, escrowAddress: true },
        })
      : null,
    destChainId
      ? db.supportedChain.findUnique({
          where: { chainId: destChainId },
          select: { chainId: true, displayName: true, explorerUrl: true, escrowAddress: true },
        })
      : null,
  ]);

  const settleTx = intent.transactions.find((tx) => tx.type === 'SETTLE' && !!tx.txHash)
    ?? intent.transactions.find((tx) => tx.type === 'SETTLE');
  let sourceTxHash = intent.bridgeTransferId ?? settleTx?.txHash ?? null;
  let hashSource: 'bridge_transfer_id' | 'settle_row' | 'mtxm' | null = intent.bridgeTransferId
    ? 'bridge_transfer_id'
    : (settleTx?.txHash ? 'settle_row' : null);

  const mtxmTxId = settleTx?.mtxmTxId?.startsWith('claim:')
    ? undefined
    : (settleTx?.mtxmTxId ?? intent.bridgeRetryMtxmTxId ?? undefined);
  if (!sourceTxHash && mtxmTxId) {
    try {
      const mtxmTx = await mtxm.getTransaction(mtxmTxId);
      if (mtxmTx.txHash) {
        sourceTxHash = mtxmTx.txHash;
        hashSource = 'mtxm';
      }
    } catch (err) {
      logger.warn('Admin bridge snapshot MTXM hash lookup failed', {
        paymentIntentId,
        mtxmTxId,
        error: String(err),
      });
    }
  }

  let lifi: Record<string, unknown> | null = null;
  let lifiError: string | null = null;
  if (sourceTxHash && sourceChainId && destChainId) {
    try {
      const status = await liFiClient.getTransferStatus({
        txHash: sourceTxHash,
        fromChain: sourceChainId,
        toChain: destChainId,
      });
      lifi = status as unknown as Record<string, unknown>;
    } catch (err) {
      lifiError = err instanceof Error ? err.message : String(err);
    }
  }

  let destCreditConsumedOnChain: boolean | null = null;
  let destOnChainError: string | null = null;
  let destEscrowTokenBalance: string | null = null;
  let destTokenDecimals: number | null = intent.cryptoTokenDecimals;
  let destTokenSymbol: string | null = null;
  const destTokenKey = intent.settlementTokenKey ?? intent.convertedTokenKey ?? intent.cryptoTokenKey;
  if (destChain?.escrowAddress && destChainId) {
    try {
      destCreditConsumedOnChain = await readDestCreditConsumed(
        destChain.escrowAddress as Address,
        destChainId,
        uuidToBytes32(intent.id),
      );
    } catch (err) {
      destOnChainError = err instanceof Error ? err.message : String(err);
    }
    if (destTokenKey) {
      try {
        const destToken = await lookupToken(destTokenKey, destChainId);
        if (destToken) {
          destTokenDecimals = destToken.decimals;
          destTokenSymbol = destToken.symbol;
          const balance = await readSourceTokenBalance(
            destChain.escrowAddress as Address,
            destChainId,
            destToken.contractAddress as Address,
          );
          destEscrowTokenBalance = balance.toString();
        }
      } catch (err) {
        destOnChainError = destOnChainError
          ?? (err instanceof Error ? err.message : String(err));
      }
    }
  }

  return {
    ...intent,
    live: {
      fetchedAt: new Date().toISOString(),
      sourceTxHash,
      hashSource,
      mtxmTxId: mtxmTxId ?? null,
      lifi,
      lifiError,
      destCreditConsumedOnChain,
      destOnChainError,
      destEscrowAddress: destChain?.escrowAddress ?? null,
      destEscrowTokenBalance,
      destTokenDecimals,
      destTokenSymbol,
      destTokenKey: destTokenKey ?? null,
      sourceChain: chainSummary(sourceChain),
      destChain: chainSummary(destChain),
    },
  };
}

export async function adminRetryBridge(paymentIntentId: string, logger: Logger): Promise<void> {
  const db = getDatabaseClient();
  const intent = await db.paymentIntent.findUnique({ where: { id: paymentIntentId } });
  if (!intent?.authorizationChainId || !intent.settlementChainId) {
    throw new PaymentError('Payment is missing chain ids for bridge retry', paymentIntentId);
  }
  await db.paymentIntent.update({
    where: { id: paymentIntentId },
    data: { bridgeRetryMtxmTxId: null },
  });
  await submitSourceRetry({
    paymentIntentId,
    sourceChainId: intent.authorizationChainId,
    destinationChainId: intent.settlementChainId,
    logger,
  });
}

export async function adminStuckCredit(paymentIntentId: string, logger: Logger): Promise<void> {
  const db = getDatabaseClient();
  const intent = await db.paymentIntent.findUnique({ where: { id: paymentIntentId } });
  if (!intent?.settlementChainId) {
    throw new PaymentError('Payment is missing settlement chain for stuck credit', paymentIntentId);
  }
  await submitStuckDestCredit({
    paymentIntentId,
    destinationChainId: intent.settlementChainId,
    logger,
  });
}


import { getDatabaseClient } from '@noderails/database';
import { MtxmClient } from '@noderails/mtxm-client';
import {
  encodeSettleToBank,
  encodeWithdrawSettlementBalance,
  buildSettleToBankTypedData,
  buildWithdrawSettlementBalanceTypedData,
  buildAuthorizeBankSettlementTypedData,
  nodeRailsEscrowAbi,
} from '@noderails/web3';
import {
  NotFoundError,
  PaymentError,
  ValidationError,
  isValidAddress,
  QUEUE_NAMES,
  getLeanRpcUrl,
} from '@noderails/common';
import { queueRegistry } from '@noderails/queue';
import type { SettlementExecuteBankSettlementJob, SettlementTrackBankSettlementJob } from '@noderails/queue';
import { createPublicClient, http, recoverTypedDataAddress, type Address, type Hex } from 'viem';
import { env } from '../../config.js';
import { bloxFiClient } from '../../clients/bloxfi.client.js';
import type { Logger } from '@noderails/service-base';
import { uuidToBytes32 } from '../payments/crypto-utils.js';
import { merchantHasVerifiedOwnAccount } from '../fiat/own-accounts/own-account.service.js';
import { getSettlementConfig } from '../settlement-config/settlement-config.service.js';

const mtxm = new MtxmClient({
  baseUrl: env.MTXM_BASE_URL,
  projectId: env.MTXM_PROJECT_ID,
  apiKey: env.MTXM_API_KEY,
});

/** Merchant bank/withdraw authorization validity (1 year). */
const BANK_SETTLEMENT_AUTH_TTL_SEC = 365 * 24 * 60 * 60;
const TERMINAL_BANK_STATUSES = ['COMPLETED', 'FAILED', 'FUNDS_AT_DEPOSIT_FAILED'] as const;

function serializeBigInts(obj: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj)) {
    result[key] = typeof value === 'bigint' ? value.toString() : value;
  }
  return result;
}

function requireValidBankAuth(config: {
  bankSettlementAuthSignature: string | null;
  bankSettlementAuthValidUntil: Date | null;
}) {
  if (!config.bankSettlementAuthSignature || !config.bankSettlementAuthValidUntil) {
    throw new ValidationError('Merchant must authorize bank settlement for 1 year before off-ramping');
  }
  if (config.bankSettlementAuthValidUntil.getTime() <= Date.now()) {
    throw new ValidationError('Bank settlement authorization expired — sign again');
  }
  return {
    merchantSignature: config.bankSettlementAuthSignature as Hex,
    authValidUntil: BigInt(Math.floor(config.bankSettlementAuthValidUntil.getTime() / 1000)),
  };
}

function normalizeChainRef(value: string | number | undefined | null): string {
  return String(value ?? '').trim().toLowerCase();
}

function depositMatchesSettlement(input: {
  depositChain?: string;
  depositToken?: string;
  settlementChainId: number;
  tokenSymbol: string;
  tokenAddress: string;
}): boolean {
  const chain = normalizeChainRef(input.depositChain);
  const token = normalizeChainRef(input.depositToken);
  if (chain) {
    const expectedChain = String(input.settlementChainId);
    if (chain !== expectedChain && chain !== expectedChain.toLowerCase()) {
      return false;
    }
  }
  if (token) {
    const symbol = input.tokenSymbol.toLowerCase();
    const address = input.tokenAddress.toLowerCase();
    if (token !== symbol && token !== address) {
      return false;
    }
  }
  return true;
}

async function resolveBankSettlementPaymentIntent(appId: string) {
  const db = getDatabaseClient();
  const intent = await db.paymentIntent.findFirst({
    where: {
      appId,
      bankSettlementEnabled: true,
      bankSettlementId: null,
      settlementCreditConsumed: true,
    },
    orderBy: { settlementCreditedAt: 'desc' },
  });
  if (!intent) {
    throw new ValidationError('No credited payment intent is eligible for bank settlement');
  }
  return intent;
}

export async function listBankSettlements(appId: string) {
  const db = getDatabaseClient();
  return db.bankSettlement.findMany({
    where: { appId },
    orderBy: { createdAt: 'desc' },
    take: 25,
    include: { paymentIntents: { select: { id: true }, take: 1 } },
  });
}

export async function readMerchantSettlementBalance(input: {
  chainId: number;
  escrowAddress: string;
  merchant: Address;
  token: Address;
}): Promise<bigint> {
  const rpc = createPublicClient({ transport: http(getLeanRpcUrl(input.chainId)) });
  return rpc.readContract({
    address: input.escrowAddress as Address,
    abi: nodeRailsEscrowAbi,
    functionName: 'merchantSettlementBalances',
    args: [input.merchant, input.token],
  });
}

export async function getSettlementBalanceForApp(appId: string) {
  const db = getDatabaseClient();
  const config = await getSettlementConfig(appId);
  const app = await db.app.findUnique({
    where: { id: appId },
    include: { appChains: { where: { chainId: config.settlementChainId ?? -1 } } },
  });
  if (!app) throw new NotFoundError('App', appId);
  if (!config.settlementChainId || !config.settlementTokenKey) {
    return { balance: '0', chainId: null, tokenKey: null, merchant: null, escrow: null };
  }
  const chain = await db.supportedChain.findUnique({ where: { chainId: config.settlementChainId } });
  const token = await db.supportedToken.findFirst({
    where: { tokenKey: config.settlementTokenKey, chainId: config.settlementChainId, isEnabled: true },
  });
  const recent = await db.paymentIntent.findFirst({
    where: { appId, bankSettlementEnabled: true, captureMerchantAddress: { not: null } },
    orderBy: { updatedAt: 'desc' },
    select: { captureMerchantAddress: true },
  });
  const merchant = (
    recent?.captureMerchantAddress
    ?? app.appChains[0]?.settlementAddress
    ?? app.receivingWallet
    ?? config.settlementWalletAddress
  ) as Address | null;
  if (!chain?.escrowAddress || !token || !merchant || !isValidAddress(merchant)) {
    return {
      balance: '0',
      chainId: config.settlementChainId,
      tokenKey: config.settlementTokenKey,
      merchant,
      escrow: chain?.escrowAddress ?? null,
    };
  }
  const balance = await readMerchantSettlementBalance({
    chainId: config.settlementChainId,
    escrowAddress: chain.escrowAddress,
    merchant,
    token: token.contractAddress as Address,
  });
  return {
    balance: balance.toString(),
    chainId: config.settlementChainId,
    tokenKey: config.settlementTokenKey,
    merchant,
    escrow: chain.escrowAddress,
    tokenAddress: token.contractAddress,
    bankAuthValidUntil: config.bankSettlementAuthValidUntil,
    bankAuthActive: !!(
      config.bankSettlementAuthSignature
      && config.bankSettlementAuthValidUntil
      && config.bankSettlementAuthValidUntil.getTime() > Date.now()
    ),
  };
}

export async function prepareBankSettlementAuth(appId: string) {
  const held = await getSettlementBalanceForApp(appId);
  if (!held.merchant) {
    throw new ValidationError('Merchant wallet is not configured');
  }
  const validUntil = BigInt(Math.floor(Date.now() / 1000) + BANK_SETTLEMENT_AUTH_TTL_SEC);
  const typedData = buildAuthorizeBankSettlementTypedData({
    merchantWallet: held.merchant as Address,
    validUntil,
  });
  return {
    typedData: {
      domain: typedData.domain,
      types: typedData.types,
      primaryType: typedData.primaryType,
      message: {
        merchantWallet: typedData.message.merchantWallet,
        purpose: typedData.message.purpose,
        validUntil: validUntil.toString(),
      },
    },
    validUntil: validUntil.toString(),
    merchant: held.merchant,
  };
}

export async function attachBankSettlementAuth(
  appId: string,
  merchantSignature: string,
  validUntilRaw: string,
) {
  const held = await getSettlementBalanceForApp(appId);
  if (!held.merchant || !isValidAddress(held.merchant)) {
    throw new ValidationError('Merchant wallet is not configured');
  }
  let validUntil: bigint;
  try {
    validUntil = BigInt(validUntilRaw);
  } catch {
    throw new ValidationError('Invalid authorization expiry');
  }
  if (validUntil <= BigInt(Math.floor(Date.now() / 1000))) {
    throw new ValidationError('Authorization expiry is in the past — prepare again');
  }
  const maxUntil = BigInt(Math.floor(Date.now() / 1000) + BANK_SETTLEMENT_AUTH_TTL_SEC + 60);
  if (validUntil > maxUntil) {
    throw new ValidationError('Authorization expiry is too far in the future');
  }

  const typedData = buildAuthorizeBankSettlementTypedData({
    merchantWallet: held.merchant as Address,
    validUntil,
  });
  const recovered = await recoverTypedDataAddress({
    domain: typedData.domain,
    types: typedData.types,
    primaryType: typedData.primaryType,
    message: typedData.message,
    signature: merchantSignature as Hex,
  });
  if (recovered.toLowerCase() !== held.merchant.toLowerCase()) {
    throw new ValidationError('Bank authorization must be signed by the merchant wallet');
  }

  const db = getDatabaseClient();
  return db.settlementConfig.update({
    where: { appId },
    data: {
      bankSettlementAuthSignature: merchantSignature,
      bankSettlementAuthValidUntil: new Date(Number(validUntil) * 1000),
    },
  });
}

export async function createBankSettlement(appId: string, logger: Logger) {
  const db = getDatabaseClient();
  const app = await db.app.findUnique({
    where: { id: appId },
    select: { merchantId: true, environment: true },
  });
  if (!app) throw new NotFoundError('App', appId);
  if (!(await merchantHasVerifiedOwnAccount(app.merchantId, app.environment))) {
    throw new ValidationError('Connect and verify your own bank account before settling to bank');
  }
  const config = await getSettlementConfig(appId);
  requireValidBankAuth(config);
  if (!config.bankSettlementEnabled) {
    throw new ValidationError('Bank settlement is not enabled for this app');
  }
  if (!config.bloxfiBeneficiaryId) {
    throw new ValidationError('Save a BloxFi beneficiary before settling to bank');
  }
  if (!config.bankPayoutCurrency || !config.settlementTokenKey || !config.settlementChainId) {
    throw new ValidationError('Settlement token, chain, and payout currency are required');
  }

  const paymentIntent = await resolveBankSettlementPaymentIntent(appId);
  const held = await getSettlementBalanceForApp(appId);
  if (!held.merchant || BigInt(held.balance) <= 0n) {
    throw new ValidationError('No settlement balance available to send to bank');
  }

  const token = await db.supportedToken.findFirst({
    where: { tokenKey: config.settlementTokenKey, chainId: config.settlementChainId },
  });
  if (!token) throw new ValidationError('Settlement token not found');

  const sourceCurrency = token.symbol.toUpperCase();
  const rate = await bloxFiClient.getOfframpRate({
    sourceCurrency,
    destinationCurrency: config.bankPayoutCurrency,
    amount: held.balance,
    network: String(config.settlementChainId),
  });

  const clientReferenceId = crypto.randomUUID();
  const row = await db.bankSettlement.create({
    data: {
      appId,
      clientReferenceId,
      tokenKey: config.settlementTokenKey,
      chainId: config.settlementChainId,
      amount: held.balance,
      payoutCurrency: config.bankPayoutCurrency,
      status: 'QUOTED',
      bloxfiRateToken: rate.bfxToken,
      metadata: {
        merchant: held.merchant,
        tokenAddress: token.contractAddress,
        tokenSymbol: token.symbol,
        paymentIntentId: paymentIntent.id,
      },
    },
  });

  const claimed = await db.paymentIntent.updateMany({
    where: { id: paymentIntent.id, bankSettlementId: null },
    data: { bankSettlementId: row.id },
  });
  if (claimed.count !== 1) {
    await db.bankSettlement.update({
      where: { id: row.id },
      data: { status: 'FAILED', failureReason: 'Payment intent already claimed for bank settlement' },
    });
    throw new ValidationError('Payment intent already claimed for bank settlement');
  }

  const transfer = await bloxFiClient.createOfframpTransfer({
    clientReferenceId: row.id,
    beneficiaryId: config.bloxfiBeneficiaryId,
    bfxToken: rate.bfxToken,
    amount: held.balance,
    sourceCurrency,
    destinationCurrency: config.bankPayoutCurrency,
    network: String(config.settlementChainId),
  });

  const depositAddress = transfer.depositInfo?.address;
  if (!depositAddress || !isValidAddress(depositAddress)) {
    await db.bankSettlement.update({
      where: { id: row.id },
      data: { status: 'FAILED', failureReason: 'BloxFi did not return a deposit address' },
    });
    throw new PaymentError('BloxFi did not return a deposit address', row.id);
  }

  if (!depositMatchesSettlement({
    depositChain: transfer.depositInfo?.chain,
    depositToken: transfer.depositInfo?.token,
    settlementChainId: config.settlementChainId,
    tokenSymbol: token.symbol,
    tokenAddress: token.contractAddress,
  })) {
    await db.bankSettlement.update({
      where: { id: row.id },
      data: {
        status: 'FAILED',
        failureReason: `BloxFi deposit chain/token mismatch (chain=${transfer.depositInfo?.chain ?? 'unknown'}, token=${transfer.depositInfo?.token ?? 'unknown'})`,
      },
    });
    throw new PaymentError('BloxFi deposit chain or token does not match settlement config', row.id);
  }

  const updated = await db.bankSettlement.update({
    where: { id: row.id },
    data: {
      bloxfiTransferId: transfer.id,
      clientReferenceId: row.id,
      depositAddress,
      status: 'DEPOSIT_PENDING',
      metadata: {
        ...(row.metadata as Record<string, unknown>),
        depositChain: transfer.depositInfo?.chain ?? null,
        depositToken: transfer.depositInfo?.token ?? null,
      },
    },
  });

  const queue = queueRegistry.getOrCreateQueue<SettlementExecuteBankSettlementJob>(
    QUEUE_NAMES.SETTLEMENT_EXECUTE_BANK_SETTLEMENT,
  );
  await queue.add(`bank-execute-${row.id}`, { bankSettlementId: row.id }, {
    jobId: `bank-execute-${row.id}`,
    attempts: 5,
    backoff: { type: 'exponential', delay: 15_000 },
  });

  logger.info('Bank settlement quoted', {
    bankSettlementId: updated.id,
    paymentIntentId: paymentIntent.id,
    depositAddress,
  });
  return { ...updated, paymentIntentId: paymentIntent.id, merchant: held.merchant };
}

export async function executeBankSettlement(bankSettlementId: string, logger: Logger) {
  const db = getDatabaseClient();
  const claimed = await db.bankSettlement.updateMany({
    where: {
      id: bankSettlementId,
      status: { in: ['QUOTED', 'DEPOSIT_PENDING'] },
    },
    data: { status: 'PROCESSING' },
  });
  if (claimed.count !== 1) {
    const existing = await db.bankSettlement.findUnique({ where: { id: bankSettlementId } });
    logger.info('Bank settlement already submitted or missing', {
      bankSettlementId,
      status: existing?.status,
    });
    return;
  }

  const row = await db.bankSettlement.findUnique({
    where: { id: bankSettlementId },
    include: { paymentIntents: { select: { id: true }, take: 1 } },
  });
  if (!row) {
    logger.warn('Bank settlement missing after claim', { bankSettlementId });
    return;
  }
  if (!row.depositAddress) {
    await db.bankSettlement.update({
      where: { id: row.id },
      data: { status: 'FAILED', failureReason: 'Bank settlement is missing deposit address' },
    });
    throw new PaymentError('Bank settlement is missing deposit address', bankSettlementId);
  }

  const config = await getSettlementConfig(row.appId);
  const { merchantSignature, authValidUntil } = requireValidBankAuth(config);

  const meta = (row.metadata ?? {}) as {
    merchant?: string;
    tokenAddress?: string;
    tokenSymbol?: string;
    paymentIntentId?: string;
    depositChain?: string;
    depositToken?: string;
  };
  const paymentIntentId = meta.paymentIntentId ?? row.paymentIntents[0]?.id;
  if (!paymentIntentId) {
    await db.bankSettlement.update({
      where: { id: row.id },
      data: { status: 'FAILED', failureReason: 'Bank settlement is missing payment intent' },
    });
    throw new PaymentError('Bank settlement is missing payment intent', bankSettlementId);
  }

  const chain = await db.supportedChain.findUnique({ where: { chainId: row.chainId } });
  if (!chain?.escrowAddress) {
    await db.bankSettlement.update({
      where: { id: row.id },
      data: { status: 'FAILED', failureReason: 'Settlement-chain escrow is missing' },
    });
    throw new PaymentError('Settlement-chain escrow is missing', bankSettlementId);
  }
  const merchant = meta.merchant as Address;
  const token = meta.tokenAddress as Address;
  if (!isValidAddress(merchant) || !isValidAddress(token)) {
    await db.bankSettlement.update({
      where: { id: row.id },
      data: { status: 'FAILED', failureReason: 'Bank settlement metadata is incomplete' },
    });
    throw new PaymentError('Bank settlement metadata is incomplete', bankSettlementId);
  }

  if (!depositMatchesSettlement({
    depositChain: meta.depositChain,
    depositToken: meta.depositToken,
    settlementChainId: row.chainId,
    tokenSymbol: meta.tokenSymbol ?? '',
    tokenAddress: token,
  })) {
    await db.bankSettlement.update({
      where: { id: row.id },
      data: { status: 'FAILED', failureReason: 'BloxFi deposit chain or token does not match settlement config' },
    });
    throw new PaymentError('BloxFi deposit chain or token does not match settlement config', bankSettlementId);
  }

  const bankId = uuidToBytes32(row.id);
  const paymentIntentBytes32 = uuidToBytes32(paymentIntentId);

  const rpc = createPublicClient({ transport: http(getLeanRpcUrl(row.chainId)) });
  const alreadyConsumed = await rpc.readContract({
    address: chain.escrowAddress as Address,
    abi: nodeRailsEscrowAbi,
    functionName: 'bankSettlementConsumed',
    args: [bankId],
  });
  if (alreadyConsumed) {
    logger.info('Bank settlement already consumed on-chain', { bankSettlementId });
    return;
  }

  const typedData = buildSettleToBankTypedData(
    {
      paymentIntentId: paymentIntentBytes32,
      merchant,
      token,
      amount: BigInt(row.amount),
      depositAddress: row.depositAddress as Address,
      bankSettlementId: bankId,
    },
    row.chainId,
    chain.escrowAddress as Address,
  );
  const sig = await mtxm.signTypedData({
    chainId: String(row.chainId),
    domain: typedData.domain,
    types: typedData.types,
    value: serializeBigInts(typedData.message),
  });
  const calldata = encodeSettleToBank({
    paymentIntentId: paymentIntentBytes32,
    merchant,
    token,
    amount: BigInt(row.amount),
    depositAddress: row.depositAddress as Address,
    bankSettlementId: bankId,
    authValidUntil,
    merchantSignature,
    noderailsSignature: sig.signature as Hex,
  });
  const txResult = await mtxm.sendTransaction({
    chainId: chain.mtxmChainDbId?.trim() || String(row.chainId),
    to: chain.escrowAddress,
    data: calldata,
  });

  await db.bankSettlement.update({
    where: { id: row.id },
    data: {
      onChainTxHash: txResult.txHash ?? null,
    },
  });
  await db.transaction.create({
    data: {
      mtxmTxId: txResult.id,
      txHash: txResult.txHash ?? null,
      chain: String(row.chainId),
      type: 'BANK_SETTLEMENT',
      status: 'PENDING',
      paymentIntentId,
    },
  });

  const track = queueRegistry.getOrCreateQueue<SettlementTrackBankSettlementJob>(
    QUEUE_NAMES.SETTLEMENT_TRACK_BANK_SETTLEMENT,
  );
  await track.add(`bank-track-${row.id}`, { bankSettlementId: row.id }, {
    jobId: `bank-track-${row.id}`,
    delay: 30_000,
    attempts: 30,
    backoff: { type: 'exponential', delay: 30_000 },
  });
  logger.info('settleToBank submitted', {
    bankSettlementId: row.id,
    paymentIntentId,
    mtxmTxId: txResult.id,
  });
}

export async function trackBankSettlement(bankSettlementId: string, logger: Logger) {
  const db = getDatabaseClient();
  const row = await db.bankSettlement.findUnique({ where: { id: bankSettlementId } });
  if (!row?.bloxfiTransferId) return;
  if ((TERMINAL_BANK_STATUSES as readonly string[]).includes(row.status)) return;

  const transfer = await bloxFiClient.getTransfer(row.bloxfiTransferId);
  const status = (transfer.status ?? '').toUpperCase();
  if (['COMPLETED', 'SUCCESS', 'SETTLED'].includes(status)) {
    await db.bankSettlement.update({
      where: { id: row.id },
      data: { status: 'COMPLETED' },
    });
    return;
  }
  if (['FAILED', 'CANCELLED', 'EXPIRED'].includes(status)) {
    await db.bankSettlement.update({
      where: { id: row.id },
      data: {
        status: row.onChainTxHash ? 'FUNDS_AT_DEPOSIT_FAILED' : 'FAILED',
        failureReason: `BloxFi status ${transfer.status}`,
      },
    });
    logger.error('BloxFi transfer failed after bank settlement', {
      bankSettlementId: row.id,
      onChainTxHash: row.onChainTxHash,
      bloxfiStatus: transfer.status,
    });
    return;
  }
  throw new Error(`BloxFi transfer still ${transfer.status ?? 'pending'}`);
}

export async function applyBloxFiWebhook(
  rawBody: string,
  signature: string,
  timestamp: string,
  eventId: string | undefined,
  logger: Logger,
): Promise<boolean> {
  if (!bloxFiClient.verifyWebhookSignature(rawBody, signature, timestamp)) {
    return false;
  }
  const payload = JSON.parse(rawBody) as {
    type?: string;
    data?: { id?: string; clientReferenceId?: string; status?: string };
  };
  const transferId = payload.data?.id;
  const clientRef = payload.data?.clientReferenceId;
  const status = (payload.data?.status ?? '').toUpperCase();
  const db = getDatabaseClient();

  if (eventId) {
    const existing = await db.bankSettlement.findFirst({ where: { webhookEventId: eventId } });
    if (existing) return true;
  }

  const row = await db.bankSettlement.findFirst({
    where: {
      OR: [
        ...(transferId ? [{ bloxfiTransferId: transferId }] : []),
        ...(clientRef ? [{ id: clientRef }, { clientReferenceId: clientRef }] : []),
      ],
    },
  });
  if (!row) {
    logger.warn('BloxFi webhook for unknown transfer', { transferId, clientRef });
    return true;
  }

  if ((TERMINAL_BANK_STATUSES as readonly string[]).includes(row.status)) {
    if (eventId && !row.webhookEventId) {
      await db.bankSettlement.update({
        where: { id: row.id },
        data: { webhookEventId: eventId },
      });
    }
    return true;
  }

  let next = row.status;
  let failureReason: string | undefined;
  if (['COMPLETED', 'SUCCESS', 'SETTLED'].includes(status)) next = 'COMPLETED';
  else if (['FAILED', 'CANCELLED', 'EXPIRED'].includes(status)) {
    next = row.onChainTxHash ? 'FUNDS_AT_DEPOSIT_FAILED' : 'FAILED';
    failureReason = `BloxFi status ${payload.data?.status ?? status}`;
  } else if (['PROCESSING', 'PENDING'].includes(status)) next = 'PROCESSING';

  await db.bankSettlement.update({
    where: { id: row.id },
    data: {
      status: next,
      webhookEventId: eventId ?? row.webhookEventId,
      bloxfiTransferId: transferId ?? row.bloxfiTransferId,
      ...(failureReason ? { failureReason } : {}),
    },
  });
  return true;
}

export async function prepareWithdrawSettlementBalance(appId: string, destination: string) {
  if (!isValidAddress(destination)) {
    throw new ValidationError('Withdraw destination must be an EVM address');
  }
  const config = await getSettlementConfig(appId);
  requireValidBankAuth(config);
  const held = await getSettlementBalanceForApp(appId);
  if (!held.merchant || !held.escrow || !held.tokenAddress || !held.chainId) {
    throw new ValidationError('No settlement balance to withdraw');
  }
  if (BigInt(held.balance) <= 0n) {
    throw new ValidationError('Settlement balance is zero');
  }
  return {
    amount: held.balance,
    merchant: held.merchant,
    token: held.tokenAddress,
    chainId: held.chainId,
    escrow: held.escrow,
    destination,
  };
}

export async function executeWithdrawSettlementBalance(input: {
  appId: string;
  destination: string;
}) {
  if (!isValidAddress(input.destination)) {
    throw new ValidationError('Withdraw destination must be an EVM address');
  }
  const config = await getSettlementConfig(input.appId);
  const { merchantSignature, authValidUntil } = requireValidBankAuth(config);
  const held = await getSettlementBalanceForApp(input.appId);
  if (!held.merchant || !held.escrow || !held.tokenAddress || !held.chainId) {
    throw new ValidationError('No settlement balance to withdraw');
  }
  if (!isValidAddress(held.merchant) || !isValidAddress(held.tokenAddress) || !isValidAddress(held.escrow)) {
    throw new ValidationError('Settlement withdraw metadata is incomplete');
  }
  const liveBalance = await readMerchantSettlementBalance({
    chainId: held.chainId,
    escrowAddress: held.escrow,
    merchant: held.merchant as Address,
    token: held.tokenAddress as Address,
  });
  if (liveBalance <= 0n) {
    throw new ValidationError('Settlement balance is zero');
  }

  const withdrawId = crypto.randomUUID();
  const typedData = buildWithdrawSettlementBalanceTypedData(
    {
      merchant: held.merchant as Address,
      token: held.tokenAddress as Address,
      amount: liveBalance,
      destination: input.destination as Address,
      withdrawId: uuidToBytes32(withdrawId),
    },
    held.chainId,
    held.escrow as Address,
  );
  const sig = await mtxm.signTypedData({
    chainId: String(held.chainId),
    domain: typedData.domain,
    types: typedData.types,
    value: serializeBigInts(typedData.message),
  });
  const calldata = encodeWithdrawSettlementBalance({
    merchant: held.merchant as Address,
    token: held.tokenAddress as Address,
    amount: liveBalance,
    destination: input.destination as Address,
    withdrawId: uuidToBytes32(withdrawId),
    authValidUntil,
    merchantSignature,
    noderailsSignature: sig.signature as Hex,
  });
  const db = getDatabaseClient();
  const chain = await db.supportedChain.findUnique({ where: { chainId: held.chainId } });
  const txResult = await mtxm.sendTransaction({
    chainId: chain?.mtxmChainDbId?.trim() || String(held.chainId),
    to: held.escrow,
    data: calldata,
  });
  await db.transaction.create({
    data: {
      mtxmTxId: txResult.id,
      txHash: txResult.txHash ?? null,
      chain: String(held.chainId),
      type: 'SETTLEMENT_WITHDRAW',
      status: 'PENDING',
    },
  });
  return txResult;
}

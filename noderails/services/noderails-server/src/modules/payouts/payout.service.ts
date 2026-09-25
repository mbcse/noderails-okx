import { getDatabaseClient, ChainType } from '@noderails/database';
import { assertOptionalEmailsCanReceiveMail } from '../../lib/email-mx.js';
import { MtxmClient } from '@noderails/mtxm-client';
import {
  NotFoundError,
  AuthorizationError,
  ValidationError,
  SuiPayoutNotEnabledError,
  DEFAULT_PAGE_SIZE,
  MAX_PAGE_SIZE,
  isNativeToken,
  isValidAddress,
  isValidSolanaAddress,
  isValidSuiAddress,
  generateNonce,
} from '@noderails/common';
import {
  encodeExecutePayout,
  encodeExecuteNativePayout,
  encodeExecuteBulkPayout,
  encodeExecuteBulkNativePayout,
  buildPayoutTypedData,
  buildNativePayoutTypedData,
  buildBulkPayoutTypedData,
  buildBulkNativePayoutTypedData,
} from '@noderails/web3';
import {
  executeNativePayoutInstruction,
  buildNativePayoutMessageSolana,
  buildSolanaSessionMessage,
  instructionToMtxmSolana,
} from '@noderails/solana';
import { PublicKey } from '@solana/web3.js';
import bs58 from 'bs58';
import type { Address, Hex } from 'viem';
import { WEBHOOK_EVENTS } from '@noderails/common';
import { env } from '../../config.js';
import { uuidToBytes32 } from '../payments/crypto-utils.js';
import { mtxmSolanaAuthority, paymentIntentIdSolanaBytes, mtxmSolanaProgramBlock } from '../payments/solana-escrow-tx.js';
import { getEffectiveFeeBps } from '../payments/fee-config.service.js';
import { enqueueAppWebhook } from '../webhooks/webhook.service.js';
import {
  familyAuth,
  familyPayoutWallet,
  parseEd25519Signature64,
  requireFamilyAuth,
  type PayoutAuthFamily,
} from './payout-auth.service.js';
import { parseHumanTokenAmount, resolvePayoutToken } from './payout-token.js';
import { enqueuePayoutExecute, payoutExecuteJobId, removePayoutJob } from './payout-queue.js';

const mtxm = new MtxmClient({
  baseUrl: env.MTXM_BASE_URL,
  projectId: env.MTXM_PROJECT_ID,
  apiKey: env.MTXM_API_KEY,
});

const MAX_BULK_SIZE = 200;

export interface PayoutLineInput {
  recipient: string;
  amount: string;
  email?: string;
}

function parseNonce32(nonce: string): Uint8Array {
  const h = nonce.startsWith('0x') ? nonce.slice(2) : nonce;
  if (!/^[0-9a-fA-F]{64}$/.test(h)) {
    throw new ValidationError('Invalid payout nonce (expected 32-byte hex)');
  }
  return Uint8Array.from(Buffer.from(h, 'hex'));
}

function parseAtomicAmount(raw: string, label = 'amount'): bigint {
  const s = raw.trim();
  if (!/^\d+$/.test(s)) {
    throw new ValidationError(`${label} must be an atomic integer string`);
  }
  const n = BigInt(s);
  if (n <= 0n) throw new ValidationError(`${label} must be greater than zero`);
  return n;
}

export function atomicAmountFromStored(raw: { toString(): string }): bigint {
  const str = raw.toString();
  if (str.includes('e') || str.includes('E')) {
    throw new ValidationError('tokenAmount must be a plain integer string');
  }
  const [whole, frac = ''] = str.split('.');
  if (frac.replace(/0+$/, '') !== '') {
    throw new ValidationError('tokenAmount must be an atomic integer (no fractional part)');
  }
  const n = BigInt(whole || '0');
  if (n <= 0n) throw new ValidationError('tokenAmount must be greater than zero');
  return n;
}

function serializeBigInts(obj: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj)) {
    result[key] = typeof value === 'bigint' ? value.toString() : value;
  }
  return result;
}

function chainFamily(chainType: ChainType): PayoutAuthFamily {
  if (chainType === ChainType.SOLANA) return 'SOLANA';
  if (chainType === ChainType.SUI) return 'SUI';
  return 'EVM';
}

export interface CreatePayoutInput {
  merchantId: string;
  appId: string;
  recipientWallet?: string;
  recipientEmail?: string;
  amountUsd?: string;
  tokenAmount?: string;
  tokenAddress: string;
  chain: string;
  lines?: PayoutLineInput[];
  scheduledAt?: string;
  executeNow?: boolean;
  scheduleId?: string;
  amountsAreAtomic?: boolean;
  persistFailedOnAuthError?: boolean;
}

function validateRecipient(family: PayoutAuthFamily, dest: string, label: string) {
  if (family === 'SOLANA') {
    if (!isValidSolanaAddress(dest)) throw new ValidationError(`Invalid Solana ${label}`);
    return;
  }
  if (family === 'SUI') {
    if (!isValidSuiAddress(dest)) throw new ValidationError(`Invalid Sui ${label}`);
    return;
  }
  if (!isValidAddress(dest)) throw new ValidationError(`Invalid EVM ${label}`);
}

export async function resolvePayoutDraft(input: CreatePayoutInput) {
  const db = getDatabaseClient();

  const app = await db.app.findUnique({ where: { id: input.appId } });
  if (!app) throw new NotFoundError('App', input.appId);
  if (app.merchantId !== input.merchantId) throw new AuthorizationError('Access denied');

  const chainIdNum = parseInt(input.chain.trim(), 10);
  if (!Number.isFinite(chainIdNum) || chainIdNum <= 0) {
    throw new ValidationError('Invalid chain id');
  }

  const supported = await db.supportedChain.findUnique({ where: { chainId: chainIdNum } });
  if (!supported?.isEnabled) {
    throw new ValidationError(`Chain ${chainIdNum} is not available`);
  }

  const enabled = await db.appChain.findUnique({
    where: { appId_chainId: { appId: input.appId, chainId: chainIdNum } },
  });
  if (!enabled?.isEnabled) {
    throw new ValidationError(`Chain ${chainIdNum} is not enabled for this app`);
  }

  const family = chainFamily(supported.chainType);
  const payoutW = familyPayoutWallet(app, family);
  if (!payoutW) {
    throw new ValidationError(`Configure a ${family} payout wallet first`);
  }

  const resolvedToken = await resolvePayoutToken({
    appId: input.appId,
    chainId: chainIdNum,
    tokenAddress: input.tokenAddress,
    family,
  });
  const tokenAddr = resolvedToken.tokenAddress;
  const bulkLines = input.lines?.length ? input.lines : null;

  if (bulkLines && family !== 'EVM' && bulkLines.length > 1) {
    throw new ValidationError('Bulk payouts are EVM only in this release');
  }

  if (family === 'SOLANA' && !isNativeToken(tokenAddr)) {
    throw new ValidationError(
      'Solana payouts support native SOL only. SPL payouts need merchant token-account co-sign and are not automated yet.',
    );
  }
  if (family === 'SUI' && !isNativeToken(tokenAddr)) {
    throw new ValidationError('Sui payouts support native SUI only for automated execution');
  }

  let recipient = (input.recipientWallet ?? '').trim();
  let tokenAmount: string;
  let linesJson: Array<{ recipient: string; amount: string; email?: string }> | null = null;

  const toAtomic = (raw: string, label: string): bigint => {
    if (input.amountsAreAtomic) return parseAtomicAmount(raw, label);
    return parseHumanTokenAmount(raw, resolvedToken.decimals, label);
  };

  if (bulkLines) {
    if (bulkLines.length < 1 || bulkLines.length > MAX_BULK_SIZE) {
      throw new ValidationError(`Bulk payouts must have 1–${MAX_BULK_SIZE} lines`);
    }
    let total = 0n;
    linesJson = bulkLines.map((line, i) => {
      const dest = line.recipient.trim();
      validateRecipient(family, dest, `recipient on line ${i + 1}`);
      const amount = toAtomic(line.amount, `line ${i + 1} amount`);
      total += amount;
      const email = typeof line.email === 'string' && line.email.trim()
        ? line.email.trim().toLowerCase()
        : undefined;
      return { recipient: dest, amount: amount.toString(), ...(email ? { email } : {}) };
    });
    recipient = linesJson[0]!.recipient;
    tokenAmount = total.toString();
  } else {
    if (!recipient) throw new ValidationError('recipientWallet is required');
    if (!input.tokenAmount) throw new ValidationError('tokenAmount is required');
    validateRecipient(family, recipient, 'recipient wallet');
    tokenAmount = toAtomic(input.tokenAmount, 'tokenAmount').toString();
  }

  return {
    app,
    family,
    payoutW,
    tokenAddr,
    chainIdNum,
    recipient,
    tokenAmount,
    linesJson,
  };
}

export async function createPayout(input: CreatePayoutInput) {
  await assertOptionalEmailsCanReceiveMail([
    input.recipientEmail,
    ...(input.lines ?? []).map((line) => line.email),
  ]);
  const db = getDatabaseClient();
  const draft = await resolvePayoutDraft(input);
  const { app, family, payoutW, tokenAddr, chainIdNum, recipient, tokenAmount, linesJson } = draft;

  let scheduledAt: Date | null = null;
  if (input.scheduledAt?.trim()) {
    scheduledAt = new Date(input.scheduledAt);
    if (Number.isNaN(scheduledAt.getTime())) {
      throw new ValidationError('Invalid scheduledAt');
    }
  }

  const futureSchedule = Boolean(scheduledAt && scheduledAt.getTime() > Date.now() + 1000);
  if (futureSchedule && family === 'SUI') {
    throw new ValidationError('Sui payouts cannot be scheduled yet');
  }

  const liveAuth = familyAuth(app, family);
  let authError: string | null = null;
  try {
    requireFamilyAuth(app, family);
  } catch (err) {
    authError = err instanceof Error ? err.message : 'Authorize payouts in app settings first';
  }

  if (authError && !input.persistFailedOnAuthError) {
    throw new ValidationError(authError);
  }

  const nonce = generateNonce();
  const feeBps = await getEffectiveFeeBps(input.merchantId);
  const failedAuth = Boolean(authError);

  const payout = await db.payoutIntent.create({
    data: {
      merchantId: input.merchantId,
      appId: input.appId,
      recipientWallet: recipient,
      recipientEmail: input.recipientEmail?.trim()
        ? input.recipientEmail.trim().toLowerCase()
        : undefined,
      merchantWallet: payoutW,
      amountUsd: input.amountUsd?.trim() || '0',
      tokenAmount,
      tokenAddress: tokenAddr,
      chain: String(chainIdNum),
      nonce,
      sessionSignature: failedAuth ? null : liveAuth.signature,
      sessionExpiry: failedAuth ? null : liveAuth.validUntil,
      lines: linesJson ?? undefined,
      scheduledAt: futureSchedule ? scheduledAt : null,
      scheduleId: input.scheduleId ?? null,
      status: failedAuth ? 'FAILED' : futureSchedule ? 'SCHEDULED' : 'PENDING',
      error: failedAuth ? authError : null,
    },
  });

  if (failedAuth) {
    await enqueueAppWebhook(payout.appId, WEBHOOK_EVENTS.PAYOUT_FAILED, {
      payoutIntentId: payout.id,
      appId: payout.appId,
      chain: payout.chain,
      error: authError,
    });
    return { ...payout, feeBps };
  }

  if (futureSchedule && scheduledAt) {
    const jobId = payoutExecuteJobId(payout.id);
    await enqueuePayoutExecute(
      { payoutIntentId: payout.id, merchantId: input.merchantId, chain: String(chainIdNum) },
      scheduledAt.getTime() - Date.now(),
      jobId,
    );
    const updated = await db.payoutIntent.update({
      where: { id: payout.id },
      data: { pendingJobId: jobId },
    });
    return { ...updated, feeBps };
  }

  const executeNow = input.executeNow !== false && !futureSchedule;
  if (executeNow && family !== 'SUI') {
    try {
      await executePayout({ merchantId: input.merchantId, payoutId: payout.id });
    } catch {
      /* executePayout persists FAILED */
    }
    return getPayout(input.merchantId, payout.id);
  }

  return { ...payout, feeBps };
}

export async function getPayout(merchantId: string, payoutId: string) {
  const db = getDatabaseClient();

  const payout = await db.payoutIntent.findUnique({
    where: { id: payoutId },
    include: { transactions: true },
  });

  if (!payout || payout.merchantId !== merchantId) {
    throw new NotFoundError('PayoutIntent', payoutId);
  }

  const feeBps = await getEffectiveFeeBps(merchantId);
  return { ...payout, feeBps };
}

interface ListPayoutsInput {
  merchantId: string;
  appId?: string;
  page?: number;
  pageSize?: number;
  status?: string;
}

export async function listPayouts(input: ListPayoutsInput) {
  const db = getDatabaseClient();

  const page = input.page ?? 1;
  const pageSize = Math.min(input.pageSize ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE);
  const skip = (page - 1) * pageSize;

  const where: Record<string, unknown> = { merchantId: input.merchantId };
  if (input.appId) where.appId = input.appId;
  if (input.status) where.status = input.status;

  const [payouts, total] = await Promise.all([
    db.payoutIntent.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip,
      take: pageSize,
      include: { transactions: { orderBy: { createdAt: 'desc' } } },
    }),
    db.payoutIntent.count({ where }),
  ]);

  const feeBps = await getEffectiveFeeBps(input.merchantId);
  return { payouts: payouts.map((p) => ({ ...p, feeBps })), total, page, pageSize, feeBps };
}

interface ExecutePayoutInput {
  merchantId: string;
  payoutId: string;
  merchantManagerAddress?: string;
  chainId?: string;
}

export async function executePayout(input: ExecutePayoutInput) {
  const db = getDatabaseClient();

  const loaded = await db.payoutIntent.findUnique({
    where: { id: input.payoutId },
    include: { app: true },
  });

  if (!loaded || loaded.merchantId !== input.merchantId) {
    throw new NotFoundError('PayoutIntent', input.payoutId);
  }
  let payout = loaded;

  if (payout.status !== 'PENDING' && payout.status !== 'SCHEDULED' && payout.status !== 'FAILED') {
    throw new ValidationError(`Cannot execute payout in ${payout.status} status`);
  }
  if (payout.txHash) {
    throw new ValidationError('Cannot execute a payout that already has a transaction hash');
  }

  const chainIdNum = parseInt(payout.chain.trim(), 10);
  if (!Number.isFinite(chainIdNum) || chainIdNum <= 0) {
    throw new ValidationError('Payout record has invalid chain id');
  }

  const chain = await db.supportedChain.findUnique({ where: { chainId: chainIdNum } });
  if (!chain) {
    throw new ValidationError('Supported chain not found for this payout');
  }

  const mgrTrim = (input.merchantManagerAddress ?? chain.merchantManagerAddress).trim();
  if (mgrTrim !== chain.merchantManagerAddress.trim()) {
    throw new ValidationError('merchantManagerAddress does not match the configured chain');
  }

  const mtxmChainId = chain.mtxmChainDbId?.trim() || String(chain.chainId);
  const family = chainFamily(chain.chainType);

  const finalizeSuccess = async (txResult: { id: string; txHash?: string | null }) => {
    const transaction = await db.transaction.create({
      data: {
        payoutIntentId: payout.id,
        mtxmTxId: txResult.id,
        txHash: txResult.txHash ?? null,
        chain: payout.chain,
        type: 'PAYOUT',
        status: 'PENDING',
      },
    });

    await db.payoutIntent.update({
      where: { id: payout.id },
      data: {
        txHash: txResult.txHash ?? null,
        pendingJobId: null,
        error: null,
      },
    });

    return transaction;
  };

  try {
    const live = requireFamilyAuth(payout.app, family);
    const wallet = familyPayoutWallet(payout.app, family);
    if (
      payout.sessionSignature !== live.signature
      || payout.sessionExpiry?.getTime() !== live.validUntil.getTime()
      || (wallet && payout.merchantWallet !== wallet)
    ) {
      await db.payoutIntent.update({
        where: { id: payout.id },
        data: {
          sessionSignature: live.signature,
          sessionExpiry: live.validUntil,
          ...(wallet ? { merchantWallet: wallet } : {}),
        },
      });
      payout = {
        ...payout,
        sessionSignature: live.signature,
        sessionExpiry: live.validUntil,
        merchantWallet: wallet ?? payout.merchantWallet,
      };
    }

    if (chain.chainType === ChainType.SOLANA) {
      return await executeSolanaPayout(payout, chain, mgrTrim, mtxmChainId, finalizeSuccess);
    }

    if (chain.chainType === ChainType.SUI) {
      return await executeSuiPayout(payout, chain);
    }

    return await executeEvmPayout(payout, chain, mgrTrim, mtxmChainId, finalizeSuccess);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await db.payoutIntent.update({
      where: { id: payout.id },
      data: { status: 'FAILED', error: message, pendingJobId: null },
    });
    await enqueueAppWebhook(payout.appId, WEBHOOK_EVENTS.PAYOUT_FAILED, {
      payoutIntentId: payout.id,
      appId: payout.appId,
      chain: payout.chain,
      error: message,
    });
    throw err;
  }
}

export async function cancelPayout(merchantId: string, payoutId: string) {
  const db = getDatabaseClient();
  const payout = await db.payoutIntent.findUnique({ where: { id: payoutId } });
  if (!payout || payout.merchantId !== merchantId) {
    throw new NotFoundError('PayoutIntent', payoutId);
  }
  if (payout.status !== 'PENDING' && payout.status !== 'SCHEDULED') {
    throw new ValidationError(`Cannot cancel payout in ${payout.status} status`);
  }
  if (payout.txHash) {
    throw new ValidationError('Cannot cancel a payout that already has a transaction');
  }
  await removePayoutJob(payout.pendingJobId);
  const updated = await db.payoutIntent.update({
    where: { id: payout.id },
    data: { status: 'CANCELLED', pendingJobId: null },
  });
  const feeBps = await getEffectiveFeeBps(merchantId);
  return { ...updated, feeBps };
}

async function executeSolanaPayout(
  payout: {
    id: string;
    tokenAddress: string;
    sessionSignature: string | null;
    sessionExpiry: Date | null;
    merchantWallet: string;
    recipientWallet: string;
    nonce: string;
    tokenAmount: { toString(): string };
  },
  chain: { chainId: number; merchantManagerAddress: string },
  programIdStr: string,
  mtxmChainId: string,
  finalizeSuccess: (txResult: { id: string; txHash?: string | null }) => Promise<unknown>,
) {
  if (!isNativeToken(payout.tokenAddress.trim())) {
    throw new ValidationError('Only native SOL is supported for automated Solana payouts');
  }
  if (!payout.sessionSignature || !payout.sessionExpiry) {
    throw new ValidationError('Authorize Solana payouts in app settings first');
  }

  const programId = new PublicKey(programIdStr);
  const executor = mtxmSolanaAuthority();
  const noderailsWallet = executor;
  const merchantPk = new PublicKey(payout.merchantWallet.trim());
  const recipientPk = new PublicKey(payout.recipientWallet.trim());
  const payer = executor;

  const sessionExpiryUnix = BigInt(Math.floor(payout.sessionExpiry.getTime() / 1000));
  const sessionMessage = buildSolanaSessionMessage(merchantPk, sessionExpiryUnix);
  const sessionSig = parseEd25519Signature64(payout.sessionSignature);

  const payoutIntentBytes = paymentIntentIdSolanaBytes(payout.id);
  const nonceBytes = parseNonce32(payout.nonce);
  const amountLamports = atomicAmountFromStored(payout.tokenAmount);

  const payoutMessage = buildNativePayoutMessageSolana({
    payoutIntentId: payoutIntentBytes,
    merchant: merchantPk,
    recipient: recipientPk,
    amountLamports,
    nonce: nonceBytes,
  });

  const signRes = await mtxm.signTypedData({
    chainId: mtxmChainId,
    chainType: 'SOLANA',
    solana: {
      domain: {
        name: 'NodeRailsMerchantManager',
        version: '1',
        chainId: chain.chainId,
        verifyingProgramId: programId.toBase58(),
        authority: executor.toBase58(),
      },
      rawPreimageBase64: payoutMessage.toString('base64'),
      payload: { payoutIntentId: payout.id, kind: 'native_payout' },
    },
  });

  const sigB58 = signRes.signatureBase58;
  if (!sigB58) {
    throw new Error('MTXM Solana sign-typed missing signatureBase58 for payout');
  }
  const noderailsSig = bs58.decode(sigB58);
  if (noderailsSig.length !== 64) {
    throw new Error('MTXM returned invalid ed25519 payout signature length');
  }

  const ix = executeNativePayoutInstruction({
    programId,
    executor,
    merchantWallet: merchantPk,
    recipient: recipientPk,
    noderailsWallet,
    payer,
    nonce: nonceBytes,
    payoutIntentId: payoutIntentBytes,
    amountLamports,
    sessionExpiryUnix,
    sessionMessage,
    sessionSignature: sessionSig,
    payoutMessage,
    noderailsSignature: noderailsSig,
  });

  const txResult = await mtxm.sendTransaction({
    chainId: mtxmChainId,
    to: programId.toBase58(),
    solana: mtxmSolanaProgramBlock([instructionToMtxmSolana(ix)]),
  });

  return finalizeSuccess(txResult);
}

async function executeSuiPayout(
  payout: {
    sessionSignature: string | null;
    sessionExpiry: Date | null;
    merchantWallet: string;
  },
  chain: { merchantManagerAddress: string },
) {
  if (!payout.sessionSignature || !payout.sessionExpiry) {
    throw new ValidationError('Authorize Sui payouts in app settings first');
  }
  if (!payout.merchantWallet || !chain.merchantManagerAddress) {
    throw new ValidationError('Sui merchant manager object IDs are not configured');
  }
  throw new SuiPayoutNotEnabledError();
}

async function executeEvmPayout(
  payout: {
    id: string;
    merchantId: string;
    tokenAddress: string;
    sessionSignature: string | null;
    sessionExpiry: Date | null;
    merchantWallet: string;
    recipientWallet: string;
    tokenAmount: { toString(): string };
    lines: unknown;
  },
  chain: { chainId: number },
  merchantManagerAddress: string,
  mtxmChainId: string,
  finalizeSuccess: (txResult: { id: string; txHash?: string | null }) => Promise<unknown>,
) {
  if (!payout.sessionSignature?.trim()) {
    throw new ValidationError('Authorize EVM payouts in app settings first');
  }
  if (!payout.sessionExpiry) {
    throw new ValidationError('Authorize EVM payouts in app settings first');
  }

  const feeBps = await getEffectiveFeeBps(payout.merchantId);
  const merchantWallet = payout.merchantWallet as Address;
  const sessionExpiry = BigInt(Math.floor(payout.sessionExpiry.getTime() / 1000));
  const merchantSignature = payout.sessionSignature as Hex;
  const payoutIntentId = uuidToBytes32(payout.id) as Hex;
  const verifying = merchantManagerAddress as Address;
  const native = isNativeToken(payout.tokenAddress);
  const lines = parseStoredLines(payout.lines);

  let calldata: Hex;

  if (lines) {
    // recipientsHash must match Solidity abi.encodePacked(address[]) — 32-byte words.
    const recipients = lines.map((l) => l.recipient as Address);
    const amounts = lines.map((l) => parseAtomicAmount(l.amount));
    if (native) {
      const typedData = buildBulkNativePayoutTypedData(
        { payoutIntentId, merchantWallet, recipients, amounts, feeBps },
        chain.chainId,
        verifying,
      );
      const sigResult = await mtxm.signTypedData({
        chainId: mtxmChainId,
        domain: typedData.domain,
        types: typedData.types,
        value: serializeBigInts(typedData.message),
      });
      calldata = encodeExecuteBulkNativePayout({
        payoutIntentId,
        merchantWallet,
        recipients,
        amounts,
        feeBps,
        sessionExpiry,
        merchantSignature,
        noderailsSignature: sigResult.signature as Hex,
      });
    } else {
      const typedData = buildBulkPayoutTypedData(
        {
          payoutIntentId,
          merchantWallet,
          token: payout.tokenAddress as Address,
          recipients,
          amounts,
          feeBps,
        },
        chain.chainId,
        verifying,
      );
      const sigResult = await mtxm.signTypedData({
        chainId: mtxmChainId,
        domain: typedData.domain,
        types: typedData.types,
        value: serializeBigInts(typedData.message),
      });
      calldata = encodeExecuteBulkPayout({
        payoutIntentId,
        merchantWallet,
        token: payout.tokenAddress as Address,
        recipients,
        amounts,
        feeBps,
        sessionExpiry,
        merchantSignature,
        noderailsSignature: sigResult.signature as Hex,
      });
    }
  } else {
    const amount = atomicAmountFromStored(payout.tokenAmount);
    if (native) {
      const typedData = buildNativePayoutTypedData(
        {
          payoutIntentId,
          merchantWallet,
          recipient: payout.recipientWallet as Address,
          amount,
          feeBps,
        },
        chain.chainId,
        verifying,
      );
      const sigResult = await mtxm.signTypedData({
        chainId: mtxmChainId,
        domain: typedData.domain,
        types: typedData.types,
        value: serializeBigInts(typedData.message),
      });
      calldata = encodeExecuteNativePayout({
        payoutIntentId,
        merchantWallet,
        recipient: payout.recipientWallet as Address,
        amount,
        feeBps,
        sessionExpiry,
        merchantSignature,
        noderailsSignature: sigResult.signature as Hex,
      });
    } else {
      const typedData = buildPayoutTypedData(
        {
          payoutIntentId,
          merchantWallet,
          recipient: payout.recipientWallet as Address,
          token: payout.tokenAddress as Address,
          amount,
          feeBps,
        },
        chain.chainId,
        verifying,
      );
      const sigResult = await mtxm.signTypedData({
        chainId: mtxmChainId,
        domain: typedData.domain,
        types: typedData.types,
        value: serializeBigInts(typedData.message),
      });
      calldata = encodeExecutePayout({
        payoutIntentId,
        merchantWallet,
        recipient: payout.recipientWallet as Address,
        token: payout.tokenAddress as Address,
        amount,
        feeBps,
        sessionExpiry,
        merchantSignature,
        noderailsSignature: sigResult.signature as Hex,
      });
    }
  }

  const txResult = await mtxm.sendTransaction({
    chainId: mtxmChainId,
    to: merchantManagerAddress,
    data: calldata,
  });

  return finalizeSuccess(txResult);
}

function parseStoredLines(raw: unknown): Array<{ recipient: string; amount: string }> | null {
  if (!raw) return null;
  if (!Array.isArray(raw) || raw.length === 0) return null;
  return raw.map((line, i) => {
    if (!line || typeof line !== 'object') {
      throw new ValidationError(`Invalid bulk line ${i + 1}`);
    }
    const rec = line as { recipient?: unknown; amount?: unknown };
    if (typeof rec.recipient !== 'string' || typeof rec.amount !== 'string') {
      throw new ValidationError(`Invalid bulk line ${i + 1}`);
    }
    return { recipient: rec.recipient, amount: rec.amount };
  });
}

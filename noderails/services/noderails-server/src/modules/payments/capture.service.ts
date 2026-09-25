import { getDatabaseClient } from '@noderails/database';
import { MtxmClient } from '@noderails/mtxm-client';
import { encodeCaptureNative, encodeCaptureERC20, type PermitData } from '@noderails/web3';
import { PaymentError, NotFoundError, isOpenEscrow } from '@noderails/common';
import { env } from '../../config.js';
import { createLogger } from '@noderails/service-base';
import { submitEvmSettlement } from '../single-chain-settlement/bridge.service.js';
import { attachSettleMtxm, claimSettleTransaction, releaseSettleClaim } from './settlement.worker.js';

const mtxm = new MtxmClient({
  baseUrl: env.MTXM_BASE_URL,
  projectId: env.MTXM_PROJECT_ID,
  apiKey: env.MTXM_API_KEY,
});

const logger = createLogger('capture');

// ── Submit Native Capture ──

interface CaptureNativeInput {
  intentId: string;
  escrowAddress: string;
  chainId: string;
  paymentIntentId: string; // bytes32
  merchant: string;
  feeBps: number;
  timelocks: bigint;
  noderailsSignature: string;
  value: string; // wei
}

export async function submitCaptureNative(input: CaptureNativeInput) {
  const db = getDatabaseClient();

  const intent = await db.paymentIntent.findUnique({ where: { id: input.intentId } });
  if (!intent) throw new NotFoundError('PaymentIntent', input.intentId);
  if (intent.status !== 'CREATED' && intent.status !== 'AUTHORIZED') {
    throw new PaymentError(`Cannot capture payment in ${intent.status} status`, input.intentId);
  }

  const calldata = encodeCaptureNative({
    paymentIntentId: input.paymentIntentId as `0x${string}`,
    merchant: input.merchant as `0x${string}`,
    feeBps: input.feeBps,
    timelocks: input.timelocks,
    noderailsSignature: input.noderailsSignature as `0x${string}`,
  });

  const txResult = await mtxm.sendTransaction({
    chainId: input.chainId,
    to: input.escrowAddress,
    data: calldata,
    value: input.value,
  });

  const transaction = await db.transaction.create({
    data: {
      paymentIntentId: input.intentId,
      mtxmTxId: txResult.id,
      txHash: txResult.txHash ?? null,
      chain: input.chainId,
      type: 'CAPTURE',
      status: 'PENDING',
    },
  });

  await db.paymentIntent.update({
    where: { id: input.intentId },
    data: {
      status: 'CAPTURING',
      capturedAt: new Date(),
      authorizationChainId: parseInt(input.chainId, 10),
    },
  });

  return transaction;
}

// ── Submit ERC20 Capture ──

interface CaptureERC20Input {
  intentId: string;
  escrowAddress: string;
  chainId: string;
  paymentIntentId: string;
  merchant: string;
  token: string;
  amount: bigint;
  payer: string;
  feeBps: number;
  timelocks: bigint;
  permitData: PermitData;
  noderailsSignature: string;
}

export async function submitCaptureERC20(input: CaptureERC20Input) {
  const db = getDatabaseClient();

  const intent = await db.paymentIntent.findUnique({ where: { id: input.intentId } });
  if (!intent) throw new NotFoundError('PaymentIntent', input.intentId);
  if (intent.status !== 'CREATED' && intent.status !== 'AUTHORIZED') {
    throw new PaymentError(`Cannot capture payment in ${intent.status} status`, input.intentId);
  }

  const calldata = encodeCaptureERC20({
    paymentIntentId: input.paymentIntentId as `0x${string}`,
    merchant: input.merchant as `0x${string}`,
    token: input.token as `0x${string}`,
    amount: input.amount,
    payer: input.payer as `0x${string}`,
    feeBps: input.feeBps,
    timelocks: input.timelocks,
    permitData: input.permitData,
    noderailsSignature: input.noderailsSignature as `0x${string}`,
  });

  const txResult = await mtxm.sendTransaction({
    chainId: input.chainId,
    to: input.escrowAddress,
    data: calldata,
  });

  const transaction = await db.transaction.create({
    data: {
      paymentIntentId: input.intentId,
      mtxmTxId: txResult.id,
      txHash: txResult.txHash ?? null,
      chain: input.chainId,
      type: 'CAPTURE',
      status: 'PENDING',
    },
  });

  await db.paymentIntent.update({
    where: { id: input.intentId },
    data: {
      status: 'CAPTURING',
      capturedAt: new Date(),
      authorizationWalletAddress: input.payer,
      authorizationChainId: parseInt(input.chainId, 10),
    },
  });

  return transaction;
}

// ── Submit Settle ──

interface SettleInput {
  intentId: string;
  escrowAddress: string;
  chainId: string;
  paymentIntentId: string; // bytes32
}

export async function submitSettle(input: SettleInput) {
  const db = getDatabaseClient();

  const intent = await db.paymentIntent.findUnique({ where: { id: input.intentId } });
  if (!intent) throw new NotFoundError('PaymentIntent', input.intentId);
  if (!isOpenEscrow(intent.status)) {
    throw new PaymentError(`Cannot settle payment in ${intent.status} status`, input.intentId);
  }

  const chainId = parseInt(input.chainId, 10);
  const chain = await db.supportedChain.findUnique({ where: { chainId } });
  const escrow = input.escrowAddress || chain?.escrowAddress;
  if (!escrow) {
    throw new PaymentError('No escrow address for settle', input.intentId);
  }

  const claim = await claimSettleTransaction(input.intentId, input.chainId);
  if (!claim) {
    throw new PaymentError('Settle transaction already in flight', input.intentId);
  }

  try {
    const result = await submitEvmSettlement({
      paymentIntentId: input.intentId,
      sourceChainId: chainId,
      sourceEscrow: escrow,
      mtxmChainId: chain?.mtxmChainDbId?.trim() || input.chainId,
      logger,
    });
    await attachSettleMtxm(claim.id, result.mtxmTxId, result.txHash ?? null);
    return db.transaction.findUniqueOrThrow({ where: { id: claim.id } });
  } catch (err) {
    await releaseSettleClaim(claim.id, claim.mtxmTxId!);
    throw err;
  }
}

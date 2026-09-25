import { getDatabaseClient, ChainType } from '@noderails/database';
import { MtxmClient } from '@noderails/mtxm-client';
import { Connection, PublicKey } from '@solana/web3.js';
import {
  QUEUE_NAMES,
  WORKER_CONFIG,
  isNativeToken,
  isOpenEscrow,
  settleJobId,
  SETTLE_SUBMIT_FAIL_WINDOW_MS,
  settleSubmitWaitMs,
} from '@noderails/common';
import { createWorker, queueRegistry, configureQueue } from '@noderails/queue';
import type {
  PaymentAutoSettleJob,
  SettlementTrackBridgeTransferJob,
  SettlementRetryBridgeTransferJob,
  SettlementExecuteBankSettlementJob,
  SettlementTrackBankSettlementJob,
} from '@noderails/queue';
import type { Logger } from '@noderails/service-base';
import { env } from '../../config.js';
import {
  buildSettleNativeMtxmPayload,
  buildSettleSplMtxmPayload,
  fetchEscrowFeeRecipientPubkey,
  merchantSolanaPubkey,
  mtxmSolanaAuthority,
  paymentIntentIdSolanaBytes,
  solanaRpcForChain,
} from './solana-escrow-tx.js';
import {
  buildSettleSuiMtxmPayload,
  merchantSuiAddress,
  paymentIntentIdSuiBytes,
} from './sui-escrow-tx.js';
import { SUI_NATIVE_COIN_TYPE } from '@noderails/sui';
import { resolveMintTokenProgramId } from './solana-mint-token-program.js';
import { submitEvmSettlement, trackBridgeTransfer, reconcileStaleBridges, submitSourceRetry } from '../single-chain-settlement/bridge.service.js';
import { executeBankSettlement, trackBankSettlement } from '../bank-settlement/bank.service.js';

const mtxm = new MtxmClient({
  baseUrl: env.MTXM_BASE_URL,
  projectId: env.MTXM_PROJECT_ID,
  apiKey: env.MTXM_API_KEY,
});

const SETTLE_CLAIM_PREFIX = 'claim:settle:';

function isUniqueConstraint(err: unknown): boolean {
  return Boolean(
    err
    && typeof err === 'object'
    && 'code' in err
    && (err as { code: string }).code === 'P2002',
  );
}

function isDuplicateJob(err: unknown): boolean {
  const message = err instanceof Error ? err.message : String(err);
  return /already exists|duplicat/i.test(message);
}

async function recentFailedSettles(paymentIntentId: string) {
  const db = getDatabaseClient();
  const since = new Date(Date.now() - SETTLE_SUBMIT_FAIL_WINDOW_MS);
  const rows = await db.transaction.findMany({
    where: {
      paymentIntentId,
      type: 'SETTLE',
      status: 'FAILED',
      createdAt: { gte: since },
    },
    select: { createdAt: true },
    orderBy: { createdAt: 'desc' },
  });
  return {
    failedInWindow: rows.length,
    lastFailedAtMs: rows[0] ? rows[0].createdAt.getTime() : null,
  };
}

export async function claimSettleTransaction(paymentIntentId: string, chain: string) {
  const db = getDatabaseClient();
  try {
    return await db.transaction.create({
      data: {
        paymentIntentId,
        mtxmTxId: `${SETTLE_CLAIM_PREFIX}${paymentIntentId}`,
        chain,
        type: 'SETTLE',
        status: 'PENDING',
      },
    });
  } catch (err) {
    if (isUniqueConstraint(err)) return null;
    throw err;
  }
}

export async function attachSettleMtxm(claimId: string, mtxmTxId: string, txHash: string | null) {
  const db = getDatabaseClient();
  await db.transaction.update({
    where: { id: claimId },
    data: { mtxmTxId, txHash },
  });
}

export async function releaseSettleClaim(claimId: string, claimMtxmTxId: string) {
  const db = getDatabaseClient();
  await db.transaction.deleteMany({
    where: { id: claimId, mtxmTxId: claimMtxmTxId },
  });
}

export async function markSettleSubmitFailed(claimId: string, err: unknown) {
  const db = getDatabaseClient();
  await db.transaction.update({
    where: { id: claimId },
    data: {
      status: 'FAILED',
      error: String(err).slice(0, 1000),
      mtxmTxId: `fail-settle-${claimId}`,
    },
  });
}

// ── Settle a single payment ──

async function processSettle(paymentIntentId: string, expectedSettlementAt: number, logger: Logger) {
  const db = getDatabaseClient();

  // Step 1: Load intent with app + chain info
  const intent = await db.paymentIntent.findUnique({
    where: { id: paymentIntentId },
    include: {
      app: {
        include: {
          appChains: true,
        },
      },
      transactions: {
        where: { type: { in: ['SETTLE', 'REFUND'] }, status: { in: ['PENDING', 'CONFIRMED'] } },
      },
      refunds: {
        where: { status: 'PENDING' },
        take: 1,
      },
    },
  });

  if (!intent) {
    logger.warn('Settlement: PaymentIntent not found', { paymentIntentId });
    return;
  }

  if (!isOpenEscrow(intent.status)) {
    logger.info('Settlement: Skipping — intent is not open escrow', {
      paymentIntentId,
      currentStatus: intent.status,
    });
    return;
  }

  const leftover = BigInt(intent.settleAmount ?? intent.convertedAmount ?? intent.cryptoAmount ?? '0');
  if (leftover <= 0n) {
    logger.info('Settlement: Skipping — settleAmount is 0', { paymentIntentId });
    return;
  }

  if (intent.refunds.length > 0 || intent.transactions.some((tx) => tx.type === 'REFUND' && tx.status === 'PENDING')) {
    logger.info('Settlement: Skipping — refund in flight', { paymentIntentId });
    return;
  }

  // Step 3: Check if a settle tx is already pending or confirmed
  if (intent.transactions.some((tx) => tx.type === 'SETTLE')) {
    logger.info('Settlement: Skipping — settle tx already exists', {
      paymentIntentId,
      existingTxStatus: intent.transactions[0].status,
    });
    return;
  }

  const failed = await recentFailedSettles(paymentIntentId);
  const retryWaitMs = settleSubmitWaitMs({
    nowMs: Date.now(),
    lastFailedAtMs: failed.lastFailedAtMs,
    failedInWindow: failed.failedInWindow,
  });
  if (retryWaitMs > 0) {
    logger.info('Settlement: Skipping — settle retry backoff', {
      paymentIntentId,
      retryWaitMs,
      failedInWindow: failed.failedInWindow,
    });
    return;
  }

  // Step 4: Verify the settlement timelock has actually passed
  const now = Math.floor(Date.now() / 1000);
  if (now < expectedSettlementAt) {
    const remainingMs = (expectedSettlementAt - now) * 1000;
    logger.warn('Settlement: Timelock not yet passed', {
      paymentIntentId,
      expectedSettlementAt,
      now,
      remainingMs,
    });
    return;
  }

  // Step 5: Resolve chain + escrow address
  const chainId = intent.authorizationChainId;
  if (!chainId) {
    logger.error('Settlement: No authorizationChainId on intent', { paymentIntentId });
    return;
  }

  const chain = await db.supportedChain.findUnique({ where: { chainId } });
  if (!chain?.escrowAddress) {
    logger.error('Settlement: No escrow address for chain', { paymentIntentId, chainId });
    return;
  }

  // Step 6: Claim SETTLE row, then build and submit via MTXM
  const mtxmChainId = chain.mtxmChainDbId?.trim() || String(chainId);
  const claim = await claimSettleTransaction(intent.id, String(chainId));
  if (!claim) {
    logger.info('Settlement: Skipping — settle claim already exists', { paymentIntentId });
    return;
  }

  try {
    let txResult;

    if (chain.chainType === ChainType.SOLANA) {
      const programId = new PublicKey(chain.escrowAddress);
      const rpc = solanaRpcForChain(chain);
      const feeRecipient = await fetchEscrowFeeRecipientPubkey(rpc, programId);
      const merchantRecipient = merchantSolanaPubkey(intent, chainId);
      const pi = paymentIntentIdSolanaBytes(intent.id);
      const authority = mtxmSolanaAuthority();

      if (!intent.cryptoTokenKey) {
        logger.error('Settlement: Solana intent missing cryptoTokenKey', { paymentIntentId });
        await releaseSettleClaim(claim.id, claim.mtxmTxId!);
        return;
      }
      const tokenRow = await db.supportedToken.findFirst({
        where: { tokenKey: intent.cryptoTokenKey, chainId, isEnabled: true },
      });
      if (!tokenRow) {
        logger.error('Settlement: unknown Solana token for intent', {
          paymentIntentId,
          tokenKey: intent.cryptoTokenKey,
        });
        await releaseSettleClaim(claim.id, claim.mtxmTxId!);
        return;
      }

      let payload;
      if (isNativeToken(tokenRow.contractAddress)) {
        payload = buildSettleNativeMtxmPayload(programId, authority, pi, merchantRecipient, feeRecipient);
      } else {
        const mint = new PublicKey(tokenRow.contractAddress);
        const conn = new Connection(rpc, 'confirmed');
        const splTokenProgramId = await resolveMintTokenProgramId(conn, mint);
        if (!splTokenProgramId) {
          logger.error('Settlement: SPL mint missing or not Token / Token-2022', {
            paymentIntentId,
            mint: mint.toBase58(),
          });
          await releaseSettleClaim(claim.id, claim.mtxmTxId!);
          return;
        }
        payload = buildSettleSplMtxmPayload(
          programId,
          authority,
          pi,
          mint,
          merchantRecipient,
          feeRecipient,
          splTokenProgramId,
        );
      }
      txResult = await mtxm.sendTransaction({
        chainId: mtxmChainId,
        ...payload,
      });
    } else if (chain.chainType === ChainType.SUI) {
      if (!intent.cryptoTokenKey) {
        logger.error('Settlement: Sui intent missing cryptoTokenKey', { paymentIntentId });
        await releaseSettleClaim(claim.id, claim.mtxmTxId!);
        return;
      }
      const tokenRow = await db.supportedToken.findFirst({
        where: { tokenKey: intent.cryptoTokenKey, chainId, isEnabled: true },
      });
      if (!tokenRow) {
        logger.error('Settlement: unknown Sui token for intent', {
          paymentIntentId,
          tokenKey: intent.cryptoTokenKey,
        });
        await releaseSettleClaim(claim.id, claim.mtxmTxId!);
        return;
      }
      const coinType = isNativeToken(tokenRow.contractAddress)
        ? SUI_NATIVE_COIN_TYPE
        : tokenRow.contractAddress.trim();
      const payload = await buildSettleSuiMtxmPayload(mtxm, {
        chain,
        coinType,
        paymentIntentId: paymentIntentIdSuiBytes(intent.id),
      });
      txResult = await mtxm.sendTransaction({
        chainId: mtxmChainId,
        ...payload,
      });
    } else {
      const result = await submitEvmSettlement({
        paymentIntentId: intent.id,
        sourceChainId: chainId,
        sourceEscrow: chain.escrowAddress,
        mtxmChainId,
        logger,
      });
      txResult = { id: result.mtxmTxId, txHash: result.txHash };
    }

    await attachSettleMtxm(claim.id, txResult.id, txResult.txHash ?? null);

    logger.info('Settlement: Settle tx submitted', {
      paymentIntentId,
      mtxmTxId: txResult.id,
      txHash: txResult.txHash,
      chainId,
    });
  } catch (err) {
    await markSettleSubmitFailed(claim.id, err);
    logger.error('Settlement: Failed to submit settle tx', {
      paymentIntentId,
      chainId,
      error: String(err),
    });
    // BullMQ will retry based on worker config
    throw err;
  }
}

// ── Enqueue a settlement job (called from ingest.service.ts) ──

export async function enqueueSettlementJob(
  paymentIntentId: string,
  timelockDuration: number,
  logger: Logger,
): Promise<{ enqueued: boolean; delayMs: number; reason?: string }> {
  const db = getDatabaseClient();
  const intent = await db.paymentIntent.findUnique({
    where: { id: paymentIntentId },
    select: { capturedAt: true, timelockEndsAt: true, timelockDuration: true, status: true },
  });
  if (!isOpenEscrow(intent?.status)) {
    logger.info('Settlement: Skip enqueue — intent is not open escrow', {
      paymentIntentId,
      status: intent?.status,
    });
    return { enqueued: false, delayMs: 0, reason: 'not_open' };
  }

  const durationSec = intent?.timelockDuration ?? timelockDuration;
  const endsAt = intent?.timelockEndsAt
    ?? (intent?.capturedAt
      ? new Date(intent.capturedAt.getTime() + durationSec * 1000)
      : new Date(Date.now() + durationSec * 1000));
  const timelockDelayMs = Math.max(0, endsAt.getTime() - Date.now());
  const failed = await recentFailedSettles(paymentIntentId);
  const retryWaitMs = settleSubmitWaitMs({
    nowMs: Date.now(),
    lastFailedAtMs: failed.lastFailedAtMs,
    failedInWindow: failed.failedInWindow,
  });
  const delayMs = Math.max(timelockDelayMs, retryWaitMs);
  const settlementAt = Math.floor(endsAt.getTime() / 1000);
  const jobId = settleJobId(paymentIntentId);

  const queue = queueRegistry.getOrCreateQueue<PaymentAutoSettleJob>(QUEUE_NAMES.PAYMENT_AUTO_SETTLE);
  const existing = await queue.getJob(jobId);
  if (existing && (existing.status === 'waiting' || existing.status === 'active' || existing.status === 'delayed')) {
    logger.info('Settlement: Job already queued', {
      paymentIntentId,
      jobId,
      status: existing.status,
    });
    return { enqueued: false, delayMs, reason: 'already_queued' };
  }
  if (existing) {
    try {
      await queue.removeJob(jobId);
    } catch {
      logger.info('Settlement: Job already queued', { paymentIntentId, jobId });
      return { enqueued: false, delayMs, reason: 'already_queued' };
    }
  }

  try {
    await queue.add(`settle-${paymentIntentId}`, {
      paymentIntentId,
      settlementAt,
    }, {
      jobId,
      delay: delayMs,
      attempts: 3,
      backoff: { type: 'exponential', delay: 30_000 },
      removeOnComplete: true,
      removeOnFail: true,
    });
  } catch (err) {
    if (isDuplicateJob(err)) {
      logger.info('Settlement: Job already queued', { paymentIntentId, jobId });
      return { enqueued: false, delayMs, reason: 'already_queued' };
    }
    throw err;
  }

  logger.info('Settlement: Job enqueued', {
    paymentIntentId,
    delayMs,
    retryWaitMs,
    failedInWindow: failed.failedInWindow,
    settlementAt: endsAt.toISOString(),
  });
  return { enqueued: true, delayMs };
}

// ── Startup reconciliation: find CAPTURED intents past settlement time with no settle tx ──

export async function reconcileSettlements(logger: Logger) {
  const db = getDatabaseClient();

  // Open escrow with no in-flight or confirmed SETTLE. Delay / backoff live in enqueueSettlementJob.
  const staleIntents = await db.paymentIntent.findMany({
    where: {
      status: { in: ['CAPTURED', 'PARTIALLY_REFUNDED'] },
      capturedAt: { not: null },
      transactions: {
        none: {
          type: 'SETTLE',
          status: { in: ['PENDING', 'CONFIRMED'] },
        },
      },
    },
    select: {
      id: true,
      capturedAt: true,
      timelockDuration: true,
    },
  });

  let enqueued = 0;

  for (const intent of staleIntents) {
    const result = await enqueueSettlementJob(intent.id, intent.timelockDuration, logger);
    if (result.enqueued) enqueued++;
  }

  logger.info('Settlement reconciliation complete', {
    found: staleIntents.length,
    enqueued,
  });

  await reconcileStaleBridges(logger);
}

// ── Worker startup ──

export function startSettlementWorker(logger: Logger) {
  configureQueue({ redisUrl: env.REDIS_URL });

  const settleWorker = createWorker<PaymentAutoSettleJob>(
    QUEUE_NAMES.PAYMENT_AUTO_SETTLE,
    async (job) => {
      logger.info('Processing auto-settlement', {
        jobId: job.id,
        paymentIntentId: job.data.paymentIntentId,
        settlementAt: new Date(job.data.settlementAt * 1000).toISOString(),
      });
      await processSettle(job.data.paymentIntentId, job.data.settlementAt, logger);
    },
    { concurrency: WORKER_CONFIG.DEFAULT_CONCURRENCY },
  );

  const bridgeWorker = createWorker<SettlementTrackBridgeTransferJob>(
    QUEUE_NAMES.SETTLEMENT_TRACK_BRIDGE_TRANSFER,
    async (job) => {
      await trackBridgeTransfer({ ...job.data, pollAttempt: job.attemptsMade }, logger);
    },
    { concurrency: WORKER_CONFIG.DEFAULT_CONCURRENCY },
    {
      onFailed: (job, error) => {
        logger.warn('Bridge track job failed', {
          jobId: job.id,
          paymentIntentId: job.data.paymentIntentId,
          attemptsMade: job.attemptsMade,
          error: error.message,
        });
      },
    },
  );

  const bridgeRetryWorker = createWorker<SettlementRetryBridgeTransferJob>(
    QUEUE_NAMES.SETTLEMENT_RETRY_BRIDGE_TRANSFER,
    async (job) => {
      await submitSourceRetry({
        paymentIntentId: job.data.paymentIntentId,
        sourceChainId: job.data.sourceChainId,
        destinationChainId: job.data.destinationChainId,
        logger,
      });
    },
    { concurrency: WORKER_CONFIG.DEFAULT_CONCURRENCY },
  );

  const bankExecuteWorker = createWorker<SettlementExecuteBankSettlementJob>(
    QUEUE_NAMES.SETTLEMENT_EXECUTE_BANK_SETTLEMENT,
    async (job) => {
      await executeBankSettlement(job.data.bankSettlementId, logger);
    },
    { concurrency: WORKER_CONFIG.DEFAULT_CONCURRENCY },
  );

  const bankTrackWorker = createWorker<SettlementTrackBankSettlementJob>(
    QUEUE_NAMES.SETTLEMENT_TRACK_BANK_SETTLEMENT,
    async (job) => {
      await trackBankSettlement(job.data.bankSettlementId, logger);
    },
    { concurrency: WORKER_CONFIG.DEFAULT_CONCURRENCY },
  );

  logger.info('Settlement worker started', {
    queue: QUEUE_NAMES.PAYMENT_AUTO_SETTLE,
    concurrency: WORKER_CONFIG.DEFAULT_CONCURRENCY,
  });

  const reconcileTimer = setInterval(() => {
    reconcileSettlements(logger).catch((err) => {
      logger.error('Periodic settlement reconciliation failed', { error: String(err) });
    });
  }, 5 * 60 * 1000);
  reconcileTimer.unref?.();

  return { settleWorker, bridgeWorker, bridgeRetryWorker, bankExecuteWorker, bankTrackWorker, reconcileTimer };
}

import { getDatabaseClient, ChainType } from '@noderails/database';
import { MtxmClient } from '@noderails/mtxm-client';
import { encodeRefundPayment, encodeRefundPaymentAmount } from '@noderails/web3';
import {
  PaymentError,
  NotFoundError,
  ValidationError,
  isValidSolanaAddress,
  isNativeToken,
  isOpenEscrow,
} from '@noderails/common';
import type { Hex } from 'viem';
import { Connection, PublicKey } from '@solana/web3.js';
import { env } from '../../config.js';
import { uuidToBytes32 } from './crypto-utils.js';
import { buildRefundNativeMtxmPayload, buildRefundSplMtxmPayload, mtxmSolanaAuthority, paymentIntentIdSolanaBytes, solanaRpcForChain } from './solana-escrow-tx.js';
import { buildRefundSuiMtxmPayload, paymentIntentIdSuiBytes } from './sui-escrow-tx.js';
import { SUI_NATIVE_COIN_TYPE } from '@noderails/sui';
import { resolveMintTokenProgramId } from './solana-mint-token-program.js';
import { computePromisedAmount } from './fee-config.service.js';
import { escrowAmount } from '../single-chain-settlement/path.js';

const mtxm = new MtxmClient({
  baseUrl: env.MTXM_BASE_URL,
  projectId: env.MTXM_PROJECT_ID,
  apiKey: env.MTXM_API_KEY,
});

export interface InitiateRefundInput {
  reason: string;
  amount?: string;
  percent?: number;
}

function parsePositiveIntString(raw: string, field: string): bigint {
  if (!/^\d+$/.test(raw)) {
    throw new ValidationError(`${field} must be an integer string of escrow token units`);
  }
  const value = BigInt(raw);
  if (value <= 0n) {
    throw new ValidationError(`${field} must be greater than zero`);
  }
  return value;
}

function resolveRefundAmount(
  leftover: bigint,
  input: InitiateRefundInput,
): bigint {
  const hasAmount = input.amount !== undefined && input.amount !== '';
  const hasPercent = input.percent !== undefined;
  if (hasAmount && hasPercent) {
    throw new ValidationError('Provide either amount or percent, not both');
  }
  if (hasPercent) {
    const percent = input.percent!;
    if (!Number.isInteger(percent) || percent < 1 || percent > 100) {
      throw new ValidationError('percent must be an integer from 1 to 100');
    }
    return (leftover * BigInt(percent)) / 100n;
  }
  if (hasAmount) {
    return parsePositiveIntString(input.amount!, 'amount');
  }
  return leftover;
}

function assertLeftoverCanSettle(
  leftoverAfter: bigint,
  platformFeeBps: number,
  vasFeeBps: number,
): void {
  if (leftoverAfter === 0n) return;
  try {
    computePromisedAmount(leftoverAfter, platformFeeBps, vasFeeBps);
  } catch {
    throw new PaymentError(
      'Refund would leave too little to settle after fees. Refund the rest, or leave enough leftover to settle.',
    );
  }
}

export async function initiateRefund(
  merchantId: string,
  paymentIntentId: string,
  input: InitiateRefundInput,
) {
  const db = getDatabaseClient();

  const intent = await db.paymentIntent.findUnique({
    where: { id: paymentIntentId },
    include: {
      app: { include: { appChains: true } },
      transactions: {
        where: { type: { in: ['REFUND', 'SETTLE'] }, status: 'PENDING' },
      },
      refunds: {
        where: { status: 'PENDING' },
        take: 1,
      },
    },
  });

  if (!intent) {
    throw new NotFoundError('PaymentIntent', paymentIntentId);
  }

  if (intent.app.merchantId !== merchantId) {
    throw new NotFoundError('PaymentIntent', paymentIntentId);
  }

  if (!isOpenEscrow(intent.status)) {
    throw new PaymentError(
      `Cannot refund payment in ${intent.status} status. Only CAPTURED or PARTIALLY_REFUNDED payments can be refunded.`,
      paymentIntentId,
    );
  }

  if (intent.refunds.length > 0 || intent.transactions.some((tx) => tx.type === 'REFUND')) {
    throw new PaymentError(
      'A refund transaction is already in progress for this payment.',
      paymentIntentId,
    );
  }

  if (intent.transactions.some((tx) => tx.type === 'SETTLE')) {
    throw new PaymentError(
      'A settlement transaction is already in progress for this payment.',
      paymentIntentId,
    );
  }

  if (intent.timelockEndsAt) {
    if (new Date() >= intent.timelockEndsAt) {
      throw new PaymentError(
        'Refund window has expired. The settlement timelock has passed.',
        paymentIntentId,
      );
    }
  } else if (intent.capturedAt) {
    const settlementTime = new Date(intent.capturedAt.getTime() + intent.timelockDuration * 1000);
    if (new Date() >= settlementTime) {
      throw new PaymentError(
        'Refund window has expired. The settlement timelock has passed.',
        paymentIntentId,
      );
    }
  }

  const leftover = escrowAmount(intent);
  if (leftover <= 0n) {
    throw new PaymentError('Nothing left to refund for this payment.', paymentIntentId);
  }

  const refundAmt = resolveRefundAmount(leftover, input);
  if (refundAmt <= 0n) {
    throw new ValidationError('Refund amount rounds to zero');
  }
  if (refundAmt > leftover) {
    throw new PaymentError(
      `Refund amount ${refundAmt.toString()} exceeds leftover ${leftover.toString()}`,
      paymentIntentId,
    );
  }

  assertLeftoverCanSettle(
    leftover - refundAmt,
    intent.platformFeeBps ?? 0,
    intent.vasFeeBps ?? 0,
  );

  const chainId = intent.authorizationChainId;
  if (!chainId) {
    throw new PaymentError('No authorizationChainId on payment intent', paymentIntentId);
  }

  const chain = await db.supportedChain.findUnique({ where: { chainId } });
  if (!chain?.escrowAddress) {
    throw new PaymentError(`No escrow address for chain ${chainId}`, paymentIntentId);
  }

  const isPartial = refundAmt < leftover;
  if (isPartial && chain.chainType !== ChainType.EVM) {
    throw new PaymentError(
      'Partial refunds are only supported on EVM. Refund the remaining amount in full, or wait for settlement.',
      paymentIntentId,
    );
  }

  let refundRow;
  try {
    refundRow = await db.paymentRefund.create({
      data: {
        paymentIntentId: intent.id,
        amount: refundAmt.toString(),
        reason: input.reason,
        status: 'PENDING',
        pendingLock: intent.id,
      },
    });
  } catch (err) {
    if (err && typeof err === 'object' && 'code' in err && (err as { code: string }).code === 'P2002') {
      throw new PaymentError(
        'A refund transaction is already in progress for this payment.',
        paymentIntentId,
      );
    }
    throw err;
  }

  const paymentIntentBytes32 = uuidToBytes32(intent.id);
  const mtxmChainId = chain.mtxmChainDbId?.trim() || String(chainId);

  let txResult;
  try {
    if (chain.chainType === ChainType.SOLANA) {
      const payer = intent.authorizationWalletAddress?.trim();
      if (!payer || !isValidSolanaAddress(payer)) {
        throw new PaymentError('Invalid Solana payer wallet on payment intent', paymentIntentId);
      }
      if (!intent.cryptoTokenKey) {
        throw new PaymentError('Payment intent is missing cryptoTokenKey for Solana refund', paymentIntentId);
      }
      const tokenRow = await db.supportedToken.findFirst({
        where: { tokenKey: intent.cryptoTokenKey, chainId, isEnabled: true },
      });
      if (!tokenRow) {
        throw new PaymentError(`Unknown token ${intent.cryptoTokenKey} for refund`, paymentIntentId);
      }
      const programId = new PublicKey(chain.escrowAddress);
      const authority = mtxmSolanaAuthority();
      const pi = paymentIntentIdSolanaBytes(intent.id);
      const payerPk = new PublicKey(payer);
      if (isNativeToken(tokenRow.contractAddress)) {
        txResult = await mtxm.sendTransaction({
          chainId: mtxmChainId,
          ...buildRefundNativeMtxmPayload(programId, authority, pi, payerPk),
        });
      } else {
        const mint = new PublicKey(tokenRow.contractAddress);
        const conn = new Connection(solanaRpcForChain(chain), 'confirmed');
        const splTokenProgramId = await resolveMintTokenProgramId(conn, mint);
        if (!splTokenProgramId) {
          throw new PaymentError(
            'SPL mint was not found on-chain or is not owned by SPL Token / Token-2022',
            paymentIntentId,
          );
        }
        txResult = await mtxm.sendTransaction({
          chainId: mtxmChainId,
          ...buildRefundSplMtxmPayload(programId, authority, pi, mint, payerPk, splTokenProgramId),
        });
      }
    } else if (chain.chainType === ChainType.SUI) {
      if (!intent.cryptoTokenKey) {
        throw new PaymentError('Payment intent is missing cryptoTokenKey for Sui refund', paymentIntentId);
      }
      const tokenRow = await db.supportedToken.findFirst({
        where: { tokenKey: intent.cryptoTokenKey, chainId, isEnabled: true },
      });
      if (!tokenRow) {
        throw new PaymentError(`Unknown token ${intent.cryptoTokenKey} for refund`, paymentIntentId);
      }
      const coinType = isNativeToken(tokenRow.contractAddress)
        ? SUI_NATIVE_COIN_TYPE
        : tokenRow.contractAddress.trim();
      const payload = await buildRefundSuiMtxmPayload(mtxm, {
        chain,
        coinType,
        paymentIntentId: paymentIntentIdSuiBytes(intent.id),
      });
      txResult = await mtxm.sendTransaction({
        chainId: mtxmChainId,
        ...payload,
      });
    } else {
      const calldata = isPartial
        ? encodeRefundPaymentAmount(paymentIntentBytes32, refundAmt)
        : encodeRefundPayment(paymentIntentBytes32);
      txResult = await mtxm.sendTransaction({
        chainId: mtxmChainId,
        to: chain.escrowAddress,
        data: calldata as string,
      });
    }
  } catch (err) {
    await db.paymentRefund.update({
      where: { id: refundRow.id },
      data: { status: 'FAILED', pendingLock: null },
    });
    throw err;
  }

  const transaction = await db.transaction.create({
    data: {
      paymentIntentId: intent.id,
      mtxmTxId: txResult.id,
      txHash: txResult.txHash ?? null,
      chain: String(chainId),
      type: 'REFUND',
      status: 'PENDING',
    },
  });

  await db.paymentRefund.update({
    where: { id: refundRow.id },
    data: { transactionId: transaction.id },
  });

  await db.paymentIntent.update({
    where: { id: intent.id },
    data: { refundReason: input.reason },
  });

  return {
    paymentIntentId: intent.id,
    transactionId: transaction.id,
    mtxmTxId: txResult.id,
    txHash: txResult.txHash ?? null,
    status: 'PENDING',
    amount: refundAmt.toString(),
    leftoverAfter: (leftover - refundAmt).toString(),
  };
}

export async function getRefundInfo(paymentIntentId: string) {
  const db = getDatabaseClient();

  const intent = await db.paymentIntent.findUnique({
    where: { id: paymentIntentId },
    select: {
      id: true,
      status: true,
      refundedAt: true,
      refundTxHash: true,
      refundReason: true,
      timelockEndsAt: true,
      capturedAt: true,
      timelockDuration: true,
      settleAmount: true,
      convertedAmount: true,
      cryptoAmount: true,
      cryptoTokenKey: true,
      authorizationChainId: true,
      refunds: {
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          amount: true,
          reason: true,
          status: true,
          createdAt: true,
          confirmedAt: true,
          transactionId: true,
        },
      },
    },
  });

  if (!intent) {
    throw new NotFoundError('PaymentIntent', paymentIntentId);
  }

  let canRefund = isOpenEscrow(intent.status);
  let refundWindowEndsAt: Date | null = null;

  if (intent.timelockEndsAt) {
    refundWindowEndsAt = intent.timelockEndsAt;
  } else if (intent.capturedAt) {
    refundWindowEndsAt = new Date(intent.capturedAt.getTime() + intent.timelockDuration * 1000);
  }

  if (canRefund && refundWindowEndsAt && new Date() >= refundWindowEndsAt) {
    canRefund = false;
  }

  return {
    ...intent,
    leftoverAmount: intent.settleAmount ?? intent.convertedAmount ?? intent.cryptoAmount ?? null,
    canRefund,
    refundWindowEndsAt,
  };
}

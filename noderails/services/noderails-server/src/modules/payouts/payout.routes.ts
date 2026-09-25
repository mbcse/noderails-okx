import express, { Router } from 'express';
import { z } from 'zod';
import {
  asyncHandler,
  validate,
  authenticateJwtOrApiKey,
  requireSecretKey,
  requirePermission,
  getMerchantId,
  success,
  created,
  paginated,
} from '@noderails/service-base';
import { MerchantWalletAddressSchema, TokenContractAddressSchema, optionalPermanentEmail } from '@noderails/common';
import * as payoutService from './payout.service.js';
import { env } from '../../config.js';

const router: express.Router = Router();

router.use(
  authenticateJwtOrApiKey(env.JWT_SECRET),
  requireSecretKey(),
  requirePermission('PAYOUTS_VIEW'),
);

const humanAmount = z.string().regex(/^\d+(\.\d+)?$/, 'amount must be a human decimal string');

const payoutLineSchema = z.object({
  recipient: MerchantWalletAddressSchema,
  amount: humanAmount,
  email: optionalPermanentEmail(),
});

const createPayoutSchema = z.object({
  appId: z.string().uuid(),
  recipientWallet: MerchantWalletAddressSchema.optional(),
  recipientEmail: optionalPermanentEmail(),
  amountUsd: z.string().regex(/^\d+(\.\d{1,8})?$/).optional(),
  tokenAmount: humanAmount.optional(),
  tokenAddress: TokenContractAddressSchema,
  chain: z.string().min(1),
  lines: z.array(payoutLineSchema).min(1).max(200).optional(),
  scheduledAt: z.string().min(1).optional(),
  executeNow: z.boolean().optional(),
}).refine(
  (body) => Boolean(body.lines?.length || (body.recipientWallet && body.tokenAmount)),
  { message: 'Provide recipientWallet + tokenAmount, or lines for a bulk payout' },
);

const listPayoutsSchema = z.object({
  appId: z.string().uuid().optional(),
  page: z.coerce.number().int().positive().optional(),
  pageSize: z.coerce.number().int().positive().max(100).optional(),
  status: z.enum(['PENDING', 'SCHEDULED', 'EXECUTED', 'FAILED', 'CANCELLED']).optional(),
});

const executePayoutSchema = z.object({
  merchantManagerAddress: MerchantWalletAddressSchema.optional(),
  chainId: z.string().optional(),
});

router.post(
  '/',
  requirePermission('PAYOUTS_MANAGE'),
  validate(createPayoutSchema),
  asyncHandler(async (req, res) => {
    const payout = await payoutService.createPayout({
      merchantId: getMerchantId(req),
      ...req.body,
    });
    created(res, payout);
  }),
);

router.get(
  '/',
  validate(listPayoutsSchema, 'query'),
  asyncHandler(async (req, res) => {
    const result = await payoutService.listPayouts({
      merchantId: getMerchantId(req),
      ...req.query,
    });
    paginated(res, result.payouts, result.total, result.page, result.pageSize);
  }),
);

router.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const payout = await payoutService.getPayout(getMerchantId(req), req.params.id);
    success(res, payout);
  }),
);

router.post(
  '/:id/execute',
  requirePermission('PAYOUTS_MANAGE'),
  validate(executePayoutSchema),
  asyncHandler(async (req, res) => {
    const tx = await payoutService.executePayout({
      merchantId: getMerchantId(req),
      payoutId: req.params.id,
      ...req.body,
    });
    success(res, tx);
  }),
);

router.post(
  '/:id/cancel',
  requirePermission('PAYOUTS_MANAGE'),
  asyncHandler(async (req, res) => {
    const payout = await payoutService.cancelPayout(getMerchantId(req), req.params.id);
    success(res, payout);
  }),
);

export default router;

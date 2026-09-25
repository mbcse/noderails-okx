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
import * as scheduleService from './payout-schedule.service.js';
import { env } from '../../config.js';

const router: express.Router = Router();

router.use(
  authenticateJwtOrApiKey(env.JWT_SECRET),
  requireSecretKey(),
  requirePermission('PAYOUTS_VIEW'),
);

const lineSchema = z.object({
  recipient: MerchantWalletAddressSchema,
  amount: z.string().regex(/^\d+(\.\d+)?$/, 'amount must be a human decimal string'),
  email: optionalPermanentEmail(),
});

const createSchema = z.object({
  appId: z.string().uuid(),
  chain: z.string().min(1),
  tokenAddress: TokenContractAddressSchema,
  lines: z.array(lineSchema).min(1).max(200),
  intervalDays: z.number().int().min(1).max(365),
  startAt: z.string().min(1).optional(),
});

const listSchema = z.object({
  appId: z.string().uuid().optional(),
  page: z.coerce.number().int().positive().optional(),
  pageSize: z.coerce.number().int().positive().max(100).optional(),
  status: z.enum(['ACTIVE', 'PAUSED', 'CANCELLED']).optional(),
});

router.post(
  '/',
  requirePermission('PAYOUTS_MANAGE'),
  validate(createSchema),
  asyncHandler(async (req, res) => {
    const schedule = await scheduleService.createSchedule({
      merchantId: getMerchantId(req),
      ...req.body,
    });
    created(res, schedule);
  }),
);

router.get(
  '/',
  validate(listSchema, 'query'),
  asyncHandler(async (req, res) => {
    const result = await scheduleService.listSchedules({
      merchantId: getMerchantId(req),
      ...req.query,
    });
    paginated(res, result.schedules, result.total, result.page, result.pageSize);
  }),
);

router.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const schedule = await scheduleService.getSchedule(getMerchantId(req), req.params.id);
    success(res, schedule);
  }),
);

router.post(
  '/:id/pause',
  requirePermission('PAYOUTS_MANAGE'),
  asyncHandler(async (req, res) => {
    const schedule = await scheduleService.pauseSchedule(getMerchantId(req), req.params.id);
    success(res, schedule);
  }),
);

router.post(
  '/:id/resume',
  requirePermission('PAYOUTS_MANAGE'),
  asyncHandler(async (req, res) => {
    const schedule = await scheduleService.resumeSchedule(getMerchantId(req), req.params.id);
    success(res, schedule);
  }),
);

router.post(
  '/:id/cancel',
  requirePermission('PAYOUTS_MANAGE'),
  asyncHandler(async (req, res) => {
    const schedule = await scheduleService.cancelSchedule(getMerchantId(req), req.params.id);
    success(res, schedule);
  }),
);

export default router;

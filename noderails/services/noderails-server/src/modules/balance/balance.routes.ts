import express, { Router } from 'express';
import { z } from 'zod';
import { asyncHandler, validate, success, createLogger } from '@noderails/service-base';
import * as balanceService from './balance.service.js';

const router: express.Router = Router();
const logger = createLogger('balance');

const balanceQuerySchema = z.object({
  chainId: z.coerce.number().int().positive(),
  address: z.string().min(1),
  token: z.string().optional(),
  tokenKey: z.string().optional(),
  includePrice: z
    .enum(['true', 'false'])
    .optional()
    .transform((v) => v === 'true'),
  currency: z.string().min(1).max(10).optional(),
});

const batchItemSchema = z.object({
  chainId: z.number().int().positive(),
  address: z.string().min(1),
  token: z.string().optional(),
  tokenKey: z.string().optional(),
});

const batchSchema = z.object({
  items: z.array(batchItemSchema).min(1).max(50),
  includePrice: z.boolean().optional(),
  currency: z.string().min(1).max(10).optional(),
});

router.get(
  '/',
  validate(balanceQuerySchema, 'query'),
  asyncHandler(async (req, res) => {
    const query = req.query as unknown as z.infer<typeof balanceQuerySchema>;
    const result = await balanceService.getWalletBalance(query, logger);
    success(res, result);
  }),
);

router.post(
  '/batch',
  validate(batchSchema),
  asyncHandler(async (req, res) => {
    const { items, includePrice, currency } = req.body as z.infer<typeof batchSchema>;
    const results = await balanceService.getWalletBalancesBatch(
      items,
      includePrice ?? false,
      currency ?? 'USD',
      logger,
    );
    success(res, results);
  }),
);

export default router;

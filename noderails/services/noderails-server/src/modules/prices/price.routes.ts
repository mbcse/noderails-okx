import express, { Router } from 'express';
import { z } from 'zod';
import { asyncHandler, validate, success, createLogger } from '@noderails/service-base';
import * as priceService from './price.service.js';

const router: express.Router = Router();
const logger = createLogger('prices');

const priceQuerySchema = z.object({
  asset: z.string().min(1),
  currency: z.string().min(1).max(10).optional(),
  amountFiat: z.coerce.number().positive().optional(),
  amountUsd: z.coerce.number().positive().optional(),
  tokenAmount: z.coerce.number().positive().optional(),
  dstAsset: z.string().min(1).optional(),
  quote: z.enum(['swap']).optional(),
  checkoutSessionId: z.string().uuid().optional(),
});

const legacyConvertSchema = z.object({
  symbol: z.string().min(1),
  currency: z.string().min(1).max(10).optional(),
  amountFiat: z.coerce.number().positive().optional(),
  amountUsd: z.coerce.number().positive().optional(),
  tokenAmount: z.coerce.number().positive().optional(),
});

router.get(
  '/',
  validate(priceQuerySchema, 'query'),
  asyncHandler(async (req, res) => {
    const query = req.query as unknown as z.infer<typeof priceQuerySchema>;
    const fiatAmount = query.amountFiat ?? query.amountUsd;
    const result = await priceService.getPrice(
      {
        asset: query.asset,
        currency: query.currency,
        amountFiat: fiatAmount,
        tokenAmount: query.tokenAmount,
        dstAsset: query.dstAsset,
        quote: query.quote,
        checkoutSessionId: query.checkoutSessionId,
      },
      logger,
    );
    success(res, result);
  }),
);

/** @deprecated Use GET /prices?asset= — maps symbol to asset */
router.get(
  '/convert',
  validate(legacyConvertSchema, 'query'),
  asyncHandler(async (req, res) => {
    const query = req.query as unknown as z.infer<typeof legacyConvertSchema>;
    const fiatAmount = query.amountFiat ?? query.amountUsd;
    const result = await priceService.getPrice(
      {
        asset: query.symbol,
        currency: query.currency,
        amountFiat: fiatAmount,
        tokenAmount: query.tokenAmount,
      },
      logger,
    );
    success(res, result);
  }),
);

/** @deprecated Use GET /prices?asset= */
router.get(
  '/:symbol',
  asyncHandler(async (req, res) => {
    const currency = (req.query.currency as string) ?? 'USD';
    const result = await priceService.getPrice(
      { asset: req.params.symbol, currency },
      logger,
    );
    success(res, result);
  }),
);

export default router;

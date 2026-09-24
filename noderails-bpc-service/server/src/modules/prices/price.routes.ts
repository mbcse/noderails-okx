import express, { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../../lib/async-handler.js';
import { validate } from '../../lib/validate.js';
import { success } from '../../lib/response.js';
import { createLogger } from '../../lib/logger.js';
import * as priceService from './price-aggregator.service.js';
import * as swapQuoteService from './swap-quote.service.js';

const router: express.Router = Router();
const logger = createLogger('prices');

/** Unified lookup — primary endpoint */
const assetQuerySchema = z.object({
  asset: z.string().min(1),
  currency: z.string().min(1).max(10).optional(),
  amountFiat: z.coerce.number().positive().optional(),
  tokenAmount: z.coerce.number().positive().optional(),
  dstAsset: z.string().min(1).optional(),
});

const convertSchema = z.object({
  symbol: z.string().min(1).optional(),
  asset: z.string().min(1).optional(),
  currency: z.string().min(1).max(10).optional(),
  amountFiat: z.coerce.number().positive().optional(),
  tokenAmount: z.coerce.number().positive().optional(),
}).refine((d) => !!(d.asset || d.symbol), { message: 'asset or symbol is required' });

const contractSchema = z.object({
  chainId: z.coerce.number().int().positive(),
  address: z.string().min(1),
  currency: z.string().min(1).max(10).optional(),
});

const batchSchema = z.array(
  z.object({
    asset: z.string().optional(),
    symbol: z.string().optional(),
    chainId: z.coerce.number().int().positive().optional(),
    contractAddress: z.string().optional(),
    currency: z.string().optional(),
  }).refine((d) => !!(d.asset || d.symbol || (d.chainId && d.contractAddress)), {
    message: 'Each item needs asset, symbol, or chainId+contractAddress',
  }),
);

router.get(
  '/',
  validate(assetQuerySchema, 'query'),
  asyncHandler(async (req, res) => {
    const query = req.query as unknown as z.infer<typeof assetQuerySchema>;
    const currency = query.currency ?? 'USD';
    if (query.dstAsset && query.amountFiat !== undefined) {
      const swap = await swapQuoteService.getExactOutSwapQuote({
        asset: query.asset,
        dstAsset: query.dstAsset,
        amountFiat: query.amountFiat,
        currency,
        logger,
      });
      success(res, swap);
      return;
    }
    const priceData = await priceService.getPriceByAsset(query.asset, currency, logger);

    if (query.amountFiat !== undefined) {
      const tokens = priceService.convertFiatToToken(query.amountFiat, priceData.price);
      success(res, { ...priceData, amountFiat: query.amountFiat, tokenAmount: tokens });
      return;
    }

    if (query.tokenAmount !== undefined) {
      const fiat = priceService.convertTokenToFiat(query.tokenAmount, priceData.price);
      success(res, { ...priceData, tokenAmount: query.tokenAmount, amountFiat: fiat });
      return;
    }

    success(res, priceData);
  }),
);

router.get(
  '/lookup',
  validate(assetQuerySchema, 'query'),
  asyncHandler(async (req, res) => {
    const query = req.query as unknown as z.infer<typeof assetQuerySchema>;
    const currency = query.currency ?? 'USD';
    const priceData = await priceService.getPriceByAsset(query.asset, currency, logger);

    if (query.amountFiat !== undefined) {
      const tokens = priceService.convertFiatToToken(query.amountFiat, priceData.price);
      success(res, { ...priceData, amountFiat: query.amountFiat, tokenAmount: tokens });
      return;
    }

    if (query.tokenAmount !== undefined) {
      const fiat = priceService.convertTokenToFiat(query.tokenAmount, priceData.price);
      success(res, { ...priceData, tokenAmount: query.tokenAmount, amountFiat: fiat });
      return;
    }

    success(res, priceData);
  }),
);

router.get(
  '/convert',
  validate(convertSchema, 'query'),
  asyncHandler(async (req, res) => {
    const query = req.query as unknown as z.infer<typeof convertSchema>;
    const currency = query.currency ?? 'USD';
    const priceData = query.asset
      ? await priceService.getPriceByAsset(query.asset, currency, logger)
      : await priceService.getPriceBySymbol(query.symbol!, currency, logger);

    if (query.amountFiat !== undefined) {
      const tokens = priceService.convertFiatToToken(query.amountFiat, priceData.price);
      success(res, { ...priceData, amountFiat: query.amountFiat, tokenAmount: tokens });
      return;
    }

    if (query.tokenAmount !== undefined) {
      const fiat = priceService.convertTokenToFiat(query.tokenAmount, priceData.price);
      success(res, { ...priceData, tokenAmount: query.tokenAmount, amountFiat: fiat });
      return;
    }

    success(res, priceData);
  }),
);

router.get(
  '/by-contract',
  validate(contractSchema, 'query'),
  asyncHandler(async (req, res) => {
    const query = req.query as unknown as z.infer<typeof contractSchema>;
    const result = await priceService.getPriceByContract(
      query.chainId,
      query.address,
      query.currency ?? 'USD',
      logger,
    );
    success(res, result);
  }),
);

router.post(
  '/batch',
  validate(batchSchema),
  asyncHandler(async (req, res) => {
    const results = await priceService.getPricesBatch(req.body, logger);
    success(res, results);
  }),
);

router.get(
  '/:symbol',
  asyncHandler(async (req, res) => {
    const currency = (req.query.currency as string) ?? 'USD';
    const result = await priceService.getPriceBySymbol(req.params.symbol, currency, logger);
    success(res, result);
  }),
);

export default router;

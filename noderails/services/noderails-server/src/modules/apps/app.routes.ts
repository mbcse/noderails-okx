import express, { Router } from 'express';
import { z } from 'zod';
import { asyncHandler, validate, authenticateJwt, requirePermission, requireAppAccess, success, created, noContent } from '@noderails/service-base';
import * as appService from './app.service.js';
import * as payoutAuthService from '../payouts/payout-auth.service.js';
import * as payoutFundingService from '../payouts/payout-funding.service.js';
import { env } from '../../config.js';
import { isValidMerchantWalletAddress, MerchantWalletAddressSchema, ValidationError } from '@noderails/common';

const router: express.Router = Router();

router.use(authenticateJwt(env.JWT_SECRET));

// ── Schemas ──

const createAppSchema = z.object({
  name: z.string().min(1).max(100),
  environment: z.enum(['TEST', 'PRODUCTION']).optional(),
});

const walletAddressField = MerchantWalletAddressSchema;

const optionalWallet = z.preprocess(
  (v) => (v === '' ? null : v),
  z.union([walletAddressField, z.null()]).optional(),
);

const optionalFamilyWallet = z.preprocess(
  (v) => (v === '' ? null : v),
  z.union([z.string().min(1).max(128), z.null()]).optional(),
);

const updateAppSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  receivingWallet: optionalWallet,
  receivingWalletSignature: z.string().optional(),
  payoutWallet: optionalWallet,
  payoutWalletSolana: optionalFamilyWallet,
  payoutWalletSui: optionalFamilyWallet,
});

const chainSettlementSchema = z.object({
  settlementAddress: z
    .string()
    .max(66)
    .nullable()
    .transform((s) => (s === '' ? null : s))
    .refine(
      (s) => s === null || isValidMerchantWalletAddress(s),
      'Invalid settlement address — use EVM (0x + 40 hex), Solana base58, or Sui (0x + up to 64 hex)',
    ),
});

const chainIdParam = z.object({ chainId: z.coerce.number().int() });
const tokenIdParam = z.object({ tokenId: z.string().uuid() });

const payoutAuthFamilySchema = z.object({
  family: z.enum(['EVM', 'SOLANA', 'SUI']),
});

const attachPayoutAuthSchema = z.object({
  family: z.enum(['EVM', 'SOLANA', 'SUI']),
  signature: z.string().min(1),
  validUntil: z.string().min(1),
});

// ── GET /apps/available-chains ──

router.get(
  '/available-chains',
  asyncHandler(async (req, res) => {
    const env = req.query.environment as string | undefined;
    const environment = env === 'TEST' || env === 'PRODUCTION' ? env : undefined;
    const chains = await appService.listAvailableChains(environment);
    success(res, chains);
  }),
);

// ── GET /apps/available-tokens ──

router.get(
  '/available-tokens',
  asyncHandler(async (req, res) => {
    const env = req.query.environment as string | undefined;
    const environment = env === 'TEST' || env === 'PRODUCTION' ? env : undefined;
    const tokens = await appService.listAvailableTokens(environment);
    success(res, tokens);
  }),
);

// ── GET /apps/available-currencies ──

router.get(
  '/available-currencies',
  asyncHandler(async (_req, res) => {
    const currencies = await appService.listAvailableCurrencies();
    success(res, currencies);
  }),
);

// ── POST /apps ──

router.post(
  '/',
  requirePermission('APPS_CREATE'),
  validate(createAppSchema),
  asyncHandler(async (req, res) => {
    const app = await appService.createApp({ merchantId: req.merchant!.id, ...req.body });
    created(res, app);
  }),
);

// ── GET /apps ──

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const apps = await appService.listApps(req.merchant!.id);
    success(res, apps);
  }),
);

// ── GET /apps/:id ──

router.get(
  '/:id',
  requireAppAccess('id'),
  asyncHandler(async (req, res) => {
    const app = await appService.getApp(req.merchant!.id, req.params.id);
    success(res, app);
  }),
);

// ── PUT /apps/:id ──

router.put(
  '/:id',
  requireAppAccess('id'),
  requirePermission('APPS_EDIT'),
  validate(updateAppSchema),
  asyncHandler(async (req, res) => {
    const app = await appService.updateApp(req.merchant!.id, req.params.id, req.body);
    success(res, app);
  }),
);

// ── Payout standing auth ──

router.get(
  '/:id/payout-funding',
  requireAppAccess('id'),
  requirePermission('PAYOUTS_VIEW'),
  asyncHandler(async (req, res) => {
    const chainId = Number(req.query.chainId);
    if (!Number.isFinite(chainId) || chainId <= 0) {
      throw new ValidationError('chainId is required');
    }
    const funding = await payoutFundingService.getPayoutFunding(
      req.merchant!.id,
      req.params.id,
      chainId,
    );
    success(res, funding);
  }),
);

router.post(
  '/:id/payout-auth/prepare',
  requireAppAccess('id'),
  requirePermission('APPS_EDIT'),
  validate(payoutAuthFamilySchema),
  asyncHandler(async (req, res) => {
    const prepared = await payoutAuthService.preparePayoutAuth(
      req.merchant!.id,
      req.params.id,
      req.body.family,
    );
    success(res, prepared);
  }),
);

router.post(
  '/:id/payout-auth',
  requireAppAccess('id'),
  requirePermission('APPS_EDIT'),
  validate(attachPayoutAuthSchema),
  asyncHandler(async (req, res) => {
    const app = await payoutAuthService.attachPayoutAuth(
      req.merchant!.id,
      req.params.id,
      req.body.family,
      req.body.signature,
      req.body.validUntil,
    );
    success(res, app);
  }),
);

// ── App Chains ──

router.get(
  '/:id/chains',
  requireAppAccess('id'),
  asyncHandler(async (req, res) => {
    const chains = await appService.listAppChains(req.merchant!.id, req.params.id);
    success(res, chains);
  }),
);

router.post(
  '/:id/chains/:chainId',
  requireAppAccess('id'),
  requirePermission('APPS_EDIT'),
  asyncHandler(async (req, res) => {
    const { chainId } = chainIdParam.parse(req.params);
    const result = await appService.enableChain(req.merchant!.id, req.params.id, chainId);
    success(res, result);
  }),
);

router.patch(
  '/:id/chains/:chainId/settlement',
  requireAppAccess('id'),
  requirePermission('APPS_EDIT'),
  validate(chainSettlementSchema),
  asyncHandler(async (req, res) => {
    const { chainId } = chainIdParam.parse(req.params);
    const result = await appService.updateAppChainSettlementAddress(
      req.merchant!.id,
      req.params.id,
      chainId,
      req.body.settlementAddress,
    );
    success(res, result);
  }),
);

router.delete(
  '/:id/chains/:chainId',
  requireAppAccess('id'),
  requirePermission('APPS_EDIT'),
  asyncHandler(async (req, res) => {
    const { chainId } = chainIdParam.parse(req.params);
    await appService.disableChain(req.merchant!.id, req.params.id, chainId);
    noContent(res);
  }),
);

// ── App Tokens ──

router.get(
  '/:id/tokens',
  requireAppAccess('id'),
  asyncHandler(async (req, res) => {
    const tokens = await appService.listAppTokens(req.merchant!.id, req.params.id);
    success(res, tokens);
  }),
);

router.post(
  '/:id/tokens/:tokenId',
  requireAppAccess('id'),
  requirePermission('APPS_EDIT'),
  asyncHandler(async (req, res) => {
    const { tokenId } = tokenIdParam.parse(req.params);
    const result = await appService.enableToken(req.merchant!.id, req.params.id, tokenId);
    success(res, result);
  }),
);

router.delete(
  '/:id/tokens/:tokenId',
  requireAppAccess('id'),
  requirePermission('APPS_EDIT'),
  asyncHandler(async (req, res) => {
    const { tokenId } = tokenIdParam.parse(req.params);
    await appService.disableToken(req.merchant!.id, req.params.id, tokenId);
    noContent(res);
  }),
);

export default router;

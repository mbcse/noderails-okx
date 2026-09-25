import express, { Router } from 'express';
import { z } from 'zod';
import {
  asyncHandler,
  validate,
  authenticateJwt,
  requirePermission,
  requireAppAccess,
  success,
  created,
  createLogger,
} from '@noderails/service-base';
import { isValidAddress } from '@noderails/common';
import { env } from '../../config.js';
import * as settlementConfigService from '../settlement-config/settlement-config.service.js';
import * as bankService from './bank.service.js';
import { bloxFiClient } from '../../clients/bloxfi.client.js';
import { getApp } from '../apps/app.service.js';
import { merchantHasVerifiedOwnAccount } from '../fiat/own-accounts/own-account.service.js';

const router: express.Router = Router();
const logger = createLogger('bank-settlement');

router.use(authenticateJwt(env.JWT_SECRET));

async function requireOwnedApp(req: express.Request) {
  return getApp(req.merchant!.id, req.params.id);
}

const configSchema = z.object({
  conversionEnabled: z.boolean().optional(),
  targetTokenKey: z.string().max(50).nullable().optional(),
  singleChainSettlementEnabled: z.boolean().optional(),
  settlementChainId: z.number().int().nullable().optional(),
  settlementTokenKey: z.string().max(50).nullable().optional(),
  settlementWalletAddress: z.string().max(42).nullable().optional(),
  bankSettlementEnabled: z.boolean().optional(),
  bankPayoutCurrency: z.string().max(10).nullable().optional(),
  bloxfiCountry: z.string().max(8).nullable().optional(),
  bloxfiDestinationType: z.string().max(50).nullable().optional(),
  bloxfiBeneficiaryType: z.string().max(50).nullable().optional(),
});

const signSchema = z.object({
  merchantSignature: z.string().min(1),
  validUntil: z.string().regex(/^\d+$/),
});

const withdrawPrepareSchema = z.object({
  destination: z.string().min(1),
});

const withdrawExecuteSchema = z.object({
  destination: z.string().min(1),
});

const beneficiarySchema = z.object({
  country: z.string().min(2).max(8),
  destinationType: z.string().min(1).max(50).default('bank_account'),
  beneficiaryType: z.string().min(1).max(50).default('business'),
  name: z.string().min(1).max(200),
}).passthrough();

router.get(
  '/:id/settlement-config',
  requireAppAccess('id'),
  asyncHandler(async (req, res) => {
    const app = await requireOwnedApp(req);
    const config = await settlementConfigService.getSettlementConfig(req.params.id);
    const ownAccountVerified = await merchantHasVerifiedOwnAccount(app.merchantId, app.environment);
    success(res, {
      ...config,
      ownAccountVerified,
      receivingWallet: app.receivingWallet && isValidAddress(app.receivingWallet)
        ? app.receivingWallet
        : null,
    });
  }),
);

router.put(
  '/:id/settlement-config',
  requireAppAccess('id'),
  requirePermission('APPS_EDIT'),
  validate(configSchema),
  asyncHandler(async (req, res) => {
    await requireOwnedApp(req);
    const config = await settlementConfigService.upsertSettlementConfig(req.params.id, req.body);
    success(res, config);
  }),
);

router.get(
  '/:id/settlement-balance',
  requireAppAccess('id'),
  asyncHandler(async (req, res) => {
    await requireOwnedApp(req);
    const balance = await bankService.getSettlementBalanceForApp(req.params.id);
    success(res, balance);
  }),
);

router.get(
  '/:id/bank-corridors',
  requireAppAccess('id'),
  asyncHandler(async (req, res) => {
    await requireOwnedApp(req);
    const corridors = await bloxFiClient.listCorridors();
    success(res, corridors);
  }),
);

router.post(
  '/:id/bank-beneficiaries',
  requireAppAccess('id'),
  requirePermission('APPS_EDIT'),
  validate(beneficiarySchema),
  asyncHandler(async (req, res) => {
    await requireOwnedApp(req);
    const beneficiary = await bloxFiClient.createBeneficiary(req.body as Record<string, unknown>);
    const config = await settlementConfigService.upsertSettlementConfig(req.params.id, {
      bloxfiBeneficiaryId: beneficiary.id,
      bloxfiCountry: typeof req.body?.country === 'string' ? req.body.country : undefined,
      bloxfiDestinationType: typeof req.body?.destinationType === 'string' ? req.body.destinationType : undefined,
      bloxfiBeneficiaryType: typeof req.body?.beneficiaryType === 'string' ? req.body.beneficiaryType : undefined,
    });
    created(res, { beneficiary, config });
  }),
);

router.post(
  '/:id/bank-settlement-auth/prepare',
  requireAppAccess('id'),
  requirePermission('APPS_EDIT'),
  asyncHandler(async (req, res) => {
    await requireOwnedApp(req);
    const prepared = await bankService.prepareBankSettlementAuth(req.params.id);
    success(res, prepared);
  }),
);

router.post(
  '/:id/bank-settlement-auth',
  requireAppAccess('id'),
  requirePermission('APPS_EDIT'),
  validate(signSchema),
  asyncHandler(async (req, res) => {
    await requireOwnedApp(req);
    const config = await bankService.attachBankSettlementAuth(
      req.params.id,
      req.body.merchantSignature,
      req.body.validUntil,
    );
    success(res, config);
  }),
);

router.post(
  '/:id/bank-settlements',
  requireAppAccess('id'),
  requirePermission('APPS_EDIT'),
  asyncHandler(async (req, res) => {
    await requireOwnedApp(req);
    const row = await bankService.createBankSettlement(req.params.id, logger);
    created(res, row);
  }),
);

router.get(
  '/:id/bank-settlements',
  requireAppAccess('id'),
  asyncHandler(async (req, res) => {
    await requireOwnedApp(req);
    const items = await bankService.listBankSettlements(req.params.id);
    success(res, items);
  }),
);

router.post(
  '/:id/settlement-withdrawals/prepare',
  requireAppAccess('id'),
  requirePermission('APPS_EDIT'),
  validate(withdrawPrepareSchema),
  asyncHandler(async (req, res) => {
    await requireOwnedApp(req);
    const prepared = await bankService.prepareWithdrawSettlementBalance(
      req.params.id,
      req.body.destination,
    );
    success(res, prepared);
  }),
);

router.post(
  '/:id/settlement-withdrawals/execute',
  requireAppAccess('id'),
  requirePermission('APPS_EDIT'),
  validate(withdrawExecuteSchema),
  asyncHandler(async (req, res) => {
    await requireOwnedApp(req);
    const result = await bankService.executeWithdrawSettlementBalance({
      appId: req.params.id,
      destination: req.body.destination,
    });
    success(res, result);
  }),
);

export default router;

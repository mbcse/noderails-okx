import express, { Router } from 'express';
import multer from 'multer';
import { z } from 'zod';
import {
  asyncHandler,
  authenticateJwt,
  created,
  requirePermission,
  success,
  validate,
} from '@noderails/service-base';
import { ValidationError } from '@noderails/common';
import { STORAGE_LIMITS } from '@noderails/storage';
import type { Environment } from '@noderails/database';
import { env } from '../../config.js';
import { getBankHub, getAccountDetail, destinationMessage } from './hub.js';
import { setAccountType } from './profile.service.js';
import { startIdentity, syncIdentityStatus } from './identity/identity.service.js';
import * as ownAccountService from './own-accounts/own-account.service.js';
import { createOpeningCheckout } from './onboarding-fee/fee.service.js';
import * as vaService from './virtual-accounts/va.service.js';
import { listAccountActivity, simulateInbound } from './virtual-accounts/activity.service.js';
import { bloxFiClient } from '../../clients/bloxfi.client.js';
import { isGlobalBankRail } from './rails.js';

const router: Router = Router();
router.use(authenticateJwt(env.JWT_SECRET), requirePermission('BANK_MANAGE'));

const envSchema = z.object({
  environment: z.enum(['TEST', 'PRODUCTION']).default('TEST'),
});

function envOf(req: express.Request): Environment {
  const raw = typeof req.query.environment === 'string' ? req.query.environment : req.body?.environment;
  return raw === 'PRODUCTION' ? 'PRODUCTION' : 'TEST';
}

const statementUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: STORAGE_LIMITS.MAX_PROOF_BYTES },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype === 'application/pdf') cb(null, true);
    else cb(new ValidationError('Only PDF files are accepted') as unknown as null, false);
  },
});

router.get(
  '/hub',
  validate(envSchema, 'query'),
  asyncHandler(async (req, res) => {
    const hub = await getBankHub(req.merchant!.id, envOf(req));
    success(res, hub);
  }),
);

router.get(
  '/corridors',
  asyncHandler(async (_req, res) => {
    const corridors = await bloxFiClient.listCorridors();
    success(res, corridors);
  }),
);

router.post(
  '/account-type',
  validate(z.object({
    environment: z.enum(['TEST', 'PRODUCTION']).default('TEST'),
    accountType: z.enum(['INDIVIDUAL', 'BUSINESS']),
  })),
  asyncHandler(async (req, res) => {
    const profile = await setAccountType(req.merchant!.id, req.body.environment);
    success(res, { accountType: profile.accountType });
  }),
);

router.post(
  '/identity/start',
  validate(envSchema),
  asyncHandler(async (req, res) => {
    const session = await startIdentity(req.merchant!.id, envOf(req));
    created(res, {
      id: session.id,
      status: session.status,
      sessionUrl: session.sessionUrl,
      kind: session.kind,
    });
  }),
);

router.post(
  '/identity/refresh',
  validate(envSchema),
  asyncHandler(async (req, res) => {
    const identity = await syncIdentityStatus(req.merchant!.id, envOf(req));
    success(res, identity);
  }),
);

router.put(
  '/own-account',
  validate(z.object({
    environment: z.enum(['TEST', 'PRODUCTION']).default('TEST'),
    corridor: z.record(z.unknown()),
  })),
  asyncHandler(async (req, res) => {
    const own = await ownAccountService.saveOwnAccountDetails(
      req.merchant!.id,
      envOf(req),
      req.body.corridor,
    );
    success(res, own);
  }),
);

router.post(
  '/own-account/statement',
  statementUpload.single('file'),
  asyncHandler(async (req, res) => {
    if (!req.file) throw new ValidationError('PDF file is required');
    const environment = req.body?.environment === 'PRODUCTION' ? 'PRODUCTION' : 'TEST';
    const own = await ownAccountService.uploadStatement(req.merchant!.id, environment, req.file);
    success(res, {
      hasStatement: Boolean(own.statementS3Key),
      hasPendingStatement: Boolean(own.pendingStatementS3Key),
    });
  }),
);

router.post(
  '/own-account/submit',
  validate(envSchema),
  asyncHandler(async (req, res) => {
    const profile = await ownAccountService.submitOwnAccount(req.merchant!.id, envOf(req));
    const own = profile.ownAccount ?? null;
    success(res, {
      ownAccountStatus: profile.ownAccountStatus,
      changeStatus: own?.changeStatus ?? 'NONE',
    });
  }),
);

router.post(
  '/global/kyc',
  validate(envSchema),
  asyncHandler(async (req, res) => {
    const customer = await vaService.startBridgeCustomer(req.merchant!.id, envOf(req));
    created(res, customer);
  }),
);

router.post(
  '/global/kyc/simulate',
  validate(envSchema),
  asyncHandler(async (req, res) => {
    const customer = await vaService.simulateBridgeKyc(req.merchant!.id, envOf(req));
    success(res, customer);
  }),
);

router.post(
  '/global/fees',
  validate(z.object({
    environment: z.enum(['TEST', 'PRODUCTION']).default('TEST'),
    rail: z.string().min(3).max(8),
  })),
  asyncHandler(async (req, res) => {
    if (!isGlobalBankRail(req.body.rail)) throw new ValidationError('Unknown country');
    const fee = await createOpeningCheckout(req.merchant!.id, envOf(req), req.body.rail);
    created(res, {
      id: fee.id,
      checkoutUrl: fee.checkoutUrl,
      amountUsd: fee.amountUsd.toString(),
      rail: fee.rail,
      status: fee.status,
    });
  }),
);

router.get(
  '/global/destination-message',
  asyncHandler(async (req, res) => {
    const environment = req.query.environment === 'PRODUCTION' ? 'PRODUCTION' : 'TEST';
    const rail = typeof req.query.rail === 'string' ? req.query.rail : '';
    const address = typeof req.query.address === 'string' ? req.query.address : '';
    success(res, {
      message: destinationMessage({
        merchantId: req.merchant!.id,
        environment,
        rail,
        address,
      }),
    });
  }),
);

router.post(
  '/global/accounts',
  validate(z.object({
    environment: z.enum(['TEST', 'PRODUCTION']).default('TEST'),
    rail: z.string().min(3).max(8),
    destinationAddress: z.string().min(8),
    destinationChainId: z.number().int(),
    destinationTokenKey: z.string().min(1),
    destinationSignature: z.string().min(1),
  })),
  asyncHandler(async (req, res) => {
    const account = await vaService.openCountryAccount({
      merchantId: req.merchant!.id,
      environment: envOf(req),
      rail: req.body.rail,
      destinationAddress: req.body.destinationAddress,
      destinationChainId: req.body.destinationChainId,
      destinationTokenKey: req.body.destinationTokenKey,
      destinationSignature: req.body.destinationSignature,
    });
    created(res, account);
  }),
);

router.get(
  '/global/accounts/:id',
  asyncHandler(async (req, res) => {
    const account = await getAccountDetail(req.merchant!.id, req.params.id);
    if (!account) {
      res.status(404).json({ success: false, error: { message: 'Account not found' } });
      return;
    }
    const activity = await listAccountActivity(account.id);
    const config = await getBankHub(req.merchant!.id, account.environment);
    success(res, {
      account: {
        id: account.id,
        rail: account.rail,
        status: account.status,
        environment: account.environment,
        depositInstructions: account.depositInstructions,
        destinationAddress: account.destinationAddress,
        destinationChainId: account.destinationChainId,
        destinationTokenKey: account.destinationTokenKey,
      },
      rateCard: config.rateCard,
      activity,
    });
  }),
);

router.post(
  '/global/accounts/:id/simulate-inbound',
  asyncHandler(async (req, res) => {
    const account = await getAccountDetail(req.merchant!.id, req.params.id);
    if (!account) {
      res.status(404).json({ success: false, error: { message: 'Account not found' } });
      return;
    }
    const activity = await simulateInbound(account.id, true);
    success(res, { activity });
  }),
);

export default router;

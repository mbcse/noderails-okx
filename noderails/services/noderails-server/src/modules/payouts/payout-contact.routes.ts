import express, { Router } from 'express';
import { z } from 'zod';
import {
  asyncHandler,
  validate,
  authenticateJwtOrApiKey,
  requireSecretKey,
  requirePermission,
  requireAppAccess,
  getMerchantId,
  success,
  created,
  noContent,
  paginated,
} from '@noderails/service-base';
import { optionalPermanentEmail } from '@noderails/common';
import * as contactService from './payout-contact.service.js';
import { env } from '../../config.js';

const router: express.Router = Router({ mergeParams: true });

router.use(
  authenticateJwtOrApiKey(env.JWT_SECRET),
  requireSecretKey(),
  requirePermission('PAYOUTS_VIEW'),
  requireAppAccess('appId'),
);

const familySchema = z.enum(['EVM', 'SOLANA', 'SUI']);

const createSchema = z.object({
  label: z.string().min(1).max(80),
  wallet: z.string().min(1).max(128),
  family: familySchema,
  email: optionalPermanentEmail(),
});

const updateSchema = z.object({
  label: z.string().min(1).max(80).optional(),
  wallet: z.string().min(1).max(128).optional(),
  family: familySchema.optional(),
  email: optionalPermanentEmail(),
});

const listSchema = z.object({
  page: z.coerce.number().int().positive().optional(),
  pageSize: z.coerce.number().int().positive().max(100).optional(),
  family: familySchema.optional(),
});

const importSchema = z.object({
  csv: z.string().min(1),
  family: familySchema,
  saveToAddressBook: z.boolean().optional(),
});

router.post(
  '/import',
  requirePermission('PAYOUTS_MANAGE'),
  validate(importSchema),
  asyncHandler(async (req, res) => {
    const result = await contactService.importContacts({
      merchantId: getMerchantId(req),
      appId: req.params.appId,
      ...req.body,
    });
    success(res, result);
  }),
);

router.post(
  '/',
  requirePermission('PAYOUTS_MANAGE'),
  validate(createSchema),
  asyncHandler(async (req, res) => {
    const contact = await contactService.createContact({
      merchantId: getMerchantId(req),
      appId: req.params.appId,
      ...req.body,
    });
    created(res, contact);
  }),
);

router.get(
  '/',
  validate(listSchema, 'query'),
  asyncHandler(async (req, res) => {
    const result = await contactService.listContacts({
      merchantId: getMerchantId(req),
      appId: req.params.appId,
      ...req.query,
    });
    paginated(res, result.contacts, result.total, result.page, result.pageSize);
  }),
);

router.get(
  '/:contactId',
  asyncHandler(async (req, res) => {
    const contact = await contactService.getContact(
      getMerchantId(req),
      req.params.appId,
      req.params.contactId,
    );
    success(res, contact);
  }),
);

router.put(
  '/:contactId',
  requirePermission('PAYOUTS_MANAGE'),
  validate(updateSchema),
  asyncHandler(async (req, res) => {
    const contact = await contactService.updateContact(
      getMerchantId(req),
      req.params.appId,
      req.params.contactId,
      req.body,
    );
    success(res, contact);
  }),
);

router.delete(
  '/:contactId',
  requirePermission('PAYOUTS_MANAGE'),
  asyncHandler(async (req, res) => {
    await contactService.deleteContact(getMerchantId(req), req.params.appId, req.params.contactId);
    noContent(res);
  }),
);

export default router;

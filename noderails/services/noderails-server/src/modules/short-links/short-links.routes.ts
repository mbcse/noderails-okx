import express, { Router } from 'express';
import { z } from 'zod';
import { asyncHandler, validate, success, created } from '@noderails/service-base';
import * as shortLinksService from './short-links.service.js';

const router: express.Router = Router();

const createSchema = z.object({
  slug: z.string().min(2).max(64),
  destinationUrl: z.string().url().max(2048),
  title: z.string().max(200).optional().nullable(),
  collectEmail: z.boolean().optional(),
  password: z.string().min(4).max(128).optional().nullable(),
});

const updateSchema = z.object({
  destinationUrl: z.string().url().max(2048).optional(),
  title: z.string().max(200).optional().nullable(),
  collectEmail: z.boolean().optional(),
  status: z.enum(['ACTIVE', 'DISABLED']).optional(),
  password: z.string().min(4).max(128).optional().nullable(),
  clearPassword: z.boolean().optional(),
});

const leadSchema = z.object({
  email: z.string().email().max(254).optional(),
  password: z.string().max(128).optional(),
  referrer: z.string().max(500).optional(),
});

const clickSchema = z.object({
  referrer: z.string().max(500).optional(),
});

const accessSchema = z.object({
  email: z.string().email().max(254).optional(),
  password: z.string().max(128).optional(),
  referrer: z.string().max(500).optional(),
});

function clientMeta(req: express.Request, body?: { referrer?: string }) {
  const forwarded = req.headers['x-forwarded-for'];
  const ip =
    typeof forwarded === 'string'
      ? forwarded.split(',')[0]?.trim()
      : req.socket.remoteAddress;
  return {
    ip,
    userAgent: typeof req.headers['user-agent'] === 'string' ? req.headers['user-agent'] : undefined,
    referrer: body?.referrer || (typeof req.headers.referer === 'string' ? req.headers.referer : undefined),
  };
}

/** Admin routes - mount under /admin after auth. */
export const adminShortLinkRoutes: express.Router = Router();

adminShortLinkRoutes.get(
  '/',
  asyncHandler(async (_req, res) => {
    success(res, await shortLinksService.listShortLinks());
  }),
);

adminShortLinkRoutes.post(
  '/',
  validate(createSchema),
  asyncHandler(async (req, res) => {
    const link = await shortLinksService.createShortLink(req.body);
    created(res, link);
  }),
);

adminShortLinkRoutes.get(
  '/:id',
  asyncHandler(async (req, res) => {
    success(res, await shortLinksService.getShortLinkAdmin(req.params.id));
  }),
);

adminShortLinkRoutes.patch(
  '/:id',
  validate(updateSchema),
  asyncHandler(async (req, res) => {
    success(res, await shortLinksService.updateShortLink(req.params.id, req.body));
  }),
);

adminShortLinkRoutes.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    await shortLinksService.deleteShortLink(req.params.id);
    success(res, { ok: true });
  }),
);

/** Public routes - mount under /public/links. */
export const publicShortLinkRoutes: express.Router = Router();

publicShortLinkRoutes.get(
  '/:slug',
  asyncHandler(async (req, res) => {
    success(res, await shortLinksService.resolvePublicShortLink(req.params.slug));
  }),
);

publicShortLinkRoutes.post(
  '/:slug/click',
  validate(clickSchema),
  asyncHandler(async (req, res) => {
    const result = await shortLinksService.recordPublicClick(
      req.params.slug,
      clientMeta(req, req.body),
    );
    success(res, result);
  }),
);

publicShortLinkRoutes.post(
  '/:slug/lead',
  validate(leadSchema),
  asyncHandler(async (req, res) => {
    const result = await shortLinksService.accessPublicShortLink(
      req.params.slug,
      { email: req.body.email, password: req.body.password },
      clientMeta(req, req.body),
    );
    success(res, result);
  }),
);

publicShortLinkRoutes.post(
  '/:slug/access',
  validate(accessSchema),
  asyncHandler(async (req, res) => {
    const result = await shortLinksService.accessPublicShortLink(
      req.params.slug,
      { email: req.body.email, password: req.body.password },
      clientMeta(req, req.body),
    );
    success(res, result);
  }),
);

export default router;

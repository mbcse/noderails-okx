import express, { Router } from 'express';
import { z } from 'zod';
import { asyncHandler, validate, success } from '@noderails/service-base';
import * as publicService from './public.service.js';
import { proxySuiRpc } from './sui-rpc.proxy.js';
import { recordClick, recordOpen, unsubscribeCampaignEmail } from '../email/email-campaign.service.js';
import { TRACKING_PIXEL_GIF, verifyClickToken, verifyUnsubscribeToken } from '../email/email-tracking.js';
import { CAMPAIGN_EMAIL_LOGO_PNG, CAMPAIGN_EMAIL_LOGO_ROUTE } from '../email/email-campaign-logo.js';
import { publicShortLinkRoutes } from '../short-links/short-links.routes.js';

const router: express.Router = Router();

const supportedAssetsQuerySchema = z.object({
  environment: z.enum(['TEST', 'PRODUCTION']).optional(),
});

router.get(
  '/supported-assets',
  validate(supportedAssetsQuerySchema, 'query'),
  asyncHandler(async (req, res) => {
    const environment = req.query.environment as 'TEST' | 'PRODUCTION' | undefined;
    const data = await publicService.getSupportedAssets(environment);
    success(res, data);
  }),
);

router.get(
  '/chain-registry',
  asyncHandler(async (_req, res) => {
    const data = await publicService.getChainRegistry();
    res.set('Cache-Control', 'public, max-age=300');
    success(res, data);
  }),
);

router.post(
  '/sui/rpc',
  asyncHandler(async (req, res) => {
    await proxySuiRpc(req, res);
  }),
);

router.get(
  CAMPAIGN_EMAIL_LOGO_ROUTE,
  asyncHandler(async (_req, res) => {
    res.set({
      'Content-Type': 'image/png',
      'Cache-Control': 'public, max-age=31536000, immutable',
    });
    res.status(200).end(CAMPAIGN_EMAIL_LOGO_PNG);
  }),
);

router.get(
  '/email/open/:token',
  asyncHandler(async (req, res) => {
    const token = req.params.token.replace(/\.gif$/i, '');
    try {
      await recordOpen(token);
    } catch {
      /* Unknown tokens and DB failures still return the GIF. */
    }
    res.set({
      'Content-Type': 'image/gif',
      'Cache-Control': 'no-store, no-cache, private, max-age=0',
      Pragma: 'no-cache',
    });
    res.status(200).end(TRACKING_PIXEL_GIF);
  }),
);

router.get(
  '/email/click/:token',
  asyncHandler(async (req, res) => {
    const parsed = verifyClickToken(req.params.token);
    const dest = parsed ? await recordClick(parsed.recipientId, parsed.destUrl, parsed.ctaId) : null;
    if (!dest) {
      res.status(400).type('html').send(
        '<!DOCTYPE html><html><body style="font-family:sans-serif;padding:40px;text-align:center;"><p>This link is invalid.</p></body></html>',
      );
      return;
    }
    res.redirect(302, dest);
  }),
);

function unsubscribeHtml(message: string): string {
  return `<!DOCTYPE html><html><body style="font-family:sans-serif;padding:40px;text-align:center;"><p>${message}</p></body></html>`;
}

async function handleUnsubscribe(token: string | undefined, res: express.Response): Promise<void> {
  const email = token ? verifyUnsubscribeToken(token) : null;
  if (!email) {
    res.status(400).type('html').send(unsubscribeHtml('This unsubscribe link is invalid.'));
    return;
  }
  await unsubscribeCampaignEmail(email);
  res.status(200).type('html').send(unsubscribeHtml('You have been unsubscribed from NodeRails updates.'));
}

router.get(
  '/email/unsubscribe',
  asyncHandler(async (req, res) => {
    await handleUnsubscribe(typeof req.query.token === 'string' ? req.query.token : undefined, res);
  }),
);

router.post(
  '/email/unsubscribe',
  asyncHandler(async (req, res) => {
    const token = typeof req.query.token === 'string'
      ? req.query.token
      : typeof req.body?.token === 'string'
        ? req.body.token
        : undefined;
    await handleUnsubscribe(token, res);
  }),
);

router.use('/links', publicShortLinkRoutes);

export default router;

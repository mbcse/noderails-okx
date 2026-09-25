import express, { Router } from 'express';
import { asyncHandler, createLogger } from '@noderails/service-base';
import * as ingestService from './ingest.service.js';

const router: express.Router = Router();
const logger = createLogger('ingest');

// Raw body for signature verification

// ── POST /webhooks/mtxm ──

router.post(
  '/mtxm',
  express.raw({ type: 'application/json' }),
  asyncHandler(async (req, res) => {
    const rawBody = req.body instanceof Buffer ? req.body.toString('utf-8') : String(req.body);
    const signature = req.headers['x-signature-256'] as string ?? '';

    const ok = await ingestService.processMtxmWebhook(rawBody, signature, logger);

    if (!ok) {
      res.status(401).json({ success: false, error: { message: 'Invalid signature' } });
      return;
    }

    res.status(200).json({ success: true });
  }),
);

// ── POST /webhooks/indexer ──

router.post(
  '/indexer',
  express.raw({ type: 'application/json' }),
  asyncHandler(async (req, res) => {
    const rawBody = req.body instanceof Buffer ? req.body.toString('utf-8') : String(req.body);
    const signature = req.headers['x-indexer-signature'] as string ?? '';
    const timestamp = req.headers['x-indexer-timestamp'] as string ?? '';

    const ok = await ingestService.processIndexerWebhook(rawBody, signature, timestamp, logger);

    if (!ok) {
      res.status(401).json({ success: false, error: { message: 'Invalid signature' } });
      return;
    }

    res.status(200).json({ success: true });
  }),
);

// ── POST /webhooks/bloxfi ──

router.post(
  '/bloxfi',
  express.raw({ type: 'application/json' }),
  asyncHandler(async (req, res) => {
    const rawBody = req.body instanceof Buffer ? req.body.toString('utf-8') : String(req.body);
    const signature = (req.headers['x-bloxfi-signature'] as string) ?? '';
    const timestamp = (req.headers['x-bloxfi-timestamp'] as string) ?? '';
    const eventId = req.headers['x-bloxfi-event-id'] as string | undefined;
    const { applyBloxFiWebhook } = await import('../bank-settlement/bank.service.js');
    const ok = await applyBloxFiWebhook(rawBody, signature, timestamp, eventId, logger);
    if (!ok) {
      res.status(401).json({ success: false, error: { message: 'Invalid signature' } });
      return;
    }
    res.status(200).json({ success: true });
  }),
);

function rawJson(req: express.Request): string {
  return req.body instanceof Buffer ? req.body.toString('utf-8') : String(req.body ?? '');
}

function header(req: express.Request, name: string): string {
  const value = req.headers[name];
  return typeof value === 'string' ? value : '';
}

router.post(
  '/didit',
  express.raw({ type: 'application/json' }),
  asyncHandler(async (req, res) => {
    const { handleDiditWebhook } = await import('../fiat/webhooks.js');
    const result = await handleDiditWebhook(
      'PRODUCTION',
      rawJson(req),
      header(req, 'x-signature-v2'),
      header(req, 'x-timestamp'),
    );
    if (result === 'unauthorized') {
      res.status(401).json({ success: false, error: { message: 'Invalid signature' } });
      return;
    }
    res.status(200).json({ success: true });
  }),
);

router.post(
  '/didit-sandbox',
  express.raw({ type: 'application/json' }),
  asyncHandler(async (req, res) => {
    const { handleDiditWebhook } = await import('../fiat/webhooks.js');
    const result = await handleDiditWebhook(
      'TEST',
      rawJson(req),
      header(req, 'x-signature-v2'),
      header(req, 'x-timestamp'),
    );
    if (result === 'unauthorized') {
      res.status(401).json({ success: false, error: { message: 'Invalid signature' } });
      return;
    }
    res.status(200).json({ success: true });
  }),
);

router.post(
  '/bridge',
  express.raw({ type: 'application/json' }),
  asyncHandler(async (req, res) => {
    const { handleBridgeWebhook } = await import('../fiat/webhooks.js');
    const result = await handleBridgeWebhook('PRODUCTION', rawJson(req), header(req, 'x-webhook-signature'));
    if (result === 'unauthorized') {
      res.status(401).json({ success: false, error: { message: 'Invalid signature' } });
      return;
    }
    res.status(200).json({ success: true });
  }),
);

router.post(
  '/bridge-sandbox',
  express.raw({ type: 'application/json' }),
  asyncHandler(async (req, res) => {
    const { handleBridgeWebhook } = await import('../fiat/webhooks.js');
    const result = await handleBridgeWebhook('TEST', rawJson(req), header(req, 'x-webhook-signature'));
    if (result === 'unauthorized') {
      res.status(401).json({ success: false, error: { message: 'Invalid signature' } });
      return;
    }
    res.status(200).json({ success: true });
  }),
);

router.post(
  '/bank-fee',
  express.raw({ type: 'application/json' }),
  asyncHandler(async (req, res) => {
    const { handleBankFeeWebhook } = await import('../fiat/webhooks.js');
    const result = await handleBankFeeWebhook(
      'PRODUCTION',
      rawJson(req),
      header(req, 'x-noderails-signature'),
      header(req, 'x-noderails-timestamp'),
    );
    if (result === 'unauthorized') {
      res.status(401).json({ success: false, error: { message: 'Invalid signature' } });
      return;
    }
    res.status(200).json({ success: true });
  }),
);

router.post(
  '/bank-fee-test',
  express.raw({ type: 'application/json' }),
  asyncHandler(async (req, res) => {
    const { handleBankFeeWebhook } = await import('../fiat/webhooks.js');
    const result = await handleBankFeeWebhook(
      'TEST',
      rawJson(req),
      header(req, 'x-noderails-signature'),
      header(req, 'x-noderails-timestamp'),
    );
    if (result === 'unauthorized') {
      res.status(401).json({ success: false, error: { message: 'Invalid signature' } });
      return;
    }
    res.status(200).json({ success: true });
  }),
);

export default router;

import { NodeRails } from '@noderails/sdk';
import { getDatabaseClient, type Environment } from '@noderails/database';
import { WEBHOOK_CONFIG } from '@noderails/common';
import { getIdentityProvider } from './factory.js';
import { applyDiditWebhook } from './identity/identity.service.js';
import { applyBridgeCustomerWebhook } from './virtual-accounts/va.service.js';
import { applyBridgeActivityWebhook } from './virtual-accounts/activity.service.js';
import { confirmOpeningFeeFromWebhook, verifyBankFeeWebhook } from './onboarding-fee/fee.service.js';
import { feeCollectorFor, getPlatformBankConfig } from './platform-bank-config.js';
import { bridgeLive, bridgeSandbox } from '../../clients/bridge.client.js';

async function alreadyProcessed(source: string, eventId: string): Promise<boolean> {
  if (!eventId || eventId === 'payment.captured') return false;
  const db = getDatabaseClient();
  const id = `${source}:${eventId}`;
  const existing = await db.fiatProcessedWebhook.findUnique({ where: { id } });
  if (existing) return true;
  try {
    await db.fiatProcessedWebhook.create({ data: { id, source } });
    return false;
  } catch {
    return true;
  }
}

function pickString(obj: Record<string, unknown>, keys: string[]): string | null {
  for (const key of keys) {
    const value = obj[key];
    if (typeof value === 'string' && value.length > 0) return value;
  }
  return null;
}

function bankFeePayload(payload: Record<string, unknown>): Record<string, unknown> {
  const nested = payload.data && typeof payload.data === 'object' && !Array.isArray(payload.data)
    ? payload.data as Record<string, unknown>
    : {};
  const metadataRaw = payload.metadata ?? nested.metadata;
  return {
    ...nested,
    ...payload,
    event: pickString(payload, ['event']) ?? pickString(nested, ['event']) ?? payload.event,
    paymentIntentId: pickString(payload, ['paymentIntentId', 'payment_intent_id'])
      ?? pickString(nested, ['paymentIntentId', 'payment_intent_id']),
    appId: pickString(payload, ['appId', 'app_id']) ?? pickString(nested, ['appId', 'app_id']),
    amount: payload.amount ?? nested.amount,
    metadata: metadataRaw && typeof metadataRaw === 'object' ? metadataRaw : {},
  };
}

function parseJson(rawBody: string): Record<string, unknown> | null {
  try {
    const parsed = JSON.parse(rawBody);
    return parsed && typeof parsed === 'object' ? parsed as Record<string, unknown> : null;
  } catch {
    return null;
  }
}

export async function handleDiditWebhook(
  environment: Environment,
  rawBody: string,
  signature: string,
  timestamp: string,
): Promise<'ok' | 'unauthorized'> {
  const provider = getIdentityProvider(environment);
  if (!provider.verifyWebhook(rawBody, signature, timestamp)) return 'unauthorized';
  const payload = parseJson(rawBody);
  if (!payload) return 'unauthorized';
  const payloadEnv = typeof payload.environment === 'string' ? payload.environment.toLowerCase() : '';
  if (environment === 'TEST' && payloadEnv && payloadEnv !== 'sandbox') return 'ok';
  if (environment === 'PRODUCTION' && payloadEnv === 'sandbox') return 'ok';
  const eventId = typeof payload.event_id === 'string' ? payload.event_id : '';
  if (await alreadyProcessed(`didit:${environment}`, eventId)) return 'ok';
  await applyDiditWebhook(environment, payload);
  return 'ok';
}

export async function handleBridgeWebhook(
  environment: Environment,
  rawBody: string,
  signatureHeader: string,
): Promise<'ok' | 'unauthorized'> {
  const client = environment === 'PRODUCTION' ? bridgeLive : bridgeSandbox;
  if (!client.verifyWebhook(rawBody, signatureHeader)) return 'unauthorized';
  const payload = parseJson(rawBody);
  if (!payload) return 'unauthorized';
  const eventId = typeof payload.event_id === 'string'
    ? payload.event_id
    : typeof payload.id === 'string'
      ? payload.id
      : '';
  if (await alreadyProcessed(`bridge:${environment}`, eventId)) return 'ok';
  const category = String(payload.event_category ?? payload.event_type ?? '');
  if (category.includes('virtual_account.activity') || category.includes('activity')) {
    await applyBridgeActivityWebhook(payload);
  } else {
    await applyBridgeCustomerWebhook(payload);
    if (category.includes('virtual_account')) {
      await applyBridgeActivityWebhook(payload);
    }
  }
  return 'ok';
}

function verifyFeePayload(
  rawBody: string,
  signature: string,
  timestamp: string,
  secret: string,
): Record<string, unknown> | null {
  try {
    return NodeRails.webhooks.constructEvent(
      rawBody,
      signature,
      timestamp,
      secret,
    ) as Record<string, unknown>;
  } catch {
    if (!verifyBankFeeWebhook(rawBody, signature, timestamp, secret)) return null;
    return parseJson(rawBody);
  }
}

export async function handleBankFeeWebhook(
  environment: Environment,
  rawBody: string,
  signature: string,
  timestamp: string,
): Promise<'ok' | 'unauthorized'> {
  const config = await getPlatformBankConfig();
  const collector = feeCollectorFor(config, environment);
  if (!collector.webhookSecret) return 'unauthorized';
  const payload = verifyFeePayload(rawBody, signature, timestamp, collector.webhookSecret);
  if (!payload) return 'unauthorized';
  const body = bankFeePayload(payload);
  const event = typeof body.event === 'string' ? body.event : '';
  if (event !== 'payment.captured') return 'ok';
  const eventId = typeof body.paymentIntentId === 'string' ? body.paymentIntentId : '';
  if (eventId) await alreadyProcessed(`bank-fee:${environment}`, eventId);
  await confirmOpeningFeeFromWebhook(body);
  return 'ok';
}

export { WEBHOOK_CONFIG };

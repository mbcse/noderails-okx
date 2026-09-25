import { NodeRails } from '@noderails/sdk';
import { getDatabaseClient, type Environment } from '@noderails/database';
import { NotFoundError, ValidationError, verifyWebhookSignature, WEBHOOK_CONFIG } from '@noderails/common';
import { env } from '../../../config.js';
import { getOrCreateProfile } from '../profile.service.js';
import { feeCollectorFor, getPlatformBankConfig } from '../platform-bank-config.js';
import { isGlobalBankRail, railMeta } from '../rails.js';
import * as webhookService from '../../webhooks/webhook.service.js';

const YEAR_MS = 365 * 24 * 60 * 60 * 1000;

function amountString(value: unknown): string {
  const n = Number(value);
  if (!Number.isFinite(n)) return '';
  return n.toFixed(2);
}

export function hasActiveFee(fees: Array<{ status: string; periodEnd: Date | null }>, rail: string) {
  const now = Date.now();
  return fees.some((fee) => fee.status === 'CONFIRMED' && fee.periodEnd && fee.periodEnd.getTime() > now);
}

export async function createOpeningCheckout(
  merchantId: string,
  environment: Environment,
  rail: string,
) {
  if (!isGlobalBankRail(rail)) throw new ValidationError('Unknown country account');
  const profile = await getOrCreateProfile(merchantId, environment);
  const config = await getPlatformBankConfig();
  const collector = feeCollectorFor(config, environment);
  if (!collector.appId || !collector.apiKey) {
    throw new ValidationError('Bank opening checkout is not configured');
  }
  const db = getDatabaseClient();
  const active = await db.fiatOnboardingFee.findFirst({
    where: {
      profileId: profile.id,
      rail,
      status: 'CONFIRMED',
      periodEnd: { gt: new Date() },
    },
  });
  if (active) {
    throw new ValidationError('This country is already paid for the current year');
  }
  const pending = await db.fiatOnboardingFee.findFirst({
    where: { profileId: profile.id, rail, status: 'PENDING' },
    orderBy: { createdAt: 'desc' },
  });
  const amountUsd = profile.accountType === 'BUSINESS'
    ? config.bankFeeBusinessUsd
    : config.bankFeeIndividualUsd;
  const amount = amountString(amountUsd);
  const meta = railMeta(rail);
  const noderails = new NodeRails({
    appId: collector.appId,
    apiKey: collector.apiKey,
    baseUrl: env.API_PUBLIC_URL,
  });
  let fee = pending;
  if (!fee) {
    fee = await db.fiatOnboardingFee.create({
      data: { profileId: profile.id, rail, amountUsd, status: 'PENDING' },
    });
  } else {
    fee = await db.fiatOnboardingFee.update({
      where: { id: fee.id },
      data: { amountUsd },
    });
  }

  const paymentUiBase = env.PAYMENT_UI_URL.replace(/\/$/, '');
  const buildCheckoutUrl = (sessionId: string) => `${paymentUiBase}/checkout/${sessionId}`;

  // Reuse existing session when still OPEN and within TTL
  if (fee.checkoutSessionId) {
    const existing = await db.checkoutSession.findUnique({
      where: { id: fee.checkoutSessionId },
      select: { id: true, status: true, expiresAt: true },
    });
    const now = new Date();
    if (existing?.status === 'OPEN' && existing.expiresAt > now) {
      const checkoutUrl = fee.checkoutUrl || buildCheckoutUrl(existing.id);
      if (!fee.checkoutUrl) {
        return db.fiatOnboardingFee.update({
          where: { id: fee.id },
          data: { checkoutUrl },
        });
      }
      return fee;
    }
    // Expire stale OPEN session before minting a replacement
    if (existing?.status === 'OPEN') {
      await db.checkoutSession.update({
        where: { id: existing.id },
        data: { status: 'EXPIRED' },
      });
    }
  }

  const session = await noderails.checkoutSessions.create({
    successUrl: `${env.DASHBOARD_URL}/dashboard/bank?fee={CHECKOUT_SESSION_ID}&rail=${rail}`,
    cancelUrl: `${env.DASHBOARD_URL}/dashboard/bank?cancelled=1&rail=${rail}`,
    items: [{
      name: `${meta?.currency ?? rail.toUpperCase()} Global Bank Account (1 year)`,
      description: `Global Bank Accounts on NodeRails. Open a ${meta?.label ?? 'country'} account for one year so you can receive local deposits.`,
      amount,
      currency: 'USD',
      quantity: 1,
    }],
    metadata: {
      purpose: 'bank_global_account',
      feeId: fee.id,
      merchantId,
      rail,
      environment,
    },
  });
  const successUrl = `${env.DASHBOARD_URL}/dashboard/bank?fee=${session.id}&rail=${rail}`;
  await db.checkoutSession.update({
    where: { id: session.id },
    data: { successUrl },
  });
  const checkoutUrl = buildCheckoutUrl(session.id);
  return db.fiatOnboardingFee.update({
    where: { id: fee.id },
    data: { checkoutSessionId: session.id, checkoutUrl },
  });
}

export async function ensureFeeWebhook(appId: string, apiKey: string, environment: Environment) {
  const db = getDatabaseClient();
  const app = await db.app.findUnique({ where: { id: appId }, include: { webhooks: true } });
  if (!app) throw new ValidationError('Fee project was not found');
  const path = environment === 'PRODUCTION' ? '/webhooks/bank-fee' : '/webhooks/bank-fee-test';
  const url = `${env.API_PUBLIC_URL}${path}`;
  const existing = app.webhooks.find((row) => row.url === url);
  if (existing) {
    const events = rowEvents(existing.events);
    if (!events.includes('payment.captured')) {
      await webhookService.updateWebhook(app.merchantId, appId, existing.id, {
        events: [...events, 'payment.captured'],
        active: true,
      });
    }
    return { webhookId: existing.id, secret: null as string | null, url };
  }
  try {
    const noderails = new NodeRails({ appId, apiKey, baseUrl: env.API_PUBLIC_URL });
    const created = await noderails.webhookEndpoints.create({
      url,
      events: ['payment.captured'],
    });
    return { webhookId: created.id, secret: created.secret ?? null, url };
  } catch {
    const created = await webhookService.createWebhook({
      merchantId: app.merchantId,
      appId,
      url,
      events: ['payment.captured'],
    });
    return { webhookId: created.id, secret: created.secret, url };
  }
}

function rowEvents(events: unknown): string[] {
  return Array.isArray(events) ? events.filter((item): item is string => typeof item === 'string') : [];
}

export function verifyBankFeeWebhook(rawBody: string, signature: string, timestamp: string, secret: string) {
  if (!secret || !signature || !timestamp) return false;
  const signed = `${timestamp}.${rawBody}`;
  return verifyWebhookSignature(signed, signature, secret);
}

export async function confirmOpeningFeeFromWebhook(payload: Record<string, unknown>) {
  if (payload.event !== 'payment.captured') return false;
  const metadata = (payload.metadata && typeof payload.metadata === 'object')
    ? payload.metadata as Record<string, unknown>
    : {};
  const db = getDatabaseClient();
  const paymentIntentId = typeof payload.paymentIntentId === 'string' ? payload.paymentIntentId : null;
  const appId = typeof payload.appId === 'string' ? payload.appId : null;
  const amount = amountString(payload.amount);
  let fee = typeof metadata.feeId === 'string'
    ? await db.fiatOnboardingFee.findUnique({ where: { id: metadata.feeId }, include: { profile: true } })
    : null;
  if (!fee && paymentIntentId) {
    const intent = await db.paymentIntent.findUnique({ where: { id: paymentIntentId } });
    if (intent?.sourceId) {
      fee = await db.fiatOnboardingFee.findFirst({
        where: { checkoutSessionId: intent.sourceId },
        include: { profile: true },
      });
    }
  }
  if (!fee || fee.status === 'CONFIRMED') return Boolean(fee);
  const config = await getPlatformBankConfig();
  const collector = feeCollectorFor(config, fee.profile.environment);
  if (appId && collector.appId && appId !== collector.appId) return false;
  if (metadata.purpose && metadata.purpose !== 'bank_global_account') return false;
  if (amount && amount !== amountString(fee.amountUsd)) return false;
  if (paymentIntentId) {
    const taken = await db.fiatOnboardingFee.findUnique({ where: { paymentIntentId } });
    if (taken && taken.id !== fee.id) return false;
  }
  const now = new Date();
  await db.fiatOnboardingFee.update({
    where: { id: fee.id },
    data: {
      status: 'CONFIRMED',
      paymentIntentId,
      periodStart: now,
      periodEnd: new Date(now.getTime() + YEAR_MS),
    },
  });
  return true;
}

/** Confirm PENDING country fees when the checkout payment is already captured. */
export async function syncPendingOpeningFees(merchantId: string, environment: Environment) {
  const profile = await getOrCreateProfile(merchantId, environment);
  const db = getDatabaseClient();
  const pending = await db.fiatOnboardingFee.findMany({
    where: {
      profileId: profile.id,
      status: 'PENDING',
      checkoutSessionId: { not: null },
    },
  });
  for (const fee of pending) {
    const session = await db.checkoutSession.findUnique({
      where: { id: fee.checkoutSessionId! },
      select: { paymentIntentId: true, paymentIntent: { select: { id: true, status: true, appId: true, amount: true, sourceId: true } } },
    });
    let intent = session?.paymentIntent ?? null;
    if (!intent && fee.checkoutSessionId) {
      intent = await db.paymentIntent.findFirst({
        where: {
          sourceId: fee.checkoutSessionId,
          status: { in: ['CAPTURED', 'SETTLED', 'PARTIALLY_REFUNDED'] },
        },
        select: { id: true, status: true, appId: true, amount: true, sourceId: true },
      });
    }
    if (!intent || !['CAPTURED', 'SETTLED', 'PARTIALLY_REFUNDED'].includes(intent.status)) {
      continue;
    }
    await confirmOpeningFeeFromWebhook({
      event: 'payment.captured',
      paymentIntentId: intent.id,
      appId: intent.appId,
      amount: intent.amount.toString(),
      metadata: { purpose: 'bank_global_account', feeId: fee.id },
    });
  }
}

export async function listCharges(filters: {
  status?: string;
  merchantId?: string;
  rail?: string;
  page?: number;
  pageSize?: number;
}) {
  const db = getDatabaseClient();
  const page = filters.page ?? 1;
  const pageSize = filters.pageSize ?? 50;
  const where = {
    ...(filters.status ? { status: filters.status as never } : {}),
    ...(filters.rail ? { rail: filters.rail } : {}),
    ...(filters.merchantId ? { profile: { merchantId: filters.merchantId } } : {}),
  };
  const [items, total] = await Promise.all([
    db.fiatOnboardingFee.findMany({
      where,
      include: {
        profile: {
          include: {
            merchant: { select: { id: true, email: true, orgName: true, businessName: true, individualName: true } },
          },
        },
        virtualAccount: { select: { id: true, rail: true, status: true } },
      },
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    db.fiatOnboardingFee.count({ where }),
  ]);
  return { items, total, page, pageSize, totalPages: Math.ceil(total / pageSize) };
}

export async function getCharge(id: string) {
  const db = getDatabaseClient();
  const fee = await db.fiatOnboardingFee.findUnique({
    where: { id },
    include: {
      profile: {
        include: {
          merchant: { select: { id: true, email: true, orgName: true, businessName: true, individualName: true } },
        },
      },
      virtualAccount: true,
    },
  });
  if (!fee) throw new NotFoundError('Charge', id);
  return fee;
}

export { WEBHOOK_CONFIG };

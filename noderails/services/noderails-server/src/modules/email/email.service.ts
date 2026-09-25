/**
 * Email Service
 *
 * Enqueues email jobs for the email worker to process.
 * Currently supports payment receipt emails.
 */

import { ChainType, getDatabaseClient } from '@noderails/database';
import {
  QUEUE_NAMES,
  CHAIN_DEFINITIONS,
  NotFoundError,
  AuthorizationError,
  ValidationError,
  formatCryptoAmount,
  blockExplorerTxUrl,
  isNativeToken,
  resolveChainTypeFromId,
} from '@noderails/common';
import { emailFrom } from './email-from.js';
import { emailLog } from './email-log.js';
import { resolvePayoutToken } from '../payouts/payout-token.js';
import type { PayoutAuthFamily } from '../payouts/payout-auth.service.js';
import { queueRegistry } from '@noderails/queue';
import type { EmailSendJob } from '@noderails/queue';
import { isEmailSuppressed } from './ses-notifications.service.js';
import { emailCanReceiveMail } from '../../lib/email-mx.js';

// ── Chain ID → chain definition lookup ──

const CHAIN_BY_ID = Object.fromEntries(
  Object.values(CHAIN_DEFINITIONS).map((c) => [c.chainId, c]),
) as Record<number, (typeof CHAIN_DEFINITIONS)[keyof typeof CHAIN_DEFINITIONS]>;

/**
 * Enqueue a payment receipt email to the customer.
 *
 * Called after a payment is captured. Loads payment + customer data
 * from the database, creates an EmailDelivery tracking record, and
 * enqueues an EMAIL_SEND job with 10 retries spread across ~24 hours.
 *
 * Retry schedule (exponential backoff, base 180 s):
 *   1→3m  2→6m  3→12m  4→24m  5→48m  6→1.6h  7→3.2h  8→6.4h  9→12.8h  ≈24h total
 */
export async function enqueueReceiptEmail(paymentIntentId: string): Promise<void> {
  const db = getDatabaseClient();

  const intent = await db.paymentIntent.findUnique({
    where: { id: paymentIntentId },
    include: {
      app: { select: { name: true } },
      customerAccount: { select: { email: true, name: true } },
    },
  });

  if (!intent) return;

  // Must have a customer with an email
  const customerEmail = intent.customerAccount?.email;
  if (!customerEmail) return;

  // Check global suppression list (permanent bounce or complaint)
  if (await isEmailSuppressed(customerEmail)) return;

  const existing = await db.emailDelivery.findFirst({
    where: {
      paymentIntentId: intent.id,
      templateId: 'payment-receipt',
      status: { in: ['PENDING', 'SENT', 'DELIVERED'] },
    },
    select: { id: true },
  });
  if (existing) {
    emailLog.info('Payment receipt already queued or sent — skipping duplicate', {
      paymentIntentId: intent.id,
      emailDeliveryId: existing.id,
    });
    return;
  }

  // Create a tracking record so we can observe delivery status per transaction
  let delivery: { id: string };
  try {
    delivery = await db.emailDelivery.create({
      data: {
        paymentIntentId: intent.id,
        templateId: 'payment-receipt',
        recipientEmail: customerEmail,
        status: 'PENDING',
      },
      select: { id: true },
    });
  } catch (err) {
    if (isPrismaUniqueViolation(err)) {
      emailLog.info('Payment receipt already queued or sent — skipping duplicate', {
        paymentIntentId: intent.id,
      });
      return;
    }
    throw err;
  }

  const queue = queueRegistry.getOrCreateQueue<EmailSendJob>(QUEUE_NAMES.EMAIL_SEND);
  const jobId = `receipt-${paymentIntentId}`;

  await queue.add(
    'payment-receipt',
    {
      templateId: 'payment-receipt',
      to: customerEmail,
      from: emailFrom('transactional'),
      variables: {
        paymentIntentId: intent.id,
        emailDeliveryId: delivery.id,
      },
    },
    {
      jobId,
      // 10 attempts with exponential backoff starting at 3 min — spreads retries across ~24 hours
      attempts: 10,
      backoff: { type: 'exponential', delay: 180_000 },
      removeOnComplete: 100,
      removeOnFail: 200,
    },
  );
}

function isPrismaUniqueViolation(err: unknown): boolean {
  return (
    typeof err === 'object'
    && err !== null
    && 'code' in err
    && (err as { code: string }).code === 'P2002'
  );
}

// ── Enqueue Invoice Email ──

/**
 * Enqueue an invoice payment email to the customer.
 *
 * Transitions the invoice to OPEN status (if DRAFT), loads invoice +
 * customer data, creates an EmailDelivery tracking record, and
 * enqueues an EMAIL_SEND job.
 */
export async function enqueueInvoiceEmail(merchantId: string, invoiceId: string): Promise<void> {
  const db = getDatabaseClient();

  const invoice = await db.invoice.findUnique({
    where: { id: invoiceId },
    include: {
      app: { select: { name: true, merchantId: true } },
      items: { include: { taxRate: true } },
      taxRate: true,
      customerAccount: { select: { email: true, name: true } },
    },
  });

  if (!invoice) throw new NotFoundError('Invoice', invoiceId);
  if (invoice.app.merchantId !== merchantId) throw new AuthorizationError('Access denied');

  if (invoice.status === 'PAID') throw new ValidationError('Invoice is already paid');
  if (invoice.status === 'VOID') throw new ValidationError('Invoice is voided');

  const customerEmail = invoice.customerAccount?.email;
  if (!customerEmail) throw new ValidationError('Customer has no email address');

  // Check global suppression list
  if (await isEmailSuppressed(customerEmail)) {
    throw new ValidationError('Customer email is suppressed (bounced or complained)');
  }

  // Transition DRAFT → OPEN
  if (invoice.status === 'DRAFT') {
    await db.invoice.update({ where: { id: invoiceId }, data: { status: 'OPEN' } });
  }

  // Create tracking record
  const delivery = await db.emailDelivery.create({
    data: {
      invoiceId: invoice.id,
      templateId: 'invoice-payment',
      recipientEmail: customerEmail,
      status: 'PENDING',
    },
  });

  const queue = queueRegistry.getOrCreateQueue<EmailSendJob>(QUEUE_NAMES.EMAIL_SEND);

  await queue.add(
    `invoice-${invoiceId}`,
    {
      templateId: 'invoice-payment',
      to: customerEmail,
      from: emailFrom('transactional'),
      variables: {
        invoiceId: invoice.id,
        emailDeliveryId: delivery.id,
      },
    },
    {
      attempts: 10,
      backoff: { type: 'exponential', delay: 180_000 },
      removeOnComplete: 100,
      removeOnFail: 200,
    },
  );
}

function payoutFamilyFromChainType(chainType: ChainType): PayoutAuthFamily {
  if (chainType === ChainType.SOLANA) return 'SOLANA';
  if (chainType === ChainType.SUI) return 'SUI';
  return 'EVM';
}

function walletsEqual(family: PayoutAuthFamily, a: string, b: string): boolean {
  if (family === 'EVM') return a.trim().toLowerCase() === b.trim().toLowerCase();
  return a.trim() === b.trim();
}

function parsePayoutEmailLines(raw: unknown): Array<{ recipient: string; email?: string }> {
  if (!Array.isArray(raw) || raw.length === 0) return [];
  const lines: Array<{ recipient: string; email?: string }> = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const rec = item as { recipient?: unknown; email?: unknown };
    if (typeof rec.recipient !== 'string') continue;
    const email = typeof rec.email === 'string' && rec.email.trim() ? rec.email.trim().toLowerCase() : undefined;
    lines.push({ recipient: rec.recipient, ...(email ? { email } : {}) });
  }
  return lines;
}

/**
 * Send payout-received receipts when a payout first becomes EXECUTED.
 * Wallet-only lines with no email are skipped.
 */
export async function enqueuePayoutReceiptEmails(payoutIntentId: string): Promise<void> {
  const db = getDatabaseClient();

  const payout = await db.payoutIntent.findUnique({
    where: { id: payoutIntentId },
    include: {
      app: { select: { id: true, name: true } },
    },
  });
  if (!payout) return;

  const chainId = Number(payout.chain);
  const chainDef = Number.isFinite(chainId) ? CHAIN_BY_ID[chainId] : undefined;
  const family = Number.isFinite(chainId) ? resolveChainTypeFromId(chainId) : 'EVM';

  let tokenSymbol = 'token';
  let amount = payout.tokenAmount;
  try {
    const token = await resolvePayoutToken({
      appId: payout.appId,
      chainId: Number.isFinite(chainId) ? chainId : 0,
      tokenAddress: payout.tokenAddress,
      family,
    });
    tokenSymbol = isNativeToken(payout.tokenAddress)
      ? (chainDef?.nativeCurrency?.symbol ?? token.symbol)
      : token.symbol;
    amount = formatCryptoAmount(payout.tokenAmount, token.decimals);
  } catch {
    /* keep atomic amount + generic symbol */
  }

  const contacts = await db.payoutContact.findMany({
    where: { appId: payout.appId },
    select: { wallet: true, email: true, label: true, family: true },
  });

  const lineRows = parsePayoutEmailLines(payout.lines);
  const targets = lineRows.length
    ? lineRows
    : [{ recipient: payout.recipientWallet, email: payout.recipientEmail ?? undefined }];

  const payoutDate = (payout.executedAt ?? new Date()).toISOString();
  const txHash = payout.txHash ?? undefined;
  const txExplorerUrl = txHash && Number.isFinite(chainId)
    ? blockExplorerTxUrl(chainId, txHash) ?? undefined
    : undefined;

  const seen = new Set<string>();
  let queued = 0;
  let skippedNoEmail = 0;
  let skippedSuppressed = 0;
  let skippedUndeliverable = 0;

  for (const line of targets) {
    const contact = contacts.find(
      (c) => payoutFamilyFromChainType(c.family) === family && walletsEqual(family, c.wallet, line.recipient),
    );
    const email = line.email ?? contact?.email ?? undefined;
    if (!email) {
      skippedNoEmail += 1;
      continue;
    }
    const normalized = email.toLowerCase();
    if (seen.has(normalized)) continue;
    seen.add(normalized);
    if (await isEmailSuppressed(normalized)) {
      skippedSuppressed += 1;
      continue;
    }
    if (!(await emailCanReceiveMail(normalized))) {
      skippedUndeliverable += 1;
      continue;
    }

    const existing = await db.emailDelivery.findFirst({
      where: {
        payoutIntentId: payout.id,
        recipientEmail: normalized,
        templateId: 'payout-received',
        status: { in: ['PENDING', 'SENT', 'DELIVERED'] },
      },
    });
    if (existing) continue;

    const delivery = await db.emailDelivery.create({
      data: {
        payoutIntentId: payout.id,
        templateId: 'payout-received',
        recipientEmail: normalized,
        status: 'PENDING',
      },
    });

    const queue = queueRegistry.getOrCreateQueue<EmailSendJob>(QUEUE_NAMES.EMAIL_SEND);
    await queue.add(
      `payout-${payout.id}-${normalized}`,
      {
        templateId: 'payout-received',
        to: normalized,
        from: emailFrom('transactional'),
        variables: {
          emailDeliveryId: delivery.id,
          merchantName: payout.app.name,
          recipientName: contact?.label,
          recipientWallet: line.recipient,
          amount,
          tokenSymbol,
          chainName: chainDef?.name,
          txHash,
          txExplorerUrl,
          payoutDate,
        },
      },
      {
        attempts: 10,
        backoff: { type: 'exponential', delay: 180_000 },
        removeOnComplete: 100,
        removeOnFail: 200,
      },
    );
    queued += 1;
  }

  if (queued > 0) {
    emailLog.info('Payout receipts queued', {
      payoutIntentId,
      queued,
      skippedNoEmail,
      skippedSuppressed,
      skippedUndeliverable,
    });
  } else if (skippedSuppressed > 0 || skippedUndeliverable > 0) {
    emailLog.info('Payout receipts skipped', {
      payoutIntentId,
      skippedNoEmail,
      skippedSuppressed,
      skippedUndeliverable,
    });
  }
}

import { getDatabaseClient, Prisma } from '@noderails/database';
import { NotFoundError, ValidationError } from '@noderails/common';
import { getVaProvider } from '../factory.js';
import type { VaActivityEvent } from './providers/va-provider.js';

const SURFACE_TYPES = new Set([
  'funds_received',
  'funds_scheduled',
  'payment_submitted',
  'payment_processed',
  'in_review',
  'refunded',
  'refund_in_flight',
  'refund_failed',
  'microdeposit',
]);

export async function persistActivityEvents(virtualAccountId: string, events: VaActivityEvent[]) {
  const db = getDatabaseClient();
  for (const event of events) {
    if (!event.externalEventId) continue;
    await db.fiatVirtualAccountEvent.upsert({
      where: { externalEventId: event.externalEventId },
      create: {
        virtualAccountId,
        externalEventId: event.externalEventId,
        depositId: event.depositId,
        type: event.type,
        amount: event.amount,
        currency: event.currency,
        paymentRail: event.paymentRail,
        senderName: event.senderName,
        senderReference: event.senderReference,
        senderLast4: event.senderLast4,
        developerFee: event.developerFee,
        exchangeFee: event.exchangeFee,
        gasFee: event.gasFee,
        subtotal: event.subtotal,
        destinationTxHash: event.destinationTxHash,
        receipt: (event.receipt ?? undefined) as Prisma.InputJsonValue | undefined,
        source: (event.source ?? undefined) as Prisma.InputJsonValue | undefined,
      },
      update: {
        type: event.type,
        amount: event.amount,
        currency: event.currency,
        paymentRail: event.paymentRail,
        senderName: event.senderName,
        senderReference: event.senderReference,
        senderLast4: event.senderLast4,
        developerFee: event.developerFee,
        exchangeFee: event.exchangeFee,
        gasFee: event.gasFee,
        subtotal: event.subtotal,
        destinationTxHash: event.destinationTxHash,
        receipt: (event.receipt ?? undefined) as Prisma.InputJsonValue | undefined,
        source: (event.source ?? undefined) as Prisma.InputJsonValue | undefined,
      },
    });
  }
}

export function groupActivity(
  events: Array<{
    id: string;
    depositId: string | null;
    type: string;
    amount: string | null;
    currency: string | null;
    paymentRail: string | null;
    senderName: string | null;
    senderReference: string | null;
    senderLast4: string | null;
    developerFee: string | null;
    exchangeFee: string | null;
    gasFee: string | null;
    subtotal: string | null;
    destinationTxHash: string | null;
    createdAt: Date;
  }>,
) {
  const groups = new Map<string, typeof events>();
  for (const event of events) {
    if (event.type === 'microdeposit') continue;
    if (!SURFACE_TYPES.has(event.type) && event.type !== 'funds_received') continue;
    const key = event.depositId ?? event.id;
    const list = groups.get(key) ?? [];
    list.push(event);
    groups.set(key, list);
  }
  return [...groups.entries()].map(([depositId, items]) => {
    const ordered = [...items].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
    const latest = ordered[ordered.length - 1]!;
    const first = ordered[0]!;
    return {
      depositId,
      status: latest.type,
      amount: first.amount ?? latest.amount,
      currency: first.currency ?? latest.currency,
      paymentRail: first.paymentRail ?? latest.paymentRail,
      senderName: first.senderName ?? latest.senderName,
      senderReference: first.senderReference ?? latest.senderReference,
      senderLast4: first.senderLast4 ?? latest.senderLast4,
      developerFee: latest.developerFee,
      exchangeFee: latest.exchangeFee,
      gasFee: latest.gasFee,
      subtotal: latest.subtotal,
      destinationTxHash: latest.type === 'payment_processed' ? latest.destinationTxHash : null,
      createdAt: first.createdAt,
      events: ordered,
    };
  }).sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
}

export async function listAccountActivity(accountId: string) {
  const db = getDatabaseClient();
  const account = await db.fiatVirtualAccount.findUnique({ where: { id: accountId } });
  if (!account) throw new NotFoundError('GlobalBankAccount', accountId);
  if (account.externalCustomerId && account.externalAccountId) {
    try {
      const provider = getVaProvider(account.environment);
      const remote = await provider.listActivity(account.externalCustomerId, account.externalAccountId);
      await persistActivityEvents(account.id, remote);
    } catch {
      // use stored events
    }
  }
  const events = await db.fiatVirtualAccountEvent.findMany({
    where: { virtualAccountId: accountId },
    orderBy: { createdAt: 'desc' },
  });
  return groupActivity(events);
}

export async function applyBridgeActivityWebhook(payload: Record<string, unknown>) {
  const object = (payload.event_object && typeof payload.event_object === 'object')
    ? payload.event_object as Record<string, unknown>
    : payload;
  const virtualAccountId = String(object.virtual_account_id ?? '');
  const eventId = String(object.id ?? payload.event_id ?? '');
  if (!virtualAccountId || !eventId) return false;
  const db = getDatabaseClient();
  const account = await db.fiatVirtualAccount.findFirst({
    where: { externalAccountId: virtualAccountId },
  });
  if (!account) return false;
  const source = (object.source && typeof object.source === 'object')
    ? object.source as Record<string, unknown>
    : null;
  await persistActivityEvents(account.id, [{
    externalEventId: eventId,
    depositId: typeof object.deposit_id === 'string' ? object.deposit_id : null,
    type: String(object.type ?? ''),
    amount: typeof object.amount === 'string' ? object.amount : null,
    currency: typeof object.currency === 'string' ? object.currency : null,
    paymentRail: typeof source?.payment_rail === 'string' ? source.payment_rail : null,
    senderName: typeof source?.sender_name === 'string' ? source.sender_name : null,
    senderReference: typeof source?.reference === 'string' ? source.reference : null,
    senderLast4: typeof source?.last_4 === 'string' ? source.last_4 : null,
    developerFee: typeof object.developer_fee_amount === 'string' ? object.developer_fee_amount : null,
    exchangeFee: typeof object.exchange_fee_amount === 'string' ? object.exchange_fee_amount : null,
    gasFee: typeof object.gas_fee === 'string' ? object.gas_fee : null,
    subtotal: typeof object.subtotal_amount === 'string' ? object.subtotal_amount : null,
    destinationTxHash: typeof object.destination_tx_hash === 'string' ? object.destination_tx_hash : null,
    receipt: object.receipt && typeof object.receipt === 'object' ? object.receipt as Record<string, unknown> : null,
    source,
  }]);
  return true;
}

export async function simulateInbound(accountId: string, environmentMustBeTest: boolean) {
  const db = getDatabaseClient();
  const account = await db.fiatVirtualAccount.findUnique({
    where: { id: accountId },
    include: { profile: true },
  });
  if (!account) throw new NotFoundError('GlobalBankAccount', accountId);
  if (environmentMustBeTest && account.environment !== 'TEST') {
    throw new ValidationError('Simulate inbound is only available in TEST');
  }
  const depositId = `sim_${Date.now()}`;
  const now = new Date();
  await persistActivityEvents(account.id, [
    {
      externalEventId: `${depositId}_received`,
      depositId,
      type: 'funds_received',
      amount: '100.00',
      currency: account.rail,
      paymentRail: 'ach_push',
      senderName: 'Sandbox Sender',
      senderReference: 'TEST inbound',
      senderLast4: '0000',
      developerFee: '0.00',
      exchangeFee: '0.00',
      gasFee: '0.00',
      subtotal: '100.00',
      destinationTxHash: null,
      receipt: null,
      source: { payment_rail: 'ach_push', sender_name: 'Sandbox Sender' },
    },
    {
      externalEventId: `${depositId}_processed`,
      depositId,
      type: 'payment_processed',
      amount: '100.00',
      currency: 'usdc',
      paymentRail: 'ach_push',
      senderName: 'Sandbox Sender',
      senderReference: 'TEST inbound',
      senderLast4: '0000',
      developerFee: '0.00',
      exchangeFee: '0.50',
      gasFee: '0.00',
      subtotal: '99.50',
      destinationTxHash: `0x${'ab'.repeat(32)}`,
      receipt: null,
      source: { payment_rail: 'ach_push', sender_name: 'Sandbox Sender' },
    },
  ]);
  return listAccountActivity(account.id);
}


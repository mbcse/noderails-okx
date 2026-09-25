import { getDatabaseClient, ChainType } from '@noderails/database';
import {
  NotFoundError,
  ValidationError,
  DEFAULT_PAGE_SIZE,
  MAX_PAGE_SIZE,
} from '@noderails/common';
import type { Logger } from '@noderails/service-base';
import { createPayout, resolvePayoutDraft, type PayoutLineInput } from './payout.service.js';
import { assertOptionalEmailsCanReceiveMail } from '../../lib/email-mx.js';
import { requireFamilyAuth } from './payout-auth.service.js';
import {
  enqueuePayoutExecute,
  payoutExecuteJobId,
  payoutJobExists,
  payoutScheduleJobId,
  removePayoutJob,
} from './payout-queue.js';

const MIN_INTERVAL_DAYS = 1;
const MAX_INTERVAL_DAYS = 365;

function addUtcDays(from: Date, days: number): Date {
  return new Date(from.getTime() + days * 86_400_000);
}

function nextFutureSlot(planned: Date, intervalDays: number): Date {
  let next = addUtcDays(planned, intervalDays);
  while (next.getTime() <= Date.now()) {
    next = addUtcDays(next, intervalDays);
  }
  return next;
}

async function scheduleFireJob(
  schedule: { id: string; merchantId: string; chain: string; nextRunAt: Date },
): Promise<string> {
  const jobId = payoutScheduleJobId(schedule.id, schedule.nextRunAt);
  await enqueuePayoutExecute(
    { scheduleId: schedule.id, merchantId: schedule.merchantId, chain: schedule.chain },
    schedule.nextRunAt.getTime() - Date.now(),
    jobId,
  );
  return jobId;
}

export async function createSchedule(input: {
  merchantId: string;
  appId: string;
  chain: string;
  tokenAddress: string;
  lines: PayoutLineInput[];
  intervalDays: number;
  startAt?: string;
}) {
  await assertOptionalEmailsCanReceiveMail(input.lines.map((line) => line.email));
  const db = getDatabaseClient();
  if (
    !Number.isInteger(input.intervalDays)
    || input.intervalDays < MIN_INTERVAL_DAYS
    || input.intervalDays > MAX_INTERVAL_DAYS
  ) {
    throw new ValidationError(`intervalDays must be ${MIN_INTERVAL_DAYS}–${MAX_INTERVAL_DAYS}`);
  }
  if (!input.lines?.length) {
    throw new ValidationError('lines are required');
  }

  const chainIdNum = parseInt(input.chain.trim(), 10);
  const supported = await db.supportedChain.findUnique({ where: { chainId: chainIdNum } });
  if (supported?.chainType === ChainType.SUI) {
    throw new ValidationError('Sui payouts cannot be scheduled yet');
  }

  let nextRunAt = input.startAt ? new Date(input.startAt) : new Date();
  if (Number.isNaN(nextRunAt.getTime())) {
    throw new ValidationError('Invalid startAt');
  }

  const draft = await resolvePayoutDraft({
    merchantId: input.merchantId,
    appId: input.appId,
    chain: input.chain,
    tokenAddress: input.tokenAddress,
    lines: input.lines,
    executeNow: false,
  });

  requireFamilyAuth(draft.app, draft.family);

  const atomicLines = draft.linesJson
    ?? [{ recipient: draft.recipient, amount: draft.tokenAmount }];

  const schedule = await db.payoutSchedule.create({
    data: {
      merchantId: input.merchantId,
      appId: input.appId,
      chain: String(chainIdNum),
      tokenAddress: draft.tokenAddr,
      lines: atomicLines,
      intervalDays: input.intervalDays,
      nextRunAt,
    },
  });

  const jobId = await scheduleFireJob(schedule);
  return db.payoutSchedule.update({
    where: { id: schedule.id },
    data: { pendingJobId: jobId },
  });
}

export async function getSchedule(merchantId: string, scheduleId: string) {
  const db = getDatabaseClient();
  const schedule = await db.payoutSchedule.findUnique({ where: { id: scheduleId } });
  if (!schedule || schedule.merchantId !== merchantId) {
    throw new NotFoundError('PayoutSchedule', scheduleId);
  }
  return schedule;
}

export async function listSchedules(input: {
  merchantId: string;
  appId?: string;
  status?: string;
  page?: number;
  pageSize?: number;
}) {
  const db = getDatabaseClient();
  const page = input.page ?? 1;
  const pageSize = Math.min(input.pageSize ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE);
  const skip = (page - 1) * pageSize;
  const where: Record<string, unknown> = { merchantId: input.merchantId };
  if (input.appId) where.appId = input.appId;
  if (input.status) where.status = input.status;

  const [schedules, total] = await Promise.all([
    db.payoutSchedule.findMany({ where, orderBy: { createdAt: 'desc' }, skip, take: pageSize }),
    db.payoutSchedule.count({ where }),
  ]);
  return { schedules, total, page, pageSize };
}

export async function pauseSchedule(merchantId: string, scheduleId: string) {
  const db = getDatabaseClient();
  const schedule = await getSchedule(merchantId, scheduleId);
  if (schedule.status !== 'ACTIVE') {
    throw new ValidationError(`Cannot pause schedule in ${schedule.status} status`);
  }
  await removePayoutJob(schedule.pendingJobId);
  return db.payoutSchedule.update({
    where: { id: schedule.id },
    data: { status: 'PAUSED', pendingJobId: null },
  });
}

export async function resumeSchedule(merchantId: string, scheduleId: string) {
  const db = getDatabaseClient();
  const schedule = await getSchedule(merchantId, scheduleId);
  if (schedule.status !== 'PAUSED') {
    throw new ValidationError(`Cannot resume schedule in ${schedule.status} status`);
  }
  let nextRunAt = schedule.nextRunAt;
  if (nextRunAt.getTime() <= Date.now()) {
    nextRunAt = new Date();
  }
  const updated = await db.payoutSchedule.update({
    where: { id: schedule.id },
    data: { status: 'ACTIVE', nextRunAt },
  });
  const jobId = await scheduleFireJob(updated);
  return db.payoutSchedule.update({
    where: { id: updated.id },
    data: { pendingJobId: jobId },
  });
}

export async function cancelSchedule(merchantId: string, scheduleId: string) {
  const db = getDatabaseClient();
  const schedule = await getSchedule(merchantId, scheduleId);
  if (schedule.status === 'CANCELLED') {
    throw new ValidationError('Schedule is already cancelled');
  }
  await removePayoutJob(schedule.pendingJobId);
  return db.payoutSchedule.update({
    where: { id: schedule.id },
    data: { status: 'CANCELLED', pendingJobId: null },
  });
}

export async function fireSchedule(scheduleId: string, logger?: Logger) {
  const db = getDatabaseClient();
  const schedule = await db.payoutSchedule.findUnique({ where: { id: scheduleId } });
  if (!schedule) {
    logger?.warn('Payout schedule not found', { scheduleId });
    return;
  }
  if (schedule.status !== 'ACTIVE') {
    logger?.info('Skipping payout schedule not ACTIVE', { scheduleId, status: schedule.status });
    return;
  }

  const lines = Array.isArray(schedule.lines)
    ? (schedule.lines as unknown as PayoutLineInput[])
    : [];

  let lastError: string | null = null;
  try {
    const payout = await createPayout({
      merchantId: schedule.merchantId,
      appId: schedule.appId,
      chain: schedule.chain,
      tokenAddress: schedule.tokenAddress,
      lines,
      executeNow: true,
      scheduleId: schedule.id,
      amountsAreAtomic: true,
      persistFailedOnAuthError: true,
    });
    if (payout.status === 'FAILED') {
      lastError = payout.error ?? 'Payout failed';
    }
  } catch (err) {
    lastError = err instanceof Error ? err.message : String(err);
    logger?.error('Payout schedule fire failed', { scheduleId, error: lastError });
  }

  const latest = await db.payoutSchedule.findUnique({ where: { id: schedule.id } });
  if (!latest || latest.status !== 'ACTIVE') {
    if (latest) {
      await db.payoutSchedule.update({
        where: { id: latest.id },
        data: { lastError, pendingJobId: null },
      });
    }
    return;
  }

  const nextRunAt = nextFutureSlot(latest.nextRunAt, latest.intervalDays);
  const jobId = payoutScheduleJobId(latest.id, nextRunAt);
  await enqueuePayoutExecute(
    { scheduleId: latest.id, merchantId: latest.merchantId, chain: latest.chain },
    nextRunAt.getTime() - Date.now(),
    jobId,
  );

  const claimed = await db.payoutSchedule.updateMany({
    where: { id: latest.id, status: 'ACTIVE' },
    data: { nextRunAt, pendingJobId: jobId, lastError },
  });
  if (claimed.count === 0) {
    await removePayoutJob(jobId);
  }
}

export async function reconcilePayouts(logger: Logger) {
  const db = getDatabaseClient();

  const dueIntents = await db.payoutIntent.findMany({
    where: {
      status: 'SCHEDULED',
      scheduledAt: { lte: new Date() },
    },
  });
  for (const payout of dueIntents) {
    const jobId = payout.pendingJobId ?? payoutExecuteJobId(payout.id);
    if (payout.pendingJobId && await payoutJobExists(payout.pendingJobId)) continue;
    try {
      await enqueuePayoutExecute(
        { payoutIntentId: payout.id, merchantId: payout.merchantId, chain: payout.chain },
        0,
        jobId,
      );
      await db.payoutIntent.update({ where: { id: payout.id }, data: { pendingJobId: jobId } });
      logger.info('Reconciled scheduled payout', { payoutId: payout.id });
    } catch (err) {
      logger.error('Failed to reconcile scheduled payout', { payoutId: payout.id, error: String(err) });
    }
  }

  const futureIntents = await db.payoutIntent.findMany({
    where: {
      status: 'SCHEDULED',
      scheduledAt: { gt: new Date() },
    },
  });
  for (const payout of futureIntents) {
    if (payout.pendingJobId && await payoutJobExists(payout.pendingJobId)) continue;
    if (!payout.scheduledAt) continue;
    const jobId = payoutExecuteJobId(payout.id);
    try {
      await enqueuePayoutExecute(
        { payoutIntentId: payout.id, merchantId: payout.merchantId, chain: payout.chain },
        payout.scheduledAt.getTime() - Date.now(),
        jobId,
      );
      await db.payoutIntent.update({ where: { id: payout.id }, data: { pendingJobId: jobId } });
      logger.info('Reconciled future scheduled payout job', { payoutId: payout.id });
    } catch (err) {
      logger.error('Failed to reconcile future payout', { payoutId: payout.id, error: String(err) });
    }
  }

  const active = await db.payoutSchedule.findMany({ where: { status: 'ACTIVE' } });
  for (const schedule of active) {
    if (schedule.pendingJobId && await payoutJobExists(schedule.pendingJobId)) continue;
    try {
      const jobId = await scheduleFireJob(schedule);
      await db.payoutSchedule.update({ where: { id: schedule.id }, data: { pendingJobId: jobId } });
      logger.info('Reconciled payout schedule', { scheduleId: schedule.id });
    } catch (err) {
      logger.error('Failed to reconcile payout schedule', { scheduleId: schedule.id, error: String(err) });
    }
  }
}

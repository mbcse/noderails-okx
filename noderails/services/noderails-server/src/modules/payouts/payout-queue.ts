import { QUEUE_NAMES } from '@noderails/common';
import { queueRegistry } from '@noderails/queue';
import type { PayoutExecuteJob } from '@noderails/queue';

export function payoutExecuteJobId(payoutIntentId: string): string {
  return `payout-exec-${payoutIntentId}`;
}

export function payoutScheduleJobId(scheduleId: string, nextRunAt: Date): string {
  return `payout-sched-${scheduleId}-${nextRunAt.getTime()}`;
}

export async function enqueuePayoutExecute(
  data: PayoutExecuteJob,
  delayMs: number,
  jobId: string,
): Promise<string> {
  const queue = queueRegistry.getOrCreateQueue<PayoutExecuteJob>(QUEUE_NAMES.PAYOUT_EXECUTE);
  await queue.add(jobId, data, {
    jobId,
    delay: Math.max(0, delayMs),
    removeOnComplete: true,
    removeOnFail: 50,
  });
  return jobId;
}

export async function removePayoutJob(jobId: string | null | undefined): Promise<void> {
  if (!jobId) return;
  const queue = queueRegistry.getOrCreateQueue<PayoutExecuteJob>(QUEUE_NAMES.PAYOUT_EXECUTE);
  try {
    await queue.removeJob(jobId);
  } catch {
    /* already gone */
  }
}

export async function payoutJobExists(jobId: string): Promise<boolean> {
  const queue = queueRegistry.getOrCreateQueue<PayoutExecuteJob>(QUEUE_NAMES.PAYOUT_EXECUTE);
  const job = await queue.getJob(jobId);
  return Boolean(job);
}

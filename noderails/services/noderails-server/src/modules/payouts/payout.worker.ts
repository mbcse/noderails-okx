import { QUEUE_NAMES, WORKER_CONFIG } from '@noderails/common';
import { createWorker, configureQueue } from '@noderails/queue';
import type { PayoutExecuteJob } from '@noderails/queue';
import type { Logger } from '@noderails/service-base';
import { env } from '../../config.js';
import { executePayout } from './payout.service.js';
import { fireSchedule, reconcilePayouts } from './payout-schedule.service.js';

const PAYOUT_RECONCILE_MS = 5 * 60 * 1000;

export function startPayoutWorker(logger: Logger) {
  configureQueue({ redisUrl: env.REDIS_URL });

  const payoutWorker = createWorker<PayoutExecuteJob>(
    QUEUE_NAMES.PAYOUT_EXECUTE,
    async (job) => {
      logger.info('Processing payout execute job', {
        jobId: job.id,
        payoutIntentId: job.data.payoutIntentId,
        scheduleId: job.data.scheduleId,
      });
      if (job.data.scheduleId) {
        await fireSchedule(job.data.scheduleId, logger);
        return;
      }
      if (!job.data.payoutIntentId) {
        logger.warn('Payout job missing payoutIntentId and scheduleId', { jobId: job.id });
        return;
      }
      await executePayout({
        merchantId: job.data.merchantId,
        payoutId: job.data.payoutIntentId,
      });
    },
    { concurrency: WORKER_CONFIG.DEFAULT_CONCURRENCY },
  );

  logger.info('Payout worker started', {
    queue: QUEUE_NAMES.PAYOUT_EXECUTE,
    concurrency: WORKER_CONFIG.DEFAULT_CONCURRENCY,
  });

  const reconcileTimer = setInterval(() => {
    reconcilePayouts(logger).catch((err) => {
      logger.error('Periodic payout reconciliation failed', { error: String(err) });
    });
  }, PAYOUT_RECONCILE_MS);
  reconcileTimer.unref?.();

  return { payoutWorker, reconcileTimer };
}

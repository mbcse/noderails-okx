import prisma from '../lib/prisma.js';
import { settingsService } from './settings.js';

/**
 * Data retention service — periodically compacts old IndexedEvents into
 * lightweight EventTraces and purges the full event data + delivery logs.
 *
 * Runs on a configurable interval (default: every 6 hours).
 * Retention period is configurable via settings (default: 15 days).
 */


class DataRetentionService {
  private timer: ReturnType<typeof setInterval> | null = null;
  private lastIntervalMs: number | null = null;
  private stopped = false;

  /** Start the periodic cleanup timer (live reloads interval) */
  start(): void {
    if (this.timer) return;
    this.stopped = false;
    // Run once immediately on startup (delayed 30s to let indexer warm up)
    setTimeout(() => this.cleanupAndReschedule().catch(console.error), 30_000);
    this.scheduleNext();
    console.log('✅ Data retention service started');
  }

  stop(): void {
    this.stopped = true;
    if (this.timer) {
      clearTimeout(this.timer as any);
      this.timer = null;
    }
    console.log('✅ Data retention service stopped');
  }

  /** Schedule the next cleanup, always using the latest interval */
  private scheduleNext() {
    if (this.stopped) return;
    const intervalMs = settingsService.getNumber('retention.intervalMs', 6 * 60 * 60_000);
    this.lastIntervalMs = intervalMs;
    this.timer = setTimeout(() => this.cleanupAndReschedule().catch(console.error), intervalMs);
  }

  /** Run cleanup, then reschedule timer (live reloads interval) */
  private async cleanupAndReschedule() {
    await this.cleanup();
    this.scheduleNext();
  }

  /** Core cleanup — compact old events into traces, then purge (always reads latest settings) */
  async cleanup(): Promise<void> {
    console.log('🧹 Starting data retention cleanup...');
    const retentionDays = settingsService.getNumber('retention.days', 15);
    const cutoff = new Date(Date.now() - retentionDays * 24 * 60 * 60_000);
    const batchSize = settingsService.getNumber('retention.batchSize', 1000);

    console.log(`🧹 Retention: purging events older than ${cutoff.toISOString()} (${retentionDays} days)`);

    let totalTraced = 0;
    let totalDeleted = 0;

    // Process in batches to avoid memory issues
    while (true) {
      const oldEvents = await prisma.indexedEvent.findMany({
        where: { createdAt: { lt: cutoff } },
        select: {
          id: true,
          subscriptionId: true,
          chainId: true,
          blockNumber: true,
          transactionHash: true,
          logIndex: true,
          createdAt: true,
          subscription: { select: { eventName: true } },
        },
        take: batchSize,
      });

      if (oldEvents.length === 0) break;

      // Insert traces and delete events in a transaction
      await prisma.$transaction(async (tx) => {
        await tx.eventTrace.createMany({
          data: oldEvents.map((ev) => ({
            subscriptionId: ev.subscriptionId,
            chainId: ev.chainId,
            blockNumber: ev.blockNumber,
            transactionHash: ev.transactionHash,
            logIndex: ev.logIndex,
            eventName: ev.subscription.eventName,
            processedAt: ev.createdAt,
          })),
        });
        const eventIds = oldEvents.map((ev) => ev.id);
        await tx.webhookDelivery.deleteMany({
          where: { eventId: { in: eventIds } },
        });
        await tx.indexedEvent.deleteMany({
          where: { id: { in: eventIds } },
        });
      });

      totalTraced += oldEvents.length;
      totalDeleted += oldEvents.length;
    }

    if (totalDeleted > 0) {
      console.log(`🧹 Retention complete: ${totalTraced} events → traces, ${totalDeleted} events + deliveries purged`);
    } else {
      console.log('🧹 Retention: nothing to purge');
    }
  }
}

export const dataRetentionService = new DataRetentionService();

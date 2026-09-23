import { Worker, Job } from 'bullmq';
import { decodeEventLog, AbiEvent } from 'viem';
import redis from '../lib/redis.js';
import prisma from '../lib/prisma.js';
import { config } from '../config/index.js';
import { QUEUE_NAMES, webhookDeliveryQueue } from '../lib/queues.js';
import { settingsService } from './settings.js';
import { matchesFilter, type FilterConditions } from '../lib/filter-match.js';

// ── Types ──────────────────────────────────────────────────────────

interface ProcessEventJobData {
  protocol?: 'evm' | 'solana' | 'sui';
  log?: {
    address: string;
    blockNumber: string;
    blockHash: string;
    transactionHash: string;
    logIndex: number;
    data: string;
    topics: string[];
  };
  chainId: number;
  subscriptionId: string;
  eventName: string;
  abiItem: any;
  contractAddress: string;
  timestamp: number; // epoch ms — already resolved by the indexer loop
  filterConditions?: FilterConditions | null; // from event subscription
  solana?: {
    signature: string;
    slot: number;
    blockTime: number | null;
    instructionIndex: number;
    eventIndex?: number;
    instructionName: string;
    eventName?: string;
    programId: string;
    logMessages: string[];
    accounts: any[];
    transaction: any;
    eventData?: Record<string, any>;
  };
  sui?: {
    digest: string;
    checkpoint: number;
    eventSeq: number;
    packageId: string;
    module: string;
    eventType: string;
    sender: string;
    timestampMs: number;
    parsedJson?: Record<string, unknown>;
    kind: 'event' | 'function';
  };
}

// ── Service ────────────────────────────────────────────────────────

class EventProcessorService {
  private worker: Worker | null = null;

  async start(): Promise<void> {
    if (this.worker) return;

    this.worker = new Worker<ProcessEventJobData>(
      QUEUE_NAMES.PROCESS_EVENT,
      async (job: Job<ProcessEventJobData>) => {
        await this.processEvent(job.data);
      },
      {
        connection: redis,
        concurrency: settingsService.getNumber('eventProcessor.concurrency', 20),
        // Extended lock duration to reduce "Missing lock" / "Lock mismatch" errors
        lockDuration: settingsService.getNumber('eventProcessor.lockDuration', 120000),
      },
    );

    this.worker.on('failed', (job, err) => {
      if (job) {
        console.error(
          `❌ Event processing failed [${job.data.eventName}]:`,
          err.message,
        );
      }
    });

    console.log('✅ Event processor worker started (concurrency: 20)');
  }

  // ── Core processing ────────────────────────────────────────────

  private async processEvent(data: ProcessEventJobData): Promise<void> {
    const {
      protocol,
      log,
      chainId,
      subscriptionId,
      eventName,
      abiItem,
      contractAddress,
      timestamp,
      filterConditions,
      solana,
      sui,
    } = data;

    const args: Record<string, any> = protocol === 'sui' && sui
      ? {
          digest: sui.digest,
          checkpoint: sui.checkpoint,
          eventSeq: sui.eventSeq,
          packageId: sui.packageId,
          module: sui.module,
          eventType: sui.eventType,
          sender: sui.sender,
          timestampMs: sui.timestampMs,
          kind: sui.kind,
          ...(sui.parsedJson ?? {}),
        }
      : protocol === 'solana' && solana
      ? {
          signature: solana.signature,
          slot: solana.slot,
          blockTime: solana.blockTime,
          instructionIndex: solana.instructionIndex,
          eventIndex: solana.eventIndex,
          instructionName: solana.instructionName,
          eventName: solana.eventName,
          programId: solana.programId,
          logMessages: solana.logMessages,
          accounts: solana.accounts,
          transaction: solana.transaction,
          ...(solana.eventData ?? {}),
        }
      : (() => {
          // 1. Decode the raw log
          const decoded = decodeEventLog({
            abi: [abiItem as AbiEvent],
            data: log!.data as `0x${string}`,
            topics: log!.topics as [`0x${string}`, ...`0x${string}`[]],
          });

          // 2. Serialize args (BigInt → string for JSON storage)
          const out: Record<string, any> = {};
          if (decoded.args) {
            for (const [key, value] of Object.entries(
              decoded.args as Record<string, any>,
            )) {
              out[key] = typeof value === 'bigint' ? value.toString() : value;
            }
          }
          return out;
        })();

    if (protocol === 'sui' && sui) {
      console.log(
        `🧩 SUI event ${eventName}: digest=${sui.digest} checkpoint=${sui.checkpoint} seq=${sui.eventSeq} kind=${sui.kind}`,
      );
    }

    if (protocol === 'solana' && solana) {
      console.log(
        `🧩 Solana event ${eventName}: sig=${solana.signature} slot=${solana.slot} ix=${solana.instructionIndex} eventIx=${solana.eventIndex ?? '-'} decoded=${solana.eventName ?? solana.instructionName}`,
      );
    }

    const subscription = await prisma.eventSubscription.findUnique({
      where: { id: subscriptionId },
      select: { id: true },
    });
    if (!subscription) {
      console.warn(`⚠️ Skipping stale queued event ${eventName}: subscription ${subscriptionId} no longer exists`);
      return;
    }

    // 3. Apply event-subscription-level filter — skip entirely if no match
    if (!matchesFilter(args, filterConditions as FilterConditions | null)) {
      if (protocol === 'sui' && sui) {
        console.log(`🧹 SUI event ${eventName}: filtered out by subscription conditions`);
      }
      if (protocol === 'solana' && solana) {
        console.log(`🧹 Solana event ${eventName}: filtered out by subscription conditions`);
      }
      return; // silently skip — event doesn't match the subscription filter
    }

    // 4. Upsert IndexedEvent (handles re-processing gracefully)
    const indexedEvent = await prisma.indexedEvent.upsert({
      where: {
        chainId_transactionHash_logIndex: {
          chainId,
          transactionHash: protocol === 'sui' && sui
            ? sui.digest
            : protocol === 'solana' && solana
              ? solana.signature
              : log!.transactionHash,
          logIndex: protocol === 'sui' && sui
            ? sui.eventSeq
            : protocol === 'solana' && solana
              ? (solana.eventIndex ?? solana.instructionIndex)
              : log!.logIndex,
        },
      },
      create: {
        subscriptionId,
        chainId,
        blockNumber: protocol === 'sui' && sui
          ? BigInt(sui.checkpoint)
          : protocol === 'solana' && solana
            ? BigInt(solana.slot)
            : BigInt(log!.blockNumber),
        blockHash: protocol === 'sui' && sui
          ? sui.digest
          : protocol === 'solana' && solana
            ? (solana.transaction?.message?.recentBlockhash ?? solana.signature)
            : log!.blockHash,
        transactionHash: protocol === 'sui' && sui
          ? sui.digest
          : protocol === 'solana' && solana
            ? solana.signature
            : log!.transactionHash,
        logIndex: protocol === 'sui' && sui
          ? sui.eventSeq
          : protocol === 'solana' && solana
            ? (solana.eventIndex ?? solana.instructionIndex)
            : log!.logIndex,
        args,
        timestamp: new Date(timestamp),
      },
      update: {}, // already exists — skip
    });

    if (protocol === 'sui' && sui) {
      console.log(`✅ SUI event ${eventName}: stored indexed event ${indexedEvent.id}`);
    }

    if (protocol === 'solana' && solana) {
      console.log(`✅ Solana event ${eventName}: stored indexed event ${indexedEvent.id}`);
    }

    // 4. Only fan-out webhooks for freshly created events
    const isNew =
      Date.now() - new Date(indexedEvent.createdAt).getTime() < 5000;
    if (!isNew) return;

    // 5. Find all active webhooks subscribed to this event type
    const webhookSubs = await prisma.webhookSubscription.findMany({
      where: {
        eventSubscriptionId: subscriptionId,
        webhook: { isActive: true },
      },
      include: { webhook: true },
    });

    if (protocol === 'sui' && sui) {
      console.log(`📣 SUI event ${eventName}: fan-out ${webhookSubs.length} webhook subscription(s)`);
    }

    if (protocol === 'solana' && solana) {
      console.log(`📣 Solana event ${eventName}: fan-out ${webhookSubs.length} webhook subscription(s)`);
    }

    if (webhookSubs.length === 0) {
      if (protocol === 'sui' && sui) {
        console.log(`ℹ️ SUI event ${eventName}: no active webhooks subscribed`);
      }
      if (protocol === 'solana' && solana) {
        console.log(`ℹ️ Solana event ${eventName}: no active webhooks subscribed`);
      }
      return;
    }

    const payload = {
      id: indexedEvent.id,
      event: eventName,
      chainId,
      contractAddress,
      blockNumber: protocol === 'sui' && sui
        ? sui.checkpoint
        : protocol === 'solana' && solana
          ? solana.slot
          : Number(log!.blockNumber),
      transactionHash: protocol === 'sui' && sui
        ? sui.digest
        : protocol === 'solana' && solana
          ? solana.signature
          : log!.transactionHash,
      logIndex: protocol === 'sui' && sui
        ? sui.eventSeq
        : protocol === 'solana' && solana
          ? (solana.eventIndex ?? solana.instructionIndex)
          : log!.logIndex,
      args,
      timestamp: new Date(timestamp).toISOString(),
    };

    // 6. Create delivery records + queue webhook jobs
    for (const sub of webhookSubs) {
      const delivery = await prisma.webhookDelivery.create({
        data: {
          webhookId: sub.webhookId,
          eventId: indexedEvent.id,
          status: 'pending',
        },
      });

      await webhookDeliveryQueue.add(
        'deliver',
        {
          webhookId: sub.webhookId,
          eventId: indexedEvent.id,
          nativeTransferId: null,
          deliveryId: delivery.id,
          payload,
          secret: sub.webhook.secret,
          url: sub.webhook.url,
        },
        {
          attempts: settingsService.getNumber('webhook.maxRetries', config.webhook.maxRetries),
          backoff: {
            type: 'exponential',
            delay: settingsService.getNumber('webhook.initialDelay', config.webhook.initialDelay),
          },
        },
      );
    }
  }

  // ── Lifecycle ──────────────────────────────────────────────────

  async stop(): Promise<void> {
    if (this.worker) {
      await this.worker.close();
      this.worker = null;
    }
    console.log('✅ Event processor stopped');
  }
}

export const eventProcessorService = new EventProcessorService();

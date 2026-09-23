import { Worker, Job } from 'bullmq';
import crypto from 'crypto';
import redis from '../lib/redis.js';
import prisma from '../lib/prisma.js';
import { config } from '../config/index.js';
import { QUEUE_NAMES, webhookDeliveryQueue } from '../lib/queues.js';
import { settingsService } from './settings.js';

interface WebhookJobData {
  webhookId: string;
  eventId: string | null;
  nativeTransferId: string | null;
  deliveryId: string;
  payload: any;
  secret: string;
  url: string;
}

function normalizeWebhookPayload(payload: any): any {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return payload;
  }

  const args = payload.args;
  if (!args || typeof args !== 'object' || Array.isArray(args)) {
    return payload;
  }

  const {
    signature,
    slot,
    blockTime,
    instructionIndex,
    eventIndex,
    instructionName,
    eventName,
    programId,
    logMessages,
    accounts,
    transaction,
    ...cleanArgs
  } = args;

  const hasSolanaMetadata =
    typeof signature === 'string' &&
    typeof slot !== 'undefined' &&
    typeof instructionIndex !== 'undefined';

  if (hasSolanaMetadata) {
    // Serialize any BN-like or bigint values in args to plain strings/numbers
    function serializeValue(value: any): any {
      if (typeof value === 'bigint') return value.toString();
      if (value == null) return value;
      if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return value;
      if (typeof value === 'object' && value?._bn && typeof value._bn === 'string') return value._bn;
      if (typeof value?.toString === 'function' && value?.constructor?.name === 'BN') return value.toString();
      if (Array.isArray(value)) return value.map(serializeValue);
      if (typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, serializeValue(v)]));
      return value;
    }

    const serializedArgs = serializeValue(cleanArgs);
    const preferredEvent = payload.event || instructionName || eventName || (serializedArgs && serializedArgs.ix_name) || null;

    return {
      ...payload,
      protocol: 'solana',
      event: preferredEvent ?? payload.event,
      contractAddress: payload.contractAddress || programId || payload.contractAddress,
      chainId: payload.chainId ?? payload.chain ?? undefined,
      blockNumber: payload.blockNumber ?? (typeof slot !== 'undefined' ? Number(slot) : undefined),
      transactionHash: payload.transactionHash || signature || payload.transactionHash,
      args: serializedArgs,
      solana: {
        signature,
        slot: Number(slot),
        blockTime: blockTime == null ? null : Number(blockTime),
        instructionIndex: Number(instructionIndex),
        eventIndex: eventIndex == null ? null : Number(eventIndex),
        instructionName: instructionName ?? eventName ?? null,
        eventName: eventName ?? null,
        programId: programId ?? null,
      },
    };
  }

  const {
    digest,
    checkpoint,
    eventSeq,
    packageId,
    module,
    eventType,
    sender,
    timestampMs,
    kind,
    ...suiCleanArgs
  } = args;

  const hasSuiMetadata =
    typeof digest === 'string' &&
    typeof checkpoint !== 'undefined' &&
    typeof eventSeq !== 'undefined';

  if (hasSuiMetadata) {
    function serializeSuiValue(value: any): any {
      if (typeof value === 'bigint') return value.toString();
      if (value == null) return value;
      if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return value;
      if (Array.isArray(value)) return value.map(serializeSuiValue);
      if (typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, serializeSuiValue(v)]));
      return value;
    }

    const serializedArgs = serializeSuiValue(suiCleanArgs);

    return {
      ...payload,
      protocol: 'sui',
      event: payload.event ?? eventType ?? payload.event,
      contractAddress: payload.contractAddress || packageId,
      blockNumber: payload.blockNumber ?? Number(checkpoint),
      transactionHash: payload.transactionHash || digest,
      logIndex: payload.logIndex ?? Number(eventSeq),
      args: serializedArgs,
      sui: {
        checkpoint: Number(checkpoint),
        packageId: packageId ?? null,
        module: module ?? null,
        eventType: eventType ?? null,
        sender: sender ?? null,
        timestampMs: timestampMs == null ? null : Number(timestampMs),
        kind: kind ?? null,
        digest,
        eventSeq: Number(eventSeq),
      },
    };
  }

  return payload;
}

class WebhookService {
  private worker: Worker | null = null;

  // Start the webhook delivery worker
  async start(): Promise<void> {
    if (this.worker) return;

    this.worker = new Worker<WebhookJobData>(
      QUEUE_NAMES.WEBHOOK_DELIVERY,
      async (job: Job<WebhookJobData>) => {
        await this.deliverWebhook(job);
      },
      {
        connection: redis,
        concurrency: settingsService.getNumber('webhook.concurrency', 10),
        // Increase lock duration to avoid "lock mismatch" errors when jobs
        // take longer than the default lock time. Configurable via settings.
        lockDuration: settingsService.getNumber('webhook.lockDuration', 120000),
      }
    );

    this.worker.on('completed', async (job) => {
      console.log(`✅ Webhook delivered: ${job.data.deliveryId}`);
    });

    this.worker.on('failed', async (job, err) => {
      if (job) {
        console.error(`❌ Webhook failed: ${job.data.deliveryId}`, err.message);
        
        // Update delivery status if all retries exhausted
        if (job.attemptsMade >= (job.opts.attempts || 5)) {
          await this.markDeliveryFailed(
            job.data.deliveryId,
            err.message,
            job.attemptsMade
          );
        }
      }
    });

    console.log('✅ Webhook delivery worker started');
  }

  // Deliver a single webhook
  private async deliverWebhook(job: Job<WebhookJobData>): Promise<void> {
    const { webhookId, eventId, nativeTransferId, deliveryId, payload, secret, url } = job.data;
    const eventOrTransferId = eventId ?? nativeTransferId ?? '';
    const normalizedPayload = normalizeWebhookPayload(payload);

    // Generate HMAC signature
    const timestamp = Date.now().toString();
    const signaturePayload = `${timestamp}.${JSON.stringify(normalizedPayload)}`;
    const signature = crypto
      .createHmac('sha256', secret)
      .update(signaturePayload)
      .digest('hex');

    // Prepare headers
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'X-Indexer-Signature': signature,
      'X-Indexer-Timestamp': timestamp,
      'X-Indexer-Event-Id': eventOrTransferId,
      'X-Indexer-Delivery-Id': deliveryId,
    };

    try {
      // Make HTTP request
      const controller = new AbortController();
      const timeoutMs = settingsService.getNumber('webhook.timeout', config.webhook.timeout);
      const timeout = setTimeout(
        () => controller.abort(),
        timeoutMs
      );

      const response = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify(normalizedPayload),
        signal: controller.signal,
      });

      clearTimeout(timeout);

      // Update delivery record
      await prisma.webhookDelivery.update({
        where: { id: deliveryId },
        data: {
          status: response.ok ? 'delivered' : 'failed',
          attempts: job.attemptsMade + 1,
          lastAttemptAt: new Date(),
          responseCode: response.status,
          errorMessage: response.ok
            ? null
            : `HTTP ${response.status}: ${response.statusText}`,
        },
      });

      // Throw error to trigger retry if not successful
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
    } catch (error: any) {
      // Update delivery attempt
      await prisma.webhookDelivery.update({
        where: { id: deliveryId },
        data: {
          attempts: job.attemptsMade + 1,
          lastAttemptAt: new Date(),
          errorMessage: error.message,
        },
      });

      throw error; // Re-throw to trigger BullMQ retry
    }
  }

  // Mark delivery as permanently failed
  private async markDeliveryFailed(
    deliveryId: string,
    errorMessage: string,
    attempts: number
  ): Promise<void> {
    await prisma.webhookDelivery.update({
      where: { id: deliveryId },
      data: {
        status: 'failed',
        attempts,
        lastAttemptAt: new Date(),
        errorMessage: `All retries exhausted: ${errorMessage}`,
      },
    });
  }

  // Retry a failed delivery
  async retryDelivery(deliveryId: string): Promise<void> {
    const delivery = await prisma.webhookDelivery.findUnique({
      where: { id: deliveryId },
      include: {
        webhook: true,
        event: {
          include: {
            subscription: {
              include: {
                contract: true,
              },
            },
          },
        },
        nativeTransfer: true,
      },
    });

    if (!delivery) {
      throw new Error('Delivery not found');
    }

    // Reset delivery status
    await prisma.webhookDelivery.update({
      where: { id: deliveryId },
      data: {
        status: 'pending',
        attempts: 0,
        errorMessage: null,
      },
    });

    let payload: any;
    if (delivery.nativeTransferId && delivery.nativeTransfer) {
      const nt = delivery.nativeTransfer;
      payload = {
        type: 'native_transfer',
        id: nt.id,
        chainId: nt.chainId,
        blockNumber: Number(nt.blockNumber),
        blockHash: nt.blockHash,
        transactionHash: nt.transactionHash,
        from: nt.from,
        to: nt.to,
        value: nt.value,
        timestamp: nt.timestamp.toISOString(),
      };
    } else if (delivery.eventId && delivery.event) {
      const e = delivery.event;
      payload = {
        id: e.id,
        event: e.subscription.eventName,
        chainId: e.chainId,
        contractAddress: e.subscription.contract.address,
        blockNumber: Number(e.blockNumber),
        transactionHash: e.transactionHash,
        logIndex: e.logIndex,
        args: e.args,
        timestamp: e.timestamp.toISOString(),
      };
    } else {
      throw new Error('Delivery has no event or native transfer');
    }

    await webhookDeliveryQueue.add(
      'deliver',
      {
        webhookId: delivery.webhookId,
        eventId: delivery.eventId ?? null,
        nativeTransferId: delivery.nativeTransferId ?? null,
        deliveryId: delivery.id,
        payload,
        secret: delivery.webhook.secret,
        url: delivery.webhook.url,
      },
      {
        attempts: settingsService.getNumber('webhook.maxRetries', config.webhook.maxRetries),
        backoff: {
          type: 'exponential',
          delay: settingsService.getNumber('webhook.initialDelay', config.webhook.initialDelay),
        },
      }
    );
  }

  async retriggerEvent(eventId: string): Promise<{ queued: number; webhookIds: string[] }> {
    const event = await prisma.indexedEvent.findUnique({
      where: { id: eventId },
      include: {
        subscription: {
          include: {
            contract: true,
          },
        },
      },
    });

    if (!event) {
      throw new Error('Event not found');
    }

    const webhookSubs = await prisma.webhookSubscription.findMany({
      where: {
        eventSubscriptionId: event.subscriptionId,
        webhook: { isActive: true },
      },
      include: { webhook: true },
    });

    if (webhookSubs.length === 0) {
      throw new Error('No active webhooks subscribed to this event');
    }

    const payload = {
      id: event.id,
      event: event.subscription.eventName,
      chainId: event.chainId,
      contractAddress: event.subscription.contract.address,
      blockNumber: Number(event.blockNumber),
      transactionHash: event.transactionHash,
      logIndex: event.logIndex,
      args: event.args,
      timestamp: event.timestamp.toISOString(),
    };

    const webhookIds: string[] = [];
    const queueOptions = {
      attempts: settingsService.getNumber('webhook.maxRetries', config.webhook.maxRetries),
      backoff: {
        type: 'exponential' as const,
        delay: settingsService.getNumber('webhook.initialDelay', config.webhook.initialDelay),
      },
    };

    for (const sub of webhookSubs) {
      const delivery = await prisma.webhookDelivery.create({
        data: {
          webhookId: sub.webhookId,
          eventId: event.id,
          status: 'pending',
        },
      });

      await webhookDeliveryQueue.add(
        'deliver',
        {
          webhookId: sub.webhookId,
          eventId: event.id,
          nativeTransferId: null,
          deliveryId: delivery.id,
          payload,
          secret: sub.webhook.secret,
          url: sub.webhook.url,
        },
        queueOptions,
      );

      webhookIds.push(sub.webhookId);
    }

    return { queued: webhookIds.length, webhookIds };
  }

  // Stop the worker
  async stop(): Promise<void> {
    if (this.worker) {
      await this.worker.close();
      this.worker = null;
      console.log('✅ Webhook delivery worker stopped');
    }
  }
}

export const webhookService = new WebhookService();

// Utility function to verify webhook signature (for receivers)
export function verifyWebhookSignature(
  payload: string,
  timestamp: string,
  signature: string,
  secret: string,
  maxAge: number = 300000 // 5 minutes
): boolean {
  // Check timestamp is recent
  const now = Date.now();
  const signatureTime = parseInt(timestamp, 10);
  if (Math.abs(now - signatureTime) > maxAge) {
    return false;
  }

  // Verify signature
  const expectedSignature = crypto
    .createHmac('sha256', secret)
    .update(`${timestamp}.${payload}`)
    .digest('hex');

  return crypto.timingSafeEqual(
    Buffer.from(signature),
    Buffer.from(expectedSignature)
  );
}

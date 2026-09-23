import { Queue } from 'bullmq';
import redis from './redis.js';

// Queue names — two dedicated queues for the entire pipeline
export const QUEUE_NAMES = {
  PROCESS_EVENT: 'process-event',
  WEBHOOK_DELIVERY: 'webhook-delivery',
} as const;

// Matched logs land here for decoding, DB storage, and webhook fan-out
export const processEventQueue = new Queue(QUEUE_NAMES.PROCESS_EVENT, {
  connection: redis,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: 'exponential', delay: 1000 },
    removeOnComplete: 500,
    removeOnFail: 1000,
  },
});

// Individual webhook HTTP deliveries
export const webhookDeliveryQueue = new Queue(QUEUE_NAMES.WEBHOOK_DELIVERY, {
  connection: redis,
  defaultJobOptions: {
    attempts: 5,
    backoff: { type: 'exponential', delay: 1000 },
    removeOnComplete: 500,
    removeOnFail: 1000,
  },
});

console.log('✅ BullMQ queues initialized (process-event, webhook-delivery)');

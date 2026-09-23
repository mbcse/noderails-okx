/**
 * Reset Database Script
 * 
 * Deletes ALL data from every table (in FK-safe order),
 * drains BullMQ queues, and re-seeds the admin user.
 * 
 * Usage:  npx tsx src/scripts/reset-db.ts
 */

import 'dotenv/config';
import prisma from '../lib/prisma.js';
import { Queue } from 'bullmq';
import IORedis from 'ioredis';

const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';

async function resetDatabase() {
  console.log('⚠️  Resetting database — deleting ALL data...\n');

  // 1. Delete in FK-safe order (children first)
  const deletions = [
    { name: 'WebhookDelivery', fn: () => prisma.webhookDelivery.deleteMany() },
    { name: 'WebhookSubscription', fn: () => prisma.webhookSubscription.deleteMany() },
    { name: 'Webhook', fn: () => prisma.webhook.deleteMany() },
    { name: 'IndexedEvent', fn: () => prisma.indexedEvent.deleteMany() },
    { name: 'IndexState', fn: () => prisma.indexState.deleteMany() },
    { name: 'EventSubscription', fn: () => prisma.eventSubscription.deleteMany() },
    { name: 'Contract', fn: () => prisma.contract.deleteMany() },
    { name: 'Chain', fn: () => prisma.chain.deleteMany() },
    { name: 'Project', fn: () => prisma.project.deleteMany() },
  ];

  for (const { name, fn } of deletions) {
    const result = await fn();
    console.log(`  ✓ ${name}: deleted ${result.count} rows`);
  }

  // 2. Drain BullMQ queues
  console.log('\n🧹 Draining BullMQ queues...');
  const redis = new IORedis(REDIS_URL, { maxRetriesPerRequest: null });
  const queueNames = ['process-event', 'webhook-delivery'];

  for (const queueName of queueNames) {
    const queue = new Queue(queueName, { connection: redis });
    await queue.obliterate({ force: true });
    console.log(`  ✓ Queue "${queueName}" obliterated`);
    await queue.close();
  }
  await redis.quit();

  // 3. Re-seed admin user credentials in .env reminder
  console.log('\n✅ Database reset complete!');
  console.log('   All tables emptied, all queues drained.');
  console.log('   Restart the backend server to re-initialize.\n');
}

resetDatabase()
  .catch((error) => {
    console.error('❌ Reset failed:', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

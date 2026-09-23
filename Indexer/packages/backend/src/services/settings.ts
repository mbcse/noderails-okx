import prisma from '../lib/prisma.js';
import { config } from '../config/index.js';

// ── Default settings definitions ────────────────────────────────

interface SettingDef {
  key: string;
  value: string;
  type: 'string' | 'number' | 'boolean';
  category: string;
  label: string;
  description: string;
}

const DEFAULTS: SettingDef[] = [
  // ── Indexer ──────────────────────────────────────────────────
  {
    key: 'indexer.blockRange',
    value: String(config.indexer.blockRange),
    type: 'number',
    category: 'indexer',
    label: 'Block Range',
    description: 'Number of blocks to fetch per batch (eth_getLogs range). Lower = less RPC load, higher = faster catch-up.',
  },
  {
    key: 'indexer.pollInterval',
    value: String(config.indexer.pollInterval),
    type: 'number',
    category: 'indexer',
    label: 'Poll Interval (ms)',
    description: 'How often each chain loop checks for new blocks when idle.',
  },
  {
    key: 'indexer.cacheTtl',
    value: '60000',
    type: 'number',
    category: 'indexer',
    label: 'Contract Cache TTL (ms)',
    description: 'How long the indexer caches active contracts before reloading from DB.',
  },

  // ── Event Processing ─────────────────────────────────────────
  {
    key: 'eventProcessor.concurrency',
    value: '20',
    type: 'number',
    category: 'eventProcessor',
    label: 'Worker Concurrency',
    description: 'Number of events processed in parallel by the BullMQ worker. Requires restart.',
  },

  // ── Webhook Delivery ─────────────────────────────────────────
  {
    key: 'webhook.concurrency',
    value: '10',
    type: 'number',
    category: 'webhook',
    label: 'Delivery Concurrency',
    description: 'Number of webhook deliveries processed in parallel. Requires restart.',
  },
  {
    key: 'webhook.maxRetries',
    value: String(config.webhook.maxRetries),
    type: 'number',
    category: 'webhook',
    label: 'Max Retries',
    description: 'Maximum number of retry attempts for failed webhook deliveries.',
  },
  {
    key: 'webhook.initialDelay',
    value: String(config.webhook.initialDelay),
    type: 'number',
    category: 'webhook',
    label: 'Initial Retry Delay (ms)',
    description: 'Base delay for exponential backoff on webhook retries.',
  },
  {
    key: 'webhook.maxDelay',
    value: String(config.webhook.maxDelay),
    type: 'number',
    category: 'webhook',
    label: 'Max Retry Delay (ms)',
    description: 'Maximum delay cap for exponential backoff.',
  },
  {
    key: 'webhook.timeout',
    value: String(config.webhook.timeout),
    type: 'number',
    category: 'webhook',
    label: 'Request Timeout (ms)',
    description: 'How long to wait for a webhook endpoint to respond before aborting.',
  },

  // ── Queue Settings ───────────────────────────────────────────
  {
    key: 'queue.processEvent.attempts',
    value: '3',
    type: 'number',
    category: 'queue',
    label: 'Event Queue Max Attempts',
    description: 'Max attempts for event processing jobs before marking as failed.',
  },
  {
    key: 'queue.processEvent.backoffDelay',
    value: '1000',
    type: 'number',
    category: 'queue',
    label: 'Event Queue Backoff Delay (ms)',
    description: 'Base delay for exponential backoff on event processing retries.',
  },
  {
    key: 'queue.webhookDelivery.attempts',
    value: '5',
    type: 'number',
    category: 'queue',
    label: 'Webhook Queue Max Attempts',
    description: 'Max attempts for webhook delivery jobs before marking as failed.',
  },
  {
    key: 'queue.webhookDelivery.backoffDelay',
    value: '1000',
    type: 'number',
    category: 'queue',
    label: 'Webhook Queue Backoff Delay (ms)',
    description: 'Base delay for exponential backoff on webhook delivery retries.',
  },
  {
    key: 'queue.removeOnComplete',
    value: '500',
    type: 'number',
    category: 'queue',
    label: 'Remove On Complete',
    description: 'Number of completed jobs to keep in Redis. Lower = less memory.',
  },
  {
    key: 'queue.removeOnFail',
    value: '1000',
    type: 'number',
    category: 'queue',
    label: 'Remove On Fail',
    description: 'Number of failed jobs to keep in Redis for inspection.',
  },

  {
    key: 'sui.pollInterval',
    value: String(config.indexer.pollInterval),
    type: 'number',
    category: 'sui',
    label: 'SUI Poll Interval (ms)',
    description: 'How often each SUI chain loop checks for new checkpoints when idle.',
  },
  {
    key: 'sui.checkpointRange',
    value: '500',
    type: 'number',
    category: 'sui',
    label: 'SUI Checkpoint Range',
    description: 'Maximum checkpoint span processed per indexer batch.',
  },
  {
    key: 'sui.graphqlPageSize',
    value: '50',
    type: 'number',
    category: 'sui',
    label: 'SUI GraphQL Page Size',
    description: 'Number of events or transactions fetched per GraphQL/JSON-RPC page.',
  },

  // ── Data Retention ───────────────────────────────────────────
  {
    key: 'retention.days',
    value: '15',
    type: 'number',
    category: 'retention',
    label: 'Retention Days',
    description: 'Number of days to keep full event data. Events older than this are compacted into traces.',
  },
  {
    key: 'retention.intervalMs',
    value: '21600000',
    type: 'number',
    category: 'retention',
    label: 'Cleanup Interval (ms)',
    description: 'How often the retention cleanup runs. Default: 6 hours (21600000 ms).',
  },
  {
    key: 'retention.batchSize',
    value: '1000',
    type: 'number',
    category: 'retention',
    label: 'Cleanup Batch Size',
    description: 'Number of old events to process per batch during cleanup.',
  },
];

// ── Settings Service ────────────────────────────────────────────

class SettingsService {
  private cache: Map<string, string> = new Map();
  private loaded = false;

  /** Seed defaults (only inserts missing keys), then load all into cache */
  async init(): Promise<void> {
    // Upsert each default so new keys get added on upgrade
    for (const def of DEFAULTS) {
      await prisma.setting.upsert({
        where: { key: def.key },
        create: def,
        update: {
          // Update metadata but NOT the value (user may have changed it)
          type: def.type,
          category: def.category,
          label: def.label,
          description: def.description,
        },
      });
    }
    await this.reload();
    console.log(`✅ Settings loaded (${this.cache.size} keys)`);
  }

  /** Reload all settings from DB into memory */
  async reload(): Promise<void> {
    const rows = await prisma.setting.findMany();
    this.cache.clear();
    for (const row of rows) {
      this.cache.set(row.key, row.value);
    }
    this.loaded = true;
  }

  /** Get a setting value with type coercion */
  getString(key: string, fallback: string = ''): string {
    return this.cache.get(key) ?? fallback;
  }

  getNumber(key: string, fallback: number = 0): number {
    const val = this.cache.get(key);
    if (val === undefined) return fallback;
    const num = Number(val);
    return isNaN(num) ? fallback : num;
  }

  getBoolean(key: string, fallback: boolean = false): boolean {
    const val = this.cache.get(key);
    if (val === undefined) return fallback;
    return val === 'true' || val === '1';
  }

  /** Update a single setting and refresh cache */
  async set(key: string, value: string): Promise<void> {
    await prisma.setting.update({
      where: { key },
      data: { value },
    });
    this.cache.set(key, value);
  }

  /** Bulk update settings and refresh cache */
  async setMany(updates: Record<string, string>): Promise<void> {
    await prisma.$transaction(
      Object.entries(updates).map(([key, value]) =>
        prisma.setting.update({
          where: { key },
          data: { value },
        }),
      ),
    );
    for (const [key, value] of Object.entries(updates)) {
      this.cache.set(key, value);
    }
  }

  /** Get all settings grouped by category */
  async getAll(): Promise<Record<string, any[]>> {
    const rows = await prisma.setting.findMany({
      orderBy: [{ category: 'asc' }, { key: 'asc' }],
    });
    const grouped: Record<string, any[]> = {};
    for (const row of rows) {
      if (!grouped[row.category]) grouped[row.category] = [];
      grouped[row.category].push({
        key: row.key,
        value: row.value,
        type: row.type,
        label: row.label,
        description: row.description,
      });
    }
    return grouped;
  }
}

export const settingsService = new SettingsService();

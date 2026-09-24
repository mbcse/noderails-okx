import { Redis } from 'ioredis';
import { createLogger } from './logger.js';

let client: Redis | null = null;
let lastErrorCode: string | null = null;
const logger = createLogger('redis');

export function createRedisClient(url: string): Redis {
  if (client) return client;

  const isTls = url.startsWith('rediss://');
  client = new Redis(url, {
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
    lazyConnect: false,
    ...(isTls && { tls: { rejectUnauthorized: true } }),
    retryStrategy(times: number) {
      return Math.min(times * 50, 5000);
    },
  });

  client.on('error', (err: Error) => {
    const code = (err as NodeJS.ErrnoException).code ?? 'UNKNOWN';
    if (code !== lastErrorCode) {
      lastErrorCode = code;
      logger.error('connection error', { code, message: err.message });
    }
  });

  client.on('connect', () => {
    lastErrorCode = null;
    logger.info('connected');
  });

  return client;
}

export function getRedis(): Redis {
  if (!client) throw new Error('Redis not initialised');
  return client;
}

export async function disconnectRedis(): Promise<void> {
  if (client) {
    await client.quit();
    client = null;
  }
}

export type { Redis };

import { getDatabaseClient } from '../../lib/db.js';
import { getRedis } from '../../lib/redis.js';
import * as chainService from '../chains/chain.service.js';
import { getAllAdapters } from '../prices/sources/index.js';

export interface HealthReport {
  status: 'ok' | 'degraded';
  db: boolean;
  redis: boolean;
  rpcEndpoints: {
    total: number;
    healthy: number;
    unhealthy: number;
    unknown: number;
  };
  priceSources: {
    total: number;
    enabled: number;
    registered: number;
  };
  ts: string;
}

export async function getHealthReport(): Promise<HealthReport> {
  const db = getDatabaseClient();
  const redis = getRedis();

  let dbOk = false;
  let redisOk = false;

  try {
    await db.$queryRaw`SELECT 1`;
    dbOk = true;
  } catch {
    dbOk = false;
  }

  try {
    await redis.ping();
    redisOk = true;
  } catch {
    redisOk = false;
  }

  const [rpcTotal, rpcHealthy, rpcUnhealthy, rpcUnknown, priceSources] = await Promise.all([
    db.rpcEndpoint.count(),
    db.rpcEndpoint.count({ where: { lastHealthStatus: 'HEALTHY' } }),
    db.rpcEndpoint.count({ where: { lastHealthStatus: 'UNHEALTHY' } }),
    db.rpcEndpoint.count({ where: { lastHealthStatus: 'UNKNOWN' } }),
    chainService.listPriceSources(),
  ]);
  const registered = getAllAdapters().length;

  return {
    status: dbOk && redisOk ? 'ok' : 'degraded',
    db: dbOk,
    redis: redisOk,
    rpcEndpoints: {
      total: rpcTotal,
      healthy: rpcHealthy,
      unhealthy: rpcUnhealthy,
      unknown: rpcUnknown,
    },
    priceSources: {
      total: priceSources.length,
      enabled: priceSources.filter((s) => s.isEnabled).length,
      registered,
    },
    ts: new Date().toISOString(),
  };
}

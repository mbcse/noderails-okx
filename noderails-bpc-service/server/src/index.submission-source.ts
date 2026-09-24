import cookieParser from 'cookie-parser';
import { createApp, attachErrorHandler } from './lib/app.js';
import { createLogger } from './lib/logger.js';
import { createDatabaseClient, disconnectDatabase } from './lib/db.js';
import { createRedisClient, disconnectRedis } from './lib/redis.js';
import { createRateLimiter } from './lib/rate-limit.js';
import { gracefulShutdown } from './lib/shutdown.js';
import { env } from './config.js';
import { openApiSpec } from './openapi.js';

import balanceRoutes from './modules/balance/balance.routes.js';
import priceRoutes from './modules/prices/price.routes.js';
import adminRoutes from './modules/admin/admin.routes.js';
import healthRoutes from './modules/health/health.routes.js';

const logger = createLogger('bpc-server', env.LOG_LEVEL);

async function main() {
  const db = createDatabaseClient();
  logger.info('Database connected');

  createRedisClient(env.REDIS_URL);
  logger.info('Redis connected', {
    url: env.REDIS_URL.replace(/:[^:@/]+@/, ':***@'),
  });

  const enabledPriceSources = await db.priceSource.count({ where: { isEnabled: true } });
  logger.info('Price engine config', {
    cacheTtlSec: env.PRICE_CACHE_TTL_SEC,
    maxStaleSec: env.PRICE_MAX_STALENESS_SEC,
    enabledPriceSources,
  });

  const app = createApp({ logger, corsOrigin: env.CORS_ORIGIN });
  app.use(cookieParser());

  const publicRateLimit = createRateLimiter(env.RATE_LIMIT_WINDOW_MS, env.RATE_LIMIT_MAX);
  app.use('/v1', publicRateLimit);

  app.use('/v1/balance', balanceRoutes);
  app.use('/v1/prices', priceRoutes);
  app.use('/v1/health', healthRoutes);
  app.use('/admin', adminRoutes);

  app.get('/v1/openapi.json', (_req, res) => {
    res.json(openApiSpec);
  });

  attachErrorHandler(app, logger);

  const server = app.listen(env.PORT, () => {
    logger.info('BPC server listening', { port: env.PORT });
  });

  gracefulShutdown(server, logger, async () => {
    await disconnectRedis();
    await disconnectDatabase();
  });
}

main().catch((err) => {
  logger.error('Fatal startup error', { error: String(err) });
  process.exit(1);
});

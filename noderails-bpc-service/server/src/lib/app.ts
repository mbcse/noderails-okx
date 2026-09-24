import express from 'express';
import cors from 'cors';
import type { Logger } from './logger.js';
import { requestId } from './request-id.js';
import { errorHandler } from './error-handler.js';

export interface AppOptions {
  logger: Logger;
  corsOrigin?: string | string[];
  bodyLimit?: string;
}

export function createApp(options: AppOptions): express.Express {
  const { logger, corsOrigin, bodyLimit } = options;
  const app = express();

  app.set('trust proxy', 1);

  app.use((_req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('X-XSS-Protection', '0');
    res.removeHeader('X-Powered-By');
    next();
  });

  app.use(requestId());
  app.use(cors({ origin: corsOrigin ?? '*', credentials: true }));
  app.use(express.json({ limit: bodyLimit ?? '1mb' }));

  app.get('/health', (_req, res) => {
    res.json({ status: 'ok', ts: new Date().toISOString() });
  });

  app.use((req, res, next) => {
    const start = Date.now();
    res.on('finish', () => {
      const ms = Date.now() - start;
      const path = req.originalUrl || req.path;
      const isHealth = path === '/health' || path.startsWith('/v1/health');

      if (isHealth) return;

      const meta = {
        method: req.method,
        path,
        status: res.statusCode,
        ms,
        requestId: req.requestId,
      };

      if (ms >= 3000 || res.statusCode >= 500) {
        logger.warn('slow or failed request', meta);
      } else if (res.statusCode >= 400) {
        logger.warn('request', meta);
      } else {
        logger.info('request', meta);
      }
    });
    next();
  });

  return app;
}

export function attachErrorHandler(app: express.Express, logger: Logger): void {
  app.use((_req, res) => {
    res.status(404).json({
      success: false,
      error: { code: 'NOT_FOUND', message: 'Route not found' },
    });
  });
  app.use(errorHandler(logger));
}

import type { Server } from 'http';
import type { Logger } from './logger.js';

export function gracefulShutdown(
  server: Server,
  logger: Logger,
  cleanup: () => Promise<void>,
): void {
  let shuttingDown = false;

  async function shutdown(signal: string) {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.info('Shutting down', { signal });

    server.close(async () => {
      try {
        await cleanup();
        logger.info('Shutdown complete');
        process.exit(0);
      } catch (err) {
        logger.error('Shutdown error', { error: String(err) });
        process.exit(1);
      }
    });

    setTimeout(() => {
      logger.error('Forced shutdown after timeout');
      process.exit(1);
    }, 10_000).unref();
  }

  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));
}

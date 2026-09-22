import { config } from "./config/index.js";
import { logger } from "./lib/logger.js";
import { createApp } from "./app.js";
import { prisma } from "./config/database.js";
import { redis } from "./config/redis.js";
import { startAllWorkers, stopAllWorkers } from "./queues/index.js";
import { scanForStuckTransactions } from "./queues/tx-stuck-resolver.js";
import { settingsService } from "./services/settings.service.js";
import { fundingService } from "./services/funding.service.js";

// ────────────────────────────────────────────────────────────
// Server entry — boots Express, BullMQ workers, graceful stop
// ────────────────────────────────────────────────────────────

async function main() {
  const app = createApp();

  // Seed default settings into DB (upserts — won't overwrite user values)
  await settingsService.seedDefaults();

  // Start BullMQ workers
  startAllWorkers();
  logger.info("all BullMQ workers started");

  // Start periodic stuck-tx scanner (interval is configurable via settings)
  const stuckScanIntervalMs = await settingsService.get<number>("stuckResolver.scanIntervalMs");
  const stuckScanTimer = setInterval(async () => {
    try {
      await scanForStuckTransactions();
    } catch (err) {
      logger.error({ err }, "stuck-tx scanner failed");
    }
  }, stuckScanIntervalMs);

  // Start periodic funding scanner (checks signer balances, funds low ones)
  const fundingIntervalMs = await settingsService.get<number>("funding.checkIntervalMs");
  const fundingScanTimer = setInterval(async () => {
    try {
      await fundingService.scanAndFund();
    } catch (err) {
      logger.error({ err }, "funding scanner failed");
    }
  }, fundingIntervalMs);

  // Start HTTP server
  const server = app.listen(config.port, () => {
    logger.info(
      { port: config.port, env: config.nodeEnv },
      "server listening",
    );
  });

  // ── Graceful shutdown ──────────────────────────────────────

  let shuttingDown = false;
  const signals: NodeJS.Signals[] = ["SIGINT", "SIGTERM"];

  for (const signal of signals) {
    process.on(signal, async () => {
      if (shuttingDown) return; // prevent double-shutdown
      shuttingDown = true;

      logger.info({ signal }, "received shutdown signal");

      // Stop periodic scanners
      clearInterval(stuckScanTimer);
      clearInterval(fundingScanTimer);

      // Stop accepting new connections
      server.close(() => logger.info("http server closed"));

      // Drain BullMQ workers & close queue connections
      await stopAllWorkers();
      logger.info("all BullMQ workers stopped");

      // Close database pool
      await prisma.$disconnect();
      logger.info("database disconnected");

      // Gracefully close Redis (flush pending commands then close)
      await redis.quit();
      logger.info("redis disconnected");

      process.exit(0);
    });
  }
}

main().catch((err) => {
  logger.fatal(err, "failed to start server");
  process.exit(1);
});

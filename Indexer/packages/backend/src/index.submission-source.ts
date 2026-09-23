import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import { config } from './config/index.js';
import { errorHandler } from './middleware/auth.js';

// Routes
import authRoutes from './routes/auth.js';
import chainRoutes from './routes/chains.js';
import projectRoutes from './routes/projects.js';
import contractRoutes from './routes/contracts.js';
import webhookRoutes from './routes/webhooks.js';
import eventRoutes from './routes/events.js';
import healthRoutes from './routes/health.js';
import settingsRoutes from './routes/settings.js';
import projectApiRoutes from './routes/project-api.js';
import watchedAddressesRoutes from './routes/watched-addresses.js';
import nativeTransfersRoutes from './routes/native-transfers.js';

// Services
import { rpcManager } from './services/rpc-manager.js';
import { indexerService } from './services/indexer.js';
import { nativeIndexerService } from './services/native-indexer.js';
import { solanaIndexerService } from './services/solana-indexer.js';
import { suiIndexerService } from './services/sui-indexer.js';
import { suiNativeIndexerService } from './services/sui-native-indexer.js';
import { eventProcessorService } from './services/event-processor.js';
import { webhookService } from './services/webhook.js';
import { settingsService } from './services/settings.js';
import { dataRetentionService } from './services/data-retention.js';

const app = express();

// Middleware
app.use(helmet());
app.use(cors({
  origin: true, // allow any origin (reflects request Origin)
  credentials: true,
}));
app.use(express.json({ limit: '10mb' })); // Allow large ABIs
app.use(morgan(config.isDev ? 'dev' : 'combined'));

// Health check (before auth)
app.use('/api/health', healthRoutes);

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/admin/chains', chainRoutes);
app.use('/api/admin/projects', projectRoutes);
app.use('/api/admin/contracts', contractRoutes);
app.use('/api/admin/webhooks', webhookRoutes);
app.use('/api/admin/settings', settingsRoutes);
app.use('/api/admin/watched-addresses', watchedAddressesRoutes);

// Project-scoped public API
app.use('/api/project', projectApiRoutes);

app.use('/api/events', eventRoutes);
app.use('/api/native-transfers', nativeTransfersRoutes);

// Error handler
app.use(errorHandler);

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: 'Route not found',
  });
});

// Start server
async function start() {
  try {
    console.log('🚀 Starting Noderails Indexer...');

    // Seed / load platform settings from DB
    await settingsService.init();

    // Initialize RPC manager with all chains
    await rpcManager.initAllChains();

    // Start indexer while-loops (one per chain)
    await indexerService.start();

    // Start native transfer indexer (one loop per chain)
    await nativeIndexerService.start();

    // Start Solana program indexer (one loop per Solana chain)
    await solanaIndexerService.start();

    // Start SUI package indexer + native SUI transfer indexer
    await suiIndexerService.start();
    await suiNativeIndexerService.start();

    // Start event processor worker (decodes logs → DB → webhook fan-out)
    await eventProcessorService.start();

    // Start webhook delivery worker
    await webhookService.start();

    // Start data retention cleanup (compacts old events into traces)
    dataRetentionService.start();

    // Start HTTP server
    app.listen(config.port, () => {
      console.log(`✅ Server running on http://localhost:${config.port}`);
      console.log(`📊 Health check: http://localhost:${config.port}/api/health`);
    });
  } catch (error) {
    console.error('❌ Failed to start server:', error);
    process.exit(1);
  }
}

// Graceful shutdown
async function shutdown() {
  console.log('\n🛑 Shutting down...');

  try {
    await indexerService.stop();
    await nativeIndexerService.stop();
    await solanaIndexerService.stop();
    await suiIndexerService.stop();
    await suiNativeIndexerService.stop();
    await eventProcessorService.stop();
    await webhookService.stop();
    dataRetentionService.stop();
    rpcManager.stopHealthChecks();
    
    const { prisma } = await import('./lib/prisma.js');
    await prisma.$disconnect();
    
    const { redis } = await import('./lib/redis.js');
    await redis.quit();

    console.log('✅ Shutdown complete');
    process.exit(0);
  } catch (error) {
    console.error('Error during shutdown:', error);
    process.exit(1);
  }
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

start();

export default app;

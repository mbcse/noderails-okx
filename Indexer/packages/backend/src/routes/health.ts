import { Router, Request, Response } from 'express';
import prisma from '../lib/prisma.js';
import { rpcManager } from '../services/rpc-manager.js';
import { processEventQueue, webhookDeliveryQueue } from '../lib/queues.js';
import { adminAuth } from '../middleware/auth.js';

const router = Router();

// GET /api/health - Basic health check (public)
router.get('/', async (req: Request, res: Response) => {
  try {
    await prisma.$queryRaw`SELECT 1`;

    res.json({
      success: true,
      status: 'healthy',
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    res.status(503).json({
      success: false,
      status: 'unhealthy',
      error: 'Database connection failed',
    });
  }
});

// GET /api/health/detailed - Detailed health check (admin only)
router.get('/detailed', adminAuth, async (req: Request, res: Response) => {
  try {
    // Database check
    const dbStart = Date.now();
    await prisma.$queryRaw`SELECT 1`;
    const dbLatency = Date.now() - dbStart;

    // Queue stats for the two pipelines
    const [processEventStats, webhookStats] = await Promise.all([
      Promise.all([
        processEventQueue.getWaitingCount(),
        processEventQueue.getActiveCount(),
        processEventQueue.getCompletedCount(),
        processEventQueue.getFailedCount(),
      ]),
      Promise.all([
        webhookDeliveryQueue.getWaitingCount(),
        webhookDeliveryQueue.getActiveCount(),
        webhookDeliveryQueue.getCompletedCount(),
        webhookDeliveryQueue.getFailedCount(),
      ]),
    ]);

    // Chain health
    const activeChains = await prisma.chain.findMany({
      where: { isActive: true },
      select: { chainId: true, name: true },
    });

    const chainHealth = activeChains.map((chain) => ({
      chainId: chain.chainId,
      name: chain.name,
      ...rpcManager.getChainHealth(chain.chainId),
    }));

    // Counts
    const [projectCount, contractCount, eventCount, webhookCount] =
      await Promise.all([
        prisma.project.count(),
        prisma.contract.count(),
        prisma.indexedEvent.count(),
        prisma.webhook.count(),
      ]);

    res.json({
      success: true,
      status: 'healthy',
      timestamp: new Date().toISOString(),
      database: {
        status: 'connected',
        latency: dbLatency,
      },
      queues: {
        processEvent: {
          waiting: processEventStats[0],
          active: processEventStats[1],
          completed: processEventStats[2],
          failed: processEventStats[3],
        },
        webhookDelivery: {
          waiting: webhookStats[0],
          active: webhookStats[1],
          completed: webhookStats[2],
          failed: webhookStats[3],
        },
      },
      chains: chainHealth,
      counts: {
        projects: projectCount,
        contracts: contractCount,
        indexedEvents: eventCount,
        webhooks: webhookCount,
      },
    });
  } catch (error) {
    console.error('Health check error:', error);
    res.status(503).json({
      success: false,
      status: 'unhealthy',
      error: 'Health check failed',
    });
  }
});

export default router;

import { Router, Request, Response } from 'express';
import prisma from '../lib/prisma.js';
import { projectAuth, adminAuth } from '../middleware/auth.js';
import { webhookService } from '../services/webhook.js';

const router = Router();

// GET /api/events - Get events (supports both admin and project auth)
router.get('/', async (req: Request, res: Response) => {
  try {
    // Check for admin token or project API key
    const authHeader = req.headers.authorization;
    const apiKey = req.headers['x-api-key'] as string;

    let projectId: string | undefined;

    if (apiKey) {
      const project = await prisma.project.findUnique({
        where: { apiKey },
        select: { id: true, isActive: true },
      });

      if (!project || !project.isActive) {
        return res.status(401).json({
          success: false,
          error: 'Invalid or inactive API key',
        });
      }
      projectId = project.id;
    } else if (!authHeader?.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        error: 'Authentication required (API key or admin token)',
      });
    }

    const {
      contractId,
      eventName,
      chainId,
      fromBlock,
      toBlock,
      limit = '10',
      offset = '0',
    } = req.query;

    // Build where clause
    const where: any = {};

    if (contractId) {
      where.subscription = { contractId: contractId as string };
    }

    if (eventName) {
      where.subscription = {
        ...where.subscription,
        eventName: eventName as string,
      };
    }

    if (chainId) {
      where.chainId = parseInt(chainId as string, 10);
    }

    if (fromBlock) {
      where.blockNumber = { gte: BigInt(fromBlock as string) };
    }

    if (toBlock) {
      where.blockNumber = {
        ...where.blockNumber,
        lte: BigInt(toBlock as string),
      };
    }

    // If using project auth, filter to project's contracts only
    if (projectId) {
      where.subscription = {
        ...where.subscription,
        contract: { projectId },
      };
    }

    const limitNum = Math.min(parseInt(limit as string, 10), 100);
    const offsetNum = parseInt(offset as string, 10);

    const [events, total] = await Promise.all([
      prisma.indexedEvent.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: limitNum,
        skip: offsetNum,
        include: {
          subscription: {
            select: {
              eventName: true,
              eventSignature: true,
              contract: {
                select: {
                  name: true,
                  address: true,
                  chainId: true,
                  chain: {
                    select: { name: true },
                  },
                },
              },
            },
          },
        },
      }),
      prisma.indexedEvent.count({ where }),
    ]);

    // Format response
    const formattedEvents = events.map((event) => ({
      id: event.id,
      eventName: event.subscription.eventName,
      eventSignature: event.subscription.eventSignature,
      contractName: event.subscription.contract.name,
      contractAddress: event.subscription.contract.address,
      chainId: event.chainId,
      chainName: event.subscription.contract.chain.name,
      blockNumber: Number(event.blockNumber),
      blockHash: event.blockHash,
      transactionHash: event.transactionHash,
      logIndex: event.logIndex,
      args: event.args,
      timestamp: event.timestamp,
      createdAt: event.createdAt,
    }));

    res.json({
      success: true,
      data: formattedEvents,
      total,
      limit: limitNum,
      offset: offsetNum,
    });
  } catch (error) {
    console.error('Error fetching events:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch events',
    });
  }
});

// POST /api/events/:id/retrigger-webhooks — admin only
router.post('/:id/retrigger-webhooks', adminAuth, async (req: Request, res: Response) => {
  try {
    const result = await webhookService.retriggerEvent(req.params.id);
    res.json({
      success: true,
      data: { queued: result.queued },
    });
  } catch (error: any) {
    const message = error?.message || 'Failed to retrigger webhooks';
    const status =
      message === 'Event not found' ? 404
      : message === 'No active webhooks subscribed to this event' ? 400
      : 500;
    if (status === 500) {
      console.error('Error retriggering webhooks:', error);
    }
    res.status(status).json({
      success: false,
      error: message,
    });
  }
});

// GET /api/events/:id - Get event by ID
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const event = await prisma.indexedEvent.findUnique({
      where: { id: req.params.id },
      include: {
        subscription: {
          include: {
            contract: {
              select: {
                name: true,
                address: true,
                chainId: true,
                chain: { select: { name: true } },
              },
            },
          },
        },
        webhookDeliveries: {
          select: {
            id: true,
            status: true,
            attempts: true,
            lastAttemptAt: true,
            responseCode: true,
            webhook: {
              select: { name: true, url: true },
            },
          },
        },
      },
    });

    if (!event) {
      return res.status(404).json({
        success: false,
        error: 'Event not found',
      });
    }

    res.json({
      success: true,
      data: {
        id: event.id,
        eventName: event.subscription.eventName,
        eventSignature: event.subscription.eventSignature,
        contractName: event.subscription.contract.name,
        contractAddress: event.subscription.contract.address,
        chainId: event.chainId,
        chainName: event.subscription.contract.chain.name,
        blockNumber: Number(event.blockNumber),
        blockHash: event.blockHash,
        transactionHash: event.transactionHash,
        logIndex: event.logIndex,
        args: event.args,
        timestamp: event.timestamp,
        createdAt: event.createdAt,
        webhookDeliveries: event.webhookDeliveries,
      },
    });
  } catch (error) {
    console.error('Error fetching event:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch event',
    });
  }
});

// GET /api/events/contract/:contractId - Get last N events for contract
router.get('/contract/:contractId', async (req: Request, res: Response) => {
  try {
    const { limit = '10' } = req.query;
    const limitNum = Math.min(parseInt(limit as string, 10), 100);

    const events = await prisma.indexedEvent.findMany({
      where: {
        subscription: { contractId: req.params.contractId },
      },
      orderBy: { createdAt: 'desc' },
      take: limitNum,
      include: {
        subscription: {
          select: {
            eventName: true,
            eventSignature: true,
          },
        },
      },
    });

    res.json({
      success: true,
      data: events.map((event) => ({
        id: event.id,
        eventName: event.subscription.eventName,
        blockNumber: Number(event.blockNumber),
        transactionHash: event.transactionHash,
        args: event.args,
        timestamp: event.timestamp,
      })),
    });
  } catch (error) {
    console.error('Error fetching contract events:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch contract events',
    });
  }
});

export default router;

import { Router, Request, Response } from 'express';
import { z } from 'zod';
import crypto from 'crypto';
import prisma from '../lib/prisma.js';
import { adminAuth } from '../middleware/auth.js';
import { webhookService } from '../services/webhook.js';

const router = Router();

// Apply admin auth to all routes
router.use(adminAuth);

// Validation schemas
const createWebhookSchema = z.object({
  projectId: z.string().uuid(),
  name: z.string().min(1).max(100),
  url: z.string().url(),
  eventSubscriptionIds: z.array(z.string().uuid()).optional(),
  subscribeNative: z.boolean().optional(),
  nativeChainId: z.number().int().positive().nullable().optional(),
});

const updateWebhookSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  url: z.string().url().optional(),
  isActive: z.boolean().optional(),
  subscribeNative: z.boolean().optional(),
  nativeChainId: z.number().int().positive().nullable().optional(),
});

// Generate secure webhook secret
function generateSecret(): string {
  return crypto.randomBytes(32).toString('hex');
}

async function sendPing(webhookId: string) {
  const webhook = await prisma.webhook.findUnique({
    where: { id: webhookId },
  });

  if (!webhook) {
    return { notFound: true as const };
  }

  const timestamp = Date.now();
  const payload = {
    type: 'ping',
    timestamp,
    message:
      'Test delivery from Noderails Indexer. If you receive this, your webhook URL is reachable.',
  };
  const body = JSON.stringify(payload);
  const signature = crypto
    .createHmac('sha256', webhook.secret)
    .update(`${timestamp}.${body}`)
    .digest('hex');

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);

  const response = await fetch(webhook.url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Indexer-Signature': signature,
      'X-Indexer-Timestamp': String(timestamp),
      'X-Indexer-Event-Id': 'ping',
      'X-Indexer-Delivery-Id': `ping-${timestamp}`,
    },
    body,
    signal: controller.signal,
  });

  clearTimeout(timeout);

  const ok = response.status >= 200 && response.status < 300;
  return {
    notFound: false as const,
    url: webhook.url,
    statusCode: response.status,
    success: ok,
    error: ok ? null : `Webhook URL returned ${response.status}. Expected 2xx.`,
  };
}

// GET /api/admin/webhooks - List all webhooks
router.get('/', async (req: Request, res: Response) => {
  try {
    const { projectId } = req.query;
    
    const where: any = {};
    if (projectId) where.projectId = projectId as string;

    const webhooks = await prisma.webhook.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: {
        project: {
          select: { id: true, name: true },
        },
        subscriptions: {
          include: {
            eventSubscription: {
              select: {
                id: true,
                eventName: true,
                contract: {
                  select: { name: true, address: true },
                },
              },
            },
          },
        },
        _count: {
          select: {
            deliveries: true,
            subscriptions: true,
          },
        },
      },
    });

    res.json({
      success: true,
      data: webhooks,
    });
  } catch (error) {
    console.error('Error fetching webhooks:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch webhooks',
    });
  }
});

// GET /api/admin/webhooks/:id - Get webhook by ID
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const webhook = await prisma.webhook.findUnique({
      where: { id: req.params.id },
      include: {
        project: {
          select: { id: true, name: true },
        },
        subscriptions: {
          include: {
            eventSubscription: {
              include: {
                contract: {
                  select: { id: true, name: true, address: true, chainId: true },
                },
              },
            },
          },
        },
        deliveries: {
          take: 20,
          orderBy: { createdAt: 'desc' },
          include: {
            event: {
              select: {
                id: true,
                transactionHash: true,
                blockNumber: true,
              },
            },
            nativeTransfer: {
              select: {
                id: true,
                transactionHash: true,
                blockNumber: true,
                chainId: true,
                from: true,
                to: true,
                value: true,
              },
            },
          },
        },
      },
    });

    if (!webhook) {
      return res.status(404).json({
        success: false,
        error: 'Webhook not found',
      });
    }

    // Serialize BigInt and optional event/nativeTransfer in deliveries
    const serializedWebhook = {
      ...webhook,
      deliveries: webhook.deliveries.map((d) => ({
        ...d,
        event: d.event ? {
          ...d.event,
          blockNumber: Number(d.event.blockNumber),
        } : null,
        nativeTransfer: d.nativeTransfer ? {
          ...d.nativeTransfer,
          blockNumber: Number(d.nativeTransfer.blockNumber),
        } : null,
      })),
    };

    res.json({
      success: true,
      data: serializedWebhook,
    });
  } catch (error) {
    console.error('Error fetching webhook:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch webhook',
    });
  }
});

// POST /api/admin/webhooks/:id/ping - Send a test payload to the webhook URL
router.post('/:id/ping', async (req: Request, res: Response) => {
  try {
    const result = await sendPing(req.params.id);
    if (result.notFound) {
      return res.status(404).json({
        success: false,
        error: 'Webhook not found',
      });
    }
    res.json({
      success: true,
      data: result,
    });
  } catch (error: any) {
    const message = error?.name === 'AbortError' ? 'Request timed out after 15s' : (error?.message || 'Request failed');
    res.status(502).json({
      success: false,
      error: message,
    });
  }
});

// Backwards-compatible alias for older admin UIs
// POST /api/admin/webhooks/:id/test
router.post('/:id/test', async (req: Request, res: Response) => {
  try {
    const result = await sendPing(req.params.id);
    if (result.notFound) {
      return res.status(404).json({
        success: false,
        error: 'Webhook not found',
      });
    }
    res.json({
      success: true,
      data: result,
    });
  } catch (error: any) {
    const message = error?.name === 'AbortError' ? 'Request timed out after 15s' : (error?.message || 'Request failed');
    res.status(502).json({
      success: false,
      error: message,
    });
  }
});

// POST /api/admin/webhooks - Create new webhook
router.post('/', async (req: Request, res: Response) => {
  try {
    const validation = createWebhookSchema.safeParse(req.body);
    
    if (!validation.success) {
      return res.status(400).json({
        success: false,
        error: 'Validation failed',
        details: validation.error.errors,
      });
    }

    const { projectId, name, url, eventSubscriptionIds, subscribeNative, nativeChainId } = validation.data;

    // Verify project exists
    const project = await prisma.project.findUnique({
      where: { id: projectId },
    });

    if (!project) {
      return res.status(404).json({
        success: false,
        error: 'Project not found',
      });
    }

    const secret = generateSecret();

    const webhook = await prisma.$transaction(async (tx) => {
      const newWebhook = await tx.webhook.create({
        data: {
          projectId,
          name,
          url,
          secret,
          subscribeNative: subscribeNative ?? false,
          nativeChainId: nativeChainId ?? null,
        },
      });

      // Create webhook subscriptions if event IDs provided
      if (eventSubscriptionIds && eventSubscriptionIds.length > 0) {
        await tx.webhookSubscription.createMany({
          data: eventSubscriptionIds.map((eventSubId) => ({
            webhookId: newWebhook.id,
            eventSubscriptionId: eventSubId,
          })),
        });
      }

      return tx.webhook.findUnique({
        where: { id: newWebhook.id },
        include: {
          subscriptions: {
            include: {
              eventSubscription: {
                select: { eventName: true },
              },
            },
          },
        },
      });
    });

    res.status(201).json({
      success: true,
      data: webhook,
      message: 'Webhook created. Save the secret for signature verification!',
    });
  } catch (error) {
    console.error('Error creating webhook:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to create webhook',
    });
  }
});

// PUT /api/admin/webhooks/:id - Update webhook
router.put('/:id', async (req: Request, res: Response) => {
  try {
    const validation = updateWebhookSchema.safeParse(req.body);
    
    if (!validation.success) {
      return res.status(400).json({
        success: false,
        error: 'Validation failed',
        details: validation.error.errors,
      });
    }

    const webhook = await prisma.webhook.findUnique({
      where: { id: req.params.id },
    });

    if (!webhook) {
      return res.status(404).json({
        success: false,
        error: 'Webhook not found',
      });
    }

    const updated = await prisma.webhook.update({
      where: { id: req.params.id },
      data: validation.data,
    });

    res.json({
      success: true,
      data: updated,
      message: 'Webhook updated successfully',
    });
  } catch (error) {
    console.error('Error updating webhook:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update webhook',
    });
  }
});

// DELETE /api/admin/webhooks/:id - Delete webhook
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const webhook = await prisma.webhook.findUnique({
      where: { id: req.params.id },
    });

    if (!webhook) {
      return res.status(404).json({
        success: false,
        error: 'Webhook not found',
      });
    }

    await prisma.webhook.delete({
      where: { id: req.params.id },
    });

    res.json({
      success: true,
      message: 'Webhook deleted successfully',
    });
  } catch (error) {
    console.error('Error deleting webhook:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to delete webhook',
    });
  }
});

// PUT /api/admin/webhooks/:id/subscriptions - Sync webhook event subscriptions (full replace)
router.put('/:id/subscriptions', async (req: Request, res: Response) => {
  try {
    const { eventSubscriptionIds } = req.body;

    if (!Array.isArray(eventSubscriptionIds)) {
      return res.status(400).json({
        success: false,
        error: 'eventSubscriptionIds array is required',
      });
    }

    const webhook = await prisma.webhook.findUnique({
      where: { id: req.params.id },
    });

    if (!webhook) {
      return res.status(404).json({
        success: false,
        error: 'Webhook not found',
      });
    }

    // Full sync: delete all existing, then create new ones
    await prisma.$transaction(async (tx) => {
      await tx.webhookSubscription.deleteMany({
        where: { webhookId: webhook.id },
      });

      if (eventSubscriptionIds.length > 0) {
        await tx.webhookSubscription.createMany({
          data: eventSubscriptionIds.map((eventSubId: string) => ({
            webhookId: webhook.id,
            eventSubscriptionId: eventSubId,
          })),
        });
      }
    });

    const updated = await prisma.webhook.findUnique({
      where: { id: req.params.id },
      include: {
        subscriptions: {
          include: {
            eventSubscription: {
              select: { eventName: true },
            },
          },
        },
      },
    });

    res.json({
      success: true,
      data: updated,
      message: `Subscriptions updated (${eventSubscriptionIds.length} events)`,
    });
  } catch (error) {
    console.error('Error syncing webhook subscriptions:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to sync subscriptions',
    });
  }
});

// POST /api/admin/webhooks/:id/events/:eventSubId - Subscribe to single event
router.post('/:id/events/:eventSubId', async (req: Request, res: Response) => {
  try {
    const { id, eventSubId } = req.params;

    const webhook = await prisma.webhook.findUnique({
      where: { id },
    });

    if (!webhook) {
      return res.status(404).json({
        success: false,
        error: 'Webhook not found',
      });
    }

    // Create subscription (skip if exists)
    await prisma.webhookSubscription.upsert({
      where: {
        webhookId_eventSubscriptionId: {
          webhookId: id,
          eventSubscriptionId: eventSubId,
        },
      },
      create: {
        webhookId: id,
        eventSubscriptionId: eventSubId,
      },
      update: {},
    });

    res.json({
      success: true,
      message: 'Event subscription added',
    });
  } catch (error) {
    console.error('Error subscribing webhook to event:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to subscribe webhook',
    });
  }
});

// DELETE /api/admin/webhooks/:id/events/:eventSubId - Unsubscribe from single event
router.delete('/:id/events/:eventSubId', async (req: Request, res: Response) => {
  try {
    const { id, eventSubId } = req.params;

    await prisma.webhookSubscription.deleteMany({
      where: {
        webhookId: id,
        eventSubscriptionId: eventSubId,
      },
    });

    res.json({
      success: true,
      message: 'Event subscription removed',
    });
  } catch (error) {
    console.error('Error unsubscribing webhook from event:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to unsubscribe webhook',
    });
  }
});

// POST /api/admin/webhooks/:id/subscribe - Subscribe to events
router.post('/:id/subscribe', async (req: Request, res: Response) => {
  try {
    const { eventSubscriptionIds } = req.body;

    if (!Array.isArray(eventSubscriptionIds) || eventSubscriptionIds.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'eventSubscriptionIds array is required',
      });
    }

    const webhook = await prisma.webhook.findUnique({
      where: { id: req.params.id },
    });

    if (!webhook) {
      return res.status(404).json({
        success: false,
        error: 'Webhook not found',
      });
    }

    // Create subscriptions (skip duplicates)
    await prisma.webhookSubscription.createMany({
      data: eventSubscriptionIds.map((eventSubId: string) => ({
        webhookId: webhook.id,
        eventSubscriptionId: eventSubId,
      })),
      skipDuplicates: true,
    });

    const updated = await prisma.webhook.findUnique({
      where: { id: req.params.id },
      include: {
        subscriptions: {
          include: {
            eventSubscription: {
              select: { eventName: true },
            },
          },
        },
      },
    });

    res.json({
      success: true,
      data: updated,
      message: 'Subscriptions added',
    });
  } catch (error) {
    console.error('Error subscribing webhook:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to subscribe webhook',
    });
  }
});

// DELETE /api/admin/webhooks/:id/subscribe/:subscriptionId - Unsubscribe from event
router.delete('/:id/subscribe/:subscriptionId', async (req: Request, res: Response) => {
  try {
    await prisma.webhookSubscription.delete({
      where: { id: req.params.subscriptionId },
    });

    res.json({
      success: true,
      message: 'Subscription removed',
    });
  } catch (error) {
    console.error('Error unsubscribing webhook:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to unsubscribe webhook',
    });
  }
});

// POST /api/admin/webhooks/:id/regenerate-secret - Regenerate webhook secret
router.post('/:id/regenerate-secret', async (req: Request, res: Response) => {
  try {
    const webhook = await prisma.webhook.findUnique({
      where: { id: req.params.id },
    });

    if (!webhook) {
      return res.status(404).json({
        success: false,
        error: 'Webhook not found',
      });
    }

    const newSecret = generateSecret();

    const updated = await prisma.webhook.update({
      where: { id: req.params.id },
      data: { secret: newSecret },
    });

    res.json({
      success: true,
      data: { secret: updated.secret },
      message: 'Secret regenerated. Update your webhook handler!',
    });
  } catch (error) {
    console.error('Error regenerating secret:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to regenerate secret',
    });
  }
});

// POST /api/admin/webhooks/:id/deliveries/:deliveryId/retry - Retry a failed delivery
router.post('/:id/deliveries/:deliveryId/retry', async (req: Request, res: Response) => {
  try {
    const { deliveryId } = req.params;
    await webhookService.retryDelivery(deliveryId);
    res.json({
      success: true,
      message: 'Retry queued',
    });
  } catch (error: any) {
    console.error('Error retrying delivery:', error);
    res.status(error?.message === 'Delivery not found' ? 404 : 500).json({
      success: false,
      error: error?.message || 'Failed to retry delivery',
    });
  }
});

// GET /api/admin/webhooks/:id/deliveries - Get delivery history
router.get('/:id/deliveries', async (req: Request, res: Response) => {
  try {
    const { status, limit = '50', offset = '0' } = req.query;

    const where: any = { webhookId: req.params.id };
    if (status) where.status = status as string;

    const [deliveries, total] = await Promise.all([
      prisma.webhookDelivery.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: parseInt(limit as string, 10),
        skip: parseInt(offset as string, 10),
        include: {
          event: {
            select: {
              id: true,
              transactionHash: true,
              blockNumber: true,
              subscription: {
                select: { eventName: true },
              },
            },
          },
        },
      }),
      prisma.webhookDelivery.count({ where }),
    ]);

    res.json({
      success: true,
      data: deliveries,
      total,
      limit: parseInt(limit as string, 10),
      offset: parseInt(offset as string, 10),
    });
  } catch (error) {
    console.error('Error fetching deliveries:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch deliveries',
    });
  }
});

export default router;

import { prisma } from "../config/database.js";
import { generateWebhookSecret, generateDeliveryId } from "../lib/crypto.js";
import { webhookDeliveryQueue } from "../queues/index.js";
import { NotFoundError } from "../lib/errors.js";
import { logger } from "../lib/logger.js";
import type { Transaction } from "../generated/prisma/client.js";

// ────────────────────────────────────────────────────────────
// Webhook service
//
// Responsible for:
//   - CRUD on webhook endpoints
//   - Emitting webhook events (enqueuing delivery jobs)
//   - Test ping
//   - Secret rotation
// ────────────────────────────────────────────────────────────

export const webhookService = {
  // ── CRUD ──────────────────────────────────────────────────

  async listByProject(projectId: string) {
    return prisma.webhookEndpoint.findMany({
      where: { projectId },
      omit: { secret: true },
      orderBy: { createdAt: "desc" },
    });
  },

  async getById(projectId: string, webhookId: string) {
    const endpoint = await prisma.webhookEndpoint.findFirst({
      where: { id: webhookId, projectId },
      omit: { secret: true },
    });
    if (!endpoint) throw new NotFoundError("Webhook endpoint");
    return endpoint;
  },

  async create(
    projectId: string,
    data: { url: string; events: string[] },
  ) {
    const webhook = await prisma.webhookEndpoint.create({
      data: {
        projectId,
        url: data.url,
        events: data.events,
        secret: generateWebhookSecret(),
      },
    });
    // Return secret ONLY on creation (user copies it now, never shown again)
    return webhook;
  },

  async update(
    projectId: string,
    webhookId: string,
    data: { url?: string; events?: string[]; isActive?: boolean },
  ) {
    return prisma.webhookEndpoint.update({
      where: { id: webhookId, projectId },
      data,
      omit: { secret: true },
    });
  },

  async delete(projectId: string, webhookId: string) {
    await prisma.webhookEndpoint.delete({
      where: { id: webhookId, projectId },
    });
  },

  async rotateSecret(projectId: string, webhookId: string) {
    const newSecret = generateWebhookSecret();
    await prisma.webhookEndpoint.update({
      where: { id: webhookId, projectId },
      data: { secret: newSecret },
    });
    return { secret: newSecret };
  },

  // ── Delivery log ──────────────────────────────────────────

  async getDeliveries(
    projectId: string,
    webhookId: string,
    filters?: { event?: string; statusCode?: number; page?: number; limit?: number },
  ) {
    // Verify the endpoint belongs to the project
    await this.getById(projectId, webhookId);

    const page = filters?.page ?? 1;
    const limit = filters?.limit ?? 20;
    const skip = (page - 1) * limit;

    const where: Record<string, unknown> = { endpointId: webhookId };
    if (filters?.event) where.event = filters.event;
    if (filters?.statusCode) where.statusCode = filters.statusCode;

    const [data, total] = await Promise.all([
      prisma.webhookDelivery.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip,
        take: limit,
      }),
      prisma.webhookDelivery.count({ where }),
    ]);

    return { data, total, page, limit, totalPages: Math.ceil(total / limit) };
  },

  // ── Test ping ─────────────────────────────────────────────

  async sendTestPing(projectId: string, webhookId: string) {
    const endpoint = await this.getById(projectId, webhookId);

    const deliveryId = generateDeliveryId();
    const payload = {
      event: "ping",
      timestamp: new Date().toISOString(),
      data: { message: "Test webhook delivery from MultichainTxManager" },
    };

    const delivery = await prisma.webhookDelivery.create({
      data: {
        id: deliveryId,
        endpointId: webhookId,
        event: "ping",
        payload,
      },
    });

    await webhookDeliveryQueue.add("deliver", {
      deliveryId: delivery.id,
      endpointId: endpoint.id,
      url: endpoint.url,
      event: "ping",
      payload,
    });

    return delivery;
  },

  // ── Event emission (called by queue workers on status change) ──

  async retryDelivery(projectId: string, webhookId: string, deliveryId: string) {
    // Verify endpoint belongs to the project
    const endpoint = await prisma.webhookEndpoint.findFirst({
      where: { id: webhookId, projectId },
    });
    if (!endpoint) throw new NotFoundError("Webhook endpoint");

    const delivery = await prisma.webhookDelivery.findFirst({
      where: { id: deliveryId, endpointId: webhookId },
    });
    if (!delivery) throw new NotFoundError("Webhook delivery");

    // Reset failure counter for the endpoint so backoff restarts fresh
    await prisma.$transaction([
      prisma.webhookEndpoint.update({
        where: { id: webhookId },
        data: { failureCount: 0 },
      }),
      prisma.webhookDelivery.update({
        where: { id: deliveryId },
        data: { error: null, nextRetryAt: null },
      }),
    ]);

    // Re-enqueue the delivery
    await webhookDeliveryQueue.add("deliver", {
      deliveryId: delivery.id,
      endpointId: endpoint.id,
      url: endpoint.url,
      event: delivery.event,
      payload: delivery.payload as Record<string, unknown>,
    });

    logger.info({ deliveryId, webhookId }, "Manual webhook retry enqueued");

    return { deliveryId, status: "retrying" };
  },

  async emitEvent(event: string, transaction: Transaction) {
    const endpoints = await prisma.webhookEndpoint.findMany({
      where: {
        projectId: transaction.projectId,
        isActive: true,
        events: { has: event },
      },
    });

    if (endpoints.length === 0) return;

    const payload = {
      event,
      timestamp: new Date().toISOString(),
      data: {
        transactionId: transaction.id,
        hash: transaction.hash,
        from: transaction.from,
        to: transaction.to,
        value: transaction.value,
        status: transaction.status,
        chainId: transaction.chainId,
        nonce: transaction.nonce,
        blockNumber: transaction.blockNumber,
        errorMessage: transaction.errorMessage ?? null,
        metadata: transaction.metadata ?? null,
      },
    };

    const jobs = await Promise.all(
      endpoints.map(async (endpoint) => {
        const deliveryId = generateDeliveryId();

        await prisma.webhookDelivery.create({
          data: {
            id: deliveryId,
            endpointId: endpoint.id,
            event,
            payload,
          },
        });

        return webhookDeliveryQueue.add("deliver", {
          deliveryId,
          endpointId: endpoint.id,
          url: endpoint.url,
          event,
          payload,
        });
      }),
    );

    logger.debug(
      { event, transactionId: transaction.id, endpointCount: endpoints.length },
      "Webhook events enqueued",
    );

    return jobs;
  },
};

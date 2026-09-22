import { Router, type Request, type Response } from "express";
import { validate } from "../middleware/validate.middleware.js";
import { requireAuthOrApiKey, requireRole } from "../middleware/auth.middleware.js";
import { webhookService } from "../services/webhook.service.js";
import {
  createWebhookSchema,
  updateWebhookSchema,
  webhookParamsSchema,
  deliveryParamsSchema,
  deliveryQuerySchema,
} from "../validators/webhook.validator.js";
import { projectIdParamsSchema } from "../validators/project.validator.js";
import { param } from "./types.js";

// ────────────────────────────────────────────────────────────
// Webhook routes — /api/v1/projects/:projectId/webhooks
// ────────────────────────────────────────────────────────────

const router = Router({ mergeParams: true });

router.use(requireAuthOrApiKey);

/** GET /api/v1/projects/:projectId/webhooks */
router.get(
  "/",
  validate({ params: projectIdParamsSchema }),
  async (req: Request, res: Response) => {
    const webhooks = await webhookService.listByProject(param(req.params.projectId));
    res.json({ success: true, data: webhooks });
  },
);

/** POST /api/v1/projects/:projectId/webhooks */
router.post(
  "/",
  requireRole("OWNER", "ADMIN"),
  validate({ params: projectIdParamsSchema, body: createWebhookSchema }),
  async (req: Request, res: Response) => {
    const webhook = await webhookService.create(param(req.params.projectId), req.body);
    res.status(201).json({ success: true, data: webhook });
  },
);

/** GET /api/v1/projects/:projectId/webhooks/:webhookId */
router.get(
  "/:webhookId",
  validate({ params: webhookParamsSchema }),
  async (req: Request, res: Response) => {
    const webhook = await webhookService.getById(
      param(req.params.projectId),
      param(req.params.webhookId),
    );
    res.json({ success: true, data: webhook });
  },
);

/** PATCH /api/v1/projects/:projectId/webhooks/:webhookId */
router.patch(
  "/:webhookId",
  requireRole("OWNER", "ADMIN"),
  validate({ params: webhookParamsSchema, body: updateWebhookSchema }),
  async (req: Request, res: Response) => {
    const webhook = await webhookService.update(
      param(req.params.projectId),
      param(req.params.webhookId),
      req.body,
    );
    res.json({ success: true, data: webhook });
  },
);

/** DELETE /api/v1/projects/:projectId/webhooks/:webhookId */
router.delete(
  "/:webhookId",
  requireRole("OWNER"),
  validate({ params: webhookParamsSchema }),
  async (req: Request, res: Response) => {
    await webhookService.delete(param(req.params.projectId), param(req.params.webhookId));
    res.status(204).end();
  },
);

/** POST /api/v1/projects/:projectId/webhooks/:webhookId/rotate-secret */
router.post(
  "/:webhookId/rotate-secret",
  requireRole("OWNER", "ADMIN"),
  validate({ params: webhookParamsSchema }),
  async (req: Request, res: Response) => {
    const result = await webhookService.rotateSecret(
      param(req.params.projectId),
      param(req.params.webhookId),
    );
    res.json({ success: true, data: result });
  },
);

/** POST /api/v1/projects/:projectId/webhooks/:webhookId/test */
router.post(
  "/:webhookId/test",
  validate({ params: webhookParamsSchema }),
  async (req: Request, res: Response) => {
    const delivery = await webhookService.sendTestPing(
      param(req.params.projectId),
      param(req.params.webhookId),
    );
    res.json({ success: true, data: delivery });
  },
);

/** GET /api/v1/projects/:projectId/webhooks/:webhookId/deliveries */
router.get(
  "/:webhookId/deliveries",
  validate({ params: webhookParamsSchema, query: deliveryQuerySchema }),
  async (req: Request, res: Response) => {
    const result = await webhookService.getDeliveries(
      param(req.params.projectId),
      param(req.params.webhookId),
      req.query as any,
    );
    res.json({ success: true, data: result });
  },
);

/** POST /api/v1/projects/:projectId/webhooks/:webhookId/deliveries/:deliveryId/retry */
router.post(
  "/:webhookId/deliveries/:deliveryId/retry",
  validate({ params: deliveryParamsSchema }),
  async (req: Request, res: Response) => {
    const result = await webhookService.retryDelivery(
      param(req.params.projectId),
      param(req.params.webhookId),
      param(req.params.deliveryId),
    );
    res.json({ success: true, data: result });
  },
);

export default router;

import { Router, type Request, type Response } from "express";
import { z } from "zod";
import { requireAuthOrApiKey, requireRole } from "../middleware/auth.middleware.js";
import { validate } from "../middleware/validate.middleware.js";
import { fundingConfigService } from "../services/funding-config.service.js";
import { param } from "./types.js";

const router = Router({ mergeParams: true });

router.use(requireAuthOrApiKey);

const projectParamsSchema = z.object({
  projectId: z.string().min(1),
});

const chainOverrideParamsSchema = z.object({
  projectId: z.string().min(1),
  chainId: z.string().min(1),
});

const updateOverrideBodySchema = z.object({
  minBalanceEth: z.string().trim().optional().nullable(),
  fundAmountEth: z.string().trim().optional().nullable(),
});

/** GET /api/v1/projects/:projectId/funding-config */
router.get(
  "/",
  validate({ params: projectParamsSchema }),
  async (req: Request, res: Response) => {
    const projectId = param(req.params.projectId);
    const config = await fundingConfigService.listByProject(projectId);
    res.json({ success: true, data: config });
  },
);

/** PATCH /api/v1/projects/:projectId/funding-config/:chainId */
router.patch(
  "/:chainId",
  requireRole("OWNER", "ADMIN"),
  validate({ params: chainOverrideParamsSchema, body: updateOverrideBodySchema }),
  async (req: Request, res: Response) => {
    const projectId = param(req.params.projectId);
    const chainDbId = param(req.params.chainId);
    const body = req.body as { minBalanceEth?: string | null; fundAmountEth?: string | null };
    const result = await fundingConfigService.updateChainOverride(projectId, chainDbId, body);
    res.json({ success: true, data: result });
  },
);

export default router;

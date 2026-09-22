import { Router, type Request, type Response } from "express";
import { validate } from "../middleware/validate.middleware.js";
import { requireAuthOrApiKey, requireRole } from "../middleware/auth.middleware.js";
import { chainService } from "../services/chain.service.js";
import {
  createChainSchema,
  updateChainSchema,
  chainParamsSchema,
} from "../validators/chain.validator.js";
import { projectIdParamsSchema } from "../validators/project.validator.js";
import { param } from "./types.js";

// ────────────────────────────────────────────────────────────
// Chain routes — /api/v1/projects/:projectId/chains
// ────────────────────────────────────────────────────────────

const router = Router({ mergeParams: true });

router.use(requireAuthOrApiKey);

/** GET /api/v1/projects/:projectId/chains */
router.get(
  "/",
  validate({ params: projectIdParamsSchema }),
  async (req: Request, res: Response) => {
    const chains = await chainService.listByProject(param(req.params.projectId));
    res.json({ success: true, data: chains });
  },
);

/** GET /api/v1/projects/:projectId/chains/:chainId */
router.get(
  "/:chainId",
  validate({ params: chainParamsSchema }),
  async (req: Request, res: Response) => {
    const chain = await chainService.getById(
      param(req.params.projectId),
      param(req.params.chainId),
    );
    res.json({ success: true, data: chain });
  },
);

/** POST /api/v1/projects/:projectId/chains */
router.post(
  "/",
  requireRole("OWNER", "ADMIN"),
  validate({ params: projectIdParamsSchema, body: createChainSchema }),
  async (req: Request, res: Response) => {
    const chain = await chainService.create(param(req.params.projectId), req.body);
    res.status(201).json({ success: true, data: chain });
  },
);

/** PATCH /api/v1/projects/:projectId/chains/:chainId */
router.patch(
  "/:chainId",
  requireRole("OWNER", "ADMIN"),
  validate({ params: chainParamsSchema, body: updateChainSchema }),
  async (req: Request, res: Response) => {
    const chain = await chainService.update(
      param(req.params.projectId),
      param(req.params.chainId),
      req.body,
    );
    res.json({ success: true, data: chain });
  },
);

/** DELETE /api/v1/projects/:projectId/chains/:chainId */
router.delete(
  "/:chainId",
  requireRole("OWNER"),
  validate({ params: chainParamsSchema }),
  async (req: Request, res: Response) => {
    await chainService.delete(param(req.params.projectId), param(req.params.chainId));
    res.status(204).end();
  },
);

export default router;

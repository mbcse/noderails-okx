import { Router, type Request, type Response } from "express";
import { validate } from "../middleware/validate.middleware.js";
import { requireAuth, requireRole } from "../middleware/auth.middleware.js";
import { projectService } from "../services/project.service.js";
import {
  createProjectSchema,
  updateProjectSchema,
  projectIdParamsSchema,
} from "../validators/project.validator.js";
import { param } from "./types.js";

// ────────────────────────────────────────────────────────────
// Project routes — /api/v1/projects
// ────────────────────────────────────────────────────────────

const router = Router();

// All project routes require admin auth
router.use(requireAuth);

/** GET /api/v1/projects */
router.get("/", async (_req: Request, res: Response) => {
  const projects = await projectService.list();
  res.json({ success: true, data: projects });
});

/** GET /api/v1/projects/:projectId */
router.get(
  "/:projectId",
  validate({ params: projectIdParamsSchema }),
  async (req: Request, res: Response) => {
    const project = await projectService.getById(param(req.params.projectId));
    res.json({ success: true, data: project });
  },
);

/** POST /api/v1/projects */
router.post(
  "/",
  requireRole("OWNER", "ADMIN"),
  validate({ body: createProjectSchema }),
  async (req: Request, res: Response) => {
    const project = await projectService.create(req.body);
    res.status(201).json({ success: true, data: project });
  },
);

/** PATCH /api/v1/projects/:projectId */
router.patch(
  "/:projectId",
  requireRole("OWNER", "ADMIN"),
  validate({ params: projectIdParamsSchema, body: updateProjectSchema }),
  async (req: Request, res: Response) => {
    const project = await projectService.update(param(req.params.projectId), req.body);
    res.json({ success: true, data: project });
  },
);

/** DELETE /api/v1/projects/:projectId */
router.delete(
  "/:projectId",
  requireRole("OWNER"),
  validate({ params: projectIdParamsSchema }),
  async (req: Request, res: Response) => {
    await projectService.delete(param(req.params.projectId));
    res.status(204).end();
  },
);

/** POST /api/v1/projects/:projectId/regenerate-key */
router.post(
  "/:projectId/regenerate-key",
  requireRole("OWNER", "ADMIN"),
  validate({ params: projectIdParamsSchema }),
  async (req: Request, res: Response) => {
    const result = await projectService.regenerateApiKey(param(req.params.projectId));
    res.json({ success: true, data: result });
  },
);

export default router;

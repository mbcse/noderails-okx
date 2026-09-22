import { Router, type Request, type Response } from "express";
import { requireAuth, requireRole } from "../middleware/auth.middleware.js";
import { settingsService } from "../services/settings.service.js";
import { z } from "zod";
import { validate } from "../middleware/validate.middleware.js";

// ────────────────────────────────────────────────────────────
// Settings routes — /api/v1/settings
// ────────────────────────────────────────────────────────────

const router = Router();

router.use(requireAuth);

const updateSettingSchema = z.object({
  value: z.string(),
});

const settingKeyParamSchema = z.object({
  key: z.string(),
});

/** GET /api/v1/settings — list all settings */
router.get("/", async (_req: Request, res: Response) => {
  const settings = await settingsService.list();
  res.json({ success: true, data: settings });
});

/** PATCH /api/v1/settings/:key — update a single setting */
router.patch(
  "/:key",
  requireRole("OWNER", "ADMIN"),
  validate({ params: settingKeyParamSchema, body: updateSettingSchema }),
  async (req: Request, res: Response) => {
    const key = req.params.key as string;
    const { value } = req.body as { value: string };
    const setting = await settingsService.update(key, value);
    res.json({ success: true, data: setting });
  },
);

export default router;

import { Router, type Request, type Response } from "express";
import { validate } from "../middleware/validate.middleware.js";
import { authLimiter } from "../middleware/rate-limiter.js";
import { requireAuth, requireRole } from "../middleware/auth.middleware.js";
import { authService } from "../services/auth.service.js";
import { config } from "../config/index.js";
import {
  loginSchema,
  registerSchema,
  refreshSchema,
} from "../validators/auth.validator.js";

// ────────────────────────────────────────────────────────────
// Auth routes — POST /api/v1/auth/*
// ────────────────────────────────────────────────────────────

const router = Router();

/** Cookie options for the HttpOnly refresh token */
function refreshCookieOptions() {
  return {
    httpOnly: true,
    secure: !config.isDev, // HTTPS-only in production
    sameSite: config.isDev ? ("lax" as const) : ("none" as const), // "none" for cross-origin (Vercel → API)
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    path: "/",
    domain: config.isDev ? undefined : ".example.local", // share across subdomains
  };
}

/** POST /api/v1/auth/login */
router.post(
  "/login",
  authLimiter,
  validate({ body: loginSchema }),
  async (req: Request, res: Response) => {
    const { email, password } = req.body;
    const result = await authService.login(email, password);

    // Set refresh token as HttpOnly cookie (never exposed to JS)
    res.cookie("mtxm_rt", result.tokens.refreshToken, refreshCookieOptions());

    // Only return accessToken in the response body
    res.json({
      success: true,
      data: {
        user: result.user,
        tokens: { accessToken: result.tokens.accessToken },
      },
    });
  },
);

/** POST /api/v1/auth/register  (OWNER-only — creates new admin users) */
router.post(
  "/register",
  requireAuth,
  requireRole("OWNER"),
  validate({ body: registerSchema }),
  async (req: Request, res: Response) => {
    const user = await authService.register(req.body);
    res.status(201).json({ success: true, data: user });
  },
);

/** POST /api/v1/auth/refresh */
router.post(
  "/refresh",
  authLimiter,
  async (req: Request, res: Response) => {
    // Read refresh token from HttpOnly cookie (primary) or body (fallback)
    const refreshToken: string | undefined =
      req.cookies?.mtxm_rt || req.body?.refreshToken;

    if (!refreshToken) {
      res.status(401).json({ success: false, message: "No refresh token provided" });
      return;
    }

    const tokens = await authService.refresh(refreshToken);

    // Rotate the cookie with the new refresh token
    res.cookie("mtxm_rt", tokens.refreshToken, refreshCookieOptions());

    // Only return accessToken in the body
    res.json({
      success: true,
      data: { accessToken: tokens.accessToken },
    });
  },
);

/** POST /api/v1/auth/logout — revokes all refresh tokens for the user */
router.post("/logout", requireAuth, async (req: Request, res: Response) => {
  await authService.logout(req.user!.id);
  res.clearCookie("mtxm_rt", {
    path: "/",
    domain: config.isDev ? undefined : ".example.local",
  });
  res.json({ success: true, message: "Logged out" });
});

/** GET /api/v1/auth/me */
router.get("/me", requireAuth, async (req: Request, res: Response) => {
  const profile = await authService.getProfile(req.user!.id);
  res.json({ success: true, data: profile });
});

export default router;

import type { Request, Response, NextFunction } from "express";
import { authService } from "../services/auth.service.js";
import { projectService } from "../services/project.service.js";
import { UnauthorizedError, ForbiddenError } from "../lib/errors.js";
import { logger } from "../lib/logger.js";

const authLog = logger.child({ service: "auth-middleware" });

// ────────────────────────────────────────────────────────────
// JWT auth middleware — validates Bearer token on admin routes
// ────────────────────────────────────────────────────────────

export function requireAuth(req: Request, _res: Response, next: NextFunction): void {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
    throw new UnauthorizedError("Missing or malformed Authorization header");
  }

  const token = header.slice(7);
  const payload = authService.verifyAccessToken(token);

  req.user = {
    id: payload.sub,
    email: payload.email,
    name: payload.name,
    role: payload.role,
  };

  next();
}

// ────────────────────────────────────────────────────────────
// Combined auth — accepts JWT Bearer OR X-API-Key header.
// Use on project-scoped routes that serve both dashboard and
// external API clients.
// ────────────────────────────────────────────────────────────

export async function requireAuthOrApiKey(
  req: Request,
  _res: Response,
  next: NextFunction,
): Promise<void> {
  const hasApiKey = !!req.headers["x-api-key"];
  const hasBearer = !!req.headers.authorization?.startsWith("Bearer ");

  authLog.debug({
    method: req.method,
    path: req.originalUrl,
    hasApiKey,
    hasBearer,
    projectIdParam: req.params.projectId ?? "(none)",
  }, "requireAuthOrApiKey hit");

  // 1) Try API key first (external integrators)
  const apiKey = req.headers["x-api-key"] as string | undefined;
  if (apiKey) {
    const project = await projectService.getByApiKey(apiKey);
    if (!project) {
      authLog.warn({ msg: "API key lookup failed — no matching project", apiKeyPrefix: apiKey.slice(0, 8) });
      throw new UnauthorizedError("Invalid or inactive API key");
    }
    // Guard: API key must belong to the project in the URL (case-insensitive — CUIDs are lowercase)
    const rawProjectId = req.params.projectId;
    const urlProjectId = Array.isArray(rawProjectId) ? rawProjectId[0] : rawProjectId;
    if (urlProjectId && project.id.toLowerCase() !== urlProjectId.toLowerCase()) {
      authLog.warn({
        msg: "API key / projectId mismatch",
        urlProjectId,
        apiKeyProjectId: project.id,
        urlProjectIdLen: urlProjectId.length,
        apiKeyProjectIdLen: project.id.length,
      });
      throw new ForbiddenError("API key does not belong to this project");
    }

    authLog.debug({ projectId: project.id }, "Authenticated via API key");
    req.project = { id: project.id, name: project.name, apiKey: project.apiKey };
    return next();
  }

  // 2) Fall back to JWT Bearer (dashboard users)
  const header = req.headers.authorization;
  if (header?.startsWith("Bearer ")) {
    const token = header.slice(7);
    const payload = authService.verifyAccessToken(token);
    authLog.debug({ userId: payload.sub }, "Authenticated via JWT");
    req.user = {
      id: payload.sub,
      email: payload.email,
      name: payload.name,
      role: payload.role,
    };
    return next();
  }

  authLog.warn({ msg: "No auth credentials provided", headers: Object.keys(req.headers) });
  throw new UnauthorizedError("Missing Authorization header or X-API-Key");
}

/**
 * Role guard — must be used after `requireAuth` or `requireAuthOrApiKey`.
 * Skips the check when the request was authenticated via API key
 * (API key implies full project access).
 * @example router.use(requireAuthOrApiKey, requireRole("OWNER", "ADMIN"))
 */
export function requireRole(...roles: string[]) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    // API-key auth → full project access, skip role check
    if (req.project) return next();

    if (!req.user) throw new UnauthorizedError();
    if (!roles.includes(req.user.role)) {
      throw new ForbiddenError("Insufficient permissions");
    }
    next();
  };
}

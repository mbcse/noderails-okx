import type { Request, Response, NextFunction } from "express";
import { projectService } from "../services/project.service.js";
import { UnauthorizedError } from "../lib/errors.js";

// ────────────────────────────────────────────────────────────
// API key middleware — validates X-API-Key header for external callers
// ────────────────────────────────────────────────────────────

export async function requireApiKey(
  req: Request,
  _res: Response,
  next: NextFunction,
): Promise<void> {
  const apiKey = req.headers["x-api-key"] as string | undefined;
  if (!apiKey) {
    throw new UnauthorizedError("Missing X-API-Key header");
  }

  const project = await projectService.getByApiKey(apiKey);
  if (!project) {
    throw new UnauthorizedError("Invalid or inactive API key");
  }

  req.project = {
    id: project.id,
    name: project.name,
    apiKey: project.apiKey,
  };

  next();
}

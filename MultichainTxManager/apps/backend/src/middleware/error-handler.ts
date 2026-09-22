import type { Request, Response, NextFunction } from "express";
import { AppError, ValidationError } from "../lib/errors.js";
import { logger } from "../lib/logger.js";

// ────────────────────────────────────────────────────────────
// Global error handler — must be the last middleware
// ────────────────────────────────────────────────────────────

/** Type guard for Prisma client-known-request errors (have a `code` property) */
function isPrismaError(err: unknown): err is Error & { code: string; meta?: Record<string, unknown> } {
  return err instanceof Error && typeof (err as unknown as Record<string, unknown>).code === "string";
}

export function errorHandler(
  err: Error,
  req: Request,
  res: Response,
  _next: NextFunction,
): void {
  // Attach request context for every log within this handler
  const reqContext = { method: req.method, url: req.originalUrl };

  // ── Operational / expected errors ──────────────────────────
  if (err instanceof ValidationError) {
    res.status(err.statusCode).json({
      success: false,
      message: err.message,
      errors: err.errors,
    });
    return;
  }

  if (err instanceof AppError) {
    if (!err.isOperational) {
      logger.error({ err, ...reqContext }, "Non-operational AppError");
    }
    res.status(err.statusCode).json({
      success: false,
      message: err.message,
    });
    return;
  }

  // ── Prisma errors ─────────────────────────────────────────
  if (isPrismaError(err)) {
    switch (err.code) {
      case "P2025": // Record not found
        res.status(404).json({ success: false, message: "Resource not found" });
        return;
      case "P2002": { // Unique constraint
        const target = err.meta?.target ?? "unknown";
        res.status(409).json({
          success: false,
          message: `Unique constraint violation on: ${target}`,
        });
        return;
      }
      case "P2003": // Foreign key constraint
        res.status(400).json({
          success: false,
          message: "Related resource does not exist",
        });
        return;
      default:
        logger.error({ err, prismaCode: err.code, ...reqContext }, "Unhandled Prisma error");
    }
  }

  // ── Unexpected errors ─────────────────────────────────────
  logger.error({ err, ...reqContext }, "Unhandled error");

  res.status(500).json({
    success: false,
    message: "Internal server error",
  });
}

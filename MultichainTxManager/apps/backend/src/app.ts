import express from "express";
import cors from "cors";
import helmet from "helmet";
import cookieParser from "cookie-parser";
import { config } from "./config/index.js";
import { errorHandler } from "./middleware/error-handler.js";
import { defaultLimiter } from "./middleware/rate-limiter.js";
import { requestLogger } from "./middleware/request-logger.js";
import apiRoutes from "./routes/index.js";

// ────────────────────────────────────────────────────────────
// Express application setup
// ────────────────────────────────────────────────────────────

export function createApp() {
  const app = express();

  // Trust reverse proxy (Caddy) for X-Forwarded-For — required for rate limiting behind proxy
  app.set("trust proxy", 1);

  // ── Global middleware ──────────────────────────────────────

  app.use(helmet());
  app.use(
    cors({
      origin: config.corsOrigin,
      credentials: true,
    }),
  );
  app.use(express.json({ limit: "256kb" }));
  app.use(cookieParser());
  app.use(defaultLimiter);

  // ── Request logging ────────────────────────────────────────

  app.use(requestLogger);

  // ── Health check ───────────────────────────────────────────

  app.get("/health", (_req, res) => {
    res.json({ status: "ok", uptime: process.uptime() });
  });

  // ── API v1 routes ──────────────────────────────────────────

  app.use("/api/v1", apiRoutes);

  // ── 404 fallback ───────────────────────────────────────────

  app.use((_req, res) => {
    res.status(404).json({
      success: false,
      error: { message: "Route not found" },
    });
  });

  // ── Global error handler (must be last) ────────────────────

  app.use(errorHandler);

  return app;
}

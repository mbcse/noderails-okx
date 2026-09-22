import { Router } from "express";
import authRoutes from "./auth.routes.js";
import projectRoutes from "./project.routes.js";
import chainRoutes from "./chain.routes.js";
import signerRoutes from "./signer.routes.js";
import transactionRoutes from "./transaction.routes.js";
import webhookRoutes from "./webhook.routes.js";
import settingsRoutes from "./settings.routes.js";
import fundingConfigRoutes from "./funding-config.routes.js";

// ────────────────────────────────────────────────────────────
// API v1 route aggregator
// ────────────────────────────────────────────────────────────

const router = Router();

router.use("/auth", authRoutes);

// Project sub-resource routes MUST be registered before the generic
// "/projects" route so Express doesn't enter projectRoutes (which uses
// JWT-only requireAuth) for requests meant for these API-key-compatible routes.
router.use("/projects/:projectId/chains", chainRoutes);
router.use("/projects/:projectId/signers", signerRoutes);
router.use("/projects/:projectId/transactions", transactionRoutes);
router.use("/projects/:projectId/webhooks", webhookRoutes);
router.use("/projects/:projectId/funding-config", fundingConfigRoutes);

router.use("/projects", projectRoutes);
router.use("/settings", settingsRoutes);

export default router;

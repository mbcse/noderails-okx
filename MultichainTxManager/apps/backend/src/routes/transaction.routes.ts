import { Router, type Request, type Response } from "express";
import { validate } from "../middleware/validate.middleware.js";
import { requireAuthOrApiKey } from "../middleware/auth.middleware.js";
import { txSendLimiter } from "../middleware/rate-limiter.js";
import { transactionService } from "../services/transaction.service.js";
import {
  sendTransactionSchema,
  signTypedDataSchema,
  suiSponsorSignSchema,
  suiExecuteSponsoredSchema,
  transactionParamsSchema,
  transactionQuerySchema,
} from "../validators/transaction.validator.js";
import { projectIdParamsSchema } from "../validators/project.validator.js";
import { param } from "./types.js";

// ────────────────────────────────────────────────────────────
// Transaction routes — /api/v1/projects/:projectId/transactions
// ────────────────────────────────────────────────────────────

const router = Router({ mergeParams: true });

router.use(requireAuthOrApiKey);

/** GET /api/v1/projects/:projectId/transactions */
router.get(
  "/",
  validate({ params: projectIdParamsSchema, query: transactionQuerySchema }),
  async (req: Request, res: Response) => {
    const result = await transactionService.list(
      param(req.params.projectId),
      req.query as any,
    );
    res.json({ success: true, data: result });
  },
);

/** GET /api/v1/projects/:projectId/transactions/:txId */
router.get(
  "/:txId",
  validate({ params: transactionParamsSchema }),
  async (req: Request, res: Response) => {
    const tx = await transactionService.getById(
      param(req.params.projectId),
      param(req.params.txId),
    );
    res.json({ success: true, data: tx });
  },
);

/** POST /api/v1/projects/:projectId/transactions/send */
router.post(
  "/send",
  txSendLimiter,
  validate({ params: projectIdParamsSchema, body: sendTransactionSchema }),
  async (req: Request, res: Response) => {
    const tx = await transactionService.send(param(req.params.projectId), req.body);
    res.status(201).json({ success: true, data: tx });
  },
);

/** POST /api/v1/projects/:projectId/transactions/sign-typed */
router.post(
  "/sign-typed",
  txSendLimiter,
  validate({ params: projectIdParamsSchema, body: signTypedDataSchema }),
  async (req: Request, res: Response) => {
    const result = await transactionService.signTypedData(param(req.params.projectId), req.body);
    res.json({ success: true, data: result });
  },
);

/** POST /api/v1/projects/:projectId/transactions/sponsor-sign — SUI gas sponsor co-sign */
router.post(
  "/sponsor-sign",
  txSendLimiter,
  validate({ params: projectIdParamsSchema, body: suiSponsorSignSchema }),
  async (req: Request, res: Response) => {
    const result = await transactionService.sponsorSign(param(req.params.projectId), req.body);
    res.json({ success: true, data: result });
  },
);

/** POST /api/v1/projects/:projectId/transactions/execute-sponsored — dual-sign SUI execute */
router.post(
  "/execute-sponsored",
  txSendLimiter,
  validate({ params: projectIdParamsSchema, body: suiExecuteSponsoredSchema }),
  async (req: Request, res: Response) => {
    const result = await transactionService.executeSponsored(param(req.params.projectId), req.body);
    res.status(201).json({ success: true, data: result });
  },
);

export default router;

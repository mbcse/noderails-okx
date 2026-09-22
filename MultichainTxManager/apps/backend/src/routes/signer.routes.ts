import { Router, type Request, type Response } from "express";
import { validate } from "../middleware/validate.middleware.js";
import { requireAuthOrApiKey, requireRole } from "../middleware/auth.middleware.js";
import { signerService } from "../services/signer.service.js";
import { fundingService } from "../services/funding.service.js";
import { resolveChainDbId } from "../lib/resolve-chain.js";
import {
  createSignerSchema,
  updateSignerSchema,
  signerParamsSchema,
  emergencyTransferSchema,
  resetNonceSchema,
  allocateSignerSchema,
} from "../validators/signer.validator.js";
import { projectIdParamsSchema } from "../validators/project.validator.js";
import { param } from "./types.js";

// ────────────────────────────────────────────────────────────
// Signer routes — /api/v1/projects/:projectId/signers
// ────────────────────────────────────────────────────────────

const router = Router({ mergeParams: true });

router.use(requireAuthOrApiKey);

/** GET /api/v1/projects/:projectId/signers */
router.get(
  "/",
  validate({ params: projectIdParamsSchema }),
  async (req: Request, res: Response) => {
    const signers = await signerService.listByProject(param(req.params.projectId));
    // Strip encrypted key data from response
    const safe = signers.map(({ encryptedKey, ...rest }) => rest);
    res.json({ success: true, data: safe });
  },
);

/** POST /api/v1/projects/:projectId/signers/allocate — round-robin SUI signer for integrators */
router.post(
  "/allocate",
  validate({ params: projectIdParamsSchema, body: allocateSignerSchema }),
  async (req: Request, res: Response) => {
    const body = req.body as { chainType?: "SUI" };
    const allocated = await signerService.allocate(param(req.params.projectId), {
      chainType: body.chainType ?? "SUI",
    });
    res.json({ success: true, data: allocated });
  },
);

/** GET /api/v1/projects/:projectId/signers/:signerId */
router.get(
  "/:signerId",
  validate({ params: signerParamsSchema }),
  async (req: Request, res: Response) => {
    const signer = await signerService.getById(
      param(req.params.projectId),
      param(req.params.signerId),
    );
    const { encryptedKey, ...safe } = signer;
    res.json({ success: true, data: safe });
  },
);

/** GET /api/v1/projects/:projectId/signers/:signerId/detail */
router.get(
  "/:signerId/detail",
  validate({ params: signerParamsSchema }),
  async (req: Request, res: Response) => {
    const detail = await signerService.getDetail(
      param(req.params.projectId),
      param(req.params.signerId),
    );
    res.json({ success: true, data: detail });
  },
);

/** POST /api/v1/projects/:projectId/signers */
router.post(
  "/",
  requireRole("OWNER", "ADMIN"),
  validate({ params: projectIdParamsSchema, body: createSignerSchema }),
  async (req: Request, res: Response) => {
    const signer = await signerService.create(param(req.params.projectId), req.body);
    const { encryptedKey, ...safe } = signer;
    res.status(201).json({ success: true, data: safe });
  },
);

/** PATCH /api/v1/projects/:projectId/signers/:signerId */
router.patch(
  "/:signerId",
  requireRole("OWNER", "ADMIN"),
  validate({ params: signerParamsSchema, body: updateSignerSchema }),
  async (req: Request, res: Response) => {
    const signer = await signerService.update(
      param(req.params.projectId),
      param(req.params.signerId),
      req.body,
    );
    const { encryptedKey, ...safe } = signer;
    res.json({ success: true, data: safe });
  },
);

/** POST /api/v1/projects/:projectId/signers/:signerId/deactivate */
router.post(
  "/:signerId/deactivate",
  requireRole("OWNER", "ADMIN"),
  validate({ params: signerParamsSchema }),
  async (req: Request, res: Response) => {
    const signer = await signerService.deactivate(
      param(req.params.projectId),
      param(req.params.signerId),
    );
    const { encryptedKey, ...safe } = signer;
    res.json({ success: true, data: safe });
  },
);

/** POST /api/v1/projects/:projectId/signers/:signerId/activate */
router.post(
  "/:signerId/activate",
  requireRole("OWNER", "ADMIN"),
  validate({ params: signerParamsSchema }),
  async (req: Request, res: Response) => {
    const signer = await signerService.activate(
      param(req.params.projectId),
      param(req.params.signerId),
    );
    const { encryptedKey, ...safe } = signer;
    res.json({ success: true, data: safe });
  },
);

/** POST /api/v1/projects/:projectId/signers/:signerId/set-master */
router.post(
  "/:signerId/set-master",
  requireRole("OWNER", "ADMIN"),
  validate({ params: signerParamsSchema }),
  async (req: Request, res: Response) => {
    const signer = await signerService.setMaster(
      param(req.params.projectId),
      param(req.params.signerId),
    );
    const { encryptedKey, ...safe } = signer;
    res.json({ success: true, data: safe });
  },
);

/** POST /api/v1/projects/:projectId/signers/:signerId/unset-master */
router.post(
  "/:signerId/unset-master",
  requireRole("OWNER", "ADMIN"),
  validate({ params: signerParamsSchema }),
  async (req: Request, res: Response) => {
    const signer = await signerService.unsetMaster(
      param(req.params.projectId),
      param(req.params.signerId),
    );
    const { encryptedKey, ...safe } = signer;
    res.json({ success: true, data: safe });
  },
);

/** POST /api/v1/projects/:projectId/signers/:signerId/fund */
router.post(
  "/:signerId/fund",
  requireRole("OWNER", "ADMIN"),
  validate({ params: signerParamsSchema }),
  async (req: Request, res: Response) => {
    const projectId = param(req.params.projectId);
    const signerId = param(req.params.signerId);
    const { chainDbId, chainId } = req.body as { chainDbId?: string; chainId?: string | number };

    const rawChainId = chainDbId ?? chainId;
    if (!rawChainId) {
      res.status(400).json({ success: false, error: "chainDbId or chainId is required" });
      return;
    }

    const resolvedChainId = await resolveChainDbId(projectId, rawChainId);
    const signer = await signerService.getById(projectId, signerId);
    const txHash = await fundingService.fund(projectId, resolvedChainId, signer.address);

    if (txHash) {
      res.json({ success: true, data: { txHash } });
    } else {
      res.status(422).json({ success: false, error: "Funding failed — check master wallet balance or configuration" });
    }
  },
);

/** POST /api/v1/projects/:projectId/signers/:signerId/emergency-transfer */
router.post(
  "/:signerId/emergency-transfer",
  requireRole("OWNER"),
  validate({ params: signerParamsSchema, body: emergencyTransferSchema }),
  async (req: Request, res: Response) => {
    const projectId = param(req.params.projectId);
    const signerId = param(req.params.signerId);
    const { chainId, toAddress, amountWei, forceNonce } = req.body;

    const resolvedChainId = await resolveChainDbId(projectId, chainId);
    const result = await fundingService.emergencyTransfer(
      projectId,
      signerId,
      resolvedChainId,
      toAddress,
      amountWei ?? "0",
      forceNonce,
    );

    res.json({ success: true, data: result });
  },
);

/** POST /api/v1/projects/:projectId/signers/:signerId/reset-nonce */
router.post(
  "/:signerId/reset-nonce",
  requireRole("OWNER", "ADMIN"),
  validate({ params: signerParamsSchema, body: resetNonceSchema }),
  async (req: Request, res: Response) => {
    const projectId = param(req.params.projectId);
    const signerId = param(req.params.signerId);
    const { chainId } = req.body;

    const resolvedChainId = await resolveChainDbId(projectId, chainId);
    const result = await signerService.resetChainNonce(projectId, signerId, resolvedChainId);
    res.json({ success: true, data: result });
  },
);

export default router;

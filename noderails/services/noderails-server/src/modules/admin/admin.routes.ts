import express, { Router } from 'express';
import { z } from 'zod';
import jwt from 'jsonwebtoken';
import { FeedbackStatus, FeedbackType, getDatabaseClient } from '@noderails/database';
import {
  asyncHandler,
  validate,
  authenticateJwt,
  requireAdmin,
  success,
  created,
  noContent,
  paginated,
  createLogger,
} from '@noderails/service-base';
import {
  AuthenticationError,
  AUTH_CONFIG,
  AddressSchema,
  SolanaAddressSchema,
  SuiAddressSchema,
  MERCHANT_WALLET_MAX_LENGTH,
  TokenContractAddressSchema,
  NotFoundError,
} from '@noderails/common';
import * as adminService from './admin.service.js';
import emailCampaignRoutes from './email-campaign.routes.js';
import { adminShortLinkRoutes } from '../short-links/short-links.routes.js';
import * as timelockConfigService from '../payments/timelock-config.service.js';
import * as feeConfigService from '../payments/fee-config.service.js';
import * as webhookConfigService from '../webhooks/webhook-config.service.js';
import * as feedbackService from '../feedback/feedback.service.js';
import { adminRetryBridge, adminStuckCredit, getAdminBridgeSnapshot } from '../single-chain-settlement/bridge.service.js';
import { env } from '../../config.js';

const adminLogger = createLogger('admin');

const router: express.Router = Router();

// ── Admin Login (env-based credentials, no DB) ──
// This endpoint is NOT behind JWT — it IS the login.

const adminLoginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

router.post(
  '/auth/login',
  validate(adminLoginSchema),
  asyncHandler(async (req, res) => {
    const { email, password } = req.body;

    if (!env.ADMIN_EMAIL || !env.ADMIN_PASSWORD) {
      throw new AuthenticationError('Admin credentials are not configured');
    }

    if (email !== env.ADMIN_EMAIL || password !== env.ADMIN_PASSWORD) {
      throw new AuthenticationError('Invalid admin credentials');
    }

    const accessToken = jwt.sign(
      { sub: 'platform-admin', email: env.ADMIN_EMAIL, role: 'ADMIN', type: 'access' },
      env.JWT_SECRET,
      { expiresIn: AUTH_CONFIG.ACCESS_TOKEN_TTL },
    );

    const refreshToken = jwt.sign(
      { sub: 'platform-admin', email: env.ADMIN_EMAIL, role: 'ADMIN', type: 'refresh' },
      env.JWT_REFRESH_SECRET,
      { expiresIn: AUTH_CONFIG.REFRESH_TOKEN_TTL },
    );

    res.cookie(AUTH_CONFIG.ADMIN_REFRESH_COOKIE_NAME, refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });

    success(res, { accessToken, admin: { email: env.ADMIN_EMAIL, role: 'ADMIN' } });
  }),
);

// ── POST /admin/auth/refresh ──

router.post(
  '/auth/refresh',
  asyncHandler(async (req, res) => {
    const token = req.cookies?.[AUTH_CONFIG.ADMIN_REFRESH_COOKIE_NAME];
    if (!token) {
      res.status(401).json({ success: false, error: { code: 'NO_REFRESH_TOKEN', message: 'No refresh token' } });
      return;
    }

    let payload: { sub: string; email: string; role: string; type: string };
    try {
      payload = jwt.verify(token, env.JWT_REFRESH_SECRET) as typeof payload;
    } catch {
      res.clearCookie(AUTH_CONFIG.ADMIN_REFRESH_COOKIE_NAME);
      res.status(401).json({ success: false, error: { code: 'INVALID_REFRESH', message: 'Invalid refresh token' } });
      return;
    }

    if (payload.type !== 'refresh' || payload.role !== 'ADMIN') {
      res.status(401).json({ success: false, error: { code: 'INVALID_TOKEN_TYPE', message: 'Invalid token type' } });
      return;
    }

    const accessToken = jwt.sign(
      { sub: 'platform-admin', email: payload.email, role: 'ADMIN', type: 'access' },
      env.JWT_SECRET,
      { expiresIn: AUTH_CONFIG.ACCESS_TOKEN_TTL },
    );

    const newRefreshToken = jwt.sign(
      { sub: 'platform-admin', email: payload.email, role: 'ADMIN', type: 'refresh' },
      env.JWT_REFRESH_SECRET,
      { expiresIn: AUTH_CONFIG.REFRESH_TOKEN_TTL },
    );

    res.cookie(AUTH_CONFIG.ADMIN_REFRESH_COOKIE_NAME, newRefreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });

    success(res, { accessToken, admin: { email: payload.email, role: 'ADMIN' } });
  }),
);

// ── POST /admin/auth/logout ──

router.post('/auth/logout', (_req, res) => {
  res.clearCookie(AUTH_CONFIG.ADMIN_REFRESH_COOKIE_NAME);
  success(res, { message: 'Logged out' });
});

// All other admin routes require JWT + ADMIN role
router.use(authenticateJwt(env.JWT_SECRET));
router.use(requireAdmin());

// ── Schemas ──

const chainAddressSchema = z.string().min(1).max(MERCHANT_WALLET_MAX_LENGTH);

function addressSchemaForChainType(chainType: 'EVM' | 'SOLANA' | 'SUI') {
  if (chainType === 'SOLANA') return SolanaAddressSchema;
  if (chainType === 'SUI') return SuiAddressSchema;
  return AddressSchema;
}

function refineChainAddresses(
  data: {
    chainType?: 'EVM' | 'SOLANA' | 'SUI';
    escrowAddress?: string;
    merchantManagerAddress?: string;
    escrowConfigObjectId?: string | null;
    paymentRegistryObjectId?: string | null;
    walletRegistryObjectId?: string | null;
    merchantManagerConfigObjectId?: string | null;
  },
  ctx: z.RefinementCtx,
  opts?: { requireSuiObjects?: boolean },
) {
  const chainType = data.chainType ?? 'EVM';
  const addressSchema = addressSchemaForChainType(chainType);

  for (const path of ['escrowAddress', 'merchantManagerAddress'] as const) {
    const val = data[path];
    if (val == null) continue;
    const parsed = addressSchema.safeParse(val);
    if (!parsed.success) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          chainType === 'SOLANA'
            ? `Invalid Solana ${path === 'escrowAddress' ? 'escrow program' : 'merchant manager program'} id`
            : chainType === 'SUI'
              ? `Invalid Sui ${path === 'escrowAddress' ? 'escrow package' : 'merchant manager package'} id`
              : `Invalid EVM ${path === 'escrowAddress' ? 'escrow contract' : 'merchant manager contract'} address`,
        path: [path],
      });
    }
  }

  if (chainType !== 'SUI') return;

  for (const path of [
    'escrowConfigObjectId',
    'paymentRegistryObjectId',
    'walletRegistryObjectId',
    'merchantManagerConfigObjectId',
  ] as const) {
    const val = data[path];
    if (val == null || val === '') {
      if (opts?.requireSuiObjects) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Missing required Sui ${path}`,
          path: [path],
        });
      }
      continue;
    }
    const parsed = SuiAddressSchema.safeParse(val);
    if (!parsed.success) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Invalid Sui ${path}`,
        path: [path],
      });
    }
  }
}

const createChainSchema = z
  .object({
    chainType: z.enum(['EVM', 'SOLANA', 'SUI']).default('EVM'),
    chainId: z.number().int().positive(),
    name: z.string().min(1).max(100),
    displayName: z.string().min(1).max(100).optional(),
    nativeCurrencySymbol: z.string().min(1).max(10),
    nativeCurrencyDecimals: z.number().int().min(0).max(18).optional(),
    escrowAddress: chainAddressSchema,
    merchantManagerAddress: chainAddressSchema,
    escrowConfigObjectId: chainAddressSchema.optional(),
    paymentRegistryObjectId: chainAddressSchema.optional(),
    walletRegistryObjectId: chainAddressSchema.optional(),
    merchantManagerConfigObjectId: chainAddressSchema.optional(),
    mtxmChainDbId: z.string().min(1).max(64).optional(),
    rpcUrl: z.string().url().optional(),
    explorerUrl: z.string().url().optional(),
    isTestnet: z.boolean().optional(),
    supports7702: z.boolean().optional(),
    iconUrl: z.string().url().optional(),
  })
  .superRefine((data, ctx) => {
    refineChainAddresses(data, ctx, { requireSuiObjects: data.chainType === 'SUI' });
  });

const updateChainSchema = z
  .object({
    chainType: z.enum(['EVM', 'SOLANA', 'SUI']).optional(),
    name: z.string().min(1).max(100).optional(),
    displayName: z.string().min(1).max(100).optional(),
    nativeCurrencySymbol: z.string().min(1).max(10).optional(),
    nativeCurrencyDecimals: z.number().int().min(0).max(18).optional(),
    escrowAddress: chainAddressSchema.optional(),
    merchantManagerAddress: chainAddressSchema.optional(),
    escrowConfigObjectId: chainAddressSchema.optional().nullable(),
    paymentRegistryObjectId: chainAddressSchema.optional().nullable(),
    walletRegistryObjectId: chainAddressSchema.optional().nullable(),
    merchantManagerConfigObjectId: chainAddressSchema.optional().nullable(),
    mtxmChainDbId: z.string().max(64).optional().nullable(),
    rpcUrl: z.string().url().optional(),
    explorerUrl: z.string().url().optional(),
    isTestnet: z.boolean().optional(),
    isEnabled: z.boolean().optional(),
    supports7702: z.boolean().optional(),
    iconUrl: z.string().url().optional(),
  })
  .superRefine((data, ctx) => {
    refineChainAddresses(data, ctx);
  });

const createTokenSchema = z.object({
  chainId: z.number().int().positive(),
  contractAddress: TokenContractAddressSchema,
  symbol: z.string().min(1).max(20),
  name: z.string().min(1).max(100),
  decimals: z.number().int().min(0).max(18),
  supportsNativeTransfer: z.boolean().optional(),
  supportsPermit: z.boolean().optional(),
  permitVersion: z.string().max(10).optional(),
  permitType: z.string().max(20).optional(),
  isStablecoin: z.boolean().optional(),
  iconUrl: z.string().url().optional(),
});

const updateTokenSchema = z.object({
  symbol: z.string().min(1).max(20).optional(),
  name: z.string().min(1).max(100).optional(),
  decimals: z.number().int().min(0).max(18).optional(),
  supportsNativeTransfer: z.boolean().optional(),
  supportsPermit: z.boolean().optional(),
  permitVersion: z.string().max(10).optional(),
  permitType: z.string().max(20).optional(),
  isStablecoin: z.boolean().optional(),
  isEnabled: z.boolean().optional(),
  iconUrl: z.string().url().optional(),
});

const listQuerySchema = z.object({
  page: z.coerce.number().int().positive().optional(),
  pageSize: z.coerce.number().int().positive().max(100).optional(),
  merchantId: z.string().uuid().optional(),
});

const feedbackListQuerySchema = z.object({
  page: z.coerce.number().int().positive().optional(),
  pageSize: z.coerce.number().int().positive().max(100).optional(),
  type: z.nativeEnum(FeedbackType).optional(),
  status: z.nativeEnum(FeedbackStatus).optional(),
});

const updateFeedbackStatusSchema = z.object({
  status: z.nativeEnum(FeedbackStatus),
});

// ── GET /admin/overview ──

router.get(
  '/overview',
  asyncHandler(async (_req, res) => {
    const overview = await adminService.getOverview();
    success(res, overview);
  }),
);

// ── CHAINS ──

router.post(
  '/chains',
  validate(createChainSchema),
  asyncHandler(async (req, res) => {
    const chain = await adminService.createChain(req.body);
    created(res, chain);
  }),
);

router.get(
  '/chains',
  asyncHandler(async (_req, res) => {
    const chains = await adminService.listChains();
    success(res, chains);
  }),
);

router.get(
  '/chains/:chainId',
  asyncHandler(async (req, res) => {
    const chain = await adminService.getChain(Number(req.params.chainId));
    success(res, chain);
  }),
);

router.put(
  '/chains/:chainId',
  validate(updateChainSchema),
  asyncHandler(async (req, res) => {
    const chain = await adminService.updateChain(Number(req.params.chainId), req.body);
    success(res, chain);
  }),
);

router.delete(
  '/chains/:chainId',
  asyncHandler(async (req, res) => {
    await adminService.deleteChain(Number(req.params.chainId));
    noContent(res);
  }),
);

// ── TOKENS ──

router.post(
  '/tokens',
  validate(createTokenSchema),
  asyncHandler(async (req, res) => {
    const token = await adminService.createToken(req.body);
    created(res, token);
  }),
);

router.get(
  '/tokens',
  asyncHandler(async (req, res) => {
    const chainId = req.query.chainId ? Number(req.query.chainId) : undefined;
    const tokens = await adminService.listTokens(chainId);
    success(res, tokens);
  }),
);

router.get(
  '/tokens/:id',
  asyncHandler(async (req, res) => {
    const token = await adminService.getToken(req.params.id);
    success(res, token);
  }),
);

router.put(
  '/tokens/:id',
  validate(updateTokenSchema),
  asyncHandler(async (req, res) => {
    const token = await adminService.updateToken(req.params.id, req.body);
    success(res, token);
  }),
);

router.delete(
  '/tokens/:id',
  asyncHandler(async (req, res) => {
    await adminService.deleteToken(req.params.id);
    noContent(res);
  }),
);

// ── CURRENCIES ──

const createCurrencySchema = z.object({
  code: z.string().min(1).max(10),
  name: z.string().min(1).max(100),
  symbol: z.string().min(1).max(5),
});

const updateCurrencySchema = z.object({
  code: z.string().min(1).max(10).optional(),
  name: z.string().min(1).max(100).optional(),
  symbol: z.string().min(1).max(5).optional(),
  isEnabled: z.boolean().optional(),
});

router.post(
  '/currencies',
  validate(createCurrencySchema),
  asyncHandler(async (req, res) => {
    const currency = await adminService.createCurrency(req.body);
    created(res, currency);
  }),
);

router.get(
  '/currencies',
  asyncHandler(async (_req, res) => {
    const currencies = await adminService.listCurrencies();
    success(res, currencies);
  }),
);

router.get(
  '/currencies/:id',
  asyncHandler(async (req, res) => {
    const currency = await adminService.getCurrency(req.params.id);
    success(res, currency);
  }),
);

router.put(
  '/currencies/:id',
  validate(updateCurrencySchema),
  asyncHandler(async (req, res) => {
    const currency = await adminService.updateCurrency(req.params.id, req.body);
    success(res, currency);
  }),
);

router.delete(
  '/currencies/:id',
  asyncHandler(async (req, res) => {
    await adminService.deleteCurrency(req.params.id);
    noContent(res);
  }),
);

// ── MERCHANTS (admin list) ──

router.get(
  '/merchants',
  validate(listQuerySchema, 'query'),
  asyncHandler(async (req, res) => {
    const result = await adminService.listMerchants(req.query as any);
    paginated(res, result.merchants, result.total, result.page, result.pageSize);
  }),
);

// ── MERCHANT DETAIL ──

router.get(
  '/merchants/:merchantId',
  asyncHandler(async (req, res) => {
    const detail = await adminService.getMerchantDetail(req.params.merchantId);
    success(res, detail);
  }),
);

// ── APPS (admin list all) ──

router.get(
  '/apps',
  validate(listQuerySchema, 'query'),
  asyncHandler(async (req, res) => {
    const result = await adminService.listAllApps(req.query as any);
    paginated(res, result.apps, result.total, result.page, result.pageSize);
  }),
);

// ── FEEDBACK (admin list/review) ──

router.get(
  '/feedback',
  validate(feedbackListQuerySchema, 'query'),
  asyncHandler(async (req, res) => {
    const result = await feedbackService.listFeedbackSubmissions(req.query as any);
    paginated(res, result.items, result.total, result.page, result.pageSize);
  }),
);

router.put(
  '/feedback/:id/status',
  validate(updateFeedbackStatusSchema),
  asyncHandler(async (req, res) => {
    const updated = await feedbackService.updateFeedbackStatus(
      req.params.id,
      req.body.status,
      req.merchant?.email ?? 'platform-admin',
    );
    success(res, updated);
  }),
);

// ── MERCHANT SUSPENSION ──

const suspendMerchantSchema = z.object({
  reason: z.string().max(500).optional(),
});

router.post(
  '/merchants/:merchantId/suspend',
  validate(suspendMerchantSchema),
  asyncHandler(async (req, res) => {
    const result = await adminService.suspendMerchant(req.params.merchantId, req.body.reason);
    success(res, result);
  }),
);

router.post(
  '/merchants/:merchantId/unsuspend',
  asyncHandler(async (req, res) => {
    const result = await adminService.unsuspendMerchant(req.params.merchantId);
    success(res, result);
  }),
);

// ── MERCHANT REFUNDS ──

router.get(
  '/merchants/:merchantId/refunds',
  validate(listQuerySchema, 'query'),
  asyncHandler(async (req, res) => {
    const { page, pageSize } = req.query as any;
    const result = await adminService.getMerchantRefunds(
      req.params.merchantId,
      page ? Number(page) : undefined,
      pageSize ? Number(pageSize) : undefined,
    );
    paginated(res, result.refunds, result.total, result.page, result.pageSize);
  }),
);

// ── CONTRACT DEPLOYMENTS ──

const createContractDeploymentSchema = z.object({
  chain: z.string().min(1).max(100),
  chainId: z.number().int().positive(),
  escrowAddress: z.string().regex(/^0x[a-fA-F0-9]{40}$/),
  merchantManagerAddress: z.string().regex(/^0x[a-fA-F0-9]{40}$/),
  deployTxHash: z.string().regex(/^0x[a-fA-F0-9]{64}$/).optional(),
  deployedAt: z.string().datetime().optional(),
});

const updateContractDeploymentSchema = z.object({
  escrowAddress: z.string().regex(/^0x[a-fA-F0-9]{40}$/).optional(),
  merchantManagerAddress: z.string().regex(/^0x[a-fA-F0-9]{40}$/).optional(),
  deployTxHash: z.string().regex(/^0x[a-fA-F0-9]{64}$/).optional(),
  deployedAt: z.string().datetime().optional(),
});

// ── TIMELOCK CONFIG ──

const updateTimelockConfigSchema = z.object({
  disputeStartSeconds: z.number().int().min(0).optional(),
  settlementSeconds: z.number().int().positive().optional(),
});

const setMerchantTimelockSchema = z.object({
  disputeStartSeconds: z.number().int().min(0),
  settlementSeconds: z.number().int().positive(),
});

// GET platform timelock defaults
router.get(
  '/timelock-config',
  asyncHandler(async (_req, res) => {
    const config = await timelockConfigService.getPlatformTimelockConfig();
    success(res, config);
  }),
);

// PUT platform timelock defaults
router.put(
  '/timelock-config',
  validate(updateTimelockConfigSchema),
  asyncHandler(async (req, res) => {
    const config = await timelockConfigService.updatePlatformTimelockConfig(req.body);
    success(res, config);
  }),
);

// GET merchant timelock override (null if none set)
router.get(
  '/merchants/:merchantId/timelock-config',
  asyncHandler(async (req, res) => {
    const override = await timelockConfigService.getMerchantTimelockOverride(req.params.merchantId);
    const effective = await timelockConfigService.getEffectiveTimelockConfig(req.params.merchantId);
    success(res, { override, effective });
  }),
);

// PUT merchant timelock override
router.put(
  '/merchants/:merchantId/timelock-config',
  validate(setMerchantTimelockSchema),
  asyncHandler(async (req, res) => {
    const override = await timelockConfigService.setMerchantTimelockOverride(
      req.params.merchantId,
      req.body,
    );
    success(res, override);
  }),
);

// DELETE merchant timelock override (revert to platform defaults)
router.delete(
  '/merchants/:merchantId/timelock-config',
  asyncHandler(async (req, res) => {
    await timelockConfigService.removeMerchantTimelockOverride(req.params.merchantId);
    noContent(res);
  }),
);

// ── FEE CONFIG ──

const updateFeeConfigSchema = z.object({
  feeBps: z.number().int().min(0).max(1000).optional(),
  conversionFeeBps: z.number().int().min(0).max(1000).optional(),
  singleChainSettlementFeeBps: z.number().int().min(0).max(1000).optional(),
  bankSettlementFeeBps: z.number().int().min(0).max(1000).optional(),
  swapQuoteTtlSeconds: z.number().int().min(30).max(600).optional(),
});

const setMerchantFeeSchema = z.object({
  feeBps: z.number().int().min(0).max(1000),
});

// GET platform fee default
router.get(
  '/fee-config',
  asyncHandler(async (_req, res) => {
    const feeBps = await feeConfigService.getPlatformFeeBps();
    const vas = await feeConfigService.getPlatformVasFees();
    success(res, { feeBps, ...vas });
  }),
);

// PUT platform fee default
router.put(
  '/fee-config',
  validate(updateFeeConfigSchema),
  asyncHandler(async (req, res) => {
    let feeBps = await feeConfigService.getPlatformFeeBps();
    if (req.body.feeBps !== undefined) {
      feeBps = await feeConfigService.updatePlatformFeeBps(req.body.feeBps);
    }
    const vas = await feeConfigService.updatePlatformVasFees({
      conversionFeeBps: req.body.conversionFeeBps,
      singleChainSettlementFeeBps: req.body.singleChainSettlementFeeBps,
      bankSettlementFeeBps: req.body.bankSettlementFeeBps,
      swapQuoteTtlSeconds: req.body.swapQuoteTtlSeconds,
    });
    success(res, { feeBps, ...vas });
  }),
);

// GET merchant fee override (null if none set)
router.get(
  '/merchants/:merchantId/fee-config',
  asyncHandler(async (req, res) => {
    const override = await feeConfigService.getMerchantFeeOverride(req.params.merchantId);
    const effective = await feeConfigService.getEffectiveFeeBps(req.params.merchantId);
    success(res, { override, effective });
  }),
);

// PUT merchant fee override
router.put(
  '/merchants/:merchantId/fee-config',
  validate(setMerchantFeeSchema),
  asyncHandler(async (req, res) => {
    const override = await feeConfigService.setMerchantFeeOverride(
      req.params.merchantId,
      req.body.feeBps,
    );
    success(res, override);
  }),
);

// DELETE merchant fee override (revert to platform defaults)
router.delete(
  '/merchants/:merchantId/fee-config',
  asyncHandler(async (req, res) => {
    await feeConfigService.removeMerchantFeeOverride(req.params.merchantId);
    noContent(res);
  }),
);

// ── Webhook Delivery Config ──

const updateWebhookConfigSchema = z.object({
  redundantSends: z.number().int().min(1).max(10).optional(),
  redundantDelaysMs: z.array(z.number().int().min(0)).max(10).optional(),
  baseDelayMs: z.number().int().min(1000).max(300_000).optional(),
  backoffMultiplier: z.number().min(1.01).max(5).optional(),
  maxDelayMs: z.number().int().min(60_000).max(86_400_000).optional(),
  maxRetries: z.number().int().min(1).max(200).optional(),
});

router.get(
  '/webhook-config',
  asyncHandler(async (_req, res) => {
    const config = await webhookConfigService.getWebhookDeliveryConfig();
    success(res, config);
  }),
);

router.put(
  '/webhook-config',
  validate(updateWebhookConfigSchema),
  asyncHandler(async (req, res) => {
    const config = await webhookConfigService.updateWebhookDeliveryConfig(req.body);
    success(res, config);
  }),
);

router.post(
  '/contracts',
  validate(createContractDeploymentSchema),
  asyncHandler(async (req, res) => {
    const contract = await adminService.createContractDeployment(req.body);
    created(res, contract);
  }),
);

router.get(
  '/contracts',
  asyncHandler(async (_req, res) => {
    const contracts = await adminService.listContractDeployments();
    success(res, contracts);
  }),
);

router.put(
  '/contracts/:id',
  validate(updateContractDeploymentSchema),
  asyncHandler(async (req, res) => {
    const contract = await adminService.updateContractDeployment(req.params.id, req.body);
    success(res, contract);
  }),
);

router.delete(
  '/contracts/:id',
  asyncHandler(async (req, res) => {
    await adminService.deleteContractDeployment(req.params.id);
    noContent(res);
  }),
);

const listBridgePaymentsSchema = z.object({
  status: z.enum(['stuck', 'stuck_settling', 'stuck_settled', 'refunded', 'pending', 'done', 'retrying', 'failed']).optional(),
  q: z.string().trim().min(2).max(80).optional(),
  page: z.coerce.number().int().min(1).optional(),
  pageSize: z.coerce.number().int().min(1).max(100).optional(),
});

router.get(
  '/bridge-payments',
  validate(listBridgePaymentsSchema, 'query'),
  asyncHandler(async (req, res) => {
    const query = req.query as unknown as z.infer<typeof listBridgePaymentsSchema>;
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 25;
    const db = getDatabaseClient();
    const where = {
      OR: [
        { bridgeTransferId: { not: null } },
        { bridgeStatus: { not: null } },
        { singleChainSettlementEnabled: true, settlementChainId: { not: null } },
      ],
      ...(query.status ? { bridgeStatus: query.status } : {}),
      ...(query.q ? { id: { startsWith: query.q } } : {}),
    };
    const [items, total] = await Promise.all([
      db.paymentIntent.findMany({
        where,
        orderBy: { updatedAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: {
          app: { select: { id: true, name: true, merchant: { select: { id: true, orgName: true, email: true } } } },
        },
      }),
      db.paymentIntent.count({ where }),
    ]);
    success(res, {
      items,
      page,
      pageSize,
      total,
      totalPages: Math.ceil(total / pageSize),
    });
  }),
);

router.get(
  '/bridge-payments/:id',
  asyncHandler(async (req, res) => {
    const snapshot = await getAdminBridgeSnapshot(req.params.id, adminLogger);
    if (!snapshot) {
      throw new NotFoundError('PaymentIntent', req.params.id);
    }
    success(res, snapshot);
  }),
);

router.post(
  '/bridge-payments/:id/retry',
  asyncHandler(async (req, res) => {
    await adminRetryBridge(req.params.id, adminLogger);
    success(res, { ok: true });
  }),
);

router.post(
  '/bridge-payments/:id/stuck-credit',
  asyncHandler(async (req, res) => {
    await adminStuckCredit(req.params.id, adminLogger);
    success(res, { ok: true });
  }),
);

const bankFeeConfigSchema = z.object({
  bankFeeIndividualUsd: z.union([z.string(), z.number()]).optional(),
  bankFeeBusinessUsd: z.union([z.string(), z.number()]).optional(),
  bankFeeTestAppId: z.string().min(1).optional(),
  bankFeeTestApiKey: z.string().min(8).optional(),
  bankFeeTestWebhookSecret: z.string().min(8).optional(),
  bankFeeLiveAppId: z.string().min(1).optional(),
  bankFeeLiveApiKey: z.string().min(8).optional(),
  bankFeeLiveWebhookSecret: z.string().min(8).optional(),
  bankOnrampFeeBps: z.number().int().min(0).max(100_000).optional(),
  bankOfframpFeeBps: z.number().int().min(0).max(100_000).optional(),
  bankFxUsdEurBps: z.number().int().min(0).max(100_000).optional(),
  bankFxUsdMxnBps: z.number().int().min(0).max(100_000).optional(),
  bankFxUsdGbpBps: z.number().int().min(0).max(100_000).optional(),
  bankFxUsdBrlBps: z.number().int().min(0).max(100_000).optional(),
  bankAchFeeCents: z.number().int().min(0).max(100_000).optional(),
  bankWireFeeCents: z.number().int().min(0).max(100_000).optional(),
  bankGasFeeNote: z.string().max(200).nullable().optional(),
});

router.get(
  '/bank/fee-config',
  asyncHandler(async (_req, res) => {
    const { getPublicFeeConfig } = await import('../fiat/admin-bank.service.js');
    success(res, await getPublicFeeConfig());
  }),
);

router.patch(
  '/bank/fee-config',
  validate(bankFeeConfigSchema),
  asyncHandler(async (req, res) => {
    const { updateFeeConfig } = await import('../fiat/admin-bank.service.js');
    success(res, await updateFeeConfig(req.body));
  }),
);

router.get(
  '/bank/charges',
  validate(z.object({
    status: z.string().optional(),
    merchantId: z.string().optional(),
    rail: z.string().optional(),
    page: z.coerce.number().int().min(1).optional(),
    pageSize: z.coerce.number().int().min(1).max(100).optional(),
  }), 'query'),
  asyncHandler(async (req, res) => {
    const { listCharges } = await import('../fiat/onboarding-fee/fee.service.js');
    const query = req.query as {
      status?: string;
      merchantId?: string;
      rail?: string;
      page?: number;
      pageSize?: number;
    };
    const result = await listCharges(query);
    success(res, {
      ...result,
      items: result.items.map((fee) => ({
        id: fee.id,
        rail: fee.rail,
        amountUsd: fee.amountUsd.toString(),
        status: fee.status,
        checkoutSessionId: fee.checkoutSessionId,
        paymentIntentId: fee.paymentIntentId,
        periodStart: fee.periodStart,
        periodEnd: fee.periodEnd,
        createdAt: fee.createdAt,
        accountOpen: Boolean(fee.virtualAccount),
        accountStatus: fee.virtualAccount?.status ?? null,
        environment: fee.profile.environment,
        accountType: fee.profile.accountType,
        merchant: fee.profile.merchant,
      })),
    });
  }),
);

router.get(
  '/bank/charges/:id',
  asyncHandler(async (req, res) => {
    const { getCharge } = await import('../fiat/onboarding-fee/fee.service.js');
    const fee = await getCharge(req.params.id);
    success(res, {
      id: fee.id,
      rail: fee.rail,
      amountUsd: fee.amountUsd.toString(),
      status: fee.status,
      checkoutSessionId: fee.checkoutSessionId,
      paymentIntentId: fee.paymentIntentId,
      periodStart: fee.periodStart,
      periodEnd: fee.periodEnd,
      createdAt: fee.createdAt,
      environment: fee.profile.environment,
      accountType: fee.profile.accountType,
      merchant: fee.profile.merchant,
      account: fee.virtualAccount
        ? {
            id: fee.virtualAccount.id,
            status: fee.virtualAccount.status,
            rail: fee.virtualAccount.rail,
          }
        : null,
    });
  }),
);

router.get(
  '/bank/own-accounts',
  validate(z.object({ status: z.string().optional() }), 'query'),
  asyncHandler(async (req, res) => {
    const { listOwnAccountsForAdmin, listStatusForAdmin } = await import('../fiat/own-accounts/own-account.service.js');
    const rows = await listOwnAccountsForAdmin(
      typeof req.query.status === 'string' ? req.query.status : undefined,
    );
    success(res, rows.map((row) => {
      const listed = listStatusForAdmin(row);
      return {
        id: row.id,
        environment: row.profile.environment,
        accountType: row.profile.accountType,
        status: listed.status,
        changeStatus: listed.changeStatus,
        identityStatus: row.profile.identitySessions[0]?.status ?? null,
        hasStatement: Boolean(row.statementS3Key),
        hasPendingStatement: Boolean(row.pendingStatementS3Key),
        country: listed.country,
        name: listed.name,
        rejectionReason: row.rejectionReason,
        changeRejectionReason: row.changeRejectionReason,
        submittedAt: row.pendingSubmittedAt ?? row.submittedAt,
        reviewedAt: row.reviewedAt,
        merchant: row.profile.merchant,
      };
    }));
  }),
);

router.get(
  '/bank/own-accounts/:id',
  asyncHandler(async (req, res) => {
    const { getOwnAccountForAdmin } = await import('../fiat/own-accounts/own-account.service.js');
    success(res, await getOwnAccountForAdmin(req.params.id));
  }),
);

router.get(
  '/bank/own-accounts/:id/statement',
  asyncHandler(async (req, res) => {
    const { statementDownloadUrl } = await import('../fiat/own-accounts/own-account.service.js');
    const kind = req.query.kind === 'pending' ? 'pending' : 'live';
    const url = await statementDownloadUrl(req.params.id, kind);
    success(res, { url });
  }),
);

router.post(
  '/bank/own-accounts/:id/approve',
  validate(z.object({ note: z.string().max(500).optional() })),
  asyncHandler(async (req, res) => {
    const { approveOwnAccount } = await import('../fiat/own-accounts/own-account.service.js');
    const profile = await approveOwnAccount(req.params.id, req.body.note);
    success(res, { ownAccountStatus: profile.ownAccountStatus });
  }),
);

router.post(
  '/bank/own-accounts/:id/reject',
  validate(z.object({ reason: z.string().min(1).max(500) })),
  asyncHandler(async (req, res) => {
    const { rejectOwnAccount } = await import('../fiat/own-accounts/own-account.service.js');
    const profile = await rejectOwnAccount(req.params.id, req.body.reason);
    success(res, { ownAccountStatus: profile.ownAccountStatus });
  }),
);

router.get(
  '/bank/accounts',
  asyncHandler(async (_req, res) => {
    const { listGlobalAccounts } = await import('../fiat/admin-bank.service.js');
    const rows = await listGlobalAccounts();
    success(res, rows.map((row) => ({
      id: row.id,
      rail: row.rail,
      status: row.status,
      environment: row.environment,
      createdAt: row.createdAt,
      merchant: row.profile.merchant,
    })));
  }),
);

router.get(
  '/bank/accounts/:id/activity',
  asyncHandler(async (req, res) => {
    const { listAccountActivity } = await import('../fiat/virtual-accounts/activity.service.js');
    const db = getDatabaseClient();
    const account = await db.fiatVirtualAccount.findUnique({
      where: { id: req.params.id },
      include: { profile: true },
    });
    if (!account) throw new NotFoundError('GlobalBankAccount', req.params.id);
    const activity = await listAccountActivity(account.id);
    success(res, {
      account: {
        id: account.id,
        rail: account.rail,
        status: account.status,
        environment: account.environment,
        depositInstructions: account.depositInstructions,
        merchantId: account.profile.merchantId,
      },
      activity,
    });
  }),
);

router.post(
  '/bank/accounts/:id/simulate-inbound',
  asyncHandler(async (req, res) => {
    const { simulateInbound } = await import('../fiat/virtual-accounts/activity.service.js');
    const activity = await simulateInbound(req.params.id, true);
    success(res, { activity });
  }),
);

router.use(emailCampaignRoutes);
router.use('/links', adminShortLinkRoutes);

export default router;

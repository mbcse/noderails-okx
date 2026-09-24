import express, { Router } from 'express';
import { z } from 'zod';
import jwt from 'jsonwebtoken';
import cookieParser from 'cookie-parser';
import { asyncHandler } from '../../lib/async-handler.js';
import { validate } from '../../lib/validate.js';
import { authenticateJwt, requireAdmin } from '../../lib/auth.js';
import { success, created, noContent } from '../../lib/response.js';
import { AuthenticationError, AUTH_CONFIG } from '../../lib/constants.js';
import { env } from '../../config.js';
import * as chainService from '../chains/chain.service.js';
import { testRpcEndpoint, listEndpointsForChain } from '../rpc/rpc-pool.service.js';
import { getHealthReport } from '../health/health.service.js';

const router: express.Router = Router();
router.use(cookieParser());

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
      { sub: 'bpc-admin', email: env.ADMIN_EMAIL, role: 'ADMIN', type: 'access' },
      env.JWT_SECRET,
      { expiresIn: AUTH_CONFIG.ACCESS_TOKEN_TTL },
    );
    const refreshToken = jwt.sign(
      { sub: 'bpc-admin', email: env.ADMIN_EMAIL, role: 'ADMIN', type: 'refresh' },
      env.JWT_REFRESH_SECRET,
      { expiresIn: AUTH_CONFIG.REFRESH_TOKEN_TTL },
    );

    res.cookie(AUTH_CONFIG.ADMIN_REFRESH_COOKIE_NAME, refreshToken, {
      httpOnly: true,
      secure: env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });

    success(res, { accessToken, admin: { email: env.ADMIN_EMAIL, role: 'ADMIN' } });
  }),
);

router.post(
  '/auth/refresh',
  asyncHandler(async (req, res) => {
    const token = req.cookies?.[AUTH_CONFIG.ADMIN_REFRESH_COOKIE_NAME];
    if (!token) {
      res.status(401).json({ success: false, error: { code: 'NO_REFRESH_TOKEN', message: 'No refresh token' } });
      return;
    }

    let payload: { email: string; role: string; type: string };
    try {
      payload = jwt.verify(token, env.JWT_REFRESH_SECRET) as typeof payload;
    } catch {
      res.clearCookie(AUTH_CONFIG.ADMIN_REFRESH_COOKIE_NAME);
      res.status(401).json({ success: false, error: { code: 'INVALID_REFRESH', message: 'Invalid refresh token' } });
      return;
    }

    if (payload.type !== 'refresh' || payload.role !== 'ADMIN') {
      res.status(401).json({ success: false, error: { code: 'INVALID_TOKEN', message: 'Invalid token type' } });
      return;
    }

    const accessToken = jwt.sign(
      { sub: 'bpc-admin', email: payload.email, role: 'ADMIN', type: 'access' },
      env.JWT_SECRET,
      { expiresIn: AUTH_CONFIG.ACCESS_TOKEN_TTL },
    );

    success(res, { accessToken, admin: { email: payload.email, role: 'ADMIN' } });
  }),
);

router.post(
  '/auth/logout',
  asyncHandler(async (_req, res) => {
    res.clearCookie(AUTH_CONFIG.ADMIN_REFRESH_COOKIE_NAME);
    noContent(res);
  }),
);

router.use(authenticateJwt(), requireAdmin());

const chainSchema = z.object({
  chainId: z.number().int().positive(),
  chainType: z.enum(['EVM', 'SOLANA', 'SUI']),
  name: z.string().min(1),
  displayName: z.string().optional(),
  nativeCurrencySymbol: z.string().min(1),
  nativeCurrencyDecimals: z.number().int().optional(),
  explorerUrl: z.string().url().optional(),
  coingeckoPlatformId: z.string().optional(),
  isTestnet: z.boolean().optional(),
  isEnabled: z.boolean().optional(),
});

router.get(
  '/chains',
  asyncHandler(async (_req, res) => {
    success(res, await chainService.listChains(true));
  }),
);

router.post(
  '/chains',
  validate(chainSchema),
  asyncHandler(async (req, res) => {
    created(res, await chainService.createChain(req.body));
  }),
);

router.put(
  '/chains/:chainId',
  asyncHandler(async (req, res) => {
    const chainId = parseInt(req.params.chainId, 10);
    success(res, await chainService.updateChain(chainId, req.body));
  }),
);

router.delete(
  '/chains/:chainId',
  asyncHandler(async (req, res) => {
    await chainService.deleteChain(parseInt(req.params.chainId, 10));
    noContent(res);
  }),
);

const rpcSchema = z.object({
  chainId: z.number().int().positive(),
  url: z.string().url(),
  priority: z.number().int().optional(),
  weight: z.number().int().optional(),
});

router.get(
  '/rpc-endpoints',
  asyncHandler(async (req, res) => {
    const chainId = req.query.chainId ? parseInt(String(req.query.chainId), 10) : undefined;
    success(res, await chainService.listRpcEndpoints(chainId));
  }),
);

router.get(
  '/rpc-endpoints/health',
  asyncHandler(async (_req, res) => {
    success(res, await chainService.listRpcEndpoints());
  }),
);

router.post(
  '/rpc-endpoints',
  validate(rpcSchema),
  asyncHandler(async (req, res) => {
    created(res, await chainService.createRpcEndpoint(req.body));
  }),
);

router.patch(
  '/rpc-endpoints/:id',
  asyncHandler(async (req, res) => {
    success(res, await chainService.updateRpcEndpoint(req.params.id, req.body));
  }),
);

router.delete(
  '/rpc-endpoints/:id',
  asyncHandler(async (req, res) => {
    await chainService.deleteRpcEndpoint(req.params.id);
    noContent(res);
  }),
);

router.post(
  '/rpc-endpoints/:id/test',
  asyncHandler(async (req, res) => {
    success(res, await testRpcEndpoint(req.params.id));
  }),
);

router.get(
  '/chains/:chainId/rpc-endpoints',
  asyncHandler(async (req, res) => {
    const chainId = parseInt(req.params.chainId, 10);
    success(res, await listEndpointsForChain(chainId));
  }),
);

const optionalSourceId = z
  .string()
  .trim()
  .max(100)
  .nullable()
  .optional()
  .transform((value) => (value === '' ? null : value));

const tokenSchema = z.object({
  chainId: z.number().int().positive(),
  contractAddress: z.string().min(1),
  symbol: z.string().min(1),
  name: z.string().min(1),
  decimals: z.number().int(),
  isNative: z.boolean().optional(),
  coingeckoId: optionalSourceId,
  defillamaId: optionalSourceId,
});

const tokenUpdateSchema = z
  .object({
    contractAddress: z.string().min(1).optional(),
    symbol: z.string().min(1).optional(),
    name: z.string().min(1).optional(),
    decimals: z.number().int().optional(),
    isNative: z.boolean().optional(),
    isEnabled: z.boolean().optional(),
    coingeckoId: optionalSourceId,
    defillamaId: optionalSourceId,
  })
  .refine((data) => Object.keys(data).length > 0, { message: 'No fields to update' });

router.get(
  '/tokens',
  asyncHandler(async (req, res) => {
    const chainId = req.query.chainId ? parseInt(String(req.query.chainId), 10) : undefined;
    success(res, await chainService.listTokens(chainId));
  }),
);

router.post(
  '/tokens',
  validate(tokenSchema),
  asyncHandler(async (req, res) => {
    created(res, await chainService.createToken(req.body));
  }),
);

router.patch(
  '/tokens/:id',
  validate(tokenUpdateSchema),
  asyncHandler(async (req, res) => {
    success(res, await chainService.updateToken(req.params.id, req.body));
  }),
);

router.delete(
  '/tokens/:id',
  asyncHandler(async (req, res) => {
    await chainService.deleteToken(req.params.id);
    noContent(res);
  }),
);

router.get(
  '/price-sources',
  asyncHandler(async (_req, res) => {
    success(res, await chainService.listPriceSources());
  }),
);

router.patch(
  '/price-sources/:id',
  asyncHandler(async (req, res) => {
    success(res, await chainService.updatePriceSource(req.params.id, req.body));
  }),
);

router.post(
  '/price-sources/:id/mappings',
  asyncHandler(async (req, res) => {
    const { assetKey, sourceAssetId } = req.body as { assetKey: string; sourceAssetId: string };
    success(
      res,
      await chainService.upsertPriceSourceMapping(req.params.id, assetKey, sourceAssetId),
    );
  }),
);

router.get(
  '/health',
  asyncHandler(async (_req, res) => {
    success(res, await getHealthReport());
  }),
);

export default router;

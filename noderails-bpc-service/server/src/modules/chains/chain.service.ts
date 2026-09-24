import { Prisma, type ChainType } from '@prisma/client';
import { getDatabaseClient } from '../../lib/db.js';
import { ConflictError, NotFoundError, ValidationError } from '../../lib/constants.js';
import { buildTokenKey } from '../prices/asset-resolver.helpers.js';

export interface CreateChainInput {
  chainId: number;
  chainType: ChainType;
  name: string;
  displayName?: string;
  nativeCurrencySymbol: string;
  nativeCurrencyDecimals?: number;
  explorerUrl?: string;
  coingeckoPlatformId?: string;
  isTestnet?: boolean;
}

export async function createChain(input: CreateChainInput) {
  const db = getDatabaseClient();
  const existing = await db.chain.findUnique({ where: { chainId: input.chainId } });
  if (existing) throw new ConflictError(`Chain ${input.chainId} already exists`);

  return db.chain.create({
    data: {
      chainId: input.chainId,
      chainType: input.chainType,
      name: input.name,
      displayName: input.displayName ?? input.name,
      nativeCurrencySymbol: input.nativeCurrencySymbol,
      nativeCurrencyDecimals:
        input.nativeCurrencyDecimals ??
        (input.chainType === 'SUI' || input.chainType === 'SOLANA' ? 9 : 18),
      explorerUrl: input.explorerUrl,
      coingeckoPlatformId: input.coingeckoPlatformId,
      isTestnet: input.isTestnet ?? false,
    },
    include: { rpcEndpoints: true, tokens: true },
  });
}

export async function listChains(includeDisabled = false) {
  const db = getDatabaseClient();
  return db.chain.findMany({
    where: includeDisabled ? undefined : { isEnabled: true },
    orderBy: { chainId: 'asc' },
    include: {
      rpcEndpoints: { orderBy: { priority: 'asc' } },
      tokens: { where: { isEnabled: true } },
    },
  });
}

export async function getChain(chainId: number) {
  const db = getDatabaseClient();
  const chain = await db.chain.findUnique({
    where: { chainId },
    include: { rpcEndpoints: { orderBy: { priority: 'asc' } }, tokens: true },
  });
  if (!chain) throw new NotFoundError('Chain', String(chainId));
  return chain;
}

export async function updateChain(
  chainId: number,
  data: Partial<CreateChainInput> & { isEnabled?: boolean },
) {
  const db = getDatabaseClient();
  const chain = await db.chain.findUnique({ where: { chainId } });
  if (!chain) throw new NotFoundError('Chain', String(chainId));

  const { chainId: _c, ...rest } = data;
  return db.chain.update({
    where: { chainId },
    data: rest,
    include: { rpcEndpoints: true, tokens: true },
  });
}

export async function deleteChain(chainId: number) {
  const db = getDatabaseClient();
  const chain = await db.chain.findUnique({ where: { chainId } });
  if (!chain) throw new NotFoundError('Chain', String(chainId));
  await db.chain.delete({ where: { chainId } });
}

export interface CreateRpcEndpointInput {
  chainId: number;
  url: string;
  priority?: number;
  weight?: number;
}

export async function createRpcEndpoint(input: CreateRpcEndpointInput) {
  const db = getDatabaseClient();
  const chain = await db.chain.findUnique({ where: { chainId: input.chainId } });
  if (!chain) throw new NotFoundError('Chain', String(input.chainId));

  try {
    new URL(input.url);
  } catch {
    throw new ValidationError('Invalid RPC URL');
  }

  return db.rpcEndpoint.create({
    data: {
      chainId: input.chainId,
      url: input.url,
      priority: input.priority ?? 100,
      weight: input.weight ?? 1,
    },
  });
}

export async function listRpcEndpoints(chainId?: number) {
  const db = getDatabaseClient();
  return db.rpcEndpoint.findMany({
    where: chainId ? { chainId } : undefined,
    orderBy: [{ chainId: 'asc' }, { priority: 'asc' }],
    include: { chain: true },
  });
}

export async function updateRpcEndpoint(
  id: string,
  data: Partial<{ url: string; priority: number; weight: number; isEnabled: boolean }>,
) {
  const db = getDatabaseClient();
  const endpoint = await db.rpcEndpoint.findUnique({ where: { id } });
  if (!endpoint) throw new NotFoundError('RpcEndpoint', id);

  if (data.url) {
    try {
      new URL(data.url);
    } catch {
      throw new ValidationError('Invalid RPC URL');
    }
  }

  return db.rpcEndpoint.update({ where: { id }, data });
}

export async function deleteRpcEndpoint(id: string) {
  const db = getDatabaseClient();
  const endpoint = await db.rpcEndpoint.findUnique({ where: { id } });
  if (!endpoint) throw new NotFoundError('RpcEndpoint', id);
  await db.rpcEndpoint.delete({ where: { id } });
}

export interface CreateTokenInput {
  chainId: number;
  contractAddress: string;
  symbol: string;
  name: string;
  decimals: number;
  isNative?: boolean;
  coingeckoId?: string;
  defillamaId?: string;
}

export async function createToken(input: CreateTokenInput) {
  const db = getDatabaseClient();
  const chain = await db.chain.findUnique({ where: { chainId: input.chainId } });
  if (!chain) throw new NotFoundError('Chain', String(input.chainId));

  const tokenKey = buildTokenKey(input.symbol, input.chainId);
  return db.token.create({ data: { ...input, tokenKey } });
}

export async function listTokens(chainId?: number) {
  const db = getDatabaseClient();
  return db.token.findMany({
    where: chainId ? { chainId } : undefined,
    orderBy: [{ chainId: 'asc' }, { symbol: 'asc' }],
    include: { chain: true },
  });
}

export async function getTokenById(id: string) {
  const db = getDatabaseClient();
  const token = await db.token.findUnique({ where: { id }, include: { chain: true } });
  if (!token) throw new NotFoundError('Token', id);
  return token;
}

export async function getTokenByKey(tokenKey: string) {
  const db = getDatabaseClient();
  const token = await db.token.findFirst({
    where: { tokenKey: tokenKey.toUpperCase() },
    include: { chain: true },
  });
  if (!token) throw new NotFoundError('Token', tokenKey);
  return token;
}

function optionalText(value: string | null | undefined): string | null | undefined {
  if (value === undefined) return undefined;
  if (value === null || value.trim() === '') return null;
  return value.trim();
}

export async function updateToken(
  id: string,
  data: Partial<CreateTokenInput & { isEnabled: boolean }>,
) {
  const db = getDatabaseClient();
  const token = await db.token.findUnique({ where: { id } });
  if (!token) throw new NotFoundError('Token', id);

  const { chainId: _c, symbol, coingeckoId, defillamaId, ...rest } = data;
  const nextSymbol = symbol !== undefined ? symbol.trim().toUpperCase() : undefined;
  const updateData = {
    ...rest,
    coingeckoId: optionalText(coingeckoId),
    defillamaId: optionalText(defillamaId),
    ...(nextSymbol !== undefined
      ? { symbol: nextSymbol, tokenKey: buildTokenKey(nextSymbol, token.chainId) }
      : {}),
  };

  try {
    return await db.token.update({ where: { id }, data: updateData });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      throw new ConflictError('A token with this symbol or contract already exists on this chain');
    }
    throw err;
  }
}

export async function deleteToken(id: string) {
  const db = getDatabaseClient();
  const token = await db.token.findUnique({ where: { id } });
  if (!token) throw new NotFoundError('Token', id);
  await db.token.delete({ where: { id } });
}

export async function listPriceSources() {
  const db = getDatabaseClient();
  return db.priceSource.findMany({
    orderBy: { priority: 'asc' },
    include: { mappings: true },
  });
}

export async function updatePriceSource(
  id: string,
  data: Partial<{
    priority: number;
    isEnabled: boolean;
    rateLimitPerMin: number;
    timeoutMs: number;
    apiKeyEnvVar: string | null;
  }>,
) {
  const db = getDatabaseClient();
  const source = await db.priceSource.findUnique({ where: { id } });
  if (!source) throw new NotFoundError('PriceSource', id);
  return db.priceSource.update({ where: { id }, data });
}

export async function upsertPriceSourceMapping(
  priceSourceId: string,
  assetKey: string,
  sourceAssetId: string,
) {
  const db = getDatabaseClient();
  return db.priceSourceMapping.upsert({
    where: { priceSourceId_assetKey: { priceSourceId, assetKey } },
    create: { priceSourceId, assetKey, sourceAssetId },
    update: { sourceAssetId },
  });
}

export async function deletePriceSourceMapping(id: string) {
  const db = getDatabaseClient();
  await db.priceSourceMapping.delete({ where: { id } });
}

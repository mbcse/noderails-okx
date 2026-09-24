import { getDatabaseClient } from '../../lib/db.js';
import { NotFoundError, ValidationError, isNativeToken } from '../../lib/constants.js';
import { getChain } from '../chains/chain.service.js';
import { buildAssetKey } from './sources/types.js';
import { buildTokenKey, splitTrailingChainId } from './asset-resolver.helpers.js';

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type AssetResolveVia =
  | 'token_id'
  | 'token_key'
  | 'contract_chain'
  | 'symbol_chain'
  | 'symbol';

export interface ResolvedAsset {
  /** Original input */
  asset: string;
  resolvedVia: AssetResolveVia;
  tokenId?: string;
  tokenKey?: string;
  symbol?: string;
  chainId?: number;
  contractAddress?: string;
  coingeckoId?: string;
  defillamaId?: string;
  assetKey: string;
}

function isUuid(value: string): boolean {
  return UUID_RE.test(value);
}

/** EVM hex, Solana base58, Sui coin type, or native sentinel */
function looksLikeAddress(value: string): boolean {
  const v = value.trim();
  if (isNativeToken(v)) return true;
  if (/^0x[0-9a-fA-F]{40}$/.test(v)) return true;
  if (/^0x[0-9a-fA-F]{64}$/.test(v)) return true;
  if (/^0x2::/.test(v)) return true;
  if (/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(v)) return true;
  return false;
}

function fromTokenRecord(
  asset: string,
  token: {
    id: string;
    symbol: string;
    chainId: number;
    contractAddress: string;
    coingeckoId: string | null;
    defillamaId: string | null;
  },
  resolvedVia: AssetResolveVia,
): ResolvedAsset {
  const tokenKey = buildTokenKey(token.symbol, token.chainId);
  const isNative = isNativeToken(token.contractAddress);
  return {
    asset,
    resolvedVia,
    tokenId: token.id,
    tokenKey,
    symbol: token.symbol.toUpperCase(),
    chainId: token.chainId,
    contractAddress: isNative ? undefined : token.contractAddress,
    coingeckoId: token.coingeckoId ?? undefined,
    defillamaId: token.defillamaId ?? undefined,
    assetKey: isNative
      ? tokenKey
      : buildAssetKey({ chainId: token.chainId, contractAddress: token.contractAddress }),
  };
}

async function lookupTokenById(id: string): Promise<ResolvedAsset | null> {
  const db = getDatabaseClient();
  const token = await db.token.findUnique({ where: { id } });
  if (!token || !token.isEnabled) return null;
  return fromTokenRecord(id, token, 'token_id');
}

async function lookupTokenByKey(tokenKey: string): Promise<ResolvedAsset | null> {
  const db = getDatabaseClient();
  const token = await db.token.findFirst({
    where: {
      isEnabled: true,
      OR: [
        { tokenKey: tokenKey.toUpperCase() },
        // legacy rows before tokenKey backfill
        ...(() => {
          const parsed = splitTrailingChainId(tokenKey);
          if (!parsed) return [];
          return [{ symbol: parsed.head.toUpperCase(), chainId: parsed.chainId }];
        })(),
      ],
    },
  });
  if (!token) return null;
  return fromTokenRecord(tokenKey, token, 'token_key');
}

async function lookupTokenByContract(
  chainId: number,
  contractAddress: string,
): Promise<ResolvedAsset | null> {
  const db = getDatabaseClient();
  const normalized = contractAddress.trim();
  const tokens = await db.token.findMany({
    where: { chainId, isEnabled: true },
  });
  const token = tokens.find(
    (t) => t.contractAddress.toLowerCase() === normalized.toLowerCase(),
  );
  if (!token) return null;
  return fromTokenRecord(`${normalized}-${chainId}`, token, 'contract_chain');
}

/**
 * Parse the unified `asset` parameter.
 *
 * Supported formats:
 * - Symbol only:           `ETH`, `SOL`
 * - Symbol + chain:        `USDC-137`, `ETH-1`
 * - Contract + chain:      `0xa0b8...-1`, `EPjF...-103`
 * - Registered token id:   UUID from tokens table
 * - Registered token key:  `USDC-137` (same as symbol-chain when in DB)
 */
export async function resolveAsset(asset: string): Promise<ResolvedAsset> {
  const input = asset.trim();
  if (!input) throw new ValidationError('asset is required');

  if (isUuid(input)) {
    const byId = await lookupTokenById(input);
    if (byId) return byId;
    throw new NotFoundError('Token', input);
  }

  const compound = splitTrailingChainId(input);
  if (compound) {
    const { head, chainId } = compound;

    if (looksLikeAddress(head)) {
      const byContract = await lookupTokenByContract(chainId, head);
      if (byContract) return byContract;

      const isNative = isNativeToken(head);
      if (isNative) {
        const chain = await getChain(chainId);
        const tokenKey = buildTokenKey(chain.nativeCurrencySymbol, chainId);
        return {
          asset: input,
          resolvedVia: 'contract_chain',
          symbol: chain.nativeCurrencySymbol.toUpperCase(),
          chainId,
          tokenKey,
          assetKey: tokenKey,
        };
      }

      return {
        asset: input,
        resolvedVia: 'contract_chain',
        chainId,
        contractAddress: head,
        assetKey: buildAssetKey({ chainId, contractAddress: head }),
      };
    }

    const byKey = await lookupTokenByKey(input);
    if (byKey) return byKey;

    return {
      asset: input,
      resolvedVia: 'symbol_chain',
      symbol: head.toUpperCase(),
      chainId,
      tokenKey: buildTokenKey(head, chainId),
      assetKey: buildTokenKey(head, chainId),
    };
  }

  const byKey = await lookupTokenByKey(input);
  if (byKey) return byKey;

  return {
    asset: input,
    resolvedVia: 'symbol',
    symbol: input.toUpperCase(),
    assetKey: buildAssetKey({ symbol: input }),
  };
}

export function toPriceLookupInput(resolved: ResolvedAsset, currency?: string) {
  return {
    symbol: resolved.symbol,
    chainId: resolved.chainId,
    contractAddress: resolved.contractAddress,
    currency,
    coingeckoId: resolved.coingeckoId,
    defillamaId: resolved.defillamaId,
  };
}

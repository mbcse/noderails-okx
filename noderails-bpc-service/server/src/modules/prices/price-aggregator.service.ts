import { getRedis } from '../../lib/redis.js';
import { getDatabaseClient } from '../../lib/db.js';
import { env } from '../../config.js';
import { getChain } from '../chains/chain.service.js';
import { getAdapter } from './sources/index.js';
import { logThrottle } from '../../lib/log-throttle.js';
import {
  buildAssetKey,
  filterOutliers,
  median,
  type AggregatedPrice,
  type PriceRequest,
  type SourceQuote,
} from './sources/types.js';
import type { Logger } from '../../lib/logger.js';
import { resolveAsset, toPriceLookupInput, type ResolvedAsset } from './asset-resolver.service.js';

export interface AggregatedPriceWithAsset extends AggregatedPrice {
  asset: string;
  resolvedVia: ResolvedAsset['resolvedVia'];
  tokenId?: string;
  tokenKey?: string;
}

const CACHE_PREFIX = 'price:';
const STALE_LOG_INTERVAL_MS = 120_000;
/** Assets currently serving stale cache — cleared when fresh fetch succeeds. */
const staleModeKeys = new Set<string>();

interface SourceFetchDiagnostics {
  succeeded: string[];
  rateLimited: string[];
  unsupported: string[];
  failed: Array<{ source: string; error: string }>;
}

interface CacheEntry {
  price: number;
  sourcesUsed: string[];
  fetchedAt: number;
}

function cacheKey(assetKey: string, currency: string): string {
  return `${CACHE_PREFIX}${assetKey}:${currency.toUpperCase()}`;
}

async function getCached(assetKey: string, currency: string): Promise<CacheEntry | null> {
  const raw = await getRedis().get(cacheKey(assetKey, currency));
  if (!raw) return null;
  return JSON.parse(raw) as CacheEntry;
}

async function setCached(assetKey: string, currency: string, entry: CacheEntry): Promise<void> {
  await getRedis().set(
    cacheKey(assetKey, currency),
    JSON.stringify(entry),
    'EX',
    env.PRICE_MAX_STALENESS_SEC,
  );
}

async function checkRateLimit(sourceSlug: string, limitPerMin: number): Promise<boolean> {
  const redis = getRedis();
  const key = `price_rl:${sourceSlug}:${Math.floor(Date.now() / 60000)}`;
  const count = await redis.incr(key);
  if (count === 1) await redis.expire(key, 60);
  return count <= limitPerMin;
}

async function fetchFromSources(
  request: PriceRequest,
  logger: Logger,
): Promise<{ quotes: SourceQuote[]; diagnostics: SourceFetchDiagnostics }> {
  const db = getDatabaseClient();
  const sources = await db.priceSource.findMany({
    where: { isEnabled: true },
    orderBy: { priority: 'asc' },
  });

  const quotes: SourceQuote[] = [];
  const diagnostics: SourceFetchDiagnostics = {
    succeeded: [],
    rateLimited: [],
    unsupported: [],
    failed: [],
  };

  await Promise.allSettled(
    sources.map(async (sourceConfig: { slug: string; rateLimitPerMin: number }) => {
      const adapter = getAdapter(sourceConfig.slug);
      if (!adapter) return;
      if (!adapter.supports(request)) {
        diagnostics.unsupported.push(sourceConfig.slug);
        return;
      }

      const allowed = await checkRateLimit(sourceConfig.slug, sourceConfig.rateLimitPerMin);
      if (!allowed) {
        diagnostics.rateLimited.push(sourceConfig.slug);
        return;
      }

      try {
        const quote = await adapter.fetchQuote(request);
        quotes.push(quote);
        diagnostics.succeeded.push(sourceConfig.slug);
      } catch (err) {
        diagnostics.failed.push({
          source: sourceConfig.slug,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }),
  );

  if (quotes.length === 0) {
    const key = `price-fetch-empty:${request.assetKey}:${request.currency}`;
    const { shouldLog, suppressed } = logThrottle(key, STALE_LOG_INTERVAL_MS);
    if (shouldLog) {
      logger.warn('All price sources failed or skipped', {
        assetKey: request.assetKey,
        symbol: request.symbol,
        currency: request.currency,
        succeeded: diagnostics.succeeded,
        rateLimited: diagnostics.rateLimited,
        unsupported: diagnostics.unsupported,
        failed: diagnostics.failed,
        suppressedSinceLastLog: suppressed,
      });
    }
  }

  return { quotes, diagnostics };
}

function buildResult(
  request: PriceRequest,
  price: number,
  sourcesUsed: string[],
  fetchedAt: number,
  stale: boolean,
): AggregatedPrice {
  return {
    assetKey: request.assetKey,
    symbol: request.symbol,
    currency: request.currency.toUpperCase(),
    price,
    sourcesUsed,
    cachedAt: new Date(fetchedAt).toISOString(),
    stale,
  };
}

export async function resolvePriceRequest(input: {
  symbol?: string;
  chainId?: number;
  contractAddress?: string;
  currency?: string;
  coingeckoId?: string;
  defillamaId?: string;
}): Promise<PriceRequest> {
  const currency = (input.currency ?? 'USD').toUpperCase();
  const assetKey = buildAssetKey(input);

  let coingeckoId = input.coingeckoId;
  let defillamaId = input.defillamaId;
  let coingeckoPlatformId: string | undefined;
  let symbol = input.symbol?.toUpperCase();

  if (input.chainId) {
    try {
      const chain = await getChain(input.chainId);
      coingeckoPlatformId = chain.coingeckoPlatformId ?? undefined;
      if (input.contractAddress) {
        const token = chain.tokens.find(
          (t: { contractAddress: string; symbol: string; coingeckoId: string | null; defillamaId: string | null }) =>
            t.contractAddress.toLowerCase() === input.contractAddress!.toLowerCase(),
        );
        if (token) {
          symbol = token.symbol;
          coingeckoId = coingeckoId ?? token.coingeckoId ?? undefined;
          defillamaId = defillamaId ?? token.defillamaId ?? undefined;
        }
      } else if (!symbol) {
        symbol = chain.nativeCurrencySymbol;
      }
    } catch {
      // chain not in DB — proceed with raw params
    }
  }

  return {
    assetKey,
    symbol,
    chainId: input.chainId,
    contractAddress: input.contractAddress,
    currency,
    coingeckoId,
    defillamaId,
    coingeckoPlatformId,
  };
}

export async function getAggregatedPrice(
  request: PriceRequest,
  logger: Logger,
): Promise<AggregatedPrice> {
  const now = Date.now();
  const cached = await getCached(request.assetKey, request.currency);

  if (cached && now - cached.fetchedAt < env.PRICE_CACHE_TTL_SEC * 1000) {
    return buildResult(request, cached.price, cached.sourcesUsed, cached.fetchedAt, false);
  }

  try {
    const { quotes } = await fetchFromSources(request, logger);
    if (quotes.length === 0) throw new Error('No price sources returned data');

    const prices = filterOutliers(quotes.map((q) => q.price));
    const price = median(prices.length > 0 ? prices : quotes.map((q) => q.price));
    const sourcesUsed = quotes.map((q) => q.source);

    await setCached(request.assetKey, request.currency, {
      price,
      sourcesUsed,
      fetchedAt: now,
    });

    const staleKey = `stale:${request.assetKey}:${request.currency}`;
    if (staleModeKeys.delete(staleKey)) {
      logger.info('Price fetch recovered — fresh quote cached', {
        assetKey: request.assetKey,
        symbol: request.symbol,
        currency: request.currency,
        sourcesUsed,
        price,
      });
    }

    return buildResult(request, price, sourcesUsed, now, false);
  } catch (err) {
    if (cached && now - cached.fetchedAt < env.PRICE_MAX_STALENESS_SEC * 1000) {
      const staleKey = `stale:${request.assetKey}:${request.currency}`;
      staleModeKeys.add(staleKey);
      const { shouldLog, suppressed } = logThrottle(staleKey, STALE_LOG_INTERVAL_MS);
      if (shouldLog) {
        logger.warn('Serving stale price — live sources unavailable', {
          assetKey: request.assetKey,
          symbol: request.symbol,
          currency: request.currency,
          staleAgeSec: Math.round((now - cached.fetchedAt) / 1000),
          staleMaxSec: env.PRICE_MAX_STALENESS_SEC,
          cachedSources: cached.sourcesUsed,
          reason: err instanceof Error ? err.message : String(err),
          suppressedSinceLastLog: suppressed,
        });
      }
      return buildResult(request, cached.price, cached.sourcesUsed, cached.fetchedAt, true);
    }

    const key = `price-fetch-fatal:${request.assetKey}:${request.currency}`;
    const { shouldLog, suppressed } = logThrottle(key, STALE_LOG_INTERVAL_MS);
    if (shouldLog) {
      logger.error('Price fetch failed — no usable cache', {
        assetKey: request.assetKey,
        symbol: request.symbol,
        currency: request.currency,
        reason: err instanceof Error ? err.message : String(err),
        suppressedSinceLastLog: suppressed,
      });
    }
    throw err instanceof Error ? err : new Error(String(err));
  }
}

export function convertFiatToToken(fiatAmount: number, price: number): string {
  if (price <= 0) throw new Error('Invalid price');
  return (fiatAmount / price).toFixed(18);
}

export function convertTokenToFiat(tokenAmount: number, price: number): string {
  return (tokenAmount * price).toFixed(8);
}

export async function getPriceBySymbol(
  symbol: string,
  currency: string,
  logger: Logger,
): Promise<AggregatedPrice> {
  const request = await resolvePriceRequest({ symbol, currency });
  return getAggregatedPrice(request, logger);
}

export async function getPriceByContract(
  chainId: number,
  contractAddress: string,
  currency: string,
  logger: Logger,
): Promise<AggregatedPrice> {
  const request = await resolvePriceRequest({ chainId, contractAddress, currency });
  return getAggregatedPrice(request, logger);
}

export async function getPriceByAsset(
  asset: string,
  currency: string,
  logger: Logger,
): Promise<AggregatedPriceWithAsset> {
  const resolved = await resolveAsset(asset);
  const request = await resolvePriceRequest(toPriceLookupInput(resolved, currency));
  const result = await getAggregatedPrice(request, logger);
  return {
    ...result,
    asset: resolved.asset,
    resolvedVia: resolved.resolvedVia,
    tokenId: resolved.tokenId,
    tokenKey: resolved.tokenKey,
  };
}

export async function getPricesBatch(
  items: Array<{ asset?: string; symbol?: string; chainId?: number; contractAddress?: string; currency?: string }>,
  logger: Logger,
): Promise<AggregatedPriceWithAsset[]> {
  return Promise.all(
    items.map(async (item) => {
      if (item.asset) {
        return getPriceByAsset(item.asset, item.currency ?? 'USD', logger);
      }
      const request = await resolvePriceRequest(item);
      const result = await getAggregatedPrice(request, logger);
      return {
        ...result,
        asset: item.symbol ?? item.contractAddress ?? 'unknown',
        resolvedVia: 'symbol' as const,
      };
    }),
  );
}

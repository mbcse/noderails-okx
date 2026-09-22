import { ethers } from "ethers";
import { prisma } from "../config/database.js";
import { redis } from "../config/redis.js";
import { logger } from "../lib/logger.js";
import { settingsService } from "./settings.service.js";
import { truncateRpcError } from "../lib/rpc-error.js";
import { warnOnce } from "../lib/log-throttle.js";

// ────────────────────────────────────────────────────────────
// RPC manager — per-chain provider pool with auto-failover
//
// For each chain we maintain an ordered list of RPC URLs.
// On failure we automatically rotate to the next URL and retry.
//
// callWithFailover(chainDbId, fn) — THE primary method.
//   Tries fn(provider) with each available URL until one succeeds.
//   Marks failed endpoints as unhealthy so future calls skip them.
//
// Redis keys:
//   rpc:cursor:{chainDbId}       → current URL index
//   rpc:unhealthy:{chainDbId}    → SET of unhealthy URL indices
// ────────────────────────────────────────────────────────────

const CURSOR_PREFIX = "rpc:cursor";
const UNHEALTHY_PREFIX = "rpc:unhealthy";
const PROVIDER_CACHE = new Map<string, ethers.JsonRpcProvider>();

/** Per-call timeout — defaults, overridden by DB settings */
let RPC_CALL_TIMEOUT_MS = 15_000;
let RPC_UNHEALTHY_TTL_SECS = 60;

async function loadRpcSettings() {
  try {
    RPC_CALL_TIMEOUT_MS = await settingsService.get<number>("rpc.callTimeoutMs");
    RPC_UNHEALTHY_TTL_SECS = await settingsService.get<number>("rpc.unhealthyTtlSecs");
  } catch { /* use defaults */ }
}

function cursorKey(chainDbId: string): string {
  return `${CURSOR_PREFIX}:${chainDbId}`;
}

function unhealthyKey(chainDbId: string): string {
  return `${UNHEALTHY_PREFIX}:${chainDbId}`;
}

/** Internal: resolve or create a cached provider for a given URL + chain */
function getOrCreateProvider(
  chainDbId: string,
  url: string,
  numericChainId: number,
): ethers.JsonRpcProvider {
  const cacheKey = `${chainDbId}:${url}`;
  if (!PROVIDER_CACHE.has(cacheKey)) {
    const provider = new ethers.JsonRpcProvider(url, numericChainId, {
      staticNetwork: true,
      batchMaxCount: 1,
    });
    PROVIDER_CACHE.set(cacheKey, provider);
  }
  return PROVIDER_CACHE.get(cacheKey)!;
}

/** Wrap a promise with a timeout */
function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`RPC call timed out after ${ms}ms: ${label}`)),
      ms,
    );
    promise.then(
      (v) => { clearTimeout(timer); resolve(v); },
      (e) => { clearTimeout(timer); reject(e); },
    );
  });
}

export const rpcManager = {
  /**
   * Execute an RPC call with automatic failover across all configured URLs.
   *
   * Tries the call on each healthy provider in round-robin order.
   * On failure, marks the endpoint unhealthy and rotates to the next.
   * Only throws after ALL URLs have been exhausted.
   *
   * @example
   *   const balance = await rpcManager.callWithFailover(chainDbId, (p) => p.getBalance(addr));
   *   const receipt = await rpcManager.callWithFailover(chainDbId, (p) => p.getTransactionReceipt(hash));
   */
  async callWithFailover<T>(
    chainDbId: string,
    fn: (provider: ethers.JsonRpcProvider) => Promise<T>,
    label = "rpc-call",
  ): Promise<T> {
    await loadRpcSettings();

    const chain = await prisma.chain.findUniqueOrThrow({
      where: { id: chainDbId },
      select: { id: true, rpcUrls: true, chainId: true },
    });

    if (chain.rpcUrls.length === 0) {
      throw new Error(`No RPC URLs configured for chain ${chainDbId}`);
    }

    const unhealthySet = new Set(await redis.smembers(unhealthyKey(chainDbId)));

    // Build ordered URL list: healthy first, then unhealthy as fallback
    const healthy: number[] = [];
    const unhealthy: number[] = [];
    for (let i = 0; i < chain.rpcUrls.length; i++) {
      if (unhealthySet.has(String(i))) unhealthy.push(i);
      else healthy.push(i);
    }
    const order = [...healthy, ...unhealthy];

    // Pick a starting point via round-robin cursor among healthy URLs
    const cursor = await redis.incr(cursorKey(chainDbId));
    const startIdx = healthy.length > 0 ? (cursor - 1) % healthy.length : 0;

    // Rotate so we start from the cursor position
    const rotated = [
      ...order.slice(startIdx),
      ...order.slice(0, startIdx),
    ];

    let lastError: Error | null = null;

    for (const urlIndex of rotated) {
      const url = chain.rpcUrls[urlIndex];
      const provider = getOrCreateProvider(chainDbId, url, chain.chainId);

      try {
        const result = await withTimeout(fn(provider), RPC_CALL_TIMEOUT_MS, label);

        // If this endpoint was previously unhealthy, mark it recovered
        if (unhealthySet.has(String(urlIndex))) {
          await redis.srem(unhealthyKey(chainDbId), String(urlIndex));
          logger.debug({ chainDbId, urlIndex, url }, "RPC endpoint recovered");
        }

        return result;
      } catch (err) {
        lastError = err as Error;

        // Transaction-level errors are NOT RPC failures — don't rotate, bubble up immediately.
        // These will fail on every endpoint, so rotating just wastes time & marks healthy RPCs unhealthy.
        const code = (err as any).code;
        const msg = lastError.message?.toLowerCase() ?? "";
        const isTransactionError =
          // Contract reverts (estimateGas)
          code === "CALL_EXCEPTION" ||
          code === "UNPREDICTABLE_GAS_LIMIT" ||
          msg.includes("execution reverted") ||
          msg.includes("always failing transaction") ||
          // Broadcast permanent failures
          msg.includes("intrinsic gas too low") ||
          msg.includes("intrinsicgas") ||
          msg.includes("insufficient funds") ||
          msg.includes("nonce too low") ||
          msg.includes("nonce has already been used") ||
          msg.includes("replacement transaction underpriced") ||
          msg.includes("transaction underpriced") ||
          msg.includes("already known") ||
          msg.includes("already imported");

        if (isTransactionError) {
          await warnOnce(
            `rpc:tx-err:${chainDbId}:${label}`,
            { chainDbId, urlIndex, url, err: truncateRpcError(lastError), label },
            "Transaction-level error — not an endpoint failure, propagating immediately",
          );
          throw lastError;
        }

        const shortErr = truncateRpcError(lastError);
        logger.debug(
          { chainDbId, urlIndex, url, err: shortErr, label },
          "RPC call failed — rotating to next endpoint",
        );

        const key = unhealthyKey(chainDbId);
        const firstUnhealthy = !unhealthySet.has(String(urlIndex));
        await redis.sadd(key, String(urlIndex));
        await redis.expire(key, RPC_UNHEALTHY_TTL_SECS);
        if (firstUnhealthy) {
          unhealthySet.add(String(urlIndex));
          await warnOnce(
            `rpc:unhealthy:${chainDbId}:${urlIndex}`,
            { chainDbId, urlIndex, url, err: shortErr, label },
            "RPC endpoint marked unhealthy",
          );
        }

        PROVIDER_CACHE.delete(`${chainDbId}:${url}`);
      }
    }

    const allFailErr = truncateRpcError(lastError);
    await warnOnce(
      `rpc:all-fail:${chainDbId}`,
      { chainDbId, label, endpoints: chain.rpcUrls.length, err: allFailErr },
      "All RPC endpoints failed",
    );
    throw new Error(
      `All ${chain.rpcUrls.length} RPC endpoints failed for chain ${chainDbId}: ${allFailErr}`,
    );
  },

  /**
   * Get a provider for the given chain (round-robin among healthy URLs).
   * Use this when you need a persistent provider reference (e.g. for signing adapters).
   * For one-off RPC calls, prefer callWithFailover().
   */
  async getProvider(chainDbId: string): Promise<ethers.JsonRpcProvider> {
    const chain = await prisma.chain.findUniqueOrThrow({
      where: { id: chainDbId },
      select: { id: true, rpcUrls: true, chainId: true },
    });

    if (chain.rpcUrls.length === 0) {
      throw new Error(`No RPC URLs configured for chain ${chainDbId}`);
    }

    const unhealthySet = await redis.smembers(unhealthyKey(chainDbId));
    const healthyUrls = chain.rpcUrls.filter(
      (_, i) => !unhealthySet.includes(String(i)),
    );

    // Fall back to all URLs if every endpoint is marked unhealthy
    const urls = healthyUrls.length > 0 ? healthyUrls : chain.rpcUrls;

    // Round-robin among healthy URLs
    const cursor = await redis.incr(cursorKey(chainDbId));
    const index = (cursor - 1) % urls.length;
    const url = urls[index];

    return getOrCreateProvider(chainDbId, url, chain.chainId);
  },

  /** Mark a specific RPC URL index as unhealthy (auto-expires after 60s) */
  async markUnhealthy(chainDbId: string, urlIndex: number): Promise<void> {
    const key = unhealthyKey(chainDbId);
    await redis.sadd(key, String(urlIndex));
    await redis.expire(key, 60); // auto-recover after 60s
    await warnOnce(
      `rpc:unhealthy:${chainDbId}:${urlIndex}`,
      { chainDbId, urlIndex },
      "RPC endpoint marked unhealthy",
    );
  },

  /** Mark all endpoints as healthy */
  async resetHealth(chainDbId: string): Promise<void> {
    await redis.del(unhealthyKey(chainDbId));
    logger.info({ chainDbId }, "RPC health reset");
  },

  /**
   * Probe all RPC endpoints for a chain and update health status.
   * Call this periodically (e.g. every 30s via cron).
   */
  async probeHealth(chainDbId: string): Promise<void> {
    const chain = await prisma.chain.findUnique({
      where: { id: chainDbId },
      select: { rpcUrls: true, chainId: true },
    });
    if (!chain) return;

    for (let i = 0; i < chain.rpcUrls.length; i++) {
      try {
        const provider = new ethers.JsonRpcProvider(
          chain.rpcUrls[i],
          chain.chainId,
          { staticNetwork: true },
        );
        const start = Date.now();
        await Promise.race([
          provider.getBlockNumber(),
          new Promise((_, reject) =>
            setTimeout(() => reject(new Error("timeout")), 5000),
          ),
        ]);
        const latency = Date.now() - start;

        // If healthy, remove from unhealthy set
        await redis.srem(unhealthyKey(chainDbId), String(i));
        logger.debug({ chainDbId, urlIndex: i, latency }, "RPC probe OK");
      } catch {
        await this.markUnhealthy(chainDbId, i);
      }
    }
  },

  /** Clear the provider cache (e.g. when chain RPC URLs change) */
  clearCache(chainDbId?: string): void {
    if (chainDbId) {
      for (const key of PROVIDER_CACHE.keys()) {
        if (key.startsWith(`${chainDbId}:`)) PROVIDER_CACHE.delete(key);
      }
    } else {
      PROVIDER_CACHE.clear();
    }
  },
};

import { redis } from "../config/redis.js";
import { logger } from "../lib/logger.js";
import { rpcManager } from "./rpc-manager.js";
import type { ethers } from "ethers";

// ────────────────────────────────────────────────────────────
// Redis-backed atomic nonce manager
//
// Key pattern:  nonce:{chainId}:{address}
//
// On boot → sync from on-chain getTransactionCount("pending")
// acquireNonce()  → INCR (atomic)
// releaseNonce()  → DECR on failure (so the nonce can be re-used)
// ────────────────────────────────────────────────────────────

const NONCE_PREFIX = "nonce";

function nonceKey(chainDbId: string, address: string): string {
  return `${NONCE_PREFIX}:${chainDbId}:${address.toLowerCase()}`;
}

export const nonceManager = {
  /**
   * Sync the Redis counter with the on-chain pending nonce.
   * Call this on startup and whenever a signer is added.
   */
  async sync(
    chainDbId: string,
    address: string,
    _provider?: ethers.JsonRpcProvider,
  ): Promise<number> {
    const onChainNonce = await rpcManager.callWithFailover(
      chainDbId,
      (p) => p.getTransactionCount(address, "pending"),
      "getTransactionCount",
    );
    const key = nonceKey(chainDbId, address);
    await redis.set(key, onChainNonce.toString());
    logger.debug({ chainDbId, address, nonce: onChainNonce }, "Nonce synced");
    return onChainNonce;
  },

  /**
   * Atomically acquire the next nonce (post-increment).
   * Returns the nonce to use for the current transaction.
   */
  async acquire(chainDbId: string, address: string): Promise<number> {
    const key = nonceKey(chainDbId, address);

    // Lua: GET + INCR atomically. Returns the current value before increment.
    // Returns -1 if the key doesn't exist (caller will lazy-sync).
    const luaScript = `
      local current = redis.call('GET', KEYS[1])
      if current == false then
        return -1
      end
      redis.call('INCR', KEYS[1])
      return current
    `;

    const result = await redis.eval(luaScript, 1, key);
    const resultNum = parseInt(result as string, 10);

    // Key didn't exist — lazy-initialise from on-chain, then retry once
    if (resultNum === -1) {
      logger.info({ chainDbId, address }, "Nonce not in Redis — syncing from chain");
      await this.sync(chainDbId, address);
      // Re-run the same script (now key exists)
      const retryResult = await redis.eval(luaScript, 1, key);
      const retryNum = parseInt(retryResult as string, 10);
      if (retryNum === -1) {
        throw new Error(`Failed to initialise nonce for ${key}`);
      }
      logger.debug({ chainDbId, address, nonce: retryNum }, "Nonce acquired (after sync)");
      return retryNum;
    }

    logger.debug({ chainDbId, address, nonce: resultNum }, "Nonce acquired");
    return resultNum;
  },

  /**
   * Release a nonce back (decrement) when signing / broadcasting fails
   * before the tx actually hits the mempool.
   *
   * Uses a Lua script to ensure the counter never goes below zero
   * (avoids race condition where two concurrent releases could
   * push the counter negative).
   */
  async release(chainDbId: string, address: string): Promise<void> {
    const key = nonceKey(chainDbId, address);

    const luaScript = `
      local current = tonumber(redis.call('GET', KEYS[1]))
      if current == nil or current <= 0 then
        return 0
      end
      return redis.call('DECR', KEYS[1])
    `;

    await redis.eval(luaScript, 1, key);
    logger.debug({ chainDbId, address }, "Nonce released");
  },

  /** Get the current nonce value without modifying it */
  async current(chainDbId: string, address: string): Promise<number | null> {
    const key = nonceKey(chainDbId, address);
    const val = await redis.get(key);
    return val !== null ? parseInt(val, 10) : null;
  },

  /** Force-set the nonce (used by stuck-tx resolver) */
  async forceSet(
    chainDbId: string,
    address: string,
    nonce: number,
  ): Promise<void> {
    const key = nonceKey(chainDbId, address);
    await redis.set(key, nonce.toString());
    logger.info({ chainDbId, address, nonce }, "Nonce force-set");
  },

  /** Clear cached nonce key from Redis (next acquire will lazy-sync). */
  async clear(chainDbId: string, address: string): Promise<void> {
    const key = nonceKey(chainDbId, address);
    await redis.del(key);
    logger.info({ chainDbId, address }, "Nonce cache cleared");
  },
};

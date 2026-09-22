import { redis } from "../config/redis.js";
import { prisma } from "../config/database.js";
import { createKeyAdapter, type IKeyAdapter } from "../adapters/index.js";
import { logger } from "../lib/logger.js";
import type { SignerKey } from "../generated/prisma/client.js";

// ────────────────────────────────────────────────────────────
// Round-robin address pool per project
//
// Redis key:  pool:cursor:{projectId}  (atomic counter)
//
// On each `getNextSigner()` call we:
//   1. Fetch active signer keys for the project
//   2. INCR the cursor atomically
//   3. Return signerKeys[cursor % signerKeys.length]
// ────────────────────────────────────────────────────────────

const CURSOR_PREFIX = "pool:cursor";

function cursorKey(projectId: string, chainType: "EVM" | "SOLANA" | "SUI"): string {
  // Back-compat: preserve the old EVM cursor key so existing deployments
  // keep their round-robin position.
  if (chainType === "EVM") return `${CURSOR_PREFIX}:${projectId}`;
  return `${CURSOR_PREFIX}:${projectId}:${chainType}`;
}

export interface PoolEntry {
  signerKey: SignerKey;
  adapter: IKeyAdapter;
}

export const addressPool = {
  /**
   * Get the next signer key for a project in round-robin order.
   * Used for tx assignment when we don't need an EVM adapter (e.g. SOLANA).
   */
  async getNextSignerKey(
    projectId: string,
    options?: {
      chainType?: "EVM" | "SOLANA" | "SUI";
      /** Never select these addresses (e.g. PTB sender for gas sponsorship). */
      excludeAddresses?: string[];
    },
  ): Promise<SignerKey> {
    const chainType = options?.chainType ?? "EVM";

    // Exclude master wallets — they are reserved for auto-funding, not signing user txs
    const signerKeys = await prisma.signerKey.findMany({
      where: { projectId, isActive: true, isMaster: false, chainType },
      orderBy: { createdAt: "asc" },
    });

    const exclude = new Set(
      (options?.excludeAddresses ?? []).map((address) => address.toLowerCase()),
    );
    const eligible = signerKeys.filter(
      (signerKey) => !exclude.has(signerKey.address.toLowerCase()),
    );

    if (eligible.length === 0) {
      throw new Error(
        exclude.size > 0
          ? `No active ${chainType} signers for project ${projectId} after exclusions`
          : `No active ${chainType} signers for project ${projectId}`,
      );
    }

    const key = cursorKey(projectId, chainType);
    const cursor = await redis.incr(key);
    const index = (cursor - 1) % eligible.length;

    const signerKey = eligible[index];

    logger.debug(
      { projectId, signerId: signerKey.id, chainType, index, total: eligible.length },
      "Address pool selected signer key",
    );

    return signerKey;
  },

  /**
   * Get the next signer for a project in round-robin order.
   * Throws if no active signers exist for the project.
   */
  async getNextSigner(
    projectId: string,
    provider?: import("ethers").Provider,
    options?: { chainType?: "EVM" },
  ): Promise<PoolEntry> {
    const chainType = options?.chainType ?? "EVM";

    // Exclude master wallets — they are reserved for auto-funding, not signing user txs
    const signerKeys = await prisma.signerKey.findMany({
      where: { projectId, isActive: true, isMaster: false, chainType },
      orderBy: { createdAt: "asc" },
    });

    if (signerKeys.length === 0) {
      throw new Error(`No active signers for project ${projectId}`);
    }

    // Atomic increment in Redis → round-robin index
    const key = cursorKey(projectId, chainType);
    const cursor = await redis.incr(key);
    const index = (cursor - 1) % signerKeys.length; // -1 because INCR starts at 1

    const signerKey = signerKeys[index];
    const adapter = createKeyAdapter(signerKey, provider);

    logger.debug(
      { projectId, signerId: signerKey.id, chainType, index, total: signerKeys.length },
      "Address pool selected signer",
    );

    return { signerKey, adapter };
  },

  /** Reset the cursor for a project (e.g. after adding / removing signers) */
  async resetCursor(projectId: string): Promise<void> {
    const key = cursorKey(projectId, "EVM");
    await redis.set(key, "0");
  },
};

import { prisma } from "../config/database.js";
import { rpcManager } from "./rpc-manager.js";
import { solanaRpcManager } from "./solana-rpc-manager.js";
import { suiRpcManager } from "./sui-rpc-manager.js";
import { NotFoundError, ConflictError } from "../lib/errors.js";
import { resolveChainDbId } from "../lib/resolve-chain.js";

// ────────────────────────────────────────────────────────────
// Chain service
// ────────────────────────────────────────────────────────────

export const chainService = {
  async listByProject(projectId: string) {
    return prisma.chain.findMany({
      where: { projectId },
      orderBy: { createdAt: "desc" },
    });
  },

  async getById(projectId: string, chainId: string) {
    const dbId = await resolveChainDbId(projectId, chainId);
    const chain = await prisma.chain.findFirst({
      where: { id: dbId, projectId },
    });
    if (!chain) throw new NotFoundError("Chain");
    return chain;
  },

  async create(
    projectId: string,
    data: {
      chainType?: "EVM" | "SOLANA" | "SUI";
      name: string;
      chainId: number;
      rpcUrls: string[];
      explorerUrl?: string;
      nativeCurrency: string;
      isTestnet: boolean;
    },
  ) {
    // Check uniqueness of chainId within project
    const existing = await prisma.chain.findUnique({
      where: { projectId_chainId: { projectId, chainId: data.chainId } },
    });
    if (existing) {
      throw new ConflictError(
        `Chain ID ${data.chainId} already exists in this project`,
      );
    }

    return prisma.chain.create({
      data: { projectId, ...data },
    });
  },

  async update(
    projectId: string,
    chainId: string,
    data: {
      chainType?: "EVM" | "SOLANA" | "SUI";
      name?: string;
      rpcUrls?: string[];
      explorerUrl?: string;
      isActive?: boolean;
    },
  ) {
    const dbId = await resolveChainDbId(projectId, chainId);
    const chain = await prisma.chain.update({
      where: { id: dbId, projectId },
      data,
    });

    // Clear provider cache if RPC URLs changed
    if (data.rpcUrls) {
      rpcManager.clearCache(dbId);
      solanaRpcManager.clearCache(dbId);
      suiRpcManager.clearCache(dbId);
    }

    return chain;
  },

  async delete(projectId: string, chainId: string) {
    const dbId = await resolveChainDbId(projectId, chainId);
    await prisma.chain.delete({ where: { id: dbId, projectId } });
    rpcManager.clearCache(dbId);
    solanaRpcManager.clearCache(dbId);
    suiRpcManager.clearCache(dbId);
  },
};

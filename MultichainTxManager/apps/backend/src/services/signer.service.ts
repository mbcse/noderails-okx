import { ethers } from "ethers";
import { Keypair, PublicKey, LAMPORTS_PER_SOL } from "@solana/web3.js";
import { prisma } from "../config/database.js";
import { encrypt, decrypt } from "../lib/crypto.js";
import { encodeSolanaSecretKey } from "../lib/solana.js";
import {
  encodeSuiSecretKey,
  keypairFromEncodedSecret,
  suiAddressFromKeypair,
  suiPublicBase64KeyFromKeypair,
} from "../lib/sui.js";
import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";
import { createKeyAdapter } from "../adapters/index.js";
import { addressPool } from "./address-pool.js";
import { rpcManager } from "./rpc-manager.js";
import { solanaRpcManager } from "./solana-rpc-manager.js";
import { suiRpcManager } from "./sui-rpc-manager.js";
import { nonceManager } from "./nonce-manager.js";
import { NotFoundError, BadRequestError } from "../lib/errors.js";
import { formatMistToSui } from "../lib/sui-transaction.js";
import { logger } from "../lib/logger.js";
import { warnOnce } from "../lib/log-throttle.js";
import { truncateRpcError } from "../lib/rpc-error.js";

// ────────────────────────────────────────────────────────────
// Signer key service
// ────────────────────────────────────────────────────────────

export const signerService = {
  async listByProject(projectId: string) {
    return prisma.signerKey.findMany({
      where: { projectId },
      orderBy: { createdAt: "desc" },
    });
  },

  async getById(projectId: string, signerId: string) {
    const signer = await prisma.signerKey.findFirst({
      where: { id: signerId, projectId },
    });
    if (!signer) throw new NotFoundError("SignerKey");
    return signer;
  },

  async create(
    projectId: string,
    data: {
      label: string;
      chainType?: "EVM" | "SOLANA" | "SUI";
      adapterType: "ENV" | "KMS";
      kmsKeyId?: string;
    },
  ) {
    const chainType = data.chainType ?? "EVM";

    let address: string;
    let encryptedKey: string | null = null;
    let kmsKeyId: string | null = null;

    if (chainType === "EVM") {
      if (data.adapterType === "ENV") {
        // Generate a fresh private key server-side
        const wallet = ethers.Wallet.createRandom();
        address = wallet.address;
        // Encrypt the generated private key for storage
        encryptedKey = encrypt(wallet.privateKey);
      } else if (data.adapterType === "KMS") {
        if (!data.kmsKeyId) {
          throw new BadRequestError("KMS key ID is required for KMS adapter");
        }
        kmsKeyId = data.kmsKeyId;
        // Derive address from KMS public key
        const adapter = createKeyAdapter({
          adapterType: "KMS",
          kmsKeyId,
          encryptedKey: null,
        } as any);
        address = await adapter.getAddress();
      } else {
        throw new BadRequestError(`Unknown adapter type: ${data.adapterType}`);
      }
    } else if (chainType === "SOLANA") {
      // SOLANA: currently supports ENV adapter only (validator enforces too)
      if (data.adapterType !== "ENV") {
        throw new BadRequestError("SOLANA signers currently support ENV adapter only");
      }

      const keypair = Keypair.generate();
      address = keypair.publicKey.toBase58();
      encryptedKey = encrypt(encodeSolanaSecretKey(keypair.secretKey));
    } else if (chainType === "SUI") {
      if (data.adapterType !== "ENV") {
        throw new BadRequestError("SUI signers currently support ENV adapter only");
      }

      const keypair = Ed25519Keypair.generate();
      address = suiAddressFromKeypair(keypair);
      encryptedKey = encrypt(encodeSuiSecretKey(keypair));
    } else {
      throw new BadRequestError(`Unknown chainType: ${chainType}`);
    }

    const signerKey = await prisma.signerKey.create({
      data: {
        projectId,
        label: data.label,
        chainType,
        address,
        adapterType: data.adapterType,
        encryptedKey,
        kmsKeyId,
      },
    });

    // Reset round-robin cursor so the new signer is included
    await addressPool.resetCursor(projectId);

    return signerKey;
  },

  async deactivate(projectId: string, signerId: string) {
    const signer = await prisma.signerKey.update({
      where: { id: signerId, projectId },
      data: { isActive: false },
    });
    await addressPool.resetCursor(projectId);
    return signer;
  },

  async activate(projectId: string, signerId: string) {
    const signer = await prisma.signerKey.update({
      where: { id: signerId, projectId },
      data: { isActive: true },
    });
    await addressPool.resetCursor(projectId);
    return signer;
  },

  async update(
    projectId: string,
    signerId: string,
    data: { label?: string; isActive?: boolean },
  ) {
    const signer = await prisma.signerKey.update({
      where: { id: signerId, projectId },
      data,
    });
    if (data.isActive !== undefined) {
      await addressPool.resetCursor(projectId);
    }
    return signer;
  },

  /**
   * Set a signer as the master wallet for the project.
   * Only one master per project — unsets any existing master first.
   */
  async setMaster(projectId: string, signerId: string) {
    // Verify the signer exists and belongs to this project
    const signer = await prisma.signerKey.findFirst({
      where: { id: signerId, projectId },
    });
    if (!signer) throw new NotFoundError("SignerKey");

    // Allow one master per (projectId, chainType)
    await prisma.$transaction([
      prisma.signerKey.updateMany({
        where: { projectId, isMaster: true, chainType: signer.chainType },
        data: { isMaster: false },
      }),
      prisma.signerKey.update({
        where: { id: signerId },
        data: { isMaster: true },
      }),
    ]);

    return prisma.signerKey.findUniqueOrThrow({ where: { id: signerId } });
  },

  /**
   * Unset the master wallet for a specific signer.
   */
  async unsetMaster(projectId: string, signerId: string) {
    const signer = await prisma.signerKey.findFirst({
      where: { id: signerId, projectId },
    });
    if (!signer) throw new NotFoundError("SignerKey");

    return prisma.signerKey.update({
      where: { id: signerId },
      data: { isMaster: false },
    });
  },

  /**
   * Get signer detail: native balances on all project chains + recent txs.
   */
  async getDetail(projectId: string, signerId: string) {
    const signer = await prisma.signerKey.findFirst({
      where: { id: signerId, projectId },
    });
    if (!signer) throw new NotFoundError("SignerKey");

    // Fetch chains that match this signer's chainType
    const chains = await prisma.chain.findMany({
      where: { projectId, isActive: true, chainType: signer.chainType },
      orderBy: { createdAt: "asc" },
    });

    // Fetch native balance on each chain in parallel
    const balances = await Promise.all(
      chains.map(async (chain) => {
        try {
          if (chain.chainType === "SOLANA") {
            const connection = await solanaRpcManager.getConnection(chain.id);
            const lamports = await connection.getBalance(new PublicKey(signer.address));
            const sol = lamports / LAMPORTS_PER_SOL;
            return {
              chainDbId: chain.id,
              chainName: chain.name,
              chainId: chain.chainId,
              chainType: chain.chainType,
              nativeCurrency: chain.nativeCurrency,
              isTestnet: chain.isTestnet,
              balanceWei: lamports.toString(),
              balanceFormatted: sol.toString(),
            };
          }

          if (chain.chainType === "SUI") {
            const mist = await suiRpcManager.getBalance(chain.id, signer.address);
            return {
              chainDbId: chain.id,
              chainName: chain.name,
              chainId: chain.chainId,
              chainType: chain.chainType,
              nativeCurrency: chain.nativeCurrency,
              isTestnet: chain.isTestnet,
              balanceWei: mist.toString(),
              balanceFormatted: formatMistToSui(mist),
            };
          }

          const balanceWei = await rpcManager.callWithFailover(
            chain.id,
            (p) => p.getBalance(signer.address),
            "getBalance",
          );
          return {
            chainDbId: chain.id,
            chainName: chain.name,
            chainId: chain.chainId,
            chainType: chain.chainType,
            nativeCurrency: chain.nativeCurrency,
            isTestnet: chain.isTestnet,
            balanceWei: balanceWei.toString(),
            balanceFormatted: ethers.formatEther(balanceWei),
          };
        } catch (err) {
          await warnOnce(
            `signer:balance:${chain.id}`,
            { chainId: chain.id, address: signer.address, err: truncateRpcError(err) },
            "Failed to fetch balance",
          );
          return {
            chainDbId: chain.id,
            chainName: chain.name,
            chainId: chain.chainId,
            chainType: chain.chainType,
            nativeCurrency: chain.nativeCurrency,
            isTestnet: chain.isTestnet,
            balanceWei: "0",
            balanceFormatted: "0.0",
            error: "Failed to fetch",
          };
        }
      }),
    );

    // Fetch transaction stats + recent txs + funding logs for this signer
    const [txCount, recentTxs, fundingLogs] = await Promise.all([
      prisma.transaction.count({
        where: { signerId, projectId },
      }),
      prisma.transaction.findMany({
        where: { signerId, projectId },
        orderBy: { createdAt: "desc" },
        take: 50,
        include: {
          chain: { select: { name: true, chainId: true, explorerUrl: true } },
        },
      }),
      prisma.fundingLog.findMany({
        where: {
          projectId,
          OR: [
            { toAddress: signer.address },
            { fromAddress: signer.address },
          ],
        },
        orderBy: { createdAt: "desc" },
        take: 20,
      }),
    ]);

    const fundingChainIds = Array.from(new Set(fundingLogs.map((fl) => fl.chainId)));
    const fundingChains = fundingChainIds.length === 0
      ? []
      : await prisma.chain.findMany({
          where: { id: { in: fundingChainIds }, projectId },
          select: { id: true, explorerUrl: true, chainType: true, nativeCurrency: true },
        });
    const chainById = new Map(fundingChains.map((c) => [c.id, c] as const));

    let publicBase64Key: string | undefined;
    if (signer.chainType === "SUI" && signer.adapterType === "ENV" && signer.encryptedKey) {
      try {
        const keypair = keypairFromEncodedSecret(decrypt(signer.encryptedKey));
        publicBase64Key = suiPublicBase64KeyFromKeypair(keypair);
      } catch (err) {
        logger.warn({ signerId, err }, "Failed to derive SUI publicBase64Key for signer detail");
      }
    }

    return {
      signer: {
        id: signer.id,
        label: signer.label,
        chainType: signer.chainType,
        address: signer.address,
        adapterType: signer.adapterType,
        isActive: signer.isActive,
        isMaster: signer.isMaster,
        createdAt: signer.createdAt,
        ...(publicBase64Key ? { publicBase64Key } : {}),
      },
      balances,
      txCount,
      recentTransactions: recentTxs.map((tx) => ({
        id: tx.id,
        hash: tx.hash,
        to: tx.to,
        value: tx.value,
        status: tx.status,
        chainName: tx.chain.name,
        chainId: tx.chain.chainId,
        explorerUrl: tx.chain.explorerUrl,
        createdAt: tx.createdAt,
        confirmedAt: tx.confirmedAt,
      })),
      fundingLogs: fundingLogs.map((fl) => {
        const chain = chainById.get(fl.chainId);
        const chainType = chain?.chainType ?? "EVM";
        const nativeCurrency = chain?.nativeCurrency ?? "ETH";

        const amountFormatted = (() => {
          if (chainType === "SUI") return formatMistToSui(BigInt(fl.amountWei));
          if (chainType !== "SOLANA") return ethers.formatEther(BigInt(fl.amountWei));
          const lamports = BigInt(fl.amountWei);
          const whole = lamports / 1_000_000_000n;
          const frac = lamports % 1_000_000_000n;
          if (frac === 0n) return whole.toString();
          const fracStr = frac.toString().padStart(9, "0").replace(/0+$/, "");
          return `${whole.toString()}.${fracStr}`;
        })();

        return {
          id: fl.id,
          chainName: fl.chainName,
          chainType,
          nativeCurrency,
          fromAddress: fl.fromAddress,
          toAddress: fl.toAddress,
          txHash: fl.txHash,
          amountWei: fl.amountWei,
          amountFormatted,
          status: fl.status,
          explorerUrl: chain?.explorerUrl ?? null,
          createdAt: fl.createdAt,
        };
      }),
    };
  },

  /**
   * Round-robin pick of the next active non-master signer for integrator use
   * (e.g. Noderales SUI capture / settle / sponsor without hard-coded env vars).
   */
  async allocate(
    projectId: string,
    options?: { chainType?: "SUI" },
  ) {
    const chainType = options?.chainType ?? "SUI";

    let signerKey: Awaited<ReturnType<typeof addressPool.getNextSignerKey>>;
    try {
      signerKey = await addressPool.getNextSignerKey(projectId, { chainType });
    } catch (err) {
      const message = err instanceof Error ? err.message : "No eligible signers";
      throw new BadRequestError(message);
    }

    if (chainType !== "SUI") {
      throw new BadRequestError("Only SUI allocation is supported");
    }

    if (signerKey.adapterType !== "ENV" || !signerKey.encryptedKey) {
      throw new BadRequestError("SUI signer must use ENV adapter to expose publicBase64Key");
    }

    let publicBase64Key: string;
    try {
      const keypair = keypairFromEncodedSecret(decrypt(signerKey.encryptedKey));
      publicBase64Key = suiPublicBase64KeyFromKeypair(keypair);
    } catch (err) {
      logger.warn({ signerId: signerKey.id, err }, "Failed to derive SUI publicBase64Key for allocate");
      throw new BadRequestError("Failed to derive SUI Ed25519 public key for selected signer");
    }

    return {
      signerId: signerKey.id,
      label: signerKey.label,
      chainType: signerKey.chainType,
      address: signerKey.address,
      publicBase64Key,
    };
  },

  async resetChainNonce(projectId: string, signerId: string, chainDbId: string) {
    const signer = await prisma.signerKey.findFirst({
      where: { id: signerId, projectId },
      select: { address: true, chainType: true },
    });
    if (!signer) throw new NotFoundError("SignerKey");

    const chain = await prisma.chain.findFirst({
      where: { id: chainDbId, projectId },
      select: { id: true, name: true, chainId: true, chainType: true },
    });
    if (!chain) throw new NotFoundError("Chain");

    if (chain.chainType !== signer.chainType) {
      throw new BadRequestError("Signer chainType does not match chain chainType");
    }

    if (chain.chainType === "SOLANA" || chain.chainType === "SUI") {
      throw new BadRequestError(`Nonce reset is not supported for ${chain.chainType} chains`);
    }

    const before = await nonceManager.current(chainDbId, signer.address);
    await nonceManager.clear(chainDbId, signer.address);
    const synced = await nonceManager.sync(chainDbId, signer.address);

    return {
      chainDbId: chain.id,
      chainName: chain.name,
      chainId: chain.chainId,
      address: signer.address,
      previousNonce: before,
      syncedNonce: synced,
    };
  },
};

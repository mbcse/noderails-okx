import { prisma } from "../config/database.js";
import { txSigningQueue, txBroadcastingQueue } from "../queues/index.js";
import { webhookService } from "./webhook.service.js";
import { BadRequestError, NotFoundError } from "../lib/errors.js";
import { resolveChainDbId } from "../lib/resolve-chain.js";
import { addressPool } from "./address-pool.js";
import { rpcManager } from "./rpc-manager.js";
import { createKeyAdapter } from "../adapters/index.js";
import { decrypt } from "../lib/crypto.js";
import { PublicKey } from "@solana/web3.js";
import { assertSingleSolanaSigner, parseSolanaTransactionBase64 } from "../lib/solana-transaction.js";
import { keypairFromEncodedSecret as solanaKeypairFromEncodedSecret } from "../lib/solana.js";
import { isValidSuiAddress, keypairFromEncodedSecret as suiKeypairFromEncodedSecret } from "../lib/sui.js";
import { suiRpcManager } from "./sui-rpc-manager.js";
import {
  assertSingleSuiSigner,
  assertSuiSponsoredRoles,
  buildAndSignSponsoredTransaction,
  prepareTxForSponsorship,
  parseSuiTransactionBase64,
  resolveSuiExecuteSignatures,
  collectSuiSponsoredSignatures,
  getSuiTransactionRoles,
  serializeSignedSuiSponsoredTx,
} from "../lib/sui-transaction.js";
import { Transaction } from "@mysten/sui/transactions";
import type { SuiMoveCall } from "../lib/sui-transaction.js";
import bs58 from "bs58";
import nacl from "tweetnacl";
import { ethers } from "ethers";
import type { Prisma, TransactionStatus } from "../generated/prisma/client.js";

// ────────────────────────────────────────────────────────────
// Transaction service
// ────────────────────────────────────────────────────────────

function canonicalStringify(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }

  if (Array.isArray(value)) {
    return `[${value.map((item) => canonicalStringify(item)).join(",")}]`;
  }

  const entries = Object.entries(value as Record<string, unknown>).sort(([left], [right]) => left.localeCompare(right));
  return `{${entries.map(([key, entryValue]) => `${JSON.stringify(key)}:${canonicalStringify(entryValue)}`).join(",")}}`;
}

function canonicalSolanaAuthorizationMessage(data: {
  domain: Record<string, unknown>;
  structHash: string;
  payload?: Record<string, unknown>;
}): string {
  return [
    "MTXM-SOLANA-AUTH-V1",
    `domain=${canonicalStringify(data.domain)}`,
    `structHash=${data.structHash}`,
    `payload=${canonicalStringify(data.payload ?? {})}`,
  ].join("\n");
}

function canonicalSuiAuthorizationMessage(data: {
  domain: Record<string, unknown>;
  structHash: string;
  payload?: Record<string, unknown>;
}): string {
  return [
    "MTXM-SUI-AUTH-V1",
    `domain=${canonicalStringify(data.domain)}`,
    `structHash=${data.structHash}`,
    `payload=${canonicalStringify(data.payload ?? {})}`,
  ].join("\n");
}

async function resolveSuiSponsorSigner(
  projectId: string,
  options?: { sponsorSignerId?: string },
) {
  if (options?.sponsorSignerId) {
    const signer = await prisma.signerKey.findFirst({
      where: {
        id: options.sponsorSignerId,
        projectId,
        isActive: true,
        chainType: "SUI",
        adapterType: "ENV",
      },
    });
    if (!signer?.encryptedKey) throw new NotFoundError("SignerKey");
    if (signer.isMaster) {
      throw new BadRequestError("Master wallet is reserved for funding — pick a non-master SUI signer for gas sponsorship");
    }
    return signer;
  }

  // Round-robin non-master SUI signers (master is funding-only, same as user tx signing).
  let sponsorKey: Awaited<ReturnType<typeof addressPool.getNextSignerKey>>;
  try {
    sponsorKey = await addressPool.getNextSignerKey(projectId, {
      chainType: "SUI",
    });
  } catch {
    throw new BadRequestError(
      "No eligible SUI sponsor signer (need at least one non-master ENV SUI signer)",
    );
  }

  if (!sponsorKey.encryptedKey) {
    throw new BadRequestError("Selected SUI sponsor signer has no encrypted key");
  }

  return sponsorKey;
}

function isSuiSponsoredGasOwner(gasOwner: string | null | undefined, sender: string): boolean {
  return !!gasOwner && gasOwner.toLowerCase() !== sender.toLowerCase();
}

async function resolveSuiSponsoredRecordSigner(
  projectId: string,
  options: {
    signerId?: string;
    sponsorSignerId?: string;
    senderAddress?: string;
    transactionBlockBase64: string;
  },
): Promise<{ signerId: string; from: string }> {
  const parsed = parseSuiTransactionBase64(options.transactionBlockBase64);
  const { sender: ptbSender, gasOwner } = getSuiTransactionRoles(parsed);
  const from = options.senderAddress ?? ptbSender;
  if (!from) {
    throw new BadRequestError("Could not resolve PTB sender — pass senderAddress");
  }

  if (options.signerId) {
    const signer = await prisma.signerKey.findFirst({
      where: { id: options.signerId, projectId, chainType: "SUI", isActive: true },
      select: { id: true },
    });
    if (!signer) throw new NotFoundError("SignerKey");
    return { signerId: signer.id, from };
  }

  const userSigner = await prisma.signerKey.findFirst({
    where: { projectId, chainType: "SUI", isActive: true, address: from },
    select: { id: true },
  });
  if (userSigner) return { signerId: userSigner.id, from };

  if (gasOwner) {
    const sponsorByAddress = await prisma.signerKey.findFirst({
      where: { projectId, chainType: "SUI", isActive: true, address: gasOwner },
      select: { id: true },
    });
    if (sponsorByAddress) return { signerId: sponsorByAddress.id, from };
  }

  const sponsorKey = await resolveSuiSponsorSigner(projectId, {
    sponsorSignerId: options.sponsorSignerId,
  });
  return { signerId: sponsorKey.id, from };
}

export const transactionService = {
  async list(
    projectId: string,
    filters?: {
      status?: string;
      chainId?: string;
      from?: string;
      to?: string;
      page?: number;
      limit?: number;
    },
  ) {
    const page = filters?.page ?? 1;
    const limit = filters?.limit ?? 20;
    const skip = (page - 1) * limit;

    const where: Prisma.TransactionWhereInput = { projectId };
    if (filters?.status) where.status = filters.status as TransactionStatus;
    if (filters?.chainId) where.chainId = filters.chainId;
    if (filters?.from) where.from = { equals: filters.from, mode: "insensitive" };
    if (filters?.to) where.to = { equals: filters.to, mode: "insensitive" };

    const [data, total] = await Promise.all([
      prisma.transaction.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip,
        take: limit,
        include: {
          chain: { select: { name: true, chainId: true, explorerUrl: true } },
          signer: { select: { label: true, address: true } },
        },
      }),
      prisma.transaction.count({ where }),
    ]);

    return {
      data,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  },

  async getById(projectId: string, txId: string) {
    const tx = await prisma.transaction.findFirst({
      where: { id: txId, projectId },
      include: {
        chain: { select: { name: true, chainId: true, explorerUrl: true } },
        signer: { select: { label: true, address: true } },
      },
    });
    if (!tx) throw new NotFoundError("Transaction");
    return tx;
  },

  /**
   * Enqueue a new transaction for signing → broadcasting → confirmation.
   * The signing worker will pick a signer via round-robin.
   */
  async send(
    projectId: string,
    data: {
      chainId: string | number;
      signerId?: string;
      to: string;
      value?: string;
      data?: string;
      gasLimit?: string;
      metadata?: Record<string, unknown>;
      solana?: {
        instructions: Array<{
          programId: string;
          keys: Array<{ pubkey: string; isSigner: boolean; isWritable: boolean }>;
          dataBase64?: string;
        }>;
        transactionBase64?: string;
        cuLimit?: number;
        cuPriceMicroLamports?: number;
      };
      sui?: {
        moveCalls?: SuiMoveCall[];
        transactionBase64?: string;
        gasBudget?: string;
        gasPrice?: string;
      };
    },
  ) {
    const chainDbId = await resolveChainDbId(projectId, data.chainId);

    const chain = await prisma.chain.findUniqueOrThrow({
      where: { id: chainDbId },
      select: { chainType: true, chainId: true },
    });

    // Chain-specific validation + signer selection
    let signerKey: { id: string; address: string };
    if (chain.chainType === "SOLANA") {
      const isProgramTx = !!data.solana?.instructions?.length;
      const isRawTx = typeof data.solana?.transactionBase64 === "string" && data.solana.transactionBase64.length > 0;

      if (isProgramTx && isRawTx) {
        throw new BadRequestError("Provide either solana.instructions or solana.transactionBase64 (not both)");
      }

      if (data.data) {
        throw new BadRequestError("For SOLANA, use solana.instructions (programId+accounts+data) instead of data");
      }
      if (data.gasLimit) {
        throw new BadRequestError("gasLimit is not applicable to SOLANA");
      }

      // Resolve signer: either explicit override or round-robin
      if (data.signerId) {
        const signer = await prisma.signerKey.findFirst({
          where: {
            id: data.signerId,
            projectId,
            isActive: true,
            chainType: "SOLANA",
          },
          select: { id: true, address: true },
        });
        if (!signer) throw new NotFoundError("SignerKey");
        signerKey = { id: signer.id, address: signer.address };
      } else {
        const selected = await addressPool.getNextSignerKey(projectId, { chainType: "SOLANA" });
        signerKey = { id: selected.id, address: selected.address };
      }

      if (isRawTx) {
        // Advanced raw tx mode: client provides an unsigned transaction (legacy/v0) to be signed.
        // This mode requires signerId for determinism (fee payer is fixed in the message).
        if (!data.signerId) {
          throw new BadRequestError("SOLANA solana.transactionBase64 requires signerId");
        }

        // Validate indexing field
        try {
          // eslint-disable-next-line no-new
          new PublicKey(data.to);
        } catch {
          throw new BadRequestError("Invalid Solana address/programId in 'to'");
        }

        let parsed;
        try {
          parsed = parseSolanaTransactionBase64(data.solana!.transactionBase64!);
        } catch (e) {
          throw new BadRequestError((e as Error).message);
        }

        // Safety: enforce single-signer + fee payer = assigned signer
        assertSingleSolanaSigner(parsed, new PublicKey(signerKey.address));
      } else if (!isProgramTx) {
        // Native SOL transfer mode: `to` is a recipient address
        try {
          // eslint-disable-next-line no-new
          new PublicKey(data.to);
        } catch {
          throw new BadRequestError("Invalid Solana recipient address");
        }

        if (data.value != null && !/^\d+(\.\d+)?$/.test(data.value)) {
          throw new BadRequestError("Invalid SOLANA value format");
        }
      } else {
        // Generic program tx mode: `to` is treated as the primary program id (for indexing/UI)
        try {
          // eslint-disable-next-line no-new
          new PublicKey(data.to);
        } catch {
          throw new BadRequestError("Invalid Solana programId in 'to'");
        }

        // Basic instruction validation
        for (const [idx, ix] of data.solana!.instructions.entries()) {
          try {
            // eslint-disable-next-line no-new
            new PublicKey(ix.programId);
          } catch {
            throw new BadRequestError(`Invalid solana.instructions[${idx}].programId`);
          }
          if (!Array.isArray(ix.keys) || ix.keys.length === 0) {
            throw new BadRequestError(`solana.instructions[${idx}].keys must be a non-empty array`);
          }
          for (const [kIdx, k] of ix.keys.entries()) {
            try {
              // eslint-disable-next-line no-new
              new PublicKey(k.pubkey);
            } catch {
              throw new BadRequestError(`Invalid solana.instructions[${idx}].keys[${kIdx}].pubkey`);
            }
          }
          if (ix.dataBase64 != null) {
            try {
              Buffer.from(ix.dataBase64, "base64");
            } catch {
              throw new BadRequestError(`Invalid base64 in solana.instructions[${idx}].dataBase64`);
            }
          }
        }
      }
    } else if (chain.chainType === "SUI") {
      const isMoveTx = !!data.sui?.moveCalls?.length;
      const isRawTx = typeof data.sui?.transactionBase64 === "string" && data.sui.transactionBase64.length > 0;

      if (isMoveTx && isRawTx) {
        throw new BadRequestError("Provide either sui.moveCalls or sui.transactionBase64 (not both)");
      }

      if (data.data) {
        throw new BadRequestError("For SUI, use sui.moveCalls instead of data");
      }
      if (data.gasLimit) {
        throw new BadRequestError("gasLimit is not applicable to SUI — use sui.gasBudget");
      }

      if (data.signerId) {
        const signer = await prisma.signerKey.findFirst({
          where: {
            id: data.signerId,
            projectId,
            isActive: true,
            chainType: "SUI",
          },
          select: { id: true, address: true },
        });
        if (!signer) throw new NotFoundError("SignerKey");
        signerKey = { id: signer.id, address: signer.address };
      } else {
        const selected = await addressPool.getNextSignerKey(projectId, { chainType: "SUI" });
        signerKey = { id: selected.id, address: selected.address };
      }

      if (isRawTx) {
        if (!data.signerId) {
          throw new BadRequestError("SUI sui.transactionBase64 requires signerId");
        }
        if (!isValidSuiAddress(data.to)) {
          throw new BadRequestError("Invalid SUI package/address in 'to'");
        }
        let parsed;
        try {
          parsed = parseSuiTransactionBase64(data.sui!.transactionBase64!);
        } catch (e) {
          throw new BadRequestError((e as Error).message);
        }
        const txData = parsed.getData();
        const gasOwner = txData.gasData?.owner;
        if (isSuiSponsoredGasOwner(gasOwner, signerKey.address)) {
          throw new BadRequestError(
            "SUI sponsored transactions (sender != gas owner) must use POST .../transactions/sponsor-sign and .../execute-sponsored",
          );
        }
        assertSingleSuiSigner(parsed, signerKey.address);
      } else if (!isMoveTx) {
        if (!isValidSuiAddress(data.to)) {
          throw new BadRequestError("Invalid SUI recipient address");
        }
        if (data.value != null && !/^\d+(\.\d+)?$/.test(data.value)) {
          throw new BadRequestError("Invalid SUI value format");
        }
      } else {
        if (!isValidSuiAddress(data.to)) {
          throw new BadRequestError("Invalid SUI package id in 'to'");
        }
        for (const [idx, call] of data.sui!.moveCalls!.entries()) {
          if (!call.target.includes("::")) {
            throw new BadRequestError(`Invalid sui.moveCalls[${idx}].target — expected package::module::function`);
          }
          if (!Array.isArray(call.arguments)) {
            throw new BadRequestError(`sui.moveCalls[${idx}].arguments must be an array`);
          }
        }
      }
    } else {
      // Validate EVM address
      if (!ethers.isAddress(data.to)) {
        throw new BadRequestError("Invalid Ethereum recipient address");
      }

      if (data.value != null && !/^\d+(\.\d+)?$/.test(data.value)) {
        throw new BadRequestError("Invalid EVM value format");
      }

      if (data.data != null && !/^0x[a-fA-F0-9]*$/.test(data.data)) {
        throw new BadRequestError("EVM data must be a hex string starting with 0x");
      }

      if (data.signerId) {
        const signer = await prisma.signerKey.findFirst({
          where: {
            id: data.signerId,
            projectId,
            isActive: true,
            chainType: "EVM",
          },
          select: { id: true, address: true },
        });
        if (!signer) throw new NotFoundError("SignerKey");
        signerKey = { id: signer.id, address: signer.address };
      } else {
        const selected = await addressPool.getNextSignerKey(projectId, { chainType: "EVM" });
        signerKey = { id: selected.id, address: selected.address };
      }
    }

    if (!signerKey) {
      throw new NotFoundError("No active signers for this project");
    }

    // Create the transaction record
    const tx = await prisma.transaction.create({
      data: {
        projectId,
        chainId: chainDbId,
        signerId: signerKey.id,
        from: signerKey.address,
        to: chain.chainType === "EVM" ? data.to.toLowerCase() : data.to,
        value: data.value || "0",
        data: chain.chainType === "EVM" ? (data.data || null) : null,
        solanaInstructions:
          chain.chainType === "SOLANA" && data.solana?.instructions
            ? ((data.solana.instructions as Prisma.InputJsonValue) ?? undefined)
            : undefined,
        solanaRawTransactionBase64:
          chain.chainType === "SOLANA" && data.solana?.transactionBase64
            ? data.solana.transactionBase64
            : undefined,
        solanaCuLimit: chain.chainType === "SOLANA" ? (data.solana?.cuLimit ?? undefined) : undefined,
        solanaCuPriceMicroLamports: chain.chainType === "SOLANA" ? (data.solana?.cuPriceMicroLamports ?? undefined) : undefined,
        suiMoveCalls:
          chain.chainType === "SUI" && data.sui?.moveCalls
            ? (data.sui.moveCalls as unknown as Prisma.InputJsonValue)
            : undefined,
        suiRawTransactionBase64:
          chain.chainType === "SUI" && data.sui?.transactionBase64
            ? data.sui.transactionBase64
            : undefined,
        suiGasBudget: chain.chainType === "SUI" ? (data.sui?.gasBudget ?? undefined) : undefined,
        suiGasPrice: chain.chainType === "SUI" ? (data.sui?.gasPrice ?? undefined) : undefined,
        gasLimit: data.gasLimit || null,
        metadata: data.metadata as Prisma.InputJsonValue ?? undefined,
        status: "QUEUED",
      },
      include: {
        chain: { select: { name: true, chainId: true, explorerUrl: true } },
        signer: { select: { label: true, address: true } },
      },
    });

    // Enqueue for signing
    await txSigningQueue.add("sign", { transactionId: tx.id });

    return tx;
  },

  /**
   * Sign EIP-712 typed data or Solana authorization payloads.
   */
  async signTypedData(
    projectId: string,
    data: {
      chainType?: "EVM" | "SOLANA" | "SUI";
      chainId: string | number;
      signerId?: string;
      domain?: Record<string, unknown>;
      types?: Record<string, Array<{ name: string; type: string }>>;
      value?: Record<string, unknown>;
      solana?: {
        domain: Record<string, unknown>;
        structHash?: string;
        rawPreimageBase64?: string;
        rawPreimageHex?: string;
        payload?: Record<string, unknown>;
      };
      sui?: {
        domain: Record<string, unknown>;
        structHash?: string;
        rawPreimageBase64?: string;
        rawPreimageHex?: string;
        payload?: Record<string, unknown>;
      };
    },
  ) {
    const chainDbId = await resolveChainDbId(projectId, data.chainId);

    const chain = await prisma.chain.findUniqueOrThrow({
      where: { id: chainDbId },
      select: { chainType: true },
    });

    const requestedChainType = data.chainType ?? chain.chainType;
    if (requestedChainType !== chain.chainType) {
      throw new BadRequestError(`Chain type mismatch: selected chain is ${chain.chainType}`);
    }

    let signerKey: { id: string; address: string; encryptedKey?: string | null; adapterType?: string; chainType?: string } | undefined;

    if (data.signerId) {
      signerKey = await prisma.signerKey.findFirst({
        where: { id: data.signerId, projectId, isActive: true, chainType: requestedChainType },
        select: { id: true, address: true, encryptedKey: true, adapterType: true, chainType: true },
      }) ?? undefined;
      if (!signerKey) throw new NotFoundError("SignerKey");
    } else if (requestedChainType === "SOLANA") {
      const selected = await addressPool.getNextSignerKey(projectId, { chainType: "SOLANA" });
      signerKey = { id: selected.id, address: selected.address, encryptedKey: selected.encryptedKey, adapterType: selected.adapterType, chainType: selected.chainType };
    } else if (requestedChainType === "SUI") {
      const selected = await addressPool.getNextSignerKey(projectId, { chainType: "SUI" });
      signerKey = { id: selected.id, address: selected.address, encryptedKey: selected.encryptedKey, adapterType: selected.adapterType, chainType: selected.chainType };
    } else {
      const provider = await rpcManager.getProvider(chainDbId);
      const selected = await addressPool.getNextSigner(projectId, provider);
      signerKey = {
        id: selected.signerKey.id,
        address: selected.signerKey.address,
        encryptedKey: selected.signerKey.encryptedKey,
        adapterType: selected.signerKey.adapterType,
        chainType: selected.signerKey.chainType,
      };
    }

    if (!signerKey) {
      throw new NotFoundError("No active signers for this project");
    }

    if (requestedChainType === "SOLANA") {
      if (!signerKey.encryptedKey) {
        throw new BadRequestError("SOLANA signers must use ENV keys with encryptedKey material");
      }
      if (!data.solana) {
        throw new BadRequestError("solana payload is required for SOLANA signing");
      }

      // If caller provides raw preimage bytes, sign those exact bytes.
      // Supported fields: solana.rawPreimageBase64 or solana.rawPreimageHex (0x-prefixed)
      let messageBytes: Uint8Array | null = null;
      let returnMessage: string | undefined;

      if (typeof data.solana.rawPreimageBase64 === "string" && data.solana.rawPreimageBase64.length > 0) {
        messageBytes = Buffer.from(data.solana.rawPreimageBase64, "base64");
        returnMessage = data.solana.rawPreimageBase64;
      } else if (typeof data.solana.rawPreimageHex === "string" && data.solana.rawPreimageHex.startsWith("0x")) {
        messageBytes = Buffer.from(data.solana.rawPreimageHex.slice(2), "hex");
        returnMessage = data.solana.rawPreimageHex;
      } else {
        const message = canonicalSolanaAuthorizationMessage({
          domain: data.solana.domain,
          structHash: data.solana.structHash!,
          payload: data.solana.payload,
        });
        messageBytes = new TextEncoder().encode(message);
        returnMessage = message;
      }

      const encodedSecret = decrypt(signerKey.encryptedKey);
      const solanaKeypair = solanaKeypairFromEncodedSecret(encodedSecret);
      const signature = nacl.sign.detached(messageBytes, solanaKeypair.secretKey);

      const response: any = {
        chainType: requestedChainType,
        signatureBase58: bs58.encode(signature),
        signer: signerKey.address,
      };
      if (returnMessage && typeof returnMessage === "string") {
        // If raw bytes were provided as base64 or hex, return them in `messageBase64` / `messageHex` shape
        if (typeof data.solana.rawPreimageBase64 === "string" && data.solana.rawPreimageBase64.length > 0) {
          response.messageBase64 = returnMessage;
        } else if (typeof data.solana.rawPreimageHex === "string" && data.solana.rawPreimageHex.length > 0) {
          response.messageHex = returnMessage;
        } else {
          response.message = returnMessage;
        }
      }

      return response;
    }

    if (requestedChainType === "SUI") {
      if (!signerKey.encryptedKey) {
        throw new BadRequestError("SUI signers must use ENV keys with encryptedKey material");
      }
      if (!data.sui) {
        throw new BadRequestError("sui payload is required for SUI signing");
      }

      let messageBytes: Uint8Array;
      let returnMessage: string | undefined;

      if (typeof data.sui.rawPreimageBase64 === "string" && data.sui.rawPreimageBase64.length > 0) {
        messageBytes = Buffer.from(data.sui.rawPreimageBase64, "base64");
        returnMessage = data.sui.rawPreimageBase64;
      } else if (typeof data.sui.rawPreimageHex === "string" && data.sui.rawPreimageHex.startsWith("0x")) {
        messageBytes = Buffer.from(data.sui.rawPreimageHex.slice(2), "hex");
        returnMessage = data.sui.rawPreimageHex;
      } else {
        const message = canonicalSuiAuthorizationMessage({
          domain: data.sui.domain,
          structHash: data.sui.structHash!,
          payload: data.sui.payload,
        });
        messageBytes = new TextEncoder().encode(message);
        returnMessage = message;
      }

      const suiKeypair = suiKeypairFromEncodedSecret(decrypt(signerKey.encryptedKey));
      const { signature } = await suiKeypair.signPersonalMessage(messageBytes);

      const response: Record<string, string> = {
        chainType: requestedChainType,
        signatureBase64: signature,
        signer: signerKey.address,
      };
      if (returnMessage) {
        if (data.sui.rawPreimageBase64) response.messageBase64 = returnMessage;
        else if (data.sui.rawPreimageHex) response.messageHex = returnMessage;
        else response.message = returnMessage;
      }
      return response;
    }

    const provider = await rpcManager.getProvider(chainDbId);
    const adapter = createKeyAdapter(signerKey as any, provider);
    if (!data.domain || !data.types || !data.value) {
      throw new BadRequestError("domain, types, and value are required for EVM signing");
    }
    const signature = await adapter.signTypedData(data.domain, data.types, data.value);

    return { chainType: requestedChainType, signature, signer: signerKey.address };
  },

  /**
   * SUI gas sponsorship — build full PTB with sponsor gas payment and return sponsor signature.
   * Client flow: build kind/partial PTB → sponsor-sign → user signs transactionBlockBase64 → execute-sponsored.
   */
  async sponsorSign(
    projectId: string,
    data: {
      chainId: string | number;
      sponsorSignerId?: string;
      transactionKindBase64?: string;
      transactionBase64?: string;
      senderAddress?: string;
      gasBudget?: string;
      gasPrice?: string;
    },
  ) {
    const chainDbId = await resolveChainDbId(projectId, data.chainId);
    const chain = await prisma.chain.findUniqueOrThrow({
      where: { id: chainDbId },
      select: { chainType: true },
    });
    if (chain.chainType !== "SUI") {
      throw new BadRequestError("sponsor-sign is only supported for SUI chains");
    }

    const client = await suiRpcManager.getClient(chainDbId);

    let tx: Transaction;
    let sender: string;
    try {
      ({ tx, sender } = await prepareTxForSponsorship(
        {
          transactionKindBase64: data.transactionKindBase64,
          transactionBase64: data.transactionBase64,
          senderAddress: data.senderAddress,
        },
        client,
      ));
    } catch (err) {
      const message = err instanceof Error ? err.message : "Invalid sponsor-sign PTB input";
      throw new BadRequestError(message);
    }

    const sponsorKey = await resolveSuiSponsorSigner(projectId, {
      sponsorSignerId: data.sponsorSignerId,
    });
    const sponsorKeypair = suiKeypairFromEncodedSecret(decrypt(sponsorKey.encryptedKey!));

    const gasPrice = data.gasPrice != null
      ? BigInt(data.gasPrice)
      : await suiRpcManager.getReferenceGasPrice(chainDbId);
    const gasBudget = data.gasBudget != null ? BigInt(data.gasBudget) : undefined;

    const built = await buildAndSignSponsoredTransaction({
      tx,
      client,
      sponsorKeypair,
      gasBudget,
      gasPrice,
    });

    assertSuiSponsoredRoles(tx, sender, built.gasOwner);

    const dualSignRequired = sender.toLowerCase() !== built.gasOwner.toLowerCase();

    return {
      sponsor: built.gasOwner,
      sender: built.sender,
      gasOwner: built.gasOwner,
      dualSignRequired,
      transactionBlockBase64: built.transactionBlockBase64,
      sponsorSignature: built.sponsorSignature,
      gasPayment: built.gasPayment,
      gasBudget: built.gasBudget,
      gasPrice: built.gasPrice,
    };
  },

  /**
   * Execute a dual-signed SUI sponsored transaction on-chain.
   */
  async executeSponsored(
    projectId: string,
    data: {
      chainId: string | number;
      transactionBlockBase64: string;
      signatures?: string[];
      userSignature?: string;
      sponsorSignature?: string;
      senderAddress?: string;
      signerId?: string;
      sponsorSignerId?: string;
      track?: boolean;
      to?: string;
      metadata?: Record<string, unknown>;
    },
  ) {
    const chainDbId = await resolveChainDbId(projectId, data.chainId);
    const chain = await prisma.chain.findUniqueOrThrow({
      where: { id: chainDbId },
      select: { chainType: true, chainId: true },
    });
    if (chain.chainType !== "SUI") {
      throw new BadRequestError("execute-sponsored is only supported for SUI chains");
    }

    const rawSignatures = collectSuiSponsoredSignatures({
      signatures: data.signatures,
      userSignature: data.userSignature,
      sponsorSignature: data.sponsorSignature,
    });

    if (rawSignatures.length === 0) {
      throw new BadRequestError("Provide at least one signature for execute-sponsored");
    }

    let executeSignatures: string | string[];
    try {
      executeSignatures = resolveSuiExecuteSignatures(
        data.transactionBlockBase64,
        rawSignatures,
        { senderAddress: data.senderAddress },
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : "Invalid execute-sponsored signatures";
      throw new BadRequestError(message);
    }

    const shouldTrack = data.track !== false;
    const signedData = serializeSignedSuiSponsoredTx({
      transactionBlockBase64: data.transactionBlockBase64,
      signatures: Array.isArray(executeSignatures) ? executeSignatures : [executeSignatures],
    });

    if (!shouldTrack) {
      const client = await suiRpcManager.getClient(chainDbId);
      const result = await client.executeTransactionBlock({
        transactionBlock: data.transactionBlockBase64,
        signature: executeSignatures,
        options: { showEffects: true, showInput: true },
      });
      return { digest: result.digest };
    }

    const { signerId, from } = await resolveSuiSponsoredRecordSigner(projectId, {
      signerId: data.signerId,
      sponsorSignerId: data.sponsorSignerId,
      senderAddress: data.senderAddress,
      transactionBlockBase64: data.transactionBlockBase64,
    });

    let txRecord = await prisma.transaction.create({
      data: {
        projectId,
        chainId: chainDbId,
        signerId,
        from,
        to: data.to ?? from,
        value: "0",
        suiRawTransactionBase64: data.transactionBlockBase64,
        signedData,
        metadata: {
          ...(typeof data.metadata === "object" && data.metadata ? data.metadata : {}),
          sponsored: true,
        } as Prisma.InputJsonValue,
        status: "QUEUED",
      },
    });

    txRecord = await prisma.transaction.update({
      where: { id: txRecord.id },
      data: { status: "SIGNING" },
    });
    await webhookService.emitEvent("tx.signing", txRecord);

    txRecord = await prisma.transaction.update({
      where: { id: txRecord.id },
      data: { status: "SIGNED" },
    });
    await webhookService.emitEvent("tx.signed", txRecord);

    await txBroadcastingQueue.add("broadcast", { transactionId: txRecord.id });

    return {
      transactionId: txRecord.id,
      status: txRecord.status,
    };
  },
};

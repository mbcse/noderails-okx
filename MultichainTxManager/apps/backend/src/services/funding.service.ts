import { ethers } from "ethers";
import { PublicKey, SystemProgram, Transaction as SolanaTransaction } from "@solana/web3.js";
import { prisma } from "../config/database.js";
import { rpcManager } from "./rpc-manager.js";
import { solanaRpcManager } from "./solana-rpc-manager.js";
import { nonceManager } from "./nonce-manager.js";
import { createKeyAdapter } from "../adapters/index.js";
import { settingsService } from "./settings.service.js";
import { fundingConfigService } from "./funding-config.service.js";
import { logger } from "../lib/logger.js";
import { decrypt } from "../lib/crypto.js";
import { keypairFromEncodedSecret } from "../lib/solana.js";
import { keypairFromEncodedSecret as suiKeypairFromEncodedSecret } from "../lib/sui.js";
import { suiRpcManager } from "./sui-rpc-manager.js";
import {
  buildNativeSuiTransferTx,
  parseSuiAmountToMist,
  signSuiTransaction,
} from "../lib/sui-transaction.js";
import { BadRequestError } from "../lib/errors.js";
import { isSuiJsonRpcDeprecated, truncateRpcError } from "../lib/rpc-error.js";
import {
  clearMasterInsufficient,
  isMasterInsufficient,
  isRpcBroken,
  markMasterInsufficient,
  markRpcBroken,
} from "../lib/funding-cooldown.js";
import { errorOnce, warnOnce } from "../lib/log-throttle.js";

// ────────────────────────────────────────────────────────────
// Funding service — auto-fund low-balance signers from master wallet
//
// The master wallet sends a plain ETH transfer directly (not queued)
// using the same nonce manager. This avoids circular dependencies
// where a queued funding tx might itself need funding.
// ────────────────────────────────────────────────────────────

const FUND_TX_GAS_LIMIT = 21000n; // plain ETH transfer (default chains)
const FILECOIN_MIN_GAS_LIMIT = 800000n;
const RECEIPT_POLL_ATTEMPTS = 10;
const RECEIPT_POLL_DELAY_MS = 3000;
const PENDING_FUNDING_STALE_MS = 10 * 60 * 1000; // 10 minutes

function maxBigInt(a: bigint, b: bigint): bigint {
  return a > b ? a : b;
}

function isFilecoinChain(chain: { name: string; chainId: number; rpcUrls?: string[] }): boolean {
  const name = chain.name.toLowerCase();
  if (name.includes("filecoin") || name.includes("calibration")) return true;

  if (chain.chainId === 314159 || chain.chainId === 314) return true;

  if (chain.rpcUrls?.some((u) => {
    const lower = u.toLowerCase();
    return lower.includes("filecoin") || lower.includes("calibration");
  })) {
    return true;
  }

  return false;
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function parseSolAmountToLamports(input: string): bigint {
  const raw = (input ?? "0").trim();
  if (raw === "") return 0n;

  if (!raw.includes(".")) {
    return BigInt(raw);
  }

  // Treat decimals as SOL → convert to lamports (9 decimals)
  const [whole = "0", frac = ""] = raw.split(".");
  const padded = frac.padEnd(9, "0").slice(0, 9);
  return BigInt(whole) * 10n ** 9n + BigInt(padded || "0");
}

function bigintToSafeNumber(value: bigint, label: string): number {
  if (value < 0n) throw new BadRequestError(`${label} must be >= 0`);
  const maxSafe = BigInt(Number.MAX_SAFE_INTEGER);
  if (value > maxSafe) {
    throw new BadRequestError(`${label} is too large to safely represent`);
  }
  return Number(value);
}

function getSolanaKeypairFromSignerKey(signerKey: { id: string; adapterType: string; encryptedKey: string | null }) {
  if (signerKey.adapterType !== "ENV") {
    throw new BadRequestError("SOLANA currently supports ENV adapter only");
  }
  if (!signerKey.encryptedKey) {
    throw new BadRequestError(`SignerKey ${signerKey.id} has no encryptedKey`);
  }

  const encodedSecret = decrypt(signerKey.encryptedKey);
  return keypairFromEncodedSecret(encodedSecret);
}

async function fundSolana(projectId: string, chainDbId: string, targetAddress: string): Promise<string | null> {
  const log = logger.child({ service: "funding.solana", projectId, chainDbId, targetAddress });

  const chain = await prisma.chain.findUniqueOrThrow({
    where: { id: chainDbId },
    select: { chainType: true, name: true },
  });

  if (chain.chainType !== "SOLANA") {
    throw new BadRequestError("Attempted Solana funding on non-SOLANA chain");
  }

  const masterKey = await prisma.signerKey.findFirst({
    where: { projectId, isMaster: true, isActive: true, chainType: "SOLANA" },
  });

  if (!masterKey) {
    log.warn("No SOLANA master wallet configured for project — cannot fund");
    return null;
  }

  if (masterKey.address === targetAddress) {
    log.debug("Target is the master wallet itself — skipping");
    return null;
  }

  const fundAmountOverride = await prisma.setting.findUnique({
    where: { key: fundingConfigService.fundAmountOverrideKey(projectId, chainDbId) },
    select: { value: true },
  });
  const fundAmountStr = fundAmountOverride?.value
    ?? await settingsService.getString("funding.solana.fundAmountLamports");
  const fundLamports = BigInt(fundAmountStr);

  if (fundLamports <= 0n) {
    throw new BadRequestError("Funding amount must be > 0");
  }

  const fromPubkey = new PublicKey(masterKey.address);
  const toPubkey = new PublicKey(targetAddress);

  const connection = await solanaRpcManager.getConnection(chainDbId);

  // Build tx to estimate fee and ensure balance
  const tx = new SolanaTransaction().add(
    SystemProgram.transfer({
      fromPubkey,
      toPubkey,
      lamports: bigintToSafeNumber(fundLamports, "fundLamports"),
    }),
  );

  const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash("confirmed");
  tx.recentBlockhash = blockhash;
  tx.feePayer = fromPubkey;

  const fee = await connection.getFeeForMessage(tx.compileMessage());
  const feeLamports = BigInt(fee.value ?? 0);

  const masterBalanceNum = await connection.getBalance(fromPubkey);
  const masterLamports = BigInt(masterBalanceNum);

  if (masterLamports < fundLamports + feeLamports) {
    const first = await markMasterInsufficient(projectId, chainDbId);
    const payload = {
      chainName: chain.name,
      masterLamports: masterLamports.toString(),
      fundLamports: fundLamports.toString(),
      feeLamports: feeLamports.toString(),
    };
    if (first) {
      log.warn(payload, "Master wallet has insufficient balance to fund");
    } else {
      log.debug(payload, "Master wallet has insufficient balance to fund");
    }
    return null;
  }

  await clearMasterInsufficient(projectId, chainDbId);

  const kp = getSolanaKeypairFromSignerKey(masterKey);

  const fundingLog = await prisma.fundingLog.create({
    data: {
      projectId,
      chainId: chainDbId,
      chainName: chain.name,
      fromAddress: masterKey.address,
      toAddress: targetAddress,
      amountWei: fundLamports.toString(),
      status: "PENDING",
    },
  });

  try {
    const signature = await connection.sendTransaction(tx, [kp], {
      preflightCommitment: "confirmed",
    });

    await prisma.fundingLog.update({
      where: { id: fundingLog.id },
      data: { txHash: signature },
    });

    const confirmation = await connection.confirmTransaction(
      { signature, blockhash, lastValidBlockHeight },
      "confirmed",
    );

    if (confirmation.value.err) {
      await prisma.fundingLog.update({
        where: { id: fundingLog.id },
        data: { status: "FAILED", errorMessage: JSON.stringify(confirmation.value.err) },
      });
      return null;
    }

    await prisma.fundingLog.update({
      where: { id: fundingLog.id },
      data: { status: "CONFIRMED" },
    });

    return signature;
  } catch (err) {
    await prisma.fundingLog.update({
      where: { id: fundingLog.id },
      data: { status: "FAILED", errorMessage: (err as Error).message },
    });
    return null;
  }
}

async function emergencyTransferSolana(
  projectId: string,
  signerId: string,
  chainDbId: string,
  toAddress: string,
  amountWei: string,
): Promise<{ txHash: string }> {
  const log = logger.child({ service: "emergency-transfer.solana", projectId, signerId, chainDbId, toAddress });

  const [chain, signer] = await Promise.all([
    prisma.chain.findFirst({
      where: { id: chainDbId, projectId },
      select: { id: true, name: true, chainType: true },
    }),
    prisma.signerKey.findFirst({
      where: { id: signerId, projectId },
      select: { id: true, address: true, adapterType: true, encryptedKey: true, chainType: true },
    }),
  ]);

  if (!chain) throw new BadRequestError("Chain not found");
  if (!signer) throw new BadRequestError("Signer not found");

  if (chain.chainType !== "SOLANA") {
    throw new BadRequestError("Attempted SOLANA emergency transfer on non-SOLANA chain");
  }
  if (signer.chainType !== "SOLANA") {
    throw new BadRequestError("Signer is not a SOLANA signer");
  }

  const fromPubkey = new PublicKey(signer.address);
  const toPubkey = new PublicKey(toAddress);
  const connection = await solanaRpcManager.getConnection(chainDbId);

  const keypair = getSolanaKeypairFromSignerKey(signer);
  if (keypair.publicKey.toBase58() !== signer.address) {
    log.warn({ signerAddress: signer.address }, "Signer keypair does not match stored address");
  }

  const balanceLamportsNum = await connection.getBalance(fromPubkey);
  const balanceLamports = BigInt(balanceLamportsNum);

  const requestedLamports = parseSolAmountToLamports(amountWei ?? "0");

  // Fee estimate
  const txForFee = new SolanaTransaction().add(
    SystemProgram.transfer({ fromPubkey, toPubkey, lamports: 1 }),
  );
  const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash("confirmed");
  txForFee.recentBlockhash = blockhash;
  txForFee.feePayer = fromPubkey;
  const fee = await connection.getFeeForMessage(txForFee.compileMessage());
  const feeLamports = BigInt(fee.value ?? 0);

  let transferLamports: bigint;
  if (requestedLamports === 0n) {
    if (balanceLamports <= feeLamports) {
      throw new BadRequestError("Insufficient balance to pay SOLANA transaction fee");
    }
    transferLamports = balanceLamports - feeLamports;
  } else {
    if (requestedLamports + feeLamports > balanceLamports) {
      throw new BadRequestError("Insufficient SOLANA balance for transfer + fee");
    }
    transferLamports = requestedLamports;
  }

  const transferTx = new SolanaTransaction().add(
    SystemProgram.transfer({
      fromPubkey,
      toPubkey,
      lamports: bigintToSafeNumber(transferLamports, "transferLamports"),
    }),
  );
  transferTx.recentBlockhash = blockhash;
  transferTx.feePayer = fromPubkey;

  const signature = await connection.sendTransaction(transferTx, [keypair], {
    preflightCommitment: "confirmed",
  });

  const confirmation = await connection.confirmTransaction(
    { signature, blockhash, lastValidBlockHeight },
    "confirmed",
  );

  if (confirmation.value.err) {
    throw new BadRequestError(`SOLANA transfer failed: ${JSON.stringify(confirmation.value.err)}`);
  }

  log.info({ signature, transferLamports: transferLamports.toString() }, "SOLANA emergency transfer confirmed");

  return { txHash: signature };
}

function getSuiKeypairFromSignerKey(signerKey: { id: string; adapterType: string; encryptedKey: string | null }) {
  if (signerKey.adapterType !== "ENV") {
    throw new BadRequestError("SUI currently supports ENV adapter only");
  }
  if (!signerKey.encryptedKey) {
    throw new BadRequestError(`SignerKey ${signerKey.id} has no encryptedKey`);
  }

  const encodedSecret = decrypt(signerKey.encryptedKey);
  return suiKeypairFromEncodedSecret(encodedSecret);
}

const DEFAULT_SUI_GAS_BUDGET = 5_000_000n;

async function fundSui(projectId: string, chainDbId: string, targetAddress: string): Promise<string | null> {
  const log = logger.child({ service: "funding.sui", projectId, chainDbId, targetAddress });

  const chain = await prisma.chain.findUniqueOrThrow({
    where: { id: chainDbId },
    select: { chainType: true, name: true },
  });

  if (chain.chainType !== "SUI") {
    throw new BadRequestError("Attempted SUI funding on non-SUI chain");
  }

  const masterKey = await prisma.signerKey.findFirst({
    where: { projectId, isMaster: true, isActive: true, chainType: "SUI" },
  });

  if (!masterKey) {
    log.warn("No SUI master wallet configured for project — cannot fund");
    return null;
  }

  if (masterKey.address === targetAddress) {
    log.debug("Target is the master wallet itself — skipping");
    return null;
  }

  const fundAmountOverride = await prisma.setting.findUnique({
    where: { key: fundingConfigService.fundAmountOverrideKey(projectId, chainDbId) },
    select: { value: true },
  });
  const fundAmountStr = fundAmountOverride?.value
    ?? await settingsService.getString("funding.sui.fundAmountMist");
  const fundMist = BigInt(fundAmountStr);

  if (fundMist <= 0n) {
    throw new BadRequestError("Funding amount must be > 0");
  }

  const client = await suiRpcManager.getClient(chainDbId);
  const gasPrice = await suiRpcManager.getReferenceGasPrice(chainDbId);
  const gasBudget = DEFAULT_SUI_GAS_BUDGET;
  const masterMist = await suiRpcManager.getBalance(chainDbId, masterKey.address);

  if (masterMist < fundMist + gasBudget) {
    const first = await markMasterInsufficient(projectId, chainDbId);
    const payload = {
      chainName: chain.name,
      masterMist: masterMist.toString(),
      fundMist: fundMist.toString(),
      gasBudget: gasBudget.toString(),
    };
    if (first) {
      log.warn(payload, "Master wallet has insufficient balance to fund");
    } else {
      log.debug(payload, "Master wallet has insufficient balance to fund");
    }
    return null;
  }

  await clearMasterInsufficient(projectId, chainDbId);

  const kp = getSuiKeypairFromSignerKey(masterKey);

  const fundingLog = await prisma.fundingLog.create({
    data: {
      projectId,
      chainId: chainDbId,
      chainName: chain.name,
      fromAddress: masterKey.address,
      toAddress: targetAddress,
      amountWei: fundMist.toString(),
      status: "PENDING",
    },
  });

  try {
    const tx = buildNativeSuiTransferTx({
      sender: masterKey.address,
      recipient: targetAddress,
      amountMist: fundMist,
      gasBudget,
      gasPrice,
    });

    const signed = await signSuiTransaction(tx, client, kp);
    const result = await client.executeTransactionBlock({
      transactionBlock: signed.transactionBlockBase64,
      signature: signed.signature,
      options: { showEffects: true },
    });

    const digest = result.digest;
    await prisma.fundingLog.update({
      where: { id: fundingLog.id },
      data: { txHash: digest },
    });

    const confirmed = await client.waitForTransaction({
      digest,
      options: { showEffects: true },
    });

    if (confirmed.effects?.status.status !== "success") {
      await prisma.fundingLog.update({
        where: { id: fundingLog.id },
        data: {
          status: "FAILED",
          errorMessage: confirmed.effects?.status.error ?? "Transaction failed",
        },
      });
      return null;
    }

    await prisma.fundingLog.update({
      where: { id: fundingLog.id },
      data: { status: "CONFIRMED" },
    });

    return digest;
  } catch (err) {
    await prisma.fundingLog.update({
      where: { id: fundingLog.id },
      data: { status: "FAILED", errorMessage: (err as Error).message },
    });
    return null;
  }
}

async function emergencyTransferSui(
  projectId: string,
  signerId: string,
  chainDbId: string,
  toAddress: string,
  amountWei: string,
): Promise<{ txHash: string }> {
  const log = logger.child({ service: "emergency-transfer.sui", projectId, signerId, chainDbId, toAddress });

  const [chain, signer] = await Promise.all([
    prisma.chain.findFirst({
      where: { id: chainDbId, projectId },
      select: { id: true, name: true, chainType: true },
    }),
    prisma.signerKey.findFirst({
      where: { id: signerId, projectId },
      select: { id: true, address: true, adapterType: true, encryptedKey: true, chainType: true },
    }),
  ]);

  if (!chain) throw new BadRequestError("Chain not found");
  if (!signer) throw new BadRequestError("Signer not found");

  if (chain.chainType !== "SUI") {
    throw new BadRequestError("Attempted SUI emergency transfer on non-SUI chain");
  }
  if (signer.chainType !== "SUI") {
    throw new BadRequestError("Signer is not a SUI signer");
  }

  const client = await suiRpcManager.getClient(chainDbId);
  const keypair = getSuiKeypairFromSignerKey(signer);
  const balanceMist = await suiRpcManager.getBalance(chainDbId, signer.address);
  const gasPrice = await suiRpcManager.getReferenceGasPrice(chainDbId);
  const gasBudget = DEFAULT_SUI_GAS_BUDGET;

  const requestedMist = parseSuiAmountToMist(amountWei ?? "0");

  let transferMist: bigint;
  if (requestedMist === 0n) {
    if (balanceMist <= gasBudget) {
      throw new BadRequestError("Insufficient balance to pay SUI transaction gas");
    }
    transferMist = balanceMist - gasBudget;
  } else {
    if (requestedMist + gasBudget > balanceMist) {
      throw new BadRequestError("Insufficient SUI balance for transfer + gas");
    }
    transferMist = requestedMist;
  }

  const tx = buildNativeSuiTransferTx({
    sender: signer.address,
    recipient: toAddress,
    amountMist: transferMist,
    gasBudget,
    gasPrice,
  });

  const signed = await signSuiTransaction(tx, client, keypair);
  const result = await client.executeTransactionBlock({
    transactionBlock: signed.transactionBlockBase64,
    signature: signed.signature,
    options: { showEffects: true },
  });

  const confirmed = await client.waitForTransaction({
    digest: result.digest,
    options: { showEffects: true },
  });

  if (confirmed.effects?.status.status !== "success") {
    throw new BadRequestError(`SUI transfer failed: ${confirmed.effects?.status.error ?? "unknown error"}`);
  }

  log.info({ digest: result.digest, transferMist: transferMist.toString() }, "SUI emergency transfer confirmed");

  return { txHash: result.digest };
}

export const fundingService = {
  /**
   * Send native tokens from the master wallet to a target address.
   *
   * @returns The transaction hash, or null if funding failed.
   */
  async fund(
    projectId: string,
    chainDbId: string,
    targetAddress: string,
  ): Promise<string | null> {
    const log = logger.child({ service: "funding", projectId, chainDbId, targetAddress });

    const chain = await prisma.chain.findUniqueOrThrow({
      where: { id: chainDbId },
      select: { chainType: true },
    });

    if (chain.chainType === "SOLANA") {
      return fundSolana(projectId, chainDbId, targetAddress);
    }

    if (chain.chainType === "SUI") {
      return fundSui(projectId, chainDbId, targetAddress);
    }

    // 1. Find the master wallet for this project
    const masterKey = await prisma.signerKey.findFirst({
      where: { projectId, isMaster: true, isActive: true, chainType: "EVM" },
    });

    if (!masterKey) {
      log.warn("No master wallet configured for project — cannot fund");
      return null;
    }

    if (masterKey.address.toLowerCase() === targetAddress.toLowerCase()) {
      log.debug("Target is the master wallet itself — skipping");
      return null;
    }

    // Deduplication: inspect existing pending funding tx for this (target, chain)
    const pendingFunding = await prisma.fundingLog.findFirst({
      where: {
        toAddress: targetAddress,
        chainId: chainDbId,
        status: "PENDING",
      },
      orderBy: { createdAt: "desc" },
    });

    if (pendingFunding) {
      const pendingAgeMs = Date.now() - pendingFunding.createdAt.getTime();

      // Corrupted/incomplete pending row: clear it so funding can proceed.
      if (!pendingFunding.txHash) {
        await prisma.fundingLog.update({
          where: { id: pendingFunding.id },
          data: { status: "FAILED", errorMessage: "Pending funding log missing tx hash" },
        });
        log.warn(
          { fundingLogId: pendingFunding.id },
          "Found pending funding without tx hash — marked failed and allowing retry",
        );
      } else {
        try {
          const existingReceipt = await rpcManager.callWithFailover(
            chainDbId,
            (p) => p.getTransactionReceipt(pendingFunding.txHash as string),
            "getTransactionReceipt",
          );

          if (existingReceipt?.status === 1) {
            await prisma.fundingLog.update({
              where: { id: pendingFunding.id },
              data: { status: "CONFIRMED" },
            });
            log.info(
              { existingTxHash: pendingFunding.txHash, fundingLogId: pendingFunding.id },
              "Existing pending funding already confirmed on-chain",
            );
            return pendingFunding.txHash;
          }

          if (existingReceipt?.status === 0) {
            await prisma.fundingLog.update({
              where: { id: pendingFunding.id },
              data: { status: "FAILED", errorMessage: "Pending funding tx reverted on-chain" },
            });
            log.warn(
              { existingTxHash: pendingFunding.txHash, fundingLogId: pendingFunding.id },
              "Existing pending funding reverted on-chain — allowing retry",
            );
          } else if (pendingAgeMs < PENDING_FUNDING_STALE_MS) {
            log.debug(
              {
                existingTxHash: pendingFunding.txHash,
                fundingLogId: pendingFunding.id,
                pendingAgeMs,
              },
              "Funding already in progress for this signer+chain — returning existing tx hash",
            );
            return pendingFunding.txHash;
          } else {
            await prisma.fundingLog.update({
              where: { id: pendingFunding.id },
              data: {
                status: "FAILED",
                errorMessage: `Stale pending funding (> ${Math.floor(PENDING_FUNDING_STALE_MS / 60000)}m)`,
              },
            });
            log.warn(
              {
                existingTxHash: pendingFunding.txHash,
                fundingLogId: pendingFunding.id,
                pendingAgeMs,
              },
              "Existing pending funding is stale — marked failed and allowing retry",
            );
          }
        } catch (receiptErr) {
          // If receipt lookup fails, keep duplicate protection for recent rows.
          if (pendingAgeMs < PENDING_FUNDING_STALE_MS) {
            log.warn(
              {
                existingTxHash: pendingFunding.txHash,
                fundingLogId: pendingFunding.id,
                pendingAgeMs,
                err: receiptErr,
              },
              "Could not verify pending funding receipt — returning existing tx hash",
            );
            return pendingFunding.txHash;
          }

          await prisma.fundingLog.update({
            where: { id: pendingFunding.id },
            data: {
              status: "FAILED",
              errorMessage: `Stale pending funding with receipt lookup error: ${(receiptErr as Error).message}`,
            },
          });
          log.warn(
            {
              existingTxHash: pendingFunding.txHash,
              fundingLogId: pendingFunding.id,
              pendingAgeMs,
              err: receiptErr,
            },
            "Pending funding stale and unverified — marked failed and allowing retry",
          );
        }
      }
    }

    try {
      // 2. Read the funding amount from settings
      const fundAmountOverride = await prisma.setting.findUnique({
        where: { key: fundingConfigService.fundAmountOverrideKey(projectId, chainDbId) },
        select: { value: true },
      });
      const fundAmountStr = fundAmountOverride?.value
        ?? await settingsService.getString("funding.fundAmountWei");
      const fundAmount = BigInt(fundAmountStr);

      // 3. Get chain info early to determine if Filecoin
      const chain = await prisma.chain.findUniqueOrThrow({
        where: { id: chainDbId },
        select: { chainId: true, name: true, rpcUrls: true },
      });

      const filecoinChain = isFilecoinChain(chain);

      log.debug(
        {
          chainName: chain.name,
          chainId: chain.chainId,
          rpcUrlCount: chain.rpcUrls?.length ?? 0,
          firstRpcUrl: chain.rpcUrls?.[0] ?? null,
          isFilecoinDetected: filecoinChain,
        },
        "Chain info loaded for balance check",
      );

      // 4. Read master wallet balance
      const masterBalance = await rpcManager.callWithFailover(
        chainDbId,
        (p) => p.getBalance(masterKey.address),
        "getBalance",
      );

      log.debug(
        {
          masterAddress: masterKey.address,
          chainName: chain.name,
          masterBalance: masterBalance.toString(),
          filecoinChain,
        },
        "Master wallet balance retrieved",
      );

      // 5. For balance validation, we need to estimate the actual gas cost.
      // Get fee data first so we can calculate expected gas cost.
      const feeData = await rpcManager.callWithFailover(
        chainDbId,
        (p) => p.getFeeData(),
        "getFeeData",
      );

      log.debug(
        {
          chain: chain.name,
          chainId: chain.chainId,
          maxFeePerGas: feeData.maxFeePerGas?.toString() ?? null,
          gasPrice: feeData.gasPrice?.toString() ?? null,
          filecoinChain,
        },
        "Fee data retrieved",
      );

      const feePerGas = (feeData.maxFeePerGas ?? feeData.gasPrice) ?? 1_000_000_000n;

      // Estimate gas limit (different for Filecoin vs standard chains)
      let gasLimit = FUND_TX_GAS_LIMIT;
      let estimatedGas: bigint | null = null;

      if (filecoinChain) {
        try {
          estimatedGas = await rpcManager.callWithFailover(
            chainDbId,
            (p) => p.estimateGas({
              from: masterKey.address,
              to: targetAddress,
              value: fundAmount,
              data: "0x",
            }),
            "estimateGas",
          );

          gasLimit = maxBigInt((estimatedGas * 120n) / 100n, FILECOIN_MIN_GAS_LIMIT);
          
          log.debug(
            {
              chain: chain.name,
              chainId: chain.chainId,
              estimatedGas: estimatedGas.toString(),
              gasLimitAfterBuffer: gasLimit.toString(),
            },
            "Filecoin gas estimation successful",
          );
        } catch (gasEstErr) {
          await errorOnce(
            `funding:filecoin-gas:${projectId}:${chainDbId}`,
            {
              chain: chain.name,
              chainId: chain.chainId,
              err: truncateRpcError(gasEstErr),
              masterAddress: masterKey.address,
              targetAddress,
              fundAmount: fundAmount.toString(),
            },
            "Filecoin gas estimation failed — falling back to minimum",
          );
          // Fall back to minimum if estimation fails
          gasLimit = FILECOIN_MIN_GAS_LIMIT;
        }
      }

      // Calculate actual estimated gas cost
      const estimatedGasCost = gasLimit * feePerGas;

      // Check balance: must cover fundAmount + estimated gas cost
      if (masterBalance < fundAmount + estimatedGasCost) {
        const first = await markMasterInsufficient(projectId, chainDbId);
        const payload = {
          masterAddress: masterKey.address,
          chain: chain.name,
          chainId: chain.chainId,
          masterBalance: masterBalance.toString(),
          fundAmount: fundAmount.toString(),
          estimatedGasCost: estimatedGasCost.toString(),
        };
        if (first) {
          log.warn(payload, "Master wallet has insufficient balance to fund");
        } else {
          log.debug(payload, "Master wallet has insufficient balance to fund");
        }
        return null;
      }

      await clearMasterInsufficient(projectId, chainDbId);

      // Balance check passed — log success details
      log.info(
        {
          masterAddress: masterKey.address,
          chain: chain.name,
          chainId: chain.chainId,
          masterBalance: masterBalance.toString(),
          masterBalanceETH: ethers.formatEther(masterBalance),
          fundAmount: fundAmount.toString(),
          fundAmountETH: ethers.formatEther(fundAmount),
          estimatedGasCost: estimatedGasCost.toString(),
          estimatedGasCostETH: ethers.formatEther(estimatedGasCost),
          bufferRemaining: (masterBalance - fundAmount - estimatedGasCost).toString(),
          filecoinChain,
        },
        "✅ Balance check passed — proceeding with funding",
      );

      // 6. Acquire nonce for the master wallet
      const nonce = await nonceManager.acquire(chainDbId, masterKey.address);

      try {
        // 7. Build the funding tx
        const fundTx: Record<string, unknown> = {
          to: targetAddress,
          value: fundAmount,
          nonce,
          chainId: chain.chainId,
          gasLimit,
        };

        // 8. Apply gas pricing
        if (feeData.maxFeePerGas != null) {
          fundTx.maxFeePerGas = (feeData.maxFeePerGas * 120n) / 100n;
          fundTx.maxPriorityFeePerGas = feeData.maxPriorityFeePerGas ?? 1_500_000_000n;
          fundTx.type = 2;
        } else if (feeData.gasPrice != null) {
          fundTx.gasPrice = (feeData.gasPrice * 120n) / 100n;
        }

        if (filecoinChain) {
          log.info(
            {
              masterAddress: masterKey.address,
              targetAddress,
              masterBalance: masterBalance.toString(),
              fundAmount: fundAmount.toString(),
              estimatedGas: estimatedGas?.toString() ?? null,
              gasLimit: gasLimit.toString(),
              feePerGas: feePerGas.toString(),
              estimatedGasCost: estimatedGasCost.toString(),
              balanceAfterFunding: (masterBalance - fundAmount - estimatedGasCost).toString(),
            },
            "Filecoin funding gas check",
          );
        }

        // 8. Sign
        const provider = await rpcManager.getProvider(chainDbId);
        const adapter = createKeyAdapter(masterKey, provider);
        const signedTxHex = await adapter.signTransaction(fundTx);

        // 9. Broadcast
        const broadcastResult = await rpcManager.callWithFailover(
          chainDbId,
          (p) => p.broadcastTransaction(signedTxHex),
          "broadcastTransaction",
        );

        log.info(
          {
            hash: broadcastResult.hash,
            from: masterKey.address,
            to: targetAddress,
            amount: ethers.formatEther(fundAmount),
            nonce,
          },
          "Funding tx broadcast",
        );

        // Record funding log in DB
        const fundingLog = await prisma.fundingLog.create({
          data: {
            projectId,
            chainId: chainDbId,
            chainName: chain.name,
            fromAddress: masterKey.address,
            toAddress: targetAddress,
            txHash: broadcastResult.hash,
            amountWei: fundAmount.toString(),
            status: "PENDING",
          },
        });

        // 10. Wait for confirmation (inline polling)
        for (let i = 0; i < RECEIPT_POLL_ATTEMPTS; i++) {
          await sleep(RECEIPT_POLL_DELAY_MS);
          try {
            const receipt = await rpcManager.callWithFailover(
              chainDbId,
              (p) => p.getTransactionReceipt(broadcastResult.hash),
              "getTransactionReceipt",
            );
            if (receipt) {
              if (receipt.status === 1) {
                log.info(
                  { hash: broadcastResult.hash, block: receipt.blockNumber },
                  "Funding tx confirmed",
                );
                await prisma.fundingLog.update({
                  where: { id: fundingLog.id },
                  data: { status: "CONFIRMED" },
                });
                return broadcastResult.hash;
              } else {
                log.error({ hash: broadcastResult.hash }, "Funding tx reverted on-chain");
                await prisma.fundingLog.update({
                  where: { id: fundingLog.id },
                  data: { status: "FAILED", errorMessage: "Reverted on-chain" },
                });
                return null;
              }
            }
          } catch (pollErr) {
            log.debug({ err: pollErr, attempt: i + 1 }, "Funding receipt poll failed — retrying");
          }
        }

        // Receipt not found in time — but tx was broadcast, likely still pending
        log.warn({ hash: broadcastResult.hash }, "Funding tx broadcast but receipt not confirmed in time");
        return broadcastResult.hash;
      } catch (err) {
        // Release nonce on failure
        await nonceManager.release(chainDbId, masterKey.address);
        throw err;
      }
    } catch (err) {
      await errorOnce(
        `funding:failed:${projectId}:${chainDbId}`,
        { err: truncateRpcError(err), projectId, chainDbId, targetAddress },
        "Funding failed",
      );
      return null;
    }
  },

  /**
   * Scan all projects for low-balance signers and fund them.
   * Called periodically from server.ts.
   */

  /**
   * Emergency transfer — send native tokens FROM any signer to an arbitrary address.
   * Uses the signer's own key to sign the transaction.
   */
  async emergencyTransfer(
    projectId: string,
    signerId: string,
    chainDbId: string,
    toAddress: string,
    amountWei: string, // "0" means drain entire balance (minus gas)
    forceNonce?: number,
  ): Promise<{ txHash: string }> {
    const log = logger.child({ service: "emergency-transfer", projectId, signerId, chainDbId, toAddress });

    // 1. Load signer
    const signerKey = await prisma.signerKey.findFirst({
      where: { id: signerId, projectId },
    });
    if (!signerKey) throw new Error("Signer not found");

    // 2. Get chain info
    const chain = await prisma.chain.findUniqueOrThrow({
      where: { id: chainDbId },
      select: { chainId: true, name: true, rpcUrls: true, chainType: true },
    });

    if (chain.chainType === "SOLANA") {
      return emergencyTransferSolana(projectId, signerId, chainDbId, toAddress, amountWei);
    }

    if (chain.chainType === "SUI") {
      return emergencyTransferSui(projectId, signerId, chainDbId, toAddress, amountWei);
    }

    if (signerKey.chainType && signerKey.chainType !== chain.chainType) {
      throw new BadRequestError("Signer chainType does not match chain chainType");
    }

    if (!ethers.isAddress(toAddress)) {
      throw new BadRequestError("Invalid Ethereum address");
    }

    const filecoinChain = isFilecoinChain(chain);

    // 3. Get provider + adapter
    const provider = await rpcManager.getProvider(chainDbId);
    const adapter = createKeyAdapter(signerKey, provider);

    // 4. Get gas pricing
    const feeData = await rpcManager.callWithFailover(
      chainDbId,
      (p) => p.getFeeData(),
      "getFeeData",
    );

    let maxGasCost: bigint;

    let gasLimit = FUND_TX_GAS_LIMIT; // default behavior for non-Filecoin
    let estimatedGas: bigint | null = null;
    if (filecoinChain) {
      const estimateValue = amountWei === "0" ? 0n : BigInt(amountWei);
      estimatedGas = await rpcManager.callWithFailover(
        chainDbId,
        (p) => p.estimateGas({
          from: signerKey.address,
          to: toAddress,
          value: estimateValue,
          data: "0x",
        }),
        "estimateGas",
      );
      gasLimit = maxBigInt((estimatedGas * 120n) / 100n, FILECOIN_MIN_GAS_LIMIT);
    }

    if (feeData.maxFeePerGas != null) {
      const maxFee = (feeData.maxFeePerGas * 130n) / 100n; // 30% buffer for estimation
      maxGasCost = gasLimit * maxFee;
    } else if (feeData.gasPrice != null) {
      const gasPrice = (feeData.gasPrice * 130n) / 100n;
      maxGasCost = gasLimit * gasPrice;
    } else {
      throw new Error("Could not determine gas pricing from network");
    }

    // 5. Determine amount
    let transferAmount: bigint;
    if (amountWei === "0") {
      // Drain: send entire balance minus gas
      const balance = await rpcManager.callWithFailover(
        chainDbId,
        (p) => p.getBalance(signerKey.address),
        "getBalance",
      );
      if (balance <= maxGasCost) {
        throw new Error(`Insufficient balance to cover gas. Balance: ${balance.toString()}, estimated gas: ${maxGasCost.toString()}`);
      }
      transferAmount = balance - maxGasCost;
    } else {
      transferAmount = BigInt(amountWei);
    }

    // 6. Acquire nonce (or use caller-supplied forced nonce)
    const usesForcedNonce = Number.isInteger(forceNonce) && (forceNonce as number) >= 0;
    const nonce = usesForcedNonce
      ? (forceNonce as number)
      : await nonceManager.acquire(chainDbId, signerKey.address);

    try {
      // 7. Build tx
      const tx: Record<string, unknown> = {
        to: toAddress,
        value: transferAmount,
        nonce,
        chainId: chain.chainId,
        gasLimit,
      };

      if (feeData.maxFeePerGas != null) {
        tx.maxFeePerGas = (feeData.maxFeePerGas * 120n) / 100n;
        tx.maxPriorityFeePerGas = feeData.maxPriorityFeePerGas ?? 1_500_000_000n;
        tx.type = 2;
      } else if (feeData.gasPrice != null) {
        tx.gasPrice = (feeData.gasPrice * 120n) / 100n;
      }

      if (filecoinChain) {
        const maxFeePerGas = (tx.maxFeePerGas as bigint | undefined) ?? (tx.gasPrice as bigint | undefined) ?? 0n;
        const estimatedGasCost = gasLimit * maxFeePerGas;
        log.info(
          {
            signerAddress: signerKey.address,
            toAddress,
            balance: (await rpcManager.callWithFailover(chainDbId, (p) => p.getBalance(signerKey.address), "getBalance")).toString(),
            amountWei: transferAmount.toString(),
            estimatedGas: estimatedGas?.toString() ?? null,
            gasLimit: gasLimit.toString(),
            maxFeePerGas: maxFeePerGas.toString(),
            estimatedGasCost: estimatedGasCost.toString(),
          },
          "Filecoin emergency transfer gas check",
        );
      }

      // 8. Sign + broadcast
      const signedTxHex = await adapter.signTransaction(tx);
      const result = await rpcManager.callWithFailover(
        chainDbId,
        (p) => p.broadcastTransaction(signedTxHex),
        "broadcastTransaction",
      );

      log.info(
        {
          hash: result.hash,
          from: signerKey.address,
          to: toAddress,
          amount: ethers.formatEther(transferAmount),
          nonce,
          forcedNonce: usesForcedNonce,
        },
        "Emergency transfer broadcast",
      );

      // Keep Redis nonce cache in sync when caller manually forces nonce.
      if (usesForcedNonce) {
        await nonceManager.forceSet(chainDbId, signerKey.address, nonce + 1);
      }

      return { txHash: result.hash };
    } catch (err) {
      if (!usesForcedNonce) {
        await nonceManager.release(chainDbId, signerKey.address);
      }
      throw err;
    }
  },

  async scanAndFund(): Promise<void> {
    const log = logger.child({ task: "funding-scanner" });

    const enabled = await settingsService.get<boolean>("funding.enabled");
    if (!enabled) {
      log.debug("Auto-funding is disabled");
      return;
    }

    const [globalEvmMinBalanceStr, globalSolMinBalanceStr, globalSuiMinBalanceStr] = await Promise.all([
      settingsService.getString("funding.minBalanceWei"),
      settingsService.getString("funding.solana.minBalanceLamports"),
      settingsService.getString("funding.sui.minBalanceMist"),
    ]);
    const globalEvmMinBalance = BigInt(globalEvmMinBalanceStr);
    const globalSolMinBalance = BigInt(globalSolMinBalanceStr);
    const globalSuiMinBalance = BigInt(globalSuiMinBalanceStr);

    const masterKeys = await prisma.signerKey.findMany({
      where: { isMaster: true, isActive: true },
      select: { projectId: true },
    });

    if (masterKeys.length === 0) return;

    const projectIds = [...new Set(masterKeys.map((k) => k.projectId))];

    let checked = 0;
    let low = 0;
    let funded = 0;
    let skippedMaster = 0;
    let errors = 0;

    for (const projectId of projectIds) {
      const signers = await prisma.signerKey.findMany({
        where: { projectId, isMaster: false, isActive: true },
        select: { id: true, address: true, chainType: true },
      });

      const chains = await prisma.chain.findMany({
        where: { projectId, isActive: true },
        select: { id: true, name: true, chainId: true, chainType: true },
      });

      for (const chain of chains) {
        const matchingSigners = signers.filter((signer) => signer.chainType === chain.chainType);
        if (matchingSigners.length === 0) continue;

        if (await isRpcBroken(chain.id)) {
          continue;
        }

        let chainBlocked: "rpc" | null = null;

        for (const signer of matchingSigners) {
          if (chainBlocked === "rpc") continue;

          try {
            checked++;
            const balance = chain.chainType === "SOLANA"
              ? BigInt(await (await solanaRpcManager.getConnection(chain.id)).getBalance(new PublicKey(signer.address)))
              : chain.chainType === "SUI"
                ? await suiRpcManager.getBalance(chain.id, signer.address)
                : await rpcManager.callWithFailover(
                    chain.id,
                    (p) => p.getBalance(signer.address),
                    "getBalance",
                  );

            const minBalanceOverride = await prisma.setting.findUnique({
              where: { key: fundingConfigService.minBalanceOverrideKey(projectId, chain.id) },
              select: { value: true },
            });
            const minBalance = minBalanceOverride?.value
              ? BigInt(minBalanceOverride.value)
              : (chain.chainType === "SOLANA"
                ? globalSolMinBalance
                : chain.chainType === "SUI"
                  ? globalSuiMinBalance
                  : globalEvmMinBalance);

            if (balance < minBalance) {
              low++;
              const quiet = await isMasterInsufficient(projectId, chain.id);
              const payload = {
                projectId,
                signer: signer.address,
                chain: chain.name,
                balance: balance.toString(),
                threshold: minBalance.toString(),
              };
              if (quiet) {
                log.debug(payload, "Low balance detected — initiating funding");
              } else {
                log.info(payload, "Low balance detected — initiating funding");
              }

              const txHash = await fundingService.fund(projectId, chain.id, signer.address);
              if (txHash) {
                funded++;
              } else if (await isMasterInsufficient(projectId, chain.id)) {
                skippedMaster++;
              }
            }
          } catch (err) {
            errors++;
            if (isSuiJsonRpcDeprecated(err)) {
              const first = await markRpcBroken(chain.id);
              const payload = {
                projectId,
                chain: chain.name,
                chainDbId: chain.id,
                err: truncateRpcError(err),
              };
              if (first) {
                log.warn(payload, "SUI JSON-RPC unavailable — skipping chain for cooldown window");
              } else {
                log.debug(payload, "SUI JSON-RPC unavailable — skipping chain for cooldown window");
              }
              chainBlocked = "rpc";
            } else {
              await warnOnce(
                `funding:balance-fail:${projectId}:${chain.id}`,
                {
                  projectId,
                  signer: signer.address,
                  chain: chain.name,
                  err: truncateRpcError(err),
                },
                "Balance check failed during funding scan",
              );
            }
          }
        }
      }
    }

    log.info(
      `funding-scanner: checked=${checked} low=${low} funded=${funded} skippedMaster=${skippedMaster} errors=${errors}`,
    );
  },
};

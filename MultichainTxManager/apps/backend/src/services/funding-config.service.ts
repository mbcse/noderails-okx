import { ethers } from "ethers";
import { prisma } from "../config/database.js";
import { BadRequestError, NotFoundError } from "../lib/errors.js";
import { settingsService } from "./settings.service.js";

type ChainType = "EVM" | "SOLANA" | "SUI";

function minBalanceOverrideKey(projectId: string, chainDbId: string): string {
  return `funding.override.${projectId}.${chainDbId}.minBalanceWei`;
}

function fundAmountOverrideKey(projectId: string, chainDbId: string): string {
  return `funding.override.${projectId}.${chainDbId}.fundAmountWei`;
}

function parseEthToWeiString(valueEth: string): string {
  return ethers.parseEther(valueEth.trim()).toString();
}

function parseSolToLamportsString(valueSol: string): string {
  const raw = valueSol.trim();
  if (raw === "") return "0";
  if (!/^\d+(\.\d+)?$/.test(raw)) {
    throw new BadRequestError("Invalid SOL amount");
  }

  const [whole = "0", frac = ""] = raw.split(".");
  if (frac.length > 9) {
    throw new BadRequestError("SOL supports up to 9 decimal places");
  }
  const padded = frac.padEnd(9, "0");
  const lamports = BigInt(whole) * 10n ** 9n + BigInt(padded || "0");
  return lamports.toString();
}

function formatWeiToEthString(valueWei: string): string {
  try {
    return ethers.formatEther(BigInt(valueWei));
  } catch {
    return "0";
  }
}

function formatLamportsToSolString(valueLamports: string): string {
  try {
    const lamports = BigInt(valueLamports);
    const whole = lamports / 10n ** 9n;
    const frac = lamports % 10n ** 9n;
    if (frac === 0n) return whole.toString();
    const fracStr = frac.toString().padStart(9, "0").replace(/0+$/, "");
    return `${whole.toString()}.${fracStr}`;
  } catch {
    return "0";
  }
}

function parseSuiToMistString(valueSui: string): string {
  const raw = valueSui.trim();
  if (raw === "") return "0";
  if (!/^\d+(\.\d+)?$/.test(raw)) {
    throw new BadRequestError("Invalid SUI amount");
  }

  const [whole = "0", frac = ""] = raw.split(".");
  if (frac.length > 9) {
    throw new BadRequestError("SUI supports up to 9 decimal places");
  }
  const padded = frac.padEnd(9, "0");
  const mist = BigInt(whole) * 10n ** 9n + BigInt(padded || "0");
  return mist.toString();
}

function formatMistToSuiString(valueMist: string): string {
  try {
    const mist = BigInt(valueMist);
    const whole = mist / 10n ** 9n;
    const frac = mist % 10n ** 9n;
    if (frac === 0n) return whole.toString();
    const fracStr = frac.toString().padStart(9, "0").replace(/0+$/, "");
    return `${whole.toString()}.${fracStr}`;
  } catch {
    return "0";
  }
}

export const fundingConfigService = {
  minBalanceOverrideKey,
  fundAmountOverrideKey,

  async listByProject(projectId: string) {
    const [chains, globalEvmMinBalanceWei, globalEvmFundAmountWei, globalSolMinBalanceLamports, globalSolFundAmountLamports, globalSuiMinBalanceMist, globalSuiFundAmountMist, overrideRows] = await Promise.all([
      prisma.chain.findMany({
        where: { projectId, isActive: true },
        orderBy: { createdAt: "asc" },
        select: {
          id: true,
          name: true,
          chainId: true,
          nativeCurrency: true,
          isTestnet: true,
          chainType: true,
        },
      }),
      settingsService.getString("funding.minBalanceWei"),
      settingsService.getString("funding.fundAmountWei"),
      settingsService.getString("funding.solana.minBalanceLamports"),
      settingsService.getString("funding.solana.fundAmountLamports"),
      settingsService.getString("funding.sui.minBalanceMist"),
      settingsService.getString("funding.sui.fundAmountMist"),
      prisma.setting.findMany({
        where: { key: { startsWith: `funding.override.${projectId}.` } },
        select: { key: true, value: true, updatedAt: true },
      }),
    ]);

    const overrideMap = new Map(overrideRows.map((r) => [r.key, r]));

    const chainOverrides = chains.map((chain) => {
      const minKey = minBalanceOverrideKey(projectId, chain.id);
      const amountKey = fundAmountOverrideKey(projectId, chain.id);

      const minRow = overrideMap.get(minKey);
      const amountRow = overrideMap.get(amountKey);

      const chainType = (chain.chainType ?? "EVM") as ChainType;
      const globalMinAtomic = chainType === "SOLANA"
        ? globalSolMinBalanceLamports
        : chainType === "SUI"
          ? globalSuiMinBalanceMist
          : globalEvmMinBalanceWei;
      const globalFundAtomic = chainType === "SOLANA"
        ? globalSolFundAmountLamports
        : chainType === "SUI"
          ? globalSuiFundAmountMist
          : globalEvmFundAmountWei;

      const minBalanceAtomic = minRow?.value ?? globalMinAtomic;
      const fundAmountAtomic = amountRow?.value ?? globalFundAtomic;

      const formatAtomic = (value: string) => {
        if (chainType === "SOLANA") return formatLamportsToSolString(value);
        if (chainType === "SUI") return formatMistToSuiString(value);
        return formatWeiToEthString(value);
      };

      return {
        chainDbId: chain.id,
        chainName: chain.name,
        chainId: chain.chainId,
        nativeCurrency: chain.nativeCurrency,
        isTestnet: chain.isTestnet,
        chainType,
        hasOverride: !!(minRow || amountRow),
        override: {
          minBalanceEth: minRow ? formatAtomic(minRow.value) : null,
          fundAmountEth: amountRow ? formatAtomic(amountRow.value) : null,
        },
        effective: {
          minBalanceEth: formatAtomic(minBalanceAtomic),
          fundAmountEth: formatAtomic(fundAmountAtomic),
        },
      };
    });

    return {
      global: {
        minBalanceEth: formatWeiToEthString(globalEvmMinBalanceWei),
        fundAmountEth: formatWeiToEthString(globalEvmFundAmountWei),
      },
      globalByChainType: {
        EVM: {
          nativeCurrency: "ETH",
          minBalance: formatWeiToEthString(globalEvmMinBalanceWei),
          fundAmount: formatWeiToEthString(globalEvmFundAmountWei),
        },
        SOLANA: {
          nativeCurrency: "SOL",
          minBalance: formatLamportsToSolString(globalSolMinBalanceLamports),
          fundAmount: formatLamportsToSolString(globalSolFundAmountLamports),
        },
        SUI: {
          nativeCurrency: "SUI",
          minBalance: formatMistToSuiString(globalSuiMinBalanceMist),
          fundAmount: formatMistToSuiString(globalSuiFundAmountMist),
        },
      },
      chains: chainOverrides,
    };
  },

  async updateChainOverride(
    projectId: string,
    chainDbId: string,
    data: { minBalanceEth?: string | null; fundAmountEth?: string | null },
  ) {
    const chain = await prisma.chain.findFirst({
      where: { id: chainDbId, projectId },
      select: { id: true, name: true, chainId: true, chainType: true },
    });
    if (!chain) throw new NotFoundError("Chain");

    const chainType = (chain.chainType ?? "EVM") as ChainType;
    const parseNativeToAtomic = (value: string) => {
      if (chainType === "SOLANA") return parseSolToLamportsString(value);
      if (chainType === "SUI") return parseSuiToMistString(value);
      return parseEthToWeiString(value);
    };

    const minKey = minBalanceOverrideKey(projectId, chainDbId);
    const amountKey = fundAmountOverrideKey(projectId, chainDbId);

    const ops: Promise<unknown>[] = [];

    if (data.minBalanceEth !== undefined) {
      const value = data.minBalanceEth?.trim();
      if (!value) {
        ops.push(prisma.setting.deleteMany({ where: { key: minKey } }));
      } else {
        const atomic = parseNativeToAtomic(value);
        ops.push(
          prisma.setting.upsert({
            where: { key: minKey },
            update: {
              value: atomic,
              label: `Funding Min Balance Override (${chain.name})`,
              description: `Project+chain override for funding min balance on ${chain.name}`,
              category: "funding",
              dataType: "string",
            },
            create: {
              key: minKey,
              value: atomic,
              label: `Funding Min Balance Override (${chain.name})`,
              description: `Project+chain override for funding min balance on ${chain.name}`,
              category: "funding",
              dataType: "string",
            },
          }),
        );
      }
    }

    if (data.fundAmountEth !== undefined) {
      const value = data.fundAmountEth?.trim();
      if (!value) {
        ops.push(prisma.setting.deleteMany({ where: { key: amountKey } }));
      } else {
        const atomic = parseNativeToAtomic(value);
        ops.push(
          prisma.setting.upsert({
            where: { key: amountKey },
            update: {
              value: atomic,
              label: `Funding Amount Override (${chain.name})`,
              description: `Project+chain override for funding amount on ${chain.name}`,
              category: "funding",
              dataType: "string",
            },
            create: {
              key: amountKey,
              value: atomic,
              label: `Funding Amount Override (${chain.name})`,
              description: `Project+chain override for funding amount on ${chain.name}`,
              category: "funding",
              dataType: "string",
            },
          }),
        );
      }
    }

    if (ops.length > 0) {
      await Promise.all(ops);
    }

    return this.listByProject(projectId);
  },
};

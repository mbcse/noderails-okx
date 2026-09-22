import { prisma } from "../config/database.js";
import { logger } from "../lib/logger.js";

// ────────────────────────────────────────────────────────────
// Settings service — DB-backed key/value config with in-memory cache
// ────────────────────────────────────────────────────────────

/**
 * Default values for all settings.
 * These are used as fallbacks when a setting doesn't exist in the DB yet.
 */
export const SETTING_DEFAULTS: Record<
  string,
  { value: string; label: string; description: string; category: string; dataType: string }
> = {
  // ── Queue / Workers ───────────────────────────────────────
  "queue.workerConcurrency": {
    value: "50",
    label: "Worker Concurrency",
    description: "Number of concurrent jobs each queue worker processes",
    category: "queue",
    dataType: "number",
  },
  "queue.jobMaxAttempts": {
    value: "5",
    label: "Job Max Attempts",
    description: "Maximum retry attempts for failed queue jobs",
    category: "queue",
    dataType: "number",
  },
  "queue.jobBackoffDelayMs": {
    value: "1000",
    label: "Job Backoff Delay (ms)",
    description: "Initial backoff delay for exponential retry (milliseconds)",
    category: "queue",
    dataType: "number",
  },

  // ── Confirmation Polling ──────────────────────────────────
  "confirmation.maxPolls": {
    value: "30",
    label: "Max Confirmation Polls",
    description: "Maximum number of receipt polls before marking STUCK (~2.5 min at 5s intervals)",
    category: "confirmation",
    dataType: "number",
  },
  "confirmation.pollIntervalMs": {
    value: "5000",
    label: "Poll Interval (ms)",
    description: "Delay between confirmation receipt polls (milliseconds)",
    category: "confirmation",
    dataType: "number",
  },
  "confirmation.nonceCheckAfterPoll": {
    value: "3",
    label: "Nonce Check After Poll",
    description: "Start checking on-chain nonce for early STUCK detection after this many polls",
    category: "confirmation",
    dataType: "number",
  },

  // ── Stuck Resolver ────────────────────────────────────────
  "stuckResolver.scanIntervalMs": {
    value: "60000",
    label: "Scan Interval (ms)",
    description: "How often to scan for stuck transactions (milliseconds)",
    category: "stuck-resolver",
    dataType: "number",
  },
  "stuckResolver.gasBumpPercent": {
    value: "20",
    label: "Gas Bump %",
    description: "Percentage to bump gas prices when speeding up stuck transactions",
    category: "stuck-resolver",
    dataType: "number",
  },
  "stuckResolver.maxResolutionAttempts": {
    value: "5",
    label: "Max Resolution Attempts",
    description: "Maximum stuck-resolver attempts before force-failing a transaction",
    category: "stuck-resolver",
    dataType: "number",
  },
  "stuckResolver.cancelAfterAttempts": {
    value: "3",
    label: "Cancel After Attempts",
    description: "Switch from speed-up to cancel after this many attempts",
    category: "stuck-resolver",
    dataType: "number",
  },

  // ── RPC ───────────────────────────────────────────────────
  "rpc.callTimeoutMs": {
    value: "15000",
    label: "RPC Call Timeout (ms)",
    description: "Timeout for individual RPC calls before rotating to next endpoint",
    category: "rpc",
    dataType: "number",
  },
  "rpc.unhealthyTtlSecs": {
    value: "60",
    label: "Unhealthy TTL (seconds)",
    description: "How long to mark an RPC endpoint as unhealthy after a failure",
    category: "rpc",
    dataType: "number",
  },

  // ── Funding ───────────────────────────────────────────────
  "funding.enabled": {
    value: "true",
    label: "Auto-Funding Enabled",
    description: "Enable automatic funding of low-balance signer wallets from master wallet",
    category: "funding",
    dataType: "boolean",
  },
  "funding.checkIntervalMs": {
    value: "120000",
    label: "Balance Check Interval (ms)",
    description: "How often to scan signer balances for low-balance funding (milliseconds)",
    category: "funding",
    dataType: "number",
  },
  "funding.minBalanceWei": {
    value: "10000000000000000",
    label: "Min Balance (ETH)",
    description: "Global low-balance threshold. Signers below this are eligible for auto-funding (default 0.01 ETH).",
    category: "funding",
    dataType: "string",
  },
  "funding.fundAmountWei": {
    value: "50000000000000000",
    label: "Fund Amount (ETH)",
    description: "Global amount sent by master wallet when funding a low-balance signer (default 0.05 ETH).",
    category: "funding",
    dataType: "string",
  },
  "funding.solana.minBalanceLamports": {
    value: "10000000",
    label: "Min Balance (SOL)",
    description: "Global low-balance threshold for SOLANA chains, in lamports (default 0.01 SOL).",
    category: "funding",
    dataType: "string",
  },
  "funding.solana.fundAmountLamports": {
    value: "50000000",
    label: "Fund Amount (SOL)",
    description: "Global funding amount for SOLANA chains, in lamports (default 0.05 SOL).",
    category: "funding",
    dataType: "string",
  },
  "funding.sui.minBalanceMist": {
    value: "10000000",
    label: "Min Balance (SUI)",
    description: "Global low-balance threshold for SUI chains, in MIST (default 0.01 SUI).",
    category: "funding",
    dataType: "string",
  },
  "funding.sui.fundAmountMist": {
    value: "50000000",
    label: "Fund Amount (SUI)",
    description: "Global funding amount for SUI chains, in MIST (default 0.05 SUI).",
    category: "funding",
    dataType: "string",
  },
};

// ── In-memory cache ─────────────────────────────────────────

const cache = new Map<string, string>();
let cacheLoaded = false;

async function ensureCache(): Promise<void> {
  if (cacheLoaded) return;
  try {
    const rows = await prisma.setting.findMany();
    for (const row of rows) {
      cache.set(row.key, row.value);
    }
    cacheLoaded = true;
  } catch {
    // DB not ready yet — use defaults
  }
}

/** Invalidate cache so next read reloads from DB. */
function invalidateCache(): void {
  cache.clear();
  cacheLoaded = false;
}

// ── Public API ──────────────────────────────────────────────

export const settingsService = {
  /**
   * Get a single setting value, parsed to its native type.
   * Falls back to SETTING_DEFAULTS if not in DB.
   */
  async get<T extends string | number | boolean = string>(key: string): Promise<T> {
    await ensureCache();

    const raw = cache.get(key) ?? SETTING_DEFAULTS[key]?.value;
    if (raw === undefined) {
      throw new Error(`Unknown setting key: ${key}`);
    }

    const dataType = SETTING_DEFAULTS[key]?.dataType ?? "string";
    switch (dataType) {
      case "number":
        return Number(raw) as T;
      case "boolean":
        return (raw === "true") as T;
      default:
        return raw as T;
    }
  },

  /**
   * Get a single setting as a raw string. Synchronous if cache is warm.
   */
  async getString(key: string): Promise<string> {
    await ensureCache();
    return cache.get(key) ?? SETTING_DEFAULTS[key]?.value ?? "";
  },

  /** List all settings (DB values merged with defaults). */
  async list() {
    await ensureCache();

    const result: Array<{
      key: string;
      value: string;
      label: string;
      description: string | null;
      category: string;
      dataType: string;
      updatedAt: string | null;
    }> = [];

    // Get DB rows for updatedAt
    const dbRows = await prisma.setting.findMany();
    const dbMap = new Map(dbRows.map((r) => [r.key, r]));

    for (const [key, def] of Object.entries(SETTING_DEFAULTS)) {
      const dbRow = dbMap.get(key);
      result.push({
        key,
        value: cache.get(key) ?? def.value,
        label: def.label,
        description: def.description,
        category: def.category,
        dataType: def.dataType,
        updatedAt: dbRow?.updatedAt?.toISOString() ?? null,
      });
    }

    return result;
  },

  /** Update a setting value. */
  async update(key: string, value: string) {
    const def = SETTING_DEFAULTS[key];
    if (!def) throw new Error(`Unknown setting key: ${key}`);

    // Validate value by type
    if (def.dataType === "number" && isNaN(Number(value))) {
      throw new Error(`Setting "${key}" requires a number value`);
    }
    if (def.dataType === "boolean" && value !== "true" && value !== "false") {
      throw new Error(`Setting "${key}" requires "true" or "false"`);
    }

    const row = await prisma.setting.upsert({
      where: { key },
      update: { value },
      create: {
        key,
        value,
        label: def.label,
        description: def.description,
        category: def.category,
        dataType: def.dataType,
      },
    });

    // Update cache
    cache.set(key, value);

    logger.info({ key, value }, "Setting updated");
    return row;
  },

  /** Seed all default settings into the DB (upsert — won't overwrite existing). */
  async seedDefaults() {
    for (const [key, def] of Object.entries(SETTING_DEFAULTS)) {
      await prisma.setting.upsert({
        where: { key },
        update: {
          label: def.label,
          description: def.description,
          category: def.category,
          dataType: def.dataType,
        },
        create: {
          key,
          value: def.value,
          label: def.label,
          description: def.description,
          category: def.category,
          dataType: def.dataType,
        },
      });
    }
    invalidateCache();
  },

  invalidateCache,
};

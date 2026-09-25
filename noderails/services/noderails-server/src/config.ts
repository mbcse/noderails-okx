// OKX X Layer submission snapshot. Defaults use placeholder hosts.
/**
 * Unified server configuration.
 * All env vars in one place — easy to find, easy to change.
 */

function envTimeoutMs(raw: string | undefined, fallback: number): number {
  if (raw == null || raw.trim() === '') return fallback;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed < 10_000) return fallback;
  return Math.min(Math.trunc(parsed), 120_000);
}

export const env = {
  // ── Server ──
  NODE_ENV: (process.env.NODE_ENV ?? 'development') as 'development' | 'test' | 'production',
  PORT: Number(process.env.PORT ?? 3000),
  CORS_ORIGIN: process.env.CORS_ORIGIN ?? 'http://localhost:3001,http://localhost:3002,http://localhost:3003,http://localhost:3004',
  LOG_LEVEL: (process.env.LOG_LEVEL ?? 'info') as 'debug' | 'info' | 'warn' | 'error',

  // ── Database ──
  DATABASE_URL: process.env.DATABASE_URL ?? '',

  // ── Auth ──
  JWT_SECRET: process.env.JWT_SECRET ?? 'SUBMISSION_INVALID_JWT',
  JWT_REFRESH_SECRET: process.env.JWT_REFRESH_SECRET ?? 'SUBMISSION_INVALID_REFRESH',

  // ── Platform Admin (env-based credentials) ──
  ADMIN_EMAIL: process.env.ADMIN_EMAIL ?? '',
  ADMIN_PASSWORD: process.env.ADMIN_PASSWORD ?? '',

  // ── MTXM ──
  MTXM_BASE_URL: process.env.MTXM_BASE_URL ?? "https://mtxm.example.local",
  MTXM_PROJECT_ID: process.env.MTXM_PROJECT_ID ?? '',
  MTXM_API_KEY: process.env.MTXM_API_KEY ?? '',
  MTXM_WEBHOOK_SECRET: process.env.MTXM_WEBHOOK_SECRET ?? '',
  /** Solana public key of the MTXM-managed signer used for settle / refund / dispute (single-signer txs). */
  MTXM_SOLANA_SIGNER_PUBKEY: process.env.MTXM_SOLANA_SIGNER_PUBKEY ?? '',
  /**
   * MTXM signer **database id** (dashboard / Signers API). Required for SPL `capture_spl` submits that use
   * `solana.transactionBase64` because the Ed25519 program ix has no accounts and MTXM rejects `instructions[]`
   * when `keys` is empty.
   */
  MTXM_SOLANA_SIGNER_ID: process.env.MTXM_SOLANA_SIGNER_ID?.trim() ?? '',
  /**
   * Per-tx compute unit limit passed to MTXM for Solana *program* submissions.
   * Solana clamps the whole transaction to **1.4M CUs** (devnet / mainnet / local validator).
   * Values in env above that are pointless; if a program needs more, reduce on-chain CU usage or split the flow.
   */
  MTXM_SOLANA_CU_LIMIT: (() => {
    const raw = process.env.MTXM_SOLANA_CU_LIMIT?.replace(/_/g, '').trim();
    const protocolMax = 1_400_000;
    const defaultCu = protocolMax;
    if (raw === undefined || raw === '') return defaultCu;
    const n = Number(raw);
    if (!Number.isFinite(n) || n < 1) return defaultCu;
    return Math.min(Math.floor(n), protocolMax);
  })(),
  /** Optional priority fee for MTXM-submitted Solana program txs (micro-lamports per CU). */
  MTXM_SOLANA_CU_PRICE_MICRO_LAMPORTS: (() => {
    const raw = process.env.MTXM_SOLANA_CU_PRICE_MICRO_LAMPORTS;
    if (raw === undefined || raw === '') return undefined as number | undefined;
    const n = Number(raw);
    if (!Number.isFinite(n) || n <= 0) return undefined;
    return Math.floor(n);
  })(),
  /** Optional override: Sui address of the MTXM-managed signer (otherwise from allocate API). */
  MTXM_SUI_SIGNER_PUBKEY: process.env.MTXM_SUI_SIGNER_PUBKEY ?? '',
  /** Optional override: MTXM signer database id for Sui PTB submissions. */
  MTXM_SUI_SIGNER_ID: process.env.MTXM_SUI_SIGNER_ID?.trim() ?? '',
  /** Optional override: base64-encoded 32-byte Ed25519 public key for on-chain auth verify. */
  MTXM_SUI_ED25519_PUBKEY_BASE64: process.env.MTXM_SUI_ED25519_PUBKEY_BASE64?.trim() ?? '',

  /** Optional dedicated Sui testnet JSON-RPC (avoids public fullnode 429 during PTB build). */
  SUI_TESTNET_RPC_URL: process.env.SUI_TESTNET_RPC_URL?.trim() ?? '',

  // ── Indexer ──
  INDEXER_WEBHOOK_SECRET: process.env.INDEXER_WEBHOOK_SECRET ?? '',

  // ── Redis ──
  REDIS_URL: process.env.REDIS_URL ?? 'redis://localhost:6379',

  // ── Payment UI ──
  DASHBOARD_URL:
    process.env.DASHBOARD_URL
    ?? process.env.NEXT_PUBLIC_DASHBOARD_URL
    ?? (process.env.NODE_ENV === 'production' ? '' : 'http://localhost:3001'),
  PAYMENT_UI_URL: process.env.PAYMENT_UI_URL || 'http://localhost:3002',

  // ── BPC (Balance & Price Check service) ──
  BPC_SERVICE_URL: process.env.BPC_SERVICE_URL ?? 'https://bpc.example.local',
  BPC_SERVICE_TIMEOUT_MS: Number(process.env.BPC_SERVICE_TIMEOUT_MS ?? 10_000),

  // ── 1inch Classic Swap ──
  ONEINCH_API_KEY: process.env.ONEINCH_API_KEY ?? '',
  ONEINCH_BASE_URL: process.env.ONEINCH_BASE_URL ?? 'https://prices.example.local',
  ONEINCH_TIMEOUT_MS: Number(process.env.ONEINCH_TIMEOUT_MS ?? 15_000),
  MTXM_EVM_TRANSACTION_KEY_ADDRESS: process.env.MTXM_EVM_TRANSACTION_KEY_ADDRESS ?? '',

  // ── LI.FI ──
  LIFI_API_KEY: process.env.LIFI_API_KEY ?? '',
  LIFI_BASE_URL: process.env.LIFI_BASE_URL ?? 'https://bridge.example.local/v1',
  LIFI_TIMEOUT_MS: Number(process.env.LIFI_TIMEOUT_MS ?? 20_000),

  // ── BloxFi ──
  BLOXFI_API_KEY: process.env.BLOXFI_API_KEY ?? '',
  BLOXFI_BASE_URL: process.env.BLOXFI_BASE_URL ?? 'https://bank.example.local',
  BLOXFI_WEBHOOK_SECRET: process.env.BLOXFI_WEBHOOK_SECRET ?? '',
  BLOXFI_TIMEOUT_MS: Number(process.env.BLOXFI_TIMEOUT_MS ?? 20_000),

  API_PUBLIC_URL: (process.env.API_PUBLIC_URL ?? process.env.NEXT_PUBLIC_API_URL ?? 'http://127.0.0.1:8080').replace(/\/$/, ''),

  DIDIT_API_KEY: process.env.DIDIT_API_KEY ?? '',
  DIDIT_WORKFLOW_KYC: process.env.DIDIT_WORKFLOW_KYC ?? '',
  DIDIT_WORKFLOW_KYB: process.env.DIDIT_WORKFLOW_KYB ?? '',
  DIDIT_WEBHOOK_SECRET: process.env.DIDIT_WEBHOOK_SECRET ?? '',
  DIDIT_SANDBOX_API_KEY: process.env.DIDIT_SANDBOX_API_KEY ?? '',
  DIDIT_SANDBOX_WORKFLOW_KYC: process.env.DIDIT_SANDBOX_WORKFLOW_KYC ?? '',
  DIDIT_SANDBOX_WORKFLOW_KYB: process.env.DIDIT_SANDBOX_WORKFLOW_KYB ?? '',
  DIDIT_SANDBOX_WEBHOOK_SECRET: process.env.DIDIT_SANDBOX_WEBHOOK_SECRET ?? '',
  DIDIT_API_URL: process.env.DIDIT_API_URL ?? 'https://verification.didit.me',

  BRIDGE_API_KEY: process.env.BRIDGE_API_KEY ?? '',
  BRIDGE_API_URL: process.env.BRIDGE_API_URL ?? 'https://api.bridge.xyz',
  BRIDGE_WEBHOOK_PUBLIC_KEY: process.env.BRIDGE_WEBHOOK_PUBLIC_KEY ?? '',
  BRIDGE_SANDBOX_API_KEY: process.env.BRIDGE_SANDBOX_API_KEY ?? '',
  BRIDGE_SANDBOX_API_URL: process.env.BRIDGE_SANDBOX_API_URL ?? 'https://api.sandbox.bridge.xyz',
  BRIDGE_SANDBOX_WEBHOOK_PUBLIC_KEY: process.env.BRIDGE_SANDBOX_WEBHOOK_PUBLIC_KEY ?? '',
  BRIDGE_TIMEOUT_MS: envTimeoutMs(process.env.BRIDGE_TIMEOUT_MS, 30_000),

  // ── AWS (shared credentials used by SES and S3) ──
  AWS_REGION: process.env.AWS_REGION ?? 'us-east-1',
  AWS_ACCESS_KEY_ID: process.env.AWS_ACCESS_KEY_ID ?? '',
  AWS_SECRET_ACCESS_KEY: process.env.AWS_SECRET_ACCESS_KEY ?? '',

  // ── AWS SES (Email) ──
  SES_FROM_EMAIL: process.env.SES_FROM_EMAIL ?? 'no-reply@example.com',
  SES_TRANSACTIONAL_FROM_EMAIL: process.env.SES_TRANSACTIONAL_FROM_EMAIL ?? 'transactions@example.com',
  EMAIL_CAMPAIGN_FROM_DEFAULT: process.env.EMAIL_CAMPAIGN_FROM_DEFAULT ?? 'updates@example.com',
  EMAIL_CAMPAIGN_MAX_PER_SECOND: Number(process.env.EMAIL_CAMPAIGN_MAX_PER_SECOND ?? 1),
  EMAIL_CAMPAIGN_MAX_PER_HOUR: Number(process.env.EMAIL_CAMPAIGN_MAX_PER_HOUR ?? 200),
  EMAIL_CAMPAIGN_DAILY_CAP: Number(process.env.EMAIL_CAMPAIGN_DAILY_CAP ?? 2000),
  EMAIL_TRACKING_SECRET: process.env.EMAIL_TRACKING_SECRET ?? process.env.JWT_SECRET ?? 'SUBMISSION_INVALID_TRACKING',
  SES_SQS_QUEUE_URL: process.env.SES_SQS_QUEUE_URL ?? '',

  // ── AWS S3 (File uploads) ──
  S3_UPLOADS_BUCKET: process.env.S3_UPLOADS_BUCKET ?? 'noderails-uploads',
  S3_BANK_STATEMENTS_BUCKET: process.env.S3_BANK_STATEMENTS_BUCKET ?? 'noderails-bank-statements',
  S3_EMAIL_IMAGES_BUCKET: process.env.S3_EMAIL_IMAGES_BUCKET ?? 'noderails-email-img',
  S3_EMAIL_IMAGES_PUBLIC_BASE: (process.env.S3_EMAIL_IMAGES_PUBLIC_BASE ?? '').replace(/\/$/, ''),

  // ── Dev / Test ──
  ENABLE_TEST_INTERVALS: process.env.ENABLE_TEST_INTERVALS === 'true',
  ENABLE_TEST_TIMELOCKS: process.env.ENABLE_TEST_TIMELOCKS === 'true',
} as const;

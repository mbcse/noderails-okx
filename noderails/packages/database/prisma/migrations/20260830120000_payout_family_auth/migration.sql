-- Per-family payout wallets + standing auth; EVM bulk payout lines.
-- Existing bank auth signatures will not verify after Escrow redeploy — clear them.

ALTER TABLE "apps"
  ADD COLUMN IF NOT EXISTS "payoutWalletSolana" TEXT,
  ADD COLUMN IF NOT EXISTS "payoutWalletSui" TEXT,
  ADD COLUMN IF NOT EXISTS "payoutAuthSignature" TEXT,
  ADD COLUMN IF NOT EXISTS "payoutAuthValidUntil" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "payoutAuthSolanaSignature" TEXT,
  ADD COLUMN IF NOT EXISTS "payoutAuthSolanaValidUntil" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "payoutAuthSuiSignature" TEXT,
  ADD COLUMN IF NOT EXISTS "payoutAuthSuiValidUntil" TIMESTAMP(3);

ALTER TABLE "payout_intents"
  ADD COLUMN IF NOT EXISTS "lines" JSONB;

UPDATE "settlement_configs"
SET
  "bankSettlementAuthSignature" = NULL,
  "bankSettlementAuthValidUntil" = NULL
WHERE "bankSettlementAuthSignature" IS NOT NULL;

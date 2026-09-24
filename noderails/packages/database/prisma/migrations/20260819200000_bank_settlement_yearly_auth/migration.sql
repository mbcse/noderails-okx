-- Yearly merchant bank-settlement authorization on SettlementConfig
ALTER TABLE "settlement_configs"
  ADD COLUMN IF NOT EXISTS "bankSettlementAuthSignature" TEXT,
  ADD COLUMN IF NOT EXISTS "bankSettlementAuthValidUntil" TIMESTAMP(3);

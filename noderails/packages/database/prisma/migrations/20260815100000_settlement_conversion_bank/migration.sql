-- Stablecoin conversion, single-chain settlement, and bank settlement

ALTER TABLE "platform_config"
  ADD COLUMN IF NOT EXISTS "defaultSettlementChainId" INTEGER,
  ADD COLUMN IF NOT EXISTS "defaultTargetStablecoinTokenKey" VARCHAR(50);

ALTER TABLE "settlement_configs"
  ADD COLUMN IF NOT EXISTS "stablecoinConversionEnabled" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "targetStablecoinTokenKey" VARCHAR(50),
  ADD COLUMN IF NOT EXISTS "singleChainSettlementEnabled" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "settlementChainId" INTEGER,
  ADD COLUMN IF NOT EXISTS "settlementTokenKey" VARCHAR(50),
  ADD COLUMN IF NOT EXISTS "settlementWalletAddress" VARCHAR(42),
  ADD COLUMN IF NOT EXISTS "bankSettlementEnabled" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "bankPayoutCurrency" VARCHAR(10),
  ADD COLUMN IF NOT EXISTS "bloxfiBeneficiaryId" TEXT,
  ADD COLUMN IF NOT EXISTS "bloxfiCountry" VARCHAR(8),
  ADD COLUMN IF NOT EXISTS "bloxfiDestinationType" VARCHAR(50),
  ADD COLUMN IF NOT EXISTS "bloxfiBeneficiaryType" VARCHAR(50);

DO $$ BEGIN
  CREATE TYPE "BankSettlementStatus" AS ENUM ('QUOTED', 'DEPOSIT_PENDING', 'PROCESSING', 'COMPLETED', 'FAILED');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "bank_settlements" (
  "id" TEXT NOT NULL,
  "appId" TEXT NOT NULL,
  "bloxfiTransferId" TEXT,
  "clientReferenceId" TEXT NOT NULL,
  "depositAddress" VARCHAR(42),
  "tokenKey" VARCHAR(50) NOT NULL,
  "chainId" INTEGER NOT NULL,
  "amount" TEXT NOT NULL,
  "payoutCurrency" VARCHAR(10) NOT NULL,
  "status" "BankSettlementStatus" NOT NULL DEFAULT 'QUOTED',
  "bloxfiRateToken" TEXT,
  "webhookEventId" TEXT,
  "merchantSignature" TEXT,
  "sessionExpiry" TIMESTAMP(3),
  "onChainTxHash" VARCHAR(128),
  "failureReason" TEXT,
  "metadata" JSONB NOT NULL DEFAULT '{}',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "bank_settlements_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "bank_settlements_bloxfiTransferId_key" ON "bank_settlements"("bloxfiTransferId");
CREATE UNIQUE INDEX IF NOT EXISTS "bank_settlements_clientReferenceId_key" ON "bank_settlements"("clientReferenceId");
CREATE UNIQUE INDEX IF NOT EXISTS "bank_settlements_webhookEventId_key" ON "bank_settlements"("webhookEventId");
CREATE INDEX IF NOT EXISTS "bank_settlements_appId_idx" ON "bank_settlements"("appId");
CREATE INDEX IF NOT EXISTS "bank_settlements_status_idx" ON "bank_settlements"("status");

DO $$ BEGIN
  ALTER TABLE "bank_settlements"
    ADD CONSTRAINT "bank_settlements_appId_fkey"
    FOREIGN KEY ("appId") REFERENCES "apps"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE "payment_intents"
  ADD COLUMN IF NOT EXISTS "stablecoinConversionEnabled" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "targetStablecoinTokenKey" VARCHAR(50),
  ADD COLUMN IF NOT EXISTS "singleChainSettlementEnabled" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "bankSettlementEnabled" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "settlementChainId" INTEGER,
  ADD COLUMN IF NOT EXISTS "settlementTokenKey" VARCHAR(50),
  ADD COLUMN IF NOT EXISTS "settlementWalletAddress" VARCHAR(42),
  ADD COLUMN IF NOT EXISTS "captureMerchantAddress" VARCHAR(42),
  ADD COLUMN IF NOT EXISTS "convertedStablecoinAmount" TEXT,
  ADD COLUMN IF NOT EXISTS "convertedStablecoinTokenKey" VARCHAR(50),
  ADD COLUMN IF NOT EXISTS "swapQuoteMeta" JSONB,
  ADD COLUMN IF NOT EXISTS "settlementCreditTxHash" VARCHAR(128),
  ADD COLUMN IF NOT EXISTS "bridgeTransferId" TEXT,
  ADD COLUMN IF NOT EXISTS "settlementCreditedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "bankSettlementId" TEXT;

CREATE INDEX IF NOT EXISTS "payment_intents_bankSettlementId_idx" ON "payment_intents"("bankSettlementId");

DO $$ BEGIN
  ALTER TABLE "payment_intents"
    ADD CONSTRAINT "payment_intents_bankSettlementId_fkey"
    FOREIGN KEY ("bankSettlementId") REFERENCES "bank_settlements"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TYPE "TransactionType" ADD VALUE 'BRIDGE';
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TYPE "TransactionType" ADD VALUE 'BANK_SETTLEMENT';
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TYPE "TransactionType" ADD VALUE 'SETTLEMENT_WITHDRAW';
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

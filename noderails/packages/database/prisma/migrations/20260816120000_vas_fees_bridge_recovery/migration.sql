-- AlterTable
ALTER TABLE "merchants" ADD COLUMN "conversionFeeBps" INTEGER;
ALTER TABLE "merchants" ADD COLUMN "singleChainSettlementFeeBps" INTEGER;
ALTER TABLE "merchants" ADD COLUMN "bankSettlementFeeBps" INTEGER;

-- AlterTable
ALTER TABLE "platform_config" ADD COLUMN "conversionFeeBps" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "platform_config" ADD COLUMN "singleChainSettlementFeeBps" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "platform_config" ADD COLUMN "bankSettlementFeeBps" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "platform_config" ADD COLUMN "swapQuoteTtlSeconds" INTEGER NOT NULL DEFAULT 120;

-- AlterTable
ALTER TABLE "payment_intents" ADD COLUMN "conversionFeeBps" INTEGER;
ALTER TABLE "payment_intents" ADD COLUMN "singleChainSettlementFeeBps" INTEGER;
ALTER TABLE "payment_intents" ADD COLUMN "bankSettlementFeeBps" INTEGER;
ALTER TABLE "payment_intents" ADD COLUMN "vasFeeBps" INTEGER;
ALTER TABLE "payment_intents" ADD COLUMN "promisedSettlementAmount" TEXT;
ALTER TABLE "payment_intents" ADD COLUMN "swapQuoteId" TEXT;
ALTER TABLE "payment_intents" ADD COLUMN "bridgeStatus" VARCHAR(40);
ALTER TABLE "payment_intents" ADD COLUMN "bridgeLiFiStatus" VARCHAR(40);
ALTER TABLE "payment_intents" ADD COLUMN "bridgeLiFiSubstatus" VARCHAR(80);
ALTER TABLE "payment_intents" ADD COLUMN "settleBridgeRetryCount" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "payment_intents" ADD COLUMN "settlementCreditConsumed" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "payment_intents" ADD COLUMN "bridgeLastError" TEXT;
ALTER TABLE "payment_intents" ADD COLUMN "bridgeLastStatusPayload" JSONB;
ALTER TABLE "payment_intents" ADD COLUMN "bridgeRetryMtxmTxId" VARCHAR(128);

-- CreateTable
CREATE TABLE "swap_quotes" (
    "id" TEXT NOT NULL,
    "checkoutSessionId" TEXT,
    "asset" VARCHAR(50) NOT NULL,
    "dstAsset" VARCHAR(50) NOT NULL,
    "cryptoAmount" TEXT NOT NULL,
    "minAmountOut" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "consumedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "swap_quotes_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "swap_quotes_checkoutSessionId_idx" ON "swap_quotes"("checkoutSessionId");
CREATE INDEX "swap_quotes_expiresAt_idx" ON "swap_quotes"("expiresAt");

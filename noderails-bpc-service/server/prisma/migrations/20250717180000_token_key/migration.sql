-- AlterTable
ALTER TABLE "tokens" ADD COLUMN "tokenKey" VARCHAR(50);

-- CreateIndex
CREATE UNIQUE INDEX "tokens_tokenKey_key" ON "tokens"("tokenKey");

-- CreateIndex
CREATE INDEX "tokens_tokenKey_idx" ON "tokens"("tokenKey");

-- Backfill tokenKey as SYMBOL-CHAINID
UPDATE "tokens" SET "tokenKey" = UPPER("symbol") || '-' || "chainId"::text WHERE "tokenKey" IS NULL;

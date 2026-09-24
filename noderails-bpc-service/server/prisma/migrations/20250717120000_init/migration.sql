-- CreateEnum
CREATE TYPE "ChainType" AS ENUM ('EVM', 'SOLANA', 'SUI');

-- CreateEnum
CREATE TYPE "PriceSourceType" AS ENUM ('CEX', 'DEX', 'FX');

-- CreateEnum
CREATE TYPE "HealthStatus" AS ENUM ('HEALTHY', 'UNHEALTHY', 'UNKNOWN');

-- CreateTable
CREATE TABLE "chains" (
    "id" TEXT NOT NULL,
    "chainId" INTEGER NOT NULL,
    "chainType" "ChainType" NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "displayName" VARCHAR(100) NOT NULL,
    "nativeCurrencySymbol" VARCHAR(10) NOT NULL,
    "nativeCurrencyDecimals" INTEGER NOT NULL DEFAULT 18,
    "explorerUrl" TEXT,
    "coingeckoPlatformId" VARCHAR(50),
    "isTestnet" BOOLEAN NOT NULL DEFAULT false,
    "isEnabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "chains_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rpc_endpoints" (
    "id" TEXT NOT NULL,
    "chainId" INTEGER NOT NULL,
    "url" TEXT NOT NULL,
    "priority" INTEGER NOT NULL DEFAULT 100,
    "weight" INTEGER NOT NULL DEFAULT 1,
    "isEnabled" BOOLEAN NOT NULL DEFAULT true,
    "lastHealthAt" TIMESTAMP(3),
    "lastHealthStatus" "HealthStatus" NOT NULL DEFAULT 'UNKNOWN',
    "consecutiveFailures" INTEGER NOT NULL DEFAULT 0,
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "rpc_endpoints_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tokens" (
    "id" TEXT NOT NULL,
    "chainId" INTEGER NOT NULL,
    "contractAddress" VARCHAR(128) NOT NULL,
    "symbol" VARCHAR(20) NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "decimals" INTEGER NOT NULL,
    "isNative" BOOLEAN NOT NULL DEFAULT false,
    "coingeckoId" VARCHAR(100),
    "defillamaId" VARCHAR(100),
    "isEnabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "price_sources" (
    "id" TEXT NOT NULL,
    "slug" VARCHAR(50) NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "type" "PriceSourceType" NOT NULL,
    "priority" INTEGER NOT NULL DEFAULT 100,
    "isEnabled" BOOLEAN NOT NULL DEFAULT true,
    "rateLimitPerMin" INTEGER NOT NULL DEFAULT 30,
    "timeoutMs" INTEGER NOT NULL DEFAULT 10000,
    "apiKeyEnvVar" VARCHAR(100),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "price_sources_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "price_source_mappings" (
    "id" TEXT NOT NULL,
    "priceSourceId" TEXT NOT NULL,
    "assetKey" VARCHAR(50) NOT NULL,
    "sourceAssetId" VARCHAR(200) NOT NULL,

    CONSTRAINT "price_source_mappings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "chains_chainId_key" ON "chains"("chainId");

-- CreateIndex
CREATE INDEX "rpc_endpoints_chainId_priority_idx" ON "rpc_endpoints"("chainId", "priority");

-- CreateIndex
CREATE UNIQUE INDEX "rpc_endpoints_chainId_url_key" ON "rpc_endpoints"("chainId", "url");

-- CreateIndex
CREATE INDEX "tokens_symbol_idx" ON "tokens"("symbol");

-- CreateIndex
CREATE UNIQUE INDEX "tokens_chainId_contractAddress_key" ON "tokens"("chainId", "contractAddress");

-- CreateIndex
CREATE UNIQUE INDEX "price_sources_slug_key" ON "price_sources"("slug");

-- CreateIndex
CREATE INDEX "price_source_mappings_assetKey_idx" ON "price_source_mappings"("assetKey");

-- CreateIndex
CREATE UNIQUE INDEX "price_source_mappings_priceSourceId_assetKey_key" ON "price_source_mappings"("priceSourceId", "assetKey");

-- AddForeignKey
ALTER TABLE "rpc_endpoints" ADD CONSTRAINT "rpc_endpoints_chainId_fkey" FOREIGN KEY ("chainId") REFERENCES "chains"("chainId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tokens" ADD CONSTRAINT "tokens_chainId_fkey" FOREIGN KEY ("chainId") REFERENCES "chains"("chainId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "price_source_mappings" ADD CONSTRAINT "price_source_mappings_priceSourceId_fkey" FOREIGN KEY ("priceSourceId") REFERENCES "price_sources"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateTable
CREATE TABLE "projects" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "apiKey" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "projects_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "chains" (
    "id" TEXT NOT NULL,
    "chainId" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "rpcUrls" JSONB NOT NULL,
    "activeRpcIndex" INTEGER NOT NULL DEFAULT 0,
    "blockTime" INTEGER NOT NULL DEFAULT 12000,
    "finalityBlocks" INTEGER NOT NULL DEFAULT 64,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "chains_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "contracts" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "chainId" INTEGER NOT NULL,
    "address" TEXT NOT NULL,
    "abi" JSONB NOT NULL,
    "startBlock" BIGINT NOT NULL DEFAULT 0,
    "name" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "contracts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "event_subscriptions" (
    "id" TEXT NOT NULL,
    "contractId" TEXT NOT NULL,
    "eventName" TEXT NOT NULL,
    "eventSignature" TEXT NOT NULL,
    "topic0" TEXT NOT NULL,
    "abiItem" JSONB NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "event_subscriptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "indexed_events" (
    "id" TEXT NOT NULL,
    "subscriptionId" TEXT NOT NULL,
    "chainId" INTEGER NOT NULL,
    "blockNumber" BIGINT NOT NULL,
    "blockHash" TEXT NOT NULL,
    "transactionHash" TEXT NOT NULL,
    "logIndex" INTEGER NOT NULL,
    "args" JSONB NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "indexed_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "index_states" (
    "id" TEXT NOT NULL,
    "chainId" INTEGER NOT NULL,
    "contractId" TEXT NOT NULL,
    "lastIndexedBlock" BIGINT NOT NULL,
    "lastFinalizedBlock" BIGINT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "index_states_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "webhooks" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "secret" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "webhooks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "webhook_subscriptions" (
    "id" TEXT NOT NULL,
    "webhookId" TEXT NOT NULL,
    "eventSubscriptionId" TEXT NOT NULL,
    "filterConditions" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "webhook_subscriptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "webhook_deliveries" (
    "id" TEXT NOT NULL,
    "webhookId" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lastAttemptAt" TIMESTAMP(3),
    "responseCode" INTEGER,
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "webhook_deliveries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "settings" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'string',
    "category" TEXT NOT NULL DEFAULT 'general',
    "label" TEXT NOT NULL DEFAULT '',
    "description" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "settings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "projects_apiKey_key" ON "projects"("apiKey");

-- CreateIndex
CREATE UNIQUE INDEX "chains_chainId_key" ON "chains"("chainId");

-- CreateIndex
CREATE INDEX "contracts_chainId_idx" ON "contracts"("chainId");

-- CreateIndex
CREATE INDEX "contracts_projectId_idx" ON "contracts"("projectId");

-- CreateIndex
CREATE UNIQUE INDEX "contracts_projectId_chainId_address_key" ON "contracts"("projectId", "chainId", "address");

-- CreateIndex
CREATE INDEX "event_subscriptions_topic0_idx" ON "event_subscriptions"("topic0");

-- CreateIndex
CREATE UNIQUE INDEX "event_subscriptions_contractId_eventName_key" ON "event_subscriptions"("contractId", "eventName");

-- CreateIndex
CREATE INDEX "indexed_events_subscriptionId_createdAt_idx" ON "indexed_events"("subscriptionId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "indexed_events_chainId_blockNumber_idx" ON "indexed_events"("chainId", "blockNumber");

-- CreateIndex
CREATE INDEX "indexed_events_transactionHash_idx" ON "indexed_events"("transactionHash");

-- CreateIndex
CREATE UNIQUE INDEX "indexed_events_chainId_transactionHash_logIndex_key" ON "indexed_events"("chainId", "transactionHash", "logIndex");

-- CreateIndex
CREATE UNIQUE INDEX "index_states_chainId_contractId_key" ON "index_states"("chainId", "contractId");

-- CreateIndex
CREATE INDEX "webhooks_projectId_idx" ON "webhooks"("projectId");

-- CreateIndex
CREATE UNIQUE INDEX "webhook_subscriptions_webhookId_eventSubscriptionId_key" ON "webhook_subscriptions"("webhookId", "eventSubscriptionId");

-- CreateIndex
CREATE INDEX "webhook_deliveries_webhookId_status_idx" ON "webhook_deliveries"("webhookId", "status");

-- CreateIndex
CREATE INDEX "webhook_deliveries_eventId_idx" ON "webhook_deliveries"("eventId");

-- CreateIndex
CREATE UNIQUE INDEX "settings_key_key" ON "settings"("key");

-- CreateIndex
CREATE INDEX "settings_category_idx" ON "settings"("category");

-- AddForeignKey
ALTER TABLE "contracts" ADD CONSTRAINT "contracts_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contracts" ADD CONSTRAINT "contracts_chainId_fkey" FOREIGN KEY ("chainId") REFERENCES "chains"("chainId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_subscriptions" ADD CONSTRAINT "event_subscriptions_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "contracts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "indexed_events" ADD CONSTRAINT "indexed_events_subscriptionId_fkey" FOREIGN KEY ("subscriptionId") REFERENCES "event_subscriptions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "index_states" ADD CONSTRAINT "index_states_chainId_fkey" FOREIGN KEY ("chainId") REFERENCES "chains"("chainId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "index_states" ADD CONSTRAINT "index_states_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "contracts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "webhooks" ADD CONSTRAINT "webhooks_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "webhook_subscriptions" ADD CONSTRAINT "webhook_subscriptions_webhookId_fkey" FOREIGN KEY ("webhookId") REFERENCES "webhooks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "webhook_subscriptions" ADD CONSTRAINT "webhook_subscriptions_eventSubscriptionId_fkey" FOREIGN KEY ("eventSubscriptionId") REFERENCES "event_subscriptions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "webhook_deliveries" ADD CONSTRAINT "webhook_deliveries_webhookId_fkey" FOREIGN KEY ("webhookId") REFERENCES "webhooks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "webhook_deliveries" ADD CONSTRAINT "webhook_deliveries_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "indexed_events"("id") ON DELETE CASCADE ON UPDATE CASCADE;

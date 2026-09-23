-- AlterTable
ALTER TABLE "event_subscriptions" ADD COLUMN     "filterConditions" JSONB;

-- CreateTable
CREATE TABLE "event_traces" (
    "id" TEXT NOT NULL,
    "subscriptionId" TEXT NOT NULL,
    "chainId" INTEGER NOT NULL,
    "blockNumber" BIGINT NOT NULL,
    "transactionHash" TEXT NOT NULL,
    "logIndex" INTEGER NOT NULL,
    "eventName" TEXT NOT NULL,
    "processedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "event_traces_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "event_traces_chainId_blockNumber_idx" ON "event_traces"("chainId", "blockNumber");

-- CreateIndex
CREATE INDEX "event_traces_subscriptionId_idx" ON "event_traces"("subscriptionId");

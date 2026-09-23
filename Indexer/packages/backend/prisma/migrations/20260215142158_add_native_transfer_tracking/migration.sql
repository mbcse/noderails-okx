-- AlterTable
ALTER TABLE "webhook_deliveries" ADD COLUMN     "nativeTransferId" TEXT,
ALTER COLUMN "eventId" DROP NOT NULL;

-- AlterTable
ALTER TABLE "webhooks" ADD COLUMN     "nativeChainId" INTEGER,
ADD COLUMN     "subscribeNative" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "watched_addresses" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "chainId" INTEGER NOT NULL,
    "address" TEXT NOT NULL,
    "label" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "watched_addresses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "native_transfers" (
    "id" TEXT NOT NULL,
    "chainId" INTEGER NOT NULL,
    "blockNumber" BIGINT NOT NULL,
    "blockHash" TEXT NOT NULL,
    "transactionHash" TEXT NOT NULL,
    "from" TEXT NOT NULL,
    "to" TEXT,
    "value" TEXT NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "native_transfers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "native_index_states" (
    "chainId" INTEGER NOT NULL,
    "lastIndexedBlock" BIGINT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL
);

-- CreateIndex
CREATE INDEX "watched_addresses_chainId_address_idx" ON "watched_addresses"("chainId", "address");

-- CreateIndex
CREATE UNIQUE INDEX "watched_addresses_projectId_chainId_address_key" ON "watched_addresses"("projectId", "chainId", "address");

-- CreateIndex
CREATE INDEX "native_transfers_chainId_blockNumber_idx" ON "native_transfers"("chainId", "blockNumber");

-- CreateIndex
CREATE INDEX "native_transfers_from_idx" ON "native_transfers"("from");

-- CreateIndex
CREATE INDEX "native_transfers_to_idx" ON "native_transfers"("to");

-- CreateIndex
CREATE UNIQUE INDEX "native_transfers_chainId_transactionHash_key" ON "native_transfers"("chainId", "transactionHash");

-- CreateIndex
CREATE UNIQUE INDEX "native_index_states_chainId_key" ON "native_index_states"("chainId");

-- CreateIndex
CREATE INDEX "webhook_deliveries_nativeTransferId_idx" ON "webhook_deliveries"("nativeTransferId");

-- AddForeignKey
ALTER TABLE "watched_addresses" ADD CONSTRAINT "watched_addresses_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "native_index_states" ADD CONSTRAINT "native_index_states_chainId_fkey" FOREIGN KEY ("chainId") REFERENCES "chains"("chainId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "webhook_deliveries" ADD CONSTRAINT "webhook_deliveries_nativeTransferId_fkey" FOREIGN KEY ("nativeTransferId") REFERENCES "native_transfers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

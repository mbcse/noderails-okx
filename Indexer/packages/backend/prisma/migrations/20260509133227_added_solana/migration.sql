/*
  Warnings:

  - A unique constraint covering the columns `[projectId,chainId,protocol,address]` on the table `contracts` will be added. If there are existing duplicate values, this will fail.

*/
-- DropIndex
DROP INDEX "contracts_projectId_chainId_address_key";

-- AlterTable
ALTER TABLE "chains" ADD COLUMN     "protocol" TEXT NOT NULL DEFAULT 'evm';

-- AlterTable
ALTER TABLE "contracts" ADD COLUMN     "protocol" TEXT NOT NULL DEFAULT 'evm';

-- CreateIndex
CREATE UNIQUE INDEX "contracts_projectId_chainId_protocol_address_key" ON "contracts"("projectId", "chainId", "protocol", "address");

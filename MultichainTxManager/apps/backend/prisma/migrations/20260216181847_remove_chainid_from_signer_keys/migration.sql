/*
  Warnings:

  - You are about to drop the column `chainId` on the `signer_keys` table. All the data in the column will be lost.

*/
-- DropForeignKey
ALTER TABLE "signer_keys" DROP CONSTRAINT "signer_keys_chainId_fkey";

-- AlterTable
ALTER TABLE "signer_keys" DROP COLUMN "chainId";

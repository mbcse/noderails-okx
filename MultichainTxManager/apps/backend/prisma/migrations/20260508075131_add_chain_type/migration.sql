-- CreateEnum
CREATE TYPE "ChainType" AS ENUM ('EVM', 'SOLANA');

-- AlterTable
ALTER TABLE "chains" ADD COLUMN     "chainType" "ChainType" NOT NULL DEFAULT 'EVM';

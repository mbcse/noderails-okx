-- AlterEnum
ALTER TYPE "ChainType" ADD VALUE 'SUI';

-- AlterTable
ALTER TABLE "transactions" ADD COLUMN "suiMoveCalls" JSONB,
ADD COLUMN "suiRawTransactionBase64" TEXT,
ADD COLUMN "suiGasBudget" TEXT,
ADD COLUMN "suiGasPrice" TEXT;

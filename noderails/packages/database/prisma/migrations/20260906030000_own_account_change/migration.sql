-- CreateEnum
CREATE TYPE "FiatOwnAccountChangeStatus" AS ENUM ('NONE', 'PENDING_REVIEW', 'REJECTED');

-- AlterTable
ALTER TABLE "fiat_own_accounts"
ADD COLUMN "pendingCorridor" JSONB NOT NULL DEFAULT '{}',
ADD COLUMN "pendingStatementS3Key" TEXT,
ADD COLUMN "pendingSubmittedAt" TIMESTAMP(3),
ADD COLUMN "changeStatus" "FiatOwnAccountChangeStatus" NOT NULL DEFAULT 'NONE',
ADD COLUMN "changeRejectionReason" TEXT;

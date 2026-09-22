-- CreateTable
CREATE TABLE "funding_logs" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "chainId" TEXT NOT NULL,
    "chainName" TEXT NOT NULL,
    "fromAddress" TEXT NOT NULL,
    "toAddress" TEXT NOT NULL,
    "txHash" TEXT,
    "amountWei" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "funding_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "funding_logs_projectId_toAddress_idx" ON "funding_logs"("projectId", "toAddress");

-- CreateIndex
CREATE INDEX "funding_logs_toAddress_createdAt_idx" ON "funding_logs"("toAddress", "createdAt");

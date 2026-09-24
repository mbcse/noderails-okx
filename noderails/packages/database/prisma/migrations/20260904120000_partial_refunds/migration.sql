-- AlterEnum
ALTER TYPE "PaymentStatus" ADD VALUE IF NOT EXISTS 'PARTIALLY_REFUNDED';

-- AlterTable
ALTER TABLE "payment_intents" ADD COLUMN "settleAmount" TEXT;

-- CreateTable
CREATE TABLE "payment_refunds" (
    "id" TEXT NOT NULL,
    "paymentIntentId" TEXT NOT NULL,
    "amount" TEXT NOT NULL,
    "reason" VARCHAR(500),
    "transactionId" TEXT,
    "status" "TransactionStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "confirmedAt" TIMESTAMP(3),

    CONSTRAINT "payment_refunds_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "payment_refunds_transactionId_key" ON "payment_refunds"("transactionId");

-- CreateIndex
CREATE INDEX "payment_refunds_paymentIntentId_idx" ON "payment_refunds"("paymentIntentId");

-- CreateIndex
CREATE INDEX "payment_refunds_status_idx" ON "payment_refunds"("status");

-- One in-flight refund per intent
CREATE UNIQUE INDEX "payment_refunds_one_pending" ON "payment_refunds"("paymentIntentId") WHERE status = 'PENDING';

-- AddForeignKey
ALTER TABLE "payment_refunds" ADD CONSTRAINT "payment_refunds_paymentIntentId_fkey" FOREIGN KEY ("paymentIntentId") REFERENCES "payment_intents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_refunds" ADD CONSTRAINT "payment_refunds_transactionId_fkey" FOREIGN KEY ("transactionId") REFERENCES "transactions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

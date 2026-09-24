-- Prisma cannot represent a partial unique index in schema.prisma, so migrate
-- dev kept trying to drop payment_refunds_one_pending. Replace it with a
-- nullable unique column (multiple NULLs allowed; one PENDING lock per intent).

ALTER TABLE "payment_refunds" ADD COLUMN "pendingLock" TEXT;

UPDATE "payment_refunds"
SET "pendingLock" = "paymentIntentId"
WHERE status = 'PENDING';

DROP INDEX IF EXISTS "payment_refunds_one_pending";

CREATE UNIQUE INDEX "payment_refunds_pendingLock_key" ON "payment_refunds"("pendingLock");

-- Scheduled / recurring payouts + per-app address book

ALTER TYPE "PayoutStatus" ADD VALUE IF NOT EXISTS 'SCHEDULED';
ALTER TYPE "PayoutStatus" ADD VALUE IF NOT EXISTS 'CANCELLED';

ALTER TABLE "payout_intents"
  ADD COLUMN IF NOT EXISTS "scheduledAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "scheduleId" TEXT,
  ADD COLUMN IF NOT EXISTS "pendingJobId" TEXT;

DO $$ BEGIN
  CREATE TYPE "PayoutScheduleStatus" AS ENUM ('ACTIVE', 'PAUSED', 'CANCELLED');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "payout_schedules" (
  "id" TEXT NOT NULL,
  "merchantId" TEXT NOT NULL,
  "appId" TEXT NOT NULL,
  "chain" TEXT NOT NULL,
  "tokenAddress" VARCHAR(128) NOT NULL,
  "lines" JSONB NOT NULL,
  "intervalDays" INTEGER NOT NULL,
  "nextRunAt" TIMESTAMP(3) NOT NULL,
  "status" "PayoutScheduleStatus" NOT NULL DEFAULT 'ACTIVE',
  "pendingJobId" TEXT,
  "lastError" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "payout_schedules_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "payout_schedules_merchantId_idx" ON "payout_schedules"("merchantId");
CREATE INDEX IF NOT EXISTS "payout_schedules_appId_idx" ON "payout_schedules"("appId");
CREATE INDEX IF NOT EXISTS "payout_schedules_status_idx" ON "payout_schedules"("status");
CREATE INDEX IF NOT EXISTS "payout_schedules_nextRunAt_idx" ON "payout_schedules"("nextRunAt");

CREATE TABLE IF NOT EXISTS "payout_contacts" (
  "id" TEXT NOT NULL,
  "merchantId" TEXT NOT NULL,
  "appId" TEXT NOT NULL,
  "label" VARCHAR(80) NOT NULL,
  "wallet" VARCHAR(128) NOT NULL,
  "family" "ChainType" NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "payout_contacts_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "payout_contacts_appId_family_wallet_key" ON "payout_contacts"("appId", "family", "wallet");
CREATE INDEX IF NOT EXISTS "payout_contacts_appId_idx" ON "payout_contacts"("appId");
CREATE INDEX IF NOT EXISTS "payout_contacts_merchantId_idx" ON "payout_contacts"("merchantId");

DO $$ BEGIN
  ALTER TABLE "payout_schedules"
    ADD CONSTRAINT "payout_schedules_merchantId_fkey"
    FOREIGN KEY ("merchantId") REFERENCES "merchants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "payout_schedules"
    ADD CONSTRAINT "payout_schedules_appId_fkey"
    FOREIGN KEY ("appId") REFERENCES "apps"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "payout_contacts"
    ADD CONSTRAINT "payout_contacts_merchantId_fkey"
    FOREIGN KEY ("merchantId") REFERENCES "merchants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "payout_contacts"
    ADD CONSTRAINT "payout_contacts_appId_fkey"
    FOREIGN KEY ("appId") REFERENCES "apps"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "payout_intents"
    ADD CONSTRAINT "payout_intents_scheduleId_fkey"
    FOREIGN KEY ("scheduleId") REFERENCES "payout_schedules"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS "payout_intents_scheduleId_idx" ON "payout_intents"("scheduleId");

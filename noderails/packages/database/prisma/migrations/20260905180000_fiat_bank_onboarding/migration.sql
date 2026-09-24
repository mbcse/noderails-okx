-- CreateEnum
CREATE TYPE "FiatAccountType" AS ENUM ('INDIVIDUAL', 'BUSINESS');
CREATE TYPE "FiatOwnAccountStatus" AS ENUM ('NONE', 'PENDING_IDENTITY', 'PENDING_REVIEW', 'VERIFIED', 'REJECTED');
CREATE TYPE "FiatVaKycStatus" AS ENUM ('NONE', 'PENDING', 'APPROVED', 'REJECTED');
CREATE TYPE "FiatIdentityKind" AS ENUM ('KYC', 'KYB');
CREATE TYPE "FiatFeeStatus" AS ENUM ('PENDING', 'CONFIRMED', 'EXPIRED', 'FAILED');

-- AlterTable
ALTER TABLE "platform_config"
ADD COLUMN "bankFeeIndividualUsd" DECIMAL(10,2) NOT NULL DEFAULT 30,
ADD COLUMN "bankFeeBusinessUsd" DECIMAL(10,2) NOT NULL DEFAULT 40,
ADD COLUMN "bankFeeTestAppId" TEXT,
ADD COLUMN "bankFeeTestApiKey" TEXT,
ADD COLUMN "bankFeeTestWebhookSecret" TEXT,
ADD COLUMN "bankFeeLiveAppId" TEXT,
ADD COLUMN "bankFeeLiveApiKey" TEXT,
ADD COLUMN "bankFeeLiveWebhookSecret" TEXT,
ADD COLUMN "bankOnrampFeeBps" INTEGER NOT NULL DEFAULT 50,
ADD COLUMN "bankOfframpFeeBps" INTEGER NOT NULL DEFAULT 25,
ADD COLUMN "bankFxUsdEurBps" INTEGER NOT NULL DEFAULT 50,
ADD COLUMN "bankFxUsdMxnBps" INTEGER NOT NULL DEFAULT 50,
ADD COLUMN "bankFxUsdGbpBps" INTEGER NOT NULL DEFAULT 50,
ADD COLUMN "bankFxUsdBrlBps" INTEGER NOT NULL DEFAULT 55,
ADD COLUMN "bankAchFeeCents" INTEGER NOT NULL DEFAULT 50,
ADD COLUMN "bankWireFeeCents" INTEGER NOT NULL DEFAULT 1000,
ADD COLUMN "bankGasFeeNote" VARCHAR(200);

-- CreateTable
CREATE TABLE "fiat_profiles" (
    "id" TEXT NOT NULL,
    "merchantId" TEXT NOT NULL,
    "environment" "Environment" NOT NULL,
    "accountType" "FiatAccountType" NOT NULL DEFAULT 'INDIVIDUAL',
    "ownAccountStatus" "FiatOwnAccountStatus" NOT NULL DEFAULT 'NONE',
    "vaKycStatus" "FiatVaKycStatus" NOT NULL DEFAULT 'NONE',
    "vaProvider" VARCHAR(40),
    "vaExternalRefs" JSONB NOT NULL DEFAULT '{}',
    "identityProvider" VARCHAR(40),
    "identityExternalRefs" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "fiat_profiles_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "fiat_own_accounts" (
    "id" TEXT NOT NULL,
    "profileId" TEXT NOT NULL,
    "corridor" JSONB NOT NULL DEFAULT '{}',
    "statementS3Key" TEXT,
    "offrampBeneficiaryId" TEXT,
    "reviewNote" TEXT,
    "rejectionReason" TEXT,
    "submittedAt" TIMESTAMP(3),
    "reviewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "fiat_own_accounts_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "fiat_identity_sessions" (
    "id" TEXT NOT NULL,
    "profileId" TEXT NOT NULL,
    "provider" VARCHAR(40) NOT NULL,
    "kind" "FiatIdentityKind" NOT NULL,
    "environment" "Environment" NOT NULL,
    "externalId" TEXT NOT NULL,
    "status" VARCHAR(40) NOT NULL,
    "vendorData" TEXT,
    "sessionUrl" TEXT,
    "lastEventId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "fiat_identity_sessions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "fiat_onboarding_fees" (
    "id" TEXT NOT NULL,
    "profileId" TEXT NOT NULL,
    "rail" VARCHAR(16) NOT NULL,
    "amountUsd" DECIMAL(10,2) NOT NULL,
    "status" "FiatFeeStatus" NOT NULL DEFAULT 'PENDING',
    "checkoutSessionId" TEXT,
    "checkoutUrl" TEXT,
    "paymentIntentId" TEXT,
    "periodStart" TIMESTAMP(3),
    "periodEnd" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "fiat_onboarding_fees_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "fiat_virtual_accounts" (
    "id" TEXT NOT NULL,
    "profileId" TEXT NOT NULL,
    "feeId" TEXT,
    "provider" VARCHAR(40) NOT NULL,
    "environment" "Environment" NOT NULL,
    "rail" VARCHAR(16) NOT NULL,
    "externalCustomerId" TEXT,
    "externalAccountId" TEXT,
    "depositInstructions" JSONB NOT NULL DEFAULT '{}',
    "destinationAddress" VARCHAR(128),
    "destinationChainId" INTEGER,
    "destinationTokenKey" VARCHAR(50),
    "destinationSignature" TEXT,
    "status" VARCHAR(40) NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "fiat_virtual_accounts_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "fiat_virtual_account_events" (
    "id" TEXT NOT NULL,
    "virtualAccountId" TEXT NOT NULL,
    "externalEventId" TEXT NOT NULL,
    "depositId" TEXT,
    "type" VARCHAR(40) NOT NULL,
    "amount" TEXT,
    "currency" VARCHAR(16),
    "paymentRail" VARCHAR(40),
    "senderName" TEXT,
    "senderReference" TEXT,
    "senderLast4" TEXT,
    "developerFee" TEXT,
    "exchangeFee" TEXT,
    "gasFee" TEXT,
    "subtotal" TEXT,
    "destinationTxHash" TEXT,
    "receipt" JSONB,
    "source" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "fiat_virtual_account_events_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "fiat_processed_webhooks" (
    "id" TEXT NOT NULL,
    "source" VARCHAR(40) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "fiat_processed_webhooks_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "fiat_profiles_merchantId_environment_key" ON "fiat_profiles"("merchantId", "environment");
CREATE INDEX "fiat_profiles_merchantId_idx" ON "fiat_profiles"("merchantId");
CREATE UNIQUE INDEX "fiat_own_accounts_profileId_key" ON "fiat_own_accounts"("profileId");
CREATE UNIQUE INDEX "fiat_identity_sessions_provider_externalId_key" ON "fiat_identity_sessions"("provider", "externalId");
CREATE INDEX "fiat_identity_sessions_profileId_idx" ON "fiat_identity_sessions"("profileId");
CREATE UNIQUE INDEX "fiat_onboarding_fees_paymentIntentId_key" ON "fiat_onboarding_fees"("paymentIntentId");
CREATE INDEX "fiat_onboarding_fees_profileId_rail_status_idx" ON "fiat_onboarding_fees"("profileId", "rail", "status");
CREATE UNIQUE INDEX "fiat_virtual_accounts_feeId_key" ON "fiat_virtual_accounts"("feeId");
CREATE UNIQUE INDEX "fiat_virtual_accounts_profileId_rail_key" ON "fiat_virtual_accounts"("profileId", "rail");
CREATE INDEX "fiat_virtual_accounts_profileId_idx" ON "fiat_virtual_accounts"("profileId");
CREATE UNIQUE INDEX "fiat_virtual_account_events_externalEventId_key" ON "fiat_virtual_account_events"("externalEventId");
CREATE INDEX "fiat_virtual_account_events_virtualAccountId_depositId_idx" ON "fiat_virtual_account_events"("virtualAccountId", "depositId");

ALTER TABLE "fiat_profiles" ADD CONSTRAINT "fiat_profiles_merchantId_fkey" FOREIGN KEY ("merchantId") REFERENCES "merchants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "fiat_own_accounts" ADD CONSTRAINT "fiat_own_accounts_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "fiat_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "fiat_identity_sessions" ADD CONSTRAINT "fiat_identity_sessions_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "fiat_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "fiat_onboarding_fees" ADD CONSTRAINT "fiat_onboarding_fees_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "fiat_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "fiat_virtual_accounts" ADD CONSTRAINT "fiat_virtual_accounts_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "fiat_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "fiat_virtual_accounts" ADD CONSTRAINT "fiat_virtual_accounts_feeId_fkey" FOREIGN KEY ("feeId") REFERENCES "fiat_onboarding_fees"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "fiat_virtual_account_events" ADD CONSTRAINT "fiat_virtual_account_events_virtualAccountId_fkey" FOREIGN KEY ("virtualAccountId") REFERENCES "fiat_virtual_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

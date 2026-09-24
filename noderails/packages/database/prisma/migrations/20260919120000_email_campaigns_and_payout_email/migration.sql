-- AlterTable
ALTER TABLE "payout_intents" ADD COLUMN "recipientEmail" TEXT;

-- AlterTable
ALTER TABLE "payout_contacts" ADD COLUMN "email" TEXT;

-- AlterTable
ALTER TABLE "email_deliveries" ADD COLUMN "payoutIntentId" TEXT;

-- CreateIndex
CREATE INDEX "email_deliveries_payoutIntentId_idx" ON "email_deliveries"("payoutIntentId");

-- AddForeignKey
ALTER TABLE "email_deliveries" ADD CONSTRAINT "email_deliveries_payoutIntentId_fkey" FOREIGN KEY ("payoutIntentId") REFERENCES "payout_intents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AlterEnum
ALTER TYPE "EmailSuppressionReason" ADD VALUE 'CAMPAIGN_UNSUBSCRIBE';

-- CreateEnum
CREATE TYPE "EmailListContactSource" AS ENUM ('TYPED', 'CSV');

-- CreateEnum
CREATE TYPE "EmailCampaignAudience" AS ENUM ('EVERYONE', 'REGISTERED_ACCOUNTS', 'ADDED_CONTACTS', 'SELECTED_PEOPLE');

-- CreateEnum
CREATE TYPE "EmailCampaignStatus" AS ENUM ('DRAFT', 'QUEUED', 'SENDING', 'CANCELLED', 'COMPLETED');

-- CreateEnum
CREATE TYPE "EmailCampaignRecipientSource" AS ENUM ('REGISTERED', 'ADDED');

-- CreateEnum
CREATE TYPE "EmailCampaignRecipientStatus" AS ENUM ('PENDING', 'SKIPPED', 'SENT', 'FAILED', 'CANCELLED');

-- CreateTable
CREATE TABLE "email_list_contacts" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT,
    "source" "EmailListContactSource" NOT NULL,
    "createdByAdminEmail" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "email_list_contacts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "email_campaigns" (
    "id" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "heading" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "ctaLabel" TEXT,
    "ctaUrl" TEXT,
    "fromAddress" TEXT NOT NULL,
    "audience" "EmailCampaignAudience" NOT NULL,
    "selectedPersonKeys" JSONB,
    "status" "EmailCampaignStatus" NOT NULL DEFAULT 'DRAFT',
    "recipientCount" INTEGER NOT NULL DEFAULT 0,
    "sentCount" INTEGER NOT NULL DEFAULT 0,
    "skippedCount" INTEGER NOT NULL DEFAULT 0,
    "failedCount" INTEGER NOT NULL DEFAULT 0,
    "uniqueOpens" INTEGER NOT NULL DEFAULT 0,
    "totalOpens" INTEGER NOT NULL DEFAULT 0,
    "uniqueClicks" INTEGER NOT NULL DEFAULT 0,
    "totalClicks" INTEGER NOT NULL DEFAULT 0,
    "createdByAdminEmail" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "email_campaigns_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "email_campaign_recipients" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "displayName" TEXT,
    "merchantId" TEXT,
    "listContactId" TEXT,
    "source" "EmailCampaignRecipientSource" NOT NULL,
    "status" "EmailCampaignRecipientStatus" NOT NULL DEFAULT 'PENDING',
    "openToken" TEXT NOT NULL,
    "firstOpenedAt" TIMESTAMP(3),
    "lastOpenedAt" TIMESTAMP(3),
    "openCount" INTEGER NOT NULL DEFAULT 0,
    "firstClickedAt" TIMESTAMP(3),
    "lastClickedAt" TIMESTAMP(3),
    "clickCount" INTEGER NOT NULL DEFAULT 0,
    "emailDeliveryId" TEXT,
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "email_campaign_recipients_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "email_campaign_clicks" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "recipientId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "email_campaign_clicks_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "email_list_contacts_email_key" ON "email_list_contacts"("email");

-- CreateIndex
CREATE INDEX "email_campaigns_status_idx" ON "email_campaigns"("status");

-- CreateIndex
CREATE INDEX "email_campaigns_createdAt_idx" ON "email_campaigns"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "email_campaign_recipients_openToken_key" ON "email_campaign_recipients"("openToken");

-- CreateIndex
CREATE UNIQUE INDEX "email_campaign_recipients_campaignId_email_key" ON "email_campaign_recipients"("campaignId", "email");

-- CreateIndex
CREATE INDEX "email_campaign_recipients_campaignId_status_idx" ON "email_campaign_recipients"("campaignId", "status");

-- CreateIndex
CREATE INDEX "email_campaign_recipients_merchantId_idx" ON "email_campaign_recipients"("merchantId");

-- CreateIndex
CREATE INDEX "email_campaign_clicks_campaignId_idx" ON "email_campaign_clicks"("campaignId");

-- CreateIndex
CREATE INDEX "email_campaign_clicks_recipientId_idx" ON "email_campaign_clicks"("recipientId");

-- AddForeignKey
ALTER TABLE "email_campaign_recipients" ADD CONSTRAINT "email_campaign_recipients_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "email_campaigns"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "email_campaign_recipients" ADD CONSTRAINT "email_campaign_recipients_merchantId_fkey" FOREIGN KEY ("merchantId") REFERENCES "merchants"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "email_campaign_recipients" ADD CONSTRAINT "email_campaign_recipients_listContactId_fkey" FOREIGN KEY ("listContactId") REFERENCES "email_list_contacts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "email_campaign_clicks" ADD CONSTRAINT "email_campaign_clicks_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "email_campaigns"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "email_campaign_clicks" ADD CONSTRAINT "email_campaign_clicks_recipientId_fkey" FOREIGN KEY ("recipientId") REFERENCES "email_campaign_recipients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

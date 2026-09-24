-- CreateEnum
CREATE TYPE "EmailCampaignTemplate" AS ENUM (
  'UPDATES',
  'BUSINESS_OUTREACH',
  'DIRECT_OUTREACH',
  'PARTNERSHIP',
  'EVENT_INVITE',
  'ANNOUNCEMENT',
  'FOLLOW_UP'
);

-- AlterTable
ALTER TABLE "email_campaigns" ADD COLUMN "templateId" "EmailCampaignTemplate" NOT NULL DEFAULT 'UPDATES';

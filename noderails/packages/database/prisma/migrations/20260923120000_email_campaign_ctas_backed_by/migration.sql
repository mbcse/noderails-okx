-- AlterTable
ALTER TABLE "email_campaigns" ADD COLUMN "ctas" JSONB,
ADD COLUMN "showBackedBy" BOOLEAN NOT NULL DEFAULT true;

-- AlterTable
ALTER TABLE "email_campaign_clicks" ADD COLUMN "ctaId" TEXT,
ADD COLUMN "ctaLabel" TEXT;

-- CreateIndex
CREATE INDEX "email_campaign_clicks_campaignId_ctaId_idx" ON "email_campaign_clicks"("campaignId", "ctaId");

-- Backfill structured CTAs from legacy label/url pairs
UPDATE "email_campaigns"
SET "ctas" = jsonb_build_array(
  jsonb_build_object(
    'id', 'legacy-1',
    'label', "ctaLabel",
    'url', "ctaUrl",
    'placement', 'after_body',
    'style', CASE "templateId"
      WHEN 'UPDATES' THEN 'black_pill'
      WHEN 'EVENT_INVITE' THEN 'purple_fill'
      WHEN 'BUSINESS_OUTREACH' THEN 'outline_dark'
      WHEN 'DIRECT_OUTREACH' THEN 'outline_dark'
      WHEN 'ANNOUNCEMENT' THEN 'text_link'
      WHEN 'PARTNERSHIP' THEN 'text_link'
      WHEN 'FOLLOW_UP' THEN 'text_link'
      ELSE 'black_pill'
    END,
    'align', CASE "templateId"
      WHEN 'UPDATES' THEN 'center'
      WHEN 'EVENT_INVITE' THEN 'center'
      ELSE 'left'
    END,
    'withArrow', false
  )
)
WHERE "ctaLabel" IS NOT NULL
  AND "ctaUrl" IS NOT NULL
  AND btrim("ctaLabel") <> ''
  AND btrim("ctaUrl") <> ''
  AND "ctas" IS NULL;

-- CreateEnum
CREATE TYPE "ShortLinkStatus" AS ENUM ('ACTIVE', 'DISABLED');

-- CreateTable
CREATE TABLE "short_links" (
    "id" TEXT NOT NULL,
    "slug" VARCHAR(64) NOT NULL,
    "destinationUrl" VARCHAR(2048) NOT NULL,
    "title" VARCHAR(200),
    "status" "ShortLinkStatus" NOT NULL DEFAULT 'ACTIVE',
    "collectEmail" BOOLEAN NOT NULL DEFAULT false,
    "clickCount" INTEGER NOT NULL DEFAULT 0,
    "leadCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "short_links_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "short_link_clicks" (
    "id" TEXT NOT NULL,
    "shortLinkId" TEXT NOT NULL,
    "referrer" VARCHAR(500),
    "userAgent" VARCHAR(500),
    "ipHash" VARCHAR(64),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "short_link_clicks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "short_link_leads" (
    "id" TEXT NOT NULL,
    "shortLinkId" TEXT NOT NULL,
    "email" VARCHAR(254) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "short_link_leads_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "short_links_slug_key" ON "short_links"("slug");

-- CreateIndex
CREATE INDEX "short_links_status_idx" ON "short_links"("status");

-- CreateIndex
CREATE INDEX "short_links_createdAt_idx" ON "short_links"("createdAt");

-- CreateIndex
CREATE INDEX "short_link_clicks_shortLinkId_createdAt_idx" ON "short_link_clicks"("shortLinkId", "createdAt");

-- CreateIndex
CREATE INDEX "short_link_leads_shortLinkId_createdAt_idx" ON "short_link_leads"("shortLinkId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "short_link_leads_shortLinkId_email_key" ON "short_link_leads"("shortLinkId", "email");

-- AddForeignKey
ALTER TABLE "short_link_clicks" ADD CONSTRAINT "short_link_clicks_shortLinkId_fkey" FOREIGN KEY ("shortLinkId") REFERENCES "short_links"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "short_link_leads" ADD CONSTRAINT "short_link_leads_shortLinkId_fkey" FOREIGN KEY ("shortLinkId") REFERENCES "short_links"("id") ON DELETE CASCADE ON UPDATE CASCADE;

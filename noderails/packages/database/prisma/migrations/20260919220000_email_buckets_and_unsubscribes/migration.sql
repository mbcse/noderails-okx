-- AlterEnum
ALTER TYPE "EmailCampaignAudience" ADD VALUE 'BUCKETS';

-- AlterTable
ALTER TABLE "email_campaigns" ADD COLUMN "selectedBucketIds" JSONB;

-- CreateTable
CREATE TABLE "email_buckets" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "createdByAdminEmail" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "email_buckets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "email_bucket_members" (
    "id" TEXT NOT NULL,
    "bucketId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "email_bucket_members_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "email_buckets_slug_key" ON "email_buckets"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "email_bucket_members_bucketId_email_key" ON "email_bucket_members"("bucketId", "email");

-- CreateIndex
CREATE INDEX "email_bucket_members_email_idx" ON "email_bucket_members"("email");

-- AddForeignKey
ALTER TABLE "email_bucket_members" ADD CONSTRAINT "email_bucket_members_bucketId_fkey" FOREIGN KEY ("bucketId") REFERENCES "email_buckets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

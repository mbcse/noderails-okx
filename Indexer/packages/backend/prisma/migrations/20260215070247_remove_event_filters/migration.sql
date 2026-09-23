/*
  Warnings:

  - You are about to drop the `event_filters` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "event_filters" DROP CONSTRAINT "event_filters_contractId_fkey";

-- DropTable
DROP TABLE "event_filters";

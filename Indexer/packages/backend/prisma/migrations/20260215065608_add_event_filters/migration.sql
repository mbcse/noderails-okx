-- CreateTable
CREATE TABLE "event_filters" (
    "id" TEXT NOT NULL,
    "contractId" TEXT NOT NULL,
    "eventName" TEXT NOT NULL,
    "field" TEXT NOT NULL,
    "op" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "event_filters_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "event_filters_contractId_eventName_idx" ON "event_filters"("contractId", "eventName");

-- AddForeignKey
ALTER TABLE "event_filters" ADD CONSTRAINT "event_filters_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "contracts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

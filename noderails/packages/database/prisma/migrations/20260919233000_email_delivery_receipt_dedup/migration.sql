-- Keep the earliest payment-receipt row per intent (drop accidental duplicates).
DELETE FROM "email_deliveries" a
USING "email_deliveries" b
WHERE a."paymentIntentId" IS NOT NULL
  AND b."paymentIntentId" = a."paymentIntentId"
  AND a."templateId" = b."templateId"
  AND a."id" > b."id";

CREATE UNIQUE INDEX "email_deliveries_paymentIntentId_templateId_key"
  ON "email_deliveries"("paymentIntentId", "templateId");

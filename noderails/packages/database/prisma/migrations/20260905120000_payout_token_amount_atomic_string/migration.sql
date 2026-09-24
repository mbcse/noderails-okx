-- Atomic payout amounts are integer strings (wei / token units).
-- DECIMAL(36,18) only has 18 digits left of the point, so 1e18 overflows.

ALTER TABLE "payout_intents"
ALTER COLUMN "tokenAmount" TYPE TEXT
USING (TRUNC("tokenAmount"))::TEXT;

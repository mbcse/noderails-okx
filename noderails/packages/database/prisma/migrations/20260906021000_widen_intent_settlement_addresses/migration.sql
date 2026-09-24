-- Solana (~44) and Sui (66) receiving wallets overflow VARCHAR(42) on authorize.

ALTER TABLE "payment_intents" ALTER COLUMN "settlementWalletAddress" TYPE VARCHAR(66);
ALTER TABLE "payment_intents" ALTER COLUMN "captureMerchantAddress" TYPE VARCHAR(66);
ALTER TABLE "settlement_configs" ALTER COLUMN "settlementWalletAddress" TYPE VARCHAR(66);

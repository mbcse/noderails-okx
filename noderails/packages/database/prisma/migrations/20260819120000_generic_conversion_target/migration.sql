-- Generic conversion target naming (not locked to stablecoin)
ALTER TABLE "platform_config"
  RENAME COLUMN "defaultTargetStablecoinTokenKey" TO "defaultTargetTokenKey";

ALTER TABLE "settlement_configs"
  RENAME COLUMN "stablecoinConversionEnabled" TO "conversionEnabled";
ALTER TABLE "settlement_configs"
  RENAME COLUMN "targetStablecoinTokenKey" TO "targetTokenKey";

ALTER TABLE "payment_intents"
  RENAME COLUMN "stablecoinConversionEnabled" TO "conversionEnabled";
ALTER TABLE "payment_intents"
  RENAME COLUMN "targetStablecoinTokenKey" TO "targetTokenKey";
ALTER TABLE "payment_intents"
  RENAME COLUMN "convertedStablecoinAmount" TO "convertedAmount";
ALTER TABLE "payment_intents"
  RENAME COLUMN "convertedStablecoinTokenKey" TO "convertedTokenKey";

-- AlterTable
ALTER TABLE "transactions" ADD COLUMN     "solanaCuLimit" INTEGER,
ADD COLUMN     "solanaCuPriceMicroLamports" INTEGER,
ADD COLUMN     "solanaInstructions" JSONB;

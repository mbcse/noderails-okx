import { z } from "zod";

export const createSignerSchema = z
  .object({
    label: z.string().min(1, "Label is required").max(100),
    chainType: z.enum(["EVM", "SOLANA", "SUI"]).optional(),
    adapterType: z.enum(["ENV", "KMS"]),
    kmsKeyId: z.string().optional(),
  })
  .refine(
    (data) => {
      if (data.adapterType === "KMS") return !!data.kmsKeyId;
      return true;
    },
    {
      message: "KMS key ID is required for KMS adapter",
      path: ["kmsKeyId"],
    },
  )
  .refine(
    (data) => {
      if (data.chainType === "SOLANA" || data.chainType === "SUI") return data.adapterType === "ENV";
      return true;
    },
    {
      message: "SOLANA and SUI signers currently support ENV adapter only",
      path: ["adapterType"],
    },
  );

export const updateSignerSchema = z.object({
  label: z.string().min(1).max(100).optional(),
  isActive: z.boolean().optional(),
});

export const signerParamsSchema = z.object({
  projectId: z.string().min(1),
  signerId: z.string().min(1),
});

export const emergencyTransferSchema = z.object({
  chainId: z.union([z.string().min(1), z.number().int().positive()]),
  toAddress: z.string().min(1),
  amountWei: z.string().default("0"), // "0" = drain entire balance
  forceNonce: z.number().int().min(0).optional(),
});

export const resetNonceSchema = z.object({
  chainId: z.union([z.string().min(1), z.number().int().positive()]),
});

export const allocateSignerSchema = z.object({
  chainType: z.enum(["SUI"]).default("SUI"),
});

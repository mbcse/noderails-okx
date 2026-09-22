import { z } from "zod";

export const createChainSchema = z.object({
  chainType: z.enum(["EVM", "SOLANA", "SUI"]).optional(),
  name: z.string().min(1, "Name is required").max(100),
  chainId: z.coerce.number().int().positive("Chain ID must be a positive integer"),
  rpcUrls: z.array(z.string().url("Invalid RPC URL")).min(1, "At least one RPC URL is required"),
  explorerUrl: z.string().url("Invalid explorer URL").optional(),
  nativeCurrency: z.string().min(1, "Native currency is required").max(10),
  isTestnet: z.boolean(),
});

export const updateChainSchema = z.object({
  chainType: z.enum(["EVM", "SOLANA", "SUI"]).optional(),
  name: z.string().min(1).max(100).optional(),
  rpcUrls: z.array(z.string().url()).min(1).optional(),
  explorerUrl: z.string().url().optional(),
  isActive: z.boolean().optional(),
});

export const chainParamsSchema = z.object({
  projectId: z.string().min(1),
  chainId: z.string().min(1),
});

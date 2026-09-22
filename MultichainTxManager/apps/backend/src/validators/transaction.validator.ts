import { z } from "zod";

export const sendTransactionSchema = z.object({
  chainId: z.union([z.string().min(1), z.number().int().positive()], { message: "Chain is required (DB id or numeric chain ID)" }),
  signerId: z.string().min(1).optional(),
  // Chain-specific validation happens in the service after we resolve chainType.
  to: z.string().min(1, "Recipient is required"),
  value: z.string().regex(/^\d+(\.\d+)?$/, "Value must be a non-negative number string").optional(),
  data: z.string().min(1).optional(),
  gasLimit: z.string().regex(/^\d+$/, "Gas limit must be a positive integer string").optional(),
  metadata: z.record(z.unknown()).optional(),
  solana: z
    .object({
      // Either provide generic program instructions OR a raw transaction payload.
      instructions: z
        .array(
          z.object({
            programId: z.string().min(1),
            keys: z.array(
              z.object({
                pubkey: z.string().min(1),
                isSigner: z.boolean(),
                isWritable: z.boolean(),
              }),
            ),
            dataBase64: z.string().optional(),
          }),
        )
        .min(1)
        .optional(),
      transactionBase64: z.string().min(1).optional(),
      cuLimit: z.number().int().positive().optional(),
      cuPriceMicroLamports: z.number().int().nonnegative().optional(),
    })
    .refine(
      (s) => {
        const hasIxs = Array.isArray(s.instructions) && s.instructions.length > 0;
        const hasRaw = typeof s.transactionBase64 === "string" && s.transactionBase64.length > 0;
        return (hasIxs ? 1 : 0) + (hasRaw ? 1 : 0) <= 1;
      },
      {
        message: "Provide either solana.instructions OR solana.transactionBase64 (not both)",
        path: ["instructions"],
      },
    )
    .optional(),
  sui: z
    .object({
      moveCalls: z
        .array(
          z.object({
            target: z.string().min(1),
            arguments: z.array(
              z.discriminatedUnion("kind", [
                z.object({ kind: z.literal("object"), objectId: z.string().min(1) }),
                z.object({
                  kind: z.literal("pure"),
                  valueBase64: z.string().min(1),
                  bcsType: z.string().min(1),
                }),
                z.object({ kind: z.literal("address"), address: z.string().min(1) }),
              ]),
            ),
            typeArguments: z.array(z.string()).optional(),
          }),
        )
        .min(1)
        .optional(),
      transactionBase64: z.string().min(1).optional(),
      gasBudget: z.string().regex(/^\d+$/, "gasBudget must be a positive integer string (MIST)").optional(),
      gasPrice: z.string().regex(/^\d+$/, "gasPrice must be a positive integer string (MIST)").optional(),
    })
    .refine(
      (s) => {
        const hasMove = Array.isArray(s.moveCalls) && s.moveCalls.length > 0;
        const hasRaw = typeof s.transactionBase64 === "string" && s.transactionBase64.length > 0;
        return (hasMove ? 1 : 0) + (hasRaw ? 1 : 0) <= 1;
      },
      {
        message: "Provide either sui.moveCalls OR sui.transactionBase64 (not both)",
        path: ["moveCalls"],
      },
    )
    .optional(),
});

export const signTypedDataSchema = z.object({
  chainType: z.enum(["EVM", "SOLANA", "SUI"]).optional(),
  chainId: z.union([z.string().min(1), z.number().int().positive()], { message: "Chain is required (DB id or numeric chain ID)" }),
  signerId: z.string().min(1).optional(),
  domain: z.object({
    name: z.string(),
    version: z.string(),
    chainId: z.number(),
    verifyingContract: z.string(),
  }).optional(),
  types: z.record(z.array(z.object({ name: z.string(), type: z.string() }))).optional(),
  value: z.record(z.unknown()).optional(),
  solana: z.object({
    domain: z.object({
      name: z.string().min(1),
      version: z.string().min(1),
      chainId: z.number().int().positive(),
      verifyingProgramId: z.string().min(1).optional(),
      authority: z.string().min(1).optional(),
    }),
    structHash: z.string().regex(/^0x[a-fA-F0-9]{64}$/, "structHash must be a 32-byte 0x-prefixed hex string").optional(),
    // Optional raw preimage: provide either `rawPreimageBase64` or `rawPreimageHex` to sign exact bytes
    rawPreimageBase64: z.string().min(1).optional(),
    rawPreimageHex: z.string().regex(/^0x[0-9a-fA-F]+$/, "rawPreimageHex must be a 0x-prefixed hex string").optional(),
    payload: z.record(z.unknown()).optional(),
  }).optional(),
  sui: z.object({
    domain: z.object({
      name: z.string().min(1),
      version: z.string().min(1),
      chainId: z.number().int().positive(),
      verifyingPackageId: z.string().min(1).optional(),
      authority: z.string().min(1).optional(),
    }),
    structHash: z.string().regex(/^0x[a-fA-F0-9]{64}$/, "structHash must be a 32-byte 0x-prefixed hex string").optional(),
    rawPreimageBase64: z.string().min(1).optional(),
    rawPreimageHex: z.string().regex(/^0x[0-9a-fA-F]+$/, "rawPreimageHex must be a 0x-prefixed hex string").optional(),
    payload: z.record(z.unknown()).optional(),
  }).optional(),
}).superRefine((value, ctx) => {
  const chainType = value.chainType ?? "EVM";
  if (chainType === "EVM") {
    if (!value.domain) ctx.addIssue({ code: "custom", path: ["domain"], message: "domain is required for EVM signing" });
    if (!value.types) ctx.addIssue({ code: "custom", path: ["types"], message: "types are required for EVM signing" });
    if (!value.value) ctx.addIssue({ code: "custom", path: ["value"], message: "value is required for EVM signing" });
  } else if (chainType === "SOLANA") {
    if (!value.solana) ctx.addIssue({ code: "custom", path: ["solana"], message: "solana is required for SOLANA signing" });
    if (value.domain || value.types || value.value) {
      ctx.addIssue({ code: "custom", path: ["domain"], message: "Use solana payload instead of EVM typed-data fields for SOLANA signing" });
    }
    if (value.solana) {
      const hasStruct = typeof value.solana.structHash === "string" && value.solana.structHash.length > 0;
      const hasRawBase64 = typeof value.solana.rawPreimageBase64 === "string" && value.solana.rawPreimageBase64.length > 0;
      const hasRawHex = typeof value.solana.rawPreimageHex === "string" && value.solana.rawPreimageHex.length > 0;
      if (!hasStruct && !hasRawBase64 && !hasRawHex) {
        ctx.addIssue({ code: "custom", path: ["solana", "structHash"], message: "Provide either solana.structHash or solana.rawPreimageBase64/rawPreimageHex for SOLANA signing" });
      }
    }
  } else if (chainType === "SUI") {
    if (!value.sui) ctx.addIssue({ code: "custom", path: ["sui"], message: "sui is required for SUI signing" });
    if (value.domain || value.types || value.value || value.solana) {
      ctx.addIssue({ code: "custom", path: ["domain"], message: "Use sui payload instead of EVM/Solana fields for SUI signing" });
    }
    if (value.sui) {
      const hasStruct = typeof value.sui.structHash === "string" && value.sui.structHash.length > 0;
      const hasRawBase64 = typeof value.sui.rawPreimageBase64 === "string" && value.sui.rawPreimageBase64.length > 0;
      const hasRawHex = typeof value.sui.rawPreimageHex === "string" && value.sui.rawPreimageHex.length > 0;
      if (!hasStruct && !hasRawBase64 && !hasRawHex) {
        ctx.addIssue({ code: "custom", path: ["sui", "structHash"], message: "Provide either sui.structHash or sui.rawPreimageBase64/rawPreimageHex for SUI signing" });
      }
    }
  }
});

export const suiSponsorSignSchema = z.object({
  chainId: z.union([z.string().min(1), z.number().int().positive()]),
  sponsorSignerId: z.string().min(1).optional(),
  transactionKindBase64: z.string().min(1).optional(),
  transactionBase64: z.string().min(1).optional(),
  senderAddress: z.string().min(1).optional(),
  gasBudget: z.string().regex(/^\d+$/, "gasBudget must be a positive integer string (MIST)").optional(),
  gasPrice: z.string().regex(/^\d+$/, "gasPrice must be a positive integer string (MIST)").optional(),
}).superRefine((value, ctx) => {
  const hasKind = typeof value.transactionKindBase64 === "string" && value.transactionKindBase64.length > 0;
  const hasTx = typeof value.transactionBase64 === "string" && value.transactionBase64.length > 0;
  if (!hasKind && !hasTx) {
    ctx.addIssue({
      code: "custom",
      path: ["transactionKindBase64"],
      message: "Provide transactionKindBase64 or transactionBase64",
    });
  }
  if (hasKind && hasTx) {
    ctx.addIssue({
      code: "custom",
      path: ["transactionBase64"],
      message: "Provide either transactionKindBase64 or transactionBase64 (not both)",
    });
  }
});

export const suiExecuteSponsoredSchema = z.object({
  chainId: z.union([z.string().min(1), z.number().int().positive()]),
  transactionBlockBase64: z.string().min(1),
  signatures: z.array(z.string().min(1)).min(1).max(2).optional(),
  userSignature: z.string().min(1).optional(),
  sponsorSignature: z.string().min(1).optional(),
  /** User wallet address (ZkLogin or Ed25519). Optional — PTB sender from sponsor-sign is used when omitted. */
  senderAddress: z.string().min(1).optional(),
  /** MTXM signer row for tracking — optional; defaults to user, sponsor, or round-robin sponsor. */
  signerId: z.string().min(1).optional(),
  sponsorSignerId: z.string().min(1).optional(),
  track: z.boolean().optional(),
  to: z.string().min(1).optional(),
  metadata: z.record(z.unknown()).optional(),
}).superRefine((value, ctx) => {
  const fromArray = Array.isArray(value.signatures) && value.signatures.length >= 1;
  const fromFields = !!(value.userSignature || value.sponsorSignature);
  if (!fromArray && !fromFields) {
    ctx.addIssue({
      code: "custom",
      path: ["signatures"],
      message: "Provide at least one signature (or userSignature / sponsorSignature)",
    });
  }
});

export const transactionParamsSchema = z.object({
  projectId: z.string().min(1),
  txId: z.string().min(1),
});

export const transactionQuerySchema = z.object({
  status: z.string().optional(),
  chainId: z.string().optional(),
  from: z.string().optional(),
  to: z.string().optional(),
  page: z.coerce.number().int().positive().optional().default(1),
  limit: z.coerce.number().int().positive().max(100).optional().default(20),
});

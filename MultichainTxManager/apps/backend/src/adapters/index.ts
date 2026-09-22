import type { SignerKey } from "../generated/prisma/client.js";
import type { ethers } from "ethers";
import type { IKeyAdapter } from "./key-adapter.interface.js";
import { EnvKeyAdapter } from "./env-key-adapter.js";
import { KmsKeyAdapter } from "./kms-key-adapter.js";

// ────────────────────────────────────────────────────────────
// Adapter factory — selects implementation by signer config
// ────────────────────────────────────────────────────────────

export function createKeyAdapter(
  signerKey: SignerKey,
  provider?: ethers.Provider,
): IKeyAdapter {
  switch (signerKey.adapterType) {
    case "ENV": {
      if (!signerKey.encryptedKey) {
        throw new Error(`SignerKey ${signerKey.id} has no encryptedKey`);
      }
      return new EnvKeyAdapter(signerKey.encryptedKey, provider);
    }

    case "KMS": {
      if (!signerKey.kmsKeyId) {
        throw new Error(`SignerKey ${signerKey.id} has no kmsKeyId`);
      }
      return new KmsKeyAdapter(signerKey.kmsKeyId);
    }

    default:
      throw new Error(
        `Unknown adapter type: ${(signerKey as SignerKey).adapterType}`,
      );
  }
}

export type { IKeyAdapter } from "./key-adapter.interface.js";
export { EnvKeyAdapter } from "./env-key-adapter.js";
export { KmsKeyAdapter } from "./kms-key-adapter.js";

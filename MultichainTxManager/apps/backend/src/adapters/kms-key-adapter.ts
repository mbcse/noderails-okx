import {
  KMSClient,
  SignCommand,
  GetPublicKeyCommand,
  type SignCommandInput,
} from "@aws-sdk/client-kms";
import { ethers, type TransactionRequest } from "ethers";
import type { IKeyAdapter } from "./key-adapter.interface.js";
import { config } from "../config/index.js";
import { logger } from "../lib/logger.js";

// ────────────────────────────────────────────────────────────
// AWS KMS key adapter — signs digests with an ECC_SECG_P256K1 key
//
// The adapter:
//   1. Fetches the DER-encoded public key from KMS
//   2. Derives the Ethereum address from the uncompressed point
//   3. Signs message digests (keccak256) via KMS
//   4. Decodes the DER signature → (r, s), applies EIP-2 low-s,
//      then recovers v by trial
// ────────────────────────────────────────────────────────────

export class KmsKeyAdapter implements IKeyAdapter {
  private kms: KMSClient;
  private kmsKeyId: string;
  private cachedAddress: string | null = null;

  constructor(kmsKeyId: string) {
    this.kmsKeyId = kmsKeyId;
    this.kms = new KMSClient({
      region: config.aws.region,
      ...(config.aws.accessKeyId && {
        credentials: {
          accessKeyId: config.aws.accessKeyId,
          secretAccessKey: config.aws.secretAccessKey!,
        },
      }),
    });
  }

  // ── Public API ──────────────────────────────────────────────

  async getAddress(): Promise<string> {
    if (this.cachedAddress) return this.cachedAddress;

    const cmd = new GetPublicKeyCommand({ KeyId: this.kmsKeyId });
    const response = await this.kms.send(cmd);
    const derPublicKey = response.PublicKey!;

    // DER-encoded SubjectPublicKeyInfo → uncompressed EC point (65 bytes)
    const uncompressed = extractUncompressedPoint(Buffer.from(derPublicKey));
    // Ethereum address = last 20 bytes of keccak256(point_without_prefix)
    this.cachedAddress = ethers.computeAddress(
      ethers.hexlify(uncompressed),
    );

    logger.debug({ address: this.cachedAddress, kmsKeyId: this.kmsKeyId }, "KMS address derived");
    return this.cachedAddress;
  }

  async signTransaction(tx: TransactionRequest): Promise<string> {
    // Resolve any async address fields before serialization
    const resolvedTx: Record<string, unknown> = { ...tx };
    if (tx.to && typeof tx.to === "object" && "then" in (tx.to as object)) {
      resolvedTx.to = await tx.to;
    }

    const unsignedTx = ethers.Transaction.from(
      resolvedTx as ethers.TransactionLike,
    ).unsignedSerialized;
    const digest = ethers.keccak256(unsignedTx);
    const { r, s, v } = await this.signDigest(digest);

    const signedTx = ethers.Transaction.from({
      ...(resolvedTx as ethers.TransactionLike),
      signature: ethers.Signature.from({ r, s, v }),
    });
    return signedTx.serialized;
  }

  async signMessage(message: string | Uint8Array): Promise<string> {
    const messageBytes =
      typeof message === "string" ? ethers.toUtf8Bytes(message) : message;
    const prefixed = ethers.hashMessage(messageBytes);
    const { r, s, v } = await this.signDigest(prefixed);
    return ethers.Signature.from({ r, s, v }).serialized;
  }

  async signTypedData(
    domain: Record<string, unknown>,
    types: Record<string, Array<{ name: string; type: string }>>,
    value: Record<string, unknown>,
  ): Promise<string> {
    const digest = ethers.TypedDataEncoder.hash(domain, types, value);
    const { r, s, v } = await this.signDigest(digest);
    return ethers.Signature.from({ r, s, v }).serialized;
  }

  // ── Internal helpers ────────────────────────────────────────

  private async signDigest(
    digest: string,
  ): Promise<{ r: string; s: string; v: number }> {
    const digestBytes = ethers.getBytes(digest);

    const input: SignCommandInput = {
      KeyId: this.kmsKeyId,
      Message: digestBytes,
      MessageType: "DIGEST",
      SigningAlgorithm: "ECDSA_SHA_256",
    };

    const response = await this.kms.send(new SignCommand(input));
    const derSignature = Buffer.from(response.Signature!);

    let { r, s } = decodeDerSignature(derSignature);

    // EIP-2: enforce low-s (s must be in the lower half of the curve order)
    const secp256k1N = BigInt(
      "0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFEBAAEDCE6AF48A03BBFD25E8CD0364141",
    );
    const secp256k1HalfN = secp256k1N / 2n;

    if (s > secp256k1HalfN) {
      s = secp256k1N - s;
    }

    const rHex = "0x" + r.toString(16).padStart(64, "0");
    const sHex = "0x" + s.toString(16).padStart(64, "0");

    // Recover v by trial (27 or 28)
    const address = await this.getAddress();
    for (const v of [27, 28]) {
      const recovered = ethers.recoverAddress(digest, { r: rHex, s: sHex, v });
      if (recovered.toLowerCase() === address.toLowerCase()) {
        return { r: rHex, s: sHex, v };
      }
    }

    throw new Error("KMS signature recovery failed — could not determine v");
  }
}

// ────────────────────────────────────────────────────────────
// DER helpers
// ────────────────────────────────────────────────────────────

function decodeDerSignature(der: Buffer): { r: bigint; s: bigint } {
  // DER: 0x30 <len> 0x02 <r-len> <r> 0x02 <s-len> <s>
  let offset = 2; // skip 0x30 + total length

  // r
  if (der[offset] !== 0x02) throw new Error("Invalid DER: expected 0x02 for r");
  offset++;
  const rLen = der[offset++];
  const rBytes = der.subarray(offset, offset + rLen);
  offset += rLen;

  // s
  if (der[offset] !== 0x02) throw new Error("Invalid DER: expected 0x02 for s");
  offset++;
  const sLen = der[offset++];
  const sBytes = der.subarray(offset, offset + sLen);

  return {
    r: BigInt("0x" + Buffer.from(rBytes).toString("hex")),
    s: BigInt("0x" + Buffer.from(sBytes).toString("hex")),
  };
}

function extractUncompressedPoint(derPublicKey: Buffer): Buffer {
  // SubjectPublicKeyInfo wraps a BIT STRING containing the EC point.
  // The EC point for secp256k1 uncompressed is 65 bytes (0x04 + x + y).
  // We look for the 0x04 prefix in the last 65 bytes.
  const point = derPublicKey.subarray(derPublicKey.length - 65);
  if (point[0] !== 0x04) {
    throw new Error("Expected uncompressed EC point (0x04 prefix)");
  }
  return point;
}

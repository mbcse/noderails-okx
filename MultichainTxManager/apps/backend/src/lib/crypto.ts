import {
  randomBytes,
  createCipheriv,
  createDecipheriv,
  createHmac,
} from "node:crypto";
import { nanoid } from "nanoid";
import { config } from "../config/index.js";

// ────────────────────────────────────────────────────────────
// AES-256-GCM encryption (for storing private keys at rest)
// ────────────────────────────────────────────────────────────

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12; // 96 bits — GCM recommended IV length

export function encrypt(plaintext: string): string {
  const key = Buffer.from(config.encryption.key, "hex");
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv);

  const encrypted = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();

  // Format: iv:tag:ciphertext (all hex-encoded)
  return [iv, tag, encrypted].map((b) => b.toString("hex")).join(":");
}

export function decrypt(ciphertext: string): string {
  const key = Buffer.from(config.encryption.key, "hex");
  const parts = ciphertext.split(":");
  if (parts.length !== 3) {
    throw new Error("Malformed ciphertext: expected iv:tag:data format");
  }
  const [ivHex, tagHex, encHex] = parts;

  const decipher = createDecipheriv(
    ALGORITHM,
    key,
    Buffer.from(ivHex, "hex"),
  );
  decipher.setAuthTag(Buffer.from(tagHex, "hex"));

  return Buffer.concat([
    decipher.update(Buffer.from(encHex, "hex")),
    decipher.final(),
  ]).toString("utf8");
}

// ────────────────────────────────────────────────────────────
// Token / secret generators
// ────────────────────────────────────────────────────────────

export function generateApiKey(): string {
  return `mtxm_${nanoid(32)}`;
}

export function generateWebhookSecret(): string {
  return `whsec_${nanoid(40)}`;
}

export function generateDeliveryId(): string {
  return `dlv_${nanoid(24)}`;
}

// ────────────────────────────────────────────────────────────
// Webhook payload: canonical JSON (deterministic key order for signing)
// ────────────────────────────────────────────────────────────

/**
 * Stringify with sorted object keys so the same payload always produces
 * the same string. Signatures are computed over this string; receivers
 * must verify using the raw request body (before any JSON parsing).
 */
export function canonicalJsonStringify(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return "[" + value.map((v) => canonicalJsonStringify(v)).join(",") + "]";
  }
  const keys = Object.keys(value as Record<string, unknown>).sort();
  const parts = keys.map((k) => JSON.stringify(k) + ":" + canonicalJsonStringify((value as Record<string, unknown>)[k]));
  return "{" + parts.join(",") + "}";
}

// ────────────────────────────────────────────────────────────
// HMAC-SHA256 (for webhook payload signing)
// ────────────────────────────────────────────────────────────

export function hmacSha256(secret: string, payload: string): string {
  return createHmac("sha256", secret).update(payload).digest("hex");
}

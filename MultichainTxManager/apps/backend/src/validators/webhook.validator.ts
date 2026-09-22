import { z } from "zod";

const VALID_EVENTS = [
  "tx.signing",
  "tx.signed",
  "tx.broadcasting",
  "tx.broadcast",
  "tx.confirmed",
  "tx.failed",
  "tx.stuck",
  "tx.cancelled",
  "tx.speed_up",
] as const;

/**
 * Reject URLs targeting private/internal networks (SSRF prevention).
 * Blocks localhost, link-local, RFC-1918 ranges, and cloud metadata endpoints.
 */
function isSafeWebhookUrl(raw: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    return false;
  }

  // Only allow http(s)
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return false;

  const host = parsed.hostname.toLowerCase();

  // Block localhost variants
  if (host === "localhost" || host === "127.0.0.1" || host === "[::1]" || host === "0.0.0.0") return false;

  // Block cloud metadata endpoints
  if (host === "169.254.169.254" || host === "metadata.google.internal") return false;

  // Block RFC-1918 / link-local ranges
  const parts = host.split(".").map(Number);
  if (parts.length === 4 && parts.every((n) => !isNaN(n))) {
    if (parts[0] === 10) return false;
    if (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) return false;
    if (parts[0] === 192 && parts[1] === 168) return false;
    if (parts[0] === 169 && parts[1] === 254) return false;
  }

  return true;
}

const safeUrlSchema = z
  .string()
  .url("Invalid webhook URL")
  .refine(isSafeWebhookUrl, "Webhook URL must be a public http(s) endpoint (internal/private IPs are blocked)");

export const createWebhookSchema = z.object({
  url: safeUrlSchema,
  events: z
    .array(z.enum(VALID_EVENTS))
    .min(1, "At least one event is required"),
});

export const updateWebhookSchema = z.object({
  url: safeUrlSchema.optional(),
  events: z.array(z.enum(VALID_EVENTS)).min(1).optional(),
  isActive: z.boolean().optional(),
});

export const webhookParamsSchema = z.object({
  projectId: z.string().min(1),
  webhookId: z.string().min(1),
});

export const deliveryParamsSchema = z.object({
  projectId: z.string().min(1),
  webhookId: z.string().min(1),
  deliveryId: z.string().min(1),
});

export const deliveryQuerySchema = z.object({
  event: z.string().optional(),
  statusCode: z.coerce.number().int().optional(),
  page: z.coerce.number().int().positive().optional().default(1),
  limit: z.coerce.number().int().positive().max(100).optional().default(20),
});

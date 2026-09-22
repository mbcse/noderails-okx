/**
 * Minimal webhook receiver for testing MultichainTxManager webhook deliveries.
 *
 * Usage:
 *   npx tsx apps/backend/test/webhook-receiver.ts
 *   npx tsx apps/backend/test/webhook-receiver.ts 9999   # custom port
 *
 * Then register http://localhost:9876 (or your custom port) as a webhook
 * endpoint in the dashboard. All incoming webhook deliveries are logged
 * with their signature, event type, and full payload.
 */

import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { createHmac } from "node:crypto";

const PORT = parseInt(process.argv[2] || "9876", 10);

// If you paste your webhook secret here, the receiver will verify signatures.
// Otherwise it just prints whatever comes in.
const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET || "";

// ── Colours for terminal output ──────────────────────────────
const C = {
  reset: "\x1b[0m",
  dim: "\x1b[2m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  cyan: "\x1b[36m",
  red: "\x1b[31m",
  bold: "\x1b[1m",
};

function timestamp(): string {
  return new Date().toISOString().replace("T", " ").slice(0, 19);
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk) => chunks.push(chunk));
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf-8")));
    req.on("error", reject);
  });
}

function verifySignature(secret: string, body: string, header: string | undefined): boolean {
  if (!secret || !header) return false;
  const expected = `sha256=${createHmac("sha256", secret).update(body).digest("hex")}`;
  return expected === header;
}

let deliveryCount = 0;

const server = createServer(async (req: IncomingMessage, res: ServerResponse) => {
  // Health check
  if (req.method === "GET" && req.url === "/health") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ ok: true, deliveries: deliveryCount }));
    return;
  }

  // Only accept POST
  if (req.method !== "POST") {
    res.writeHead(405);
    res.end("Method Not Allowed");
    return;
  }

  try {
    const body = await readBody(req);
    deliveryCount++;

    const event = req.headers["x-webhook-event"] as string | undefined;
    const deliveryId = req.headers["x-delivery-id"] as string | undefined;
    const signature = req.headers["x-signature-256"] as string | undefined;

    console.log(
      `\n${C.bold}${C.cyan}━━━ Webhook #${deliveryCount} ━━━━━━━━━━━━━━━━━━━━━━━━━━━${C.reset}`,
    );
    console.log(`${C.dim}${timestamp()}${C.reset}`);
    console.log(`${C.green}Event:${C.reset}       ${event ?? "—"}`);
    console.log(`${C.green}Delivery ID:${C.reset} ${deliveryId ?? "—"}`);
    console.log(`${C.green}Signature:${C.reset}   ${signature ?? "—"}`);

    // Verify signature if secret is set
    if (WEBHOOK_SECRET) {
      const valid = verifySignature(WEBHOOK_SECRET, body, signature);
      console.log(
        `${C.green}Sig valid:${C.reset}   ${valid ? `${C.green}✓ YES` : `${C.red}✗ NO`}${C.reset}`,
      );
    }

    // Pretty-print payload
    try {
      const parsed = JSON.parse(body);
      console.log(`${C.green}Payload:${C.reset}`);
      console.log(JSON.stringify(parsed, null, 2));
    } catch {
      console.log(`${C.yellow}Raw body:${C.reset} ${body.slice(0, 2000)}`);
    }

    // Always respond 200 so the webhook delivery worker doesn't retry
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ received: true }));
  } catch (err) {
    console.error(`${C.red}Error processing webhook:${C.reset}`, err);
    res.writeHead(500);
    res.end("Internal Server Error");
  }
});

server.listen(PORT, () => {
  console.log(`${C.bold}${C.cyan}🔔 Webhook receiver listening on http://localhost:${PORT}${C.reset}`);
  console.log(`${C.dim}   Health check: GET http://localhost:${PORT}/health${C.reset}`);
  if (WEBHOOK_SECRET) {
    console.log(`${C.dim}   Verifying signatures with provided WEBHOOK_SECRET${C.reset}`);
  } else {
    console.log(`${C.dim}   Set WEBHOOK_SECRET env var to enable signature verification${C.reset}`);
  }
  console.log(`${C.dim}   Ctrl+C to stop\n${C.reset}`);
});

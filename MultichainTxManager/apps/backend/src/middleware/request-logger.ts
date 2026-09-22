import { randomUUID } from "node:crypto";
import type { NextFunction, Request, Response } from "express";
import { logger } from "../lib/logger.js";

const QUIET_PATHS = new Set(["/health"]);
const WRITE_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);
const PATH_VERBS = new Set([
  "send",
  "sign-typed",
  "sponsor-sign",
  "execute-sponsored",
  "fund",
  "emergency-transfer",
  "activate",
  "deactivate",
  "set-master",
  "unset-master",
  "reset-nonce",
  "test",
  "retry",
  "rotate-secret",
]);

function requestPath(req: Request): string {
  const raw = req.originalUrl || req.url || "";
  return raw.split("?")[0] || raw;
}

function actionLabel(method: string, path: string): string {
  const leaf = path.split("/").filter(Boolean).at(-1) ?? "";
  if (method === "POST" && leaf === "send") return "tx.send";
  if (method === "POST" && leaf === "sign-typed") return "tx.sign-typed";
  if (method === "POST" && leaf === "sponsor-sign") return "tx.sponsor-sign";
  if (method === "POST" && leaf === "execute-sponsored") return "tx.execute-sponsored";
  if (method === "POST" && leaf === "fund") return "signer.fund";
  if (method === "POST" && leaf === "emergency-transfer") return "signer.transfer";
  if (method === "POST" && leaf === "reset-nonce") return "signer.reset-nonce";
  return `${method} ${path}`;
}

function pathId(path: string, segment: string): string | undefined {
  const match = path.match(new RegExp(`/${segment}/([^/]+)`));
  const value = match?.[1];
  if (!value || PATH_VERBS.has(value)) return undefined;
  return value;
}

function pickString(value: unknown): string | undefined {
  if (typeof value === "string" && value.trim()) return value;
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return undefined;
}

function requestContext(req: Request): Record<string, unknown> {
  const path = requestPath(req);
  const ctx: Record<string, unknown> = {};

  const projectId = pathId(path, "projects") ?? req.project?.id;
  const signerId = pathId(path, "signers");
  const txId = pathId(path, "transactions");
  const webhookId = pathId(path, "webhooks");
  const chainDbId = pathId(path, "chains");

  if (projectId) ctx.projectId = projectId;
  if (signerId) ctx.signerId = signerId;
  if (txId) ctx.txId = txId;
  if (webhookId) ctx.webhookId = webhookId;
  if (chainDbId) ctx.chainDbId = chainDbId;

  if (req.user?.id) {
    ctx.auth = "jwt";
    ctx.userId = req.user.id;
  } else if (req.project?.id) {
    ctx.auth = "api-key";
  }

  const body = req.body && typeof req.body === "object"
    ? req.body as Record<string, unknown>
    : null;
  if (body) {
    const bodySignerId = pickString(body.signerId);
    const bodyChainId = pickString(body.chainId) ?? pickString(body.chainDbId);
    const to = pickString(body.to) ?? pickString(body.toAddress);
    const from = pickString(body.from);
    const value = pickString(body.value) ?? pickString(body.amountWei);
    const nonce = pickString(body.nonce) ?? pickString(body.forceNonce);

    if (bodySignerId && !ctx.signerId) ctx.signerId = bodySignerId;
    if (bodyChainId) ctx.chainId = bodyChainId;
    if (to) ctx.to = to;
    if (from) ctx.from = from;
    if (value) ctx.value = value;
    if (nonce) ctx.nonce = nonce;
  }

  return ctx;
}

function responseIds(body: unknown): Record<string, unknown> {
  if (!body || typeof body !== "object") return {};
  const data = (body as { data?: unknown }).data;
  if (!data || typeof data !== "object") return {};
  const row = data as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  const mtxmId = pickString(row.id);
  const hash = pickString(row.hash) ?? pickString(row.txHash) ?? pickString(row.digest);
  const status = pickString(row.status);
  const nonce = pickString(row.nonce);
  if (mtxmId) out.mtxmId = mtxmId;
  if (hash) out.hash = hash;
  if (status) out.txStatus = status;
  if (nonce && out.nonce == null) out.nonce = nonce;
  return out;
}

/** Info for writes and errors; debug for routine GETs. */
export function requestLogger(req: Request, res: Response, next: NextFunction): void {
  const path = requestPath(req);
  if (QUIET_PATHS.has(path)) {
    next();
    return;
  }

  const reqId = randomUUID().slice(0, 8);
  const started = Date.now();
  let captured: Record<string, unknown> = {};

  const originalJson = res.json.bind(res);
  res.json = ((body: unknown) => {
    captured = responseIds(body);
    return originalJson(body);
  }) as Response["json"];

  res.on("finish", () => {
    const status = res.statusCode;
    const ms = Date.now() - started;
    const payload: Record<string, unknown> = {
      reqId,
      method: req.method,
      path,
      status,
      ms,
      ...requestContext(req),
      ...captured,
    };
    const mtxmId = typeof payload.mtxmId === "string" ? payload.mtxmId : undefined;
    const idBit = mtxmId ? ` mtxmId=${mtxmId}` : "";
    const message = `request: ${actionLabel(req.method, path)} ${status} ${ms}ms${idBit}`;
    const notable = WRITE_METHODS.has(req.method) || status >= 400;
    if (notable) {
      logger.info(payload, message);
    } else {
      logger.debug(payload, message);
    }
  });

  next();
}

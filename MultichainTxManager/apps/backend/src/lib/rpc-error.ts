const DEFAULT_TRUNCATE = 200;

function firstNonEmpty(...values: Array<unknown>): string | null {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value;
  }
  return null;
}

/** Best-effort short message from ethers / JSON-RPC / generic errors. */
export function extractErrorMessage(err: unknown): string {
  if (err == null) return "unknown error";
  if (typeof err === "string") return err;

  if (typeof err === "object") {
    const e = err as {
      shortMessage?: unknown;
      message?: unknown;
      info?: { error?: { message?: unknown; code?: unknown } };
      cause?: { message?: unknown; shortMessage?: unknown };
    };

    const extracted = firstNonEmpty(
      e.shortMessage,
      e.message,
      e.info?.error?.message,
      e.cause?.shortMessage,
      e.cause?.message,
    );
    if (extracted) return extracted;
  }

  return String(err);
}

/** Collapse HTML / multiline RPC bodies to a single ~200-char line. */
export function truncateRpcError(err: unknown, max = DEFAULT_TRUNCATE): string {
  const raw = extractErrorMessage(err);
  const firstLine = raw.split(/\r?\n/, 1)[0] ?? raw;
  const cleaned = firstLine.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim() || "unknown error";
  if (cleaned.length <= max) return cleaned;
  return `${cleaned.slice(0, max)}…`;
}

function extractErrorCode(err: unknown): string | number | undefined {
  if (err == null || typeof err !== "object") return undefined;
  const e = err as {
    code?: unknown;
    info?: { error?: { code?: unknown } };
    cause?: { code?: unknown };
  };
  return (e.code ?? e.info?.error?.code ?? e.cause?.code) as string | number | undefined;
}

/** Public SUI fullnodes returning JSON-RPC deprecation / method-not-found (-32601). */
export function isSuiJsonRpcDeprecated(err: unknown): boolean {
  const code = extractErrorCode(err);
  if (code === -32601 || code === "-32601") return true;

  const msg = extractErrorMessage(err).toLowerCase();
  return (
    msg.includes("method not found") ||
    msg.includes("json-rpc on public fullnodes has been deprecated") ||
    (msg.includes("json-rpc") && msg.includes("deprecated"))
  );
}

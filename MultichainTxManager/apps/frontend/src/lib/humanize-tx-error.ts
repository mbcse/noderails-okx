/** Short, human-readable title for a stored transaction errorMessage. */
export function humanizeTxError(errorMessage: string | null | undefined): string {
  if (!errorMessage?.trim()) return "Transaction failed";

  const msg = errorMessage.toLowerCase();

  if (msg.includes("insufficient funds") || msg.includes("insufficient balance")) {
    return "Insufficient funds";
  }
  if (msg.includes("execution reverted") || msg.includes("always failing")) {
    return "Contract reverted";
  }
  if (msg.includes("reverted on-chain")) {
    return "Reverted on-chain";
  }
  if (msg.includes("timed out") || msg.includes("timeout")) {
    return "RPC timeout";
  }
  if (
    msg.includes("nonce too low") ||
    msg.includes("nonce has already") ||
    msg.includes("nonce collision")
  ) {
    return "Nonce conflict";
  }
  if (
    msg.includes("object version") ||
    msg.includes("version expired") ||
    msg.includes("objectnotfound")
  ) {
    return "SUI object version expired";
  }
  if (
    msg.includes("method not found") ||
    (msg.includes("json-rpc") && msg.includes("deprecated"))
  ) {
    return "SUI RPC unavailable";
  }
  if (msg.includes("replacement") && msg.includes("underpriced")) {
    return "Replacement underpriced";
  }
  if (msg.includes("intrinsic gas")) {
    return "Gas too low";
  }
  if (msg.includes("blockhash expired")) {
    return "Solana blockhash expired";
  }

  const first = (errorMessage.split(/[\n.]/, 1)[0] ?? errorMessage).trim();
  if (first.length > 80) return `${first.slice(0, 77)}…`;
  return first || "Transaction failed";
}

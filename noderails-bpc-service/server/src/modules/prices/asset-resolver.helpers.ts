export function buildTokenKey(symbol: string, chainId: number): string {
  return `${symbol.toUpperCase()}-${chainId}`;
}

export function splitTrailingChainId(value: string): { head: string; chainId: number } | null {
  const idx = value.lastIndexOf('-');
  if (idx <= 0) return null;
  const tail = value.slice(idx + 1);
  if (!/^\d+$/.test(tail)) return null;
  const chainId = parseInt(tail, 10);
  if (!Number.isFinite(chainId) || chainId <= 0) return null;
  return { head: value.slice(0, idx), chainId };
}

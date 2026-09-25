/** Drop networks that have no payable tokens after resolution filters. */
export function filterChainsWithTokens<T extends { chainId: number }>(
  chains: T[],
  tokens: Array<{ chainId: number }>,
): T[] {
  const chainIdsWithTokens = new Set(tokens.map((t) => t.chainId));
  return chains.filter((c) => chainIdsWithTokens.has(c.chainId));
}

const LEANRPC_BASE = 'https://rpc.leanrpc.xyz/rpc';
const DEFAULT_LEANRPC_API_KEY = 'ak_8166c2e4adfb1fc508ee8d1680f507c4';

/** LeanRPC URL — primary EVM RPC across NodeRails (matches @noderails/common). */
export function getLeanRpcUrl(chainId: number, apiKey?: string): string {
  const key = apiKey ?? process.env.LEANRPC_API_KEY ?? DEFAULT_LEANRPC_API_KEY;
  return `${LEANRPC_BASE}?chainId=${chainId}&apiKey=${key}`;
}

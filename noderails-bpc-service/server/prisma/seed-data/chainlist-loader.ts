import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { ChainType } from '@prisma/client';
import { getLeanRpcUrl } from '../../src/lib/leanrpc.js';

const CHAINLIST_URL = 'https://chainlist.org/rpcs.json';
const LOCAL_CHAINLIST = join(dirname(fileURLToPath(import.meta.url)), 'chainlist-rpcs.json');

export interface SeedChain {
  chainId: number;
  chainType: ChainType;
  name: string;
  displayName: string;
  nativeCurrencySymbol: string;
  nativeCurrencyDecimals: number;
  explorerUrl: string | null;
  coingeckoPlatformId: string | null;
  isTestnet: boolean;
  rpcUrls: string[];
}

interface ChainlistEntry {
  name?: string;
  chainId?: number;
  testnet?: boolean;
  nativeCurrency?: { symbol?: string; decimals?: number };
  explorers?: Array<{ url?: string }>;
  rpc?: Array<string | { url?: string }>;
}

function slugify(name: string, chainId: number): string {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return slug || `chain-${chainId}`;
}

function isValidHttpsRpc(url: string): boolean {
  if (!url.startsWith('https://')) return false;
  if (url.length > 512) return false;
  if (url.includes('${') || url.includes('{API') || url.includes('YOUR_')) return false;
  if (url.includes('apiKey=') || url.includes('api_key=')) return false;
  if (url.includes('polkadot.js.org/apps')) return false;
  return true;
}

function extractRpcUrls(entry: ChainlistEntry): string[] {
  const seen = new Set<string>();
  const urls: string[] = [];

  for (const rpc of entry.rpc ?? []) {
    const raw = typeof rpc === 'string' ? rpc : rpc.url;
    if (!raw || typeof raw !== 'string') continue;
    const url = raw.trim();
    if (!isValidHttpsRpc(url) || seen.has(url)) continue;
    seen.add(url);
    urls.push(url);
  }

  return urls;
}

async function loadChainlistJson(): Promise<ChainlistEntry[]> {
  try {
    const res = await fetch(CHAINLIST_URL, { signal: AbortSignal.timeout(30_000) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return (await res.json()) as ChainlistEntry[];
  } catch (err) {
    console.warn(`Chainlist fetch failed (${String(err)}), using bundled seed-data/chainlist-rpcs.json`);
    const raw = readFileSync(LOCAL_CHAINLIST, 'utf8');
    return JSON.parse(raw) as ChainlistEntry[];
  }
}

/** Parse chainlist.org data into BPC chain + RPC rows (LeanRPC first for every EVM chain). */
export async function loadEvmChainsFromChainlist(): Promise<SeedChain[]> {
  const entries = await loadChainlistJson();
  const leanRpcKey = process.env.LEANRPC_API_KEY;
  const chains: SeedChain[] = [];

  for (const entry of entries) {
    if (typeof entry.chainId !== 'number' || entry.chainId <= 0 || entry.chainId > 2_147_483_647) continue;

    const publicRpcs = extractRpcUrls(entry);
    if (publicRpcs.length === 0) continue;

    const displayName = entry.name?.trim() || `Chain ${entry.chainId}`;
    const leanRpc = getLeanRpcUrl(entry.chainId, leanRpcKey);
    const rpcUrls = [leanRpc, ...publicRpcs.filter((u) => u !== leanRpc)];

    chains.push({
      chainId: entry.chainId,
      chainType: 'EVM',
      name: slugify(displayName, entry.chainId),
      displayName,
      nativeCurrencySymbol: entry.nativeCurrency?.symbol?.toUpperCase() || 'ETH',
      nativeCurrencyDecimals: entry.nativeCurrency?.decimals ?? 18,
      explorerUrl: entry.explorers?.[0]?.url?.trim() ?? null,
      coingeckoPlatformId: null,
      isTestnet: entry.testnet === true,
      rpcUrls,
    });
  }

  chains.sort((a, b) => a.chainId - b.chainId);
  return chains;
}

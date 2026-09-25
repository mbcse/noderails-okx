export type EscrowTrackedKind = 'swapRouters' | 'bridgeRouters' | 'settlementTokens';

export interface EscrowTrackedAddresses {
  swapRouters: string[];
  bridgeRouters: string[];
  settlementTokens: string[];
}

const EMPTY: EscrowTrackedAddresses = {
  swapRouters: [],
  bridgeRouters: [],
  settlementTokens: [],
};

function storageKey(chainId: number) {
  return `noderails-admin-escrow-tracked-${chainId}`;
}

export function loadEscrowTrackedAddresses(chainId: number): EscrowTrackedAddresses {
  if (typeof window === 'undefined') return { ...EMPTY };
  try {
    const raw = window.localStorage.getItem(storageKey(chainId));
    if (!raw) return { ...EMPTY };
    const parsed = JSON.parse(raw) as Partial<EscrowTrackedAddresses>;
    return {
      swapRouters: Array.isArray(parsed.swapRouters) ? parsed.swapRouters : [],
      bridgeRouters: Array.isArray(parsed.bridgeRouters) ? parsed.bridgeRouters : [],
      settlementTokens: Array.isArray(parsed.settlementTokens) ? parsed.settlementTokens : [],
    };
  } catch {
    return { ...EMPTY };
  }
}

export function saveEscrowTrackedAddresses(chainId: number, data: EscrowTrackedAddresses) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(storageKey(chainId), JSON.stringify(data));
}

export function addEscrowTrackedAddress(
  chainId: number,
  kind: EscrowTrackedKind,
  address: string,
): EscrowTrackedAddresses {
  const current = loadEscrowTrackedAddresses(chainId);
  const list = current[kind];
  const normalized = address.toLowerCase();
  if (!list.some((a) => a.toLowerCase() === normalized)) {
    list.push(address);
  }
  saveEscrowTrackedAddresses(chainId, current);
  return { ...current };
}

export function removeEscrowTrackedAddress(
  chainId: number,
  kind: EscrowTrackedKind,
  address: string,
): EscrowTrackedAddresses {
  const current = loadEscrowTrackedAddresses(chainId);
  const normalized = address.toLowerCase();
  current[kind] = current[kind].filter((a) => a.toLowerCase() !== normalized);
  saveEscrowTrackedAddresses(chainId, current);
  return { ...current };
}

export interface EscrowTxRecord {
  hash: string;
  label: string;
  chainId: number;
  at: string;
}

const TX_KEY = 'noderails-admin-escrow-recent-txs';

export function loadRecentEscrowTxs(): EscrowTxRecord[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(TX_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function pushRecentEscrowTx(record: EscrowTxRecord) {
  if (typeof window === 'undefined') return;
  const next = [record, ...loadRecentEscrowTxs()].slice(0, 20);
  window.localStorage.setItem(TX_KEY, JSON.stringify(next));
  return next;
}

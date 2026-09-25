export type Family = 'EVM' | 'SOLANA' | 'SUI';
export type SendMode = 'now' | 'once' | 'recurring';
export type WorkspaceTab = 'send' | 'recipients' | 'activity';

export type PayoutRow = { recipient: string; amount: string; email?: string };

export type PayoutContact = {
  id: string;
  label: string;
  wallet: string;
  family: string;
  email?: string | null;
};

export function sameEvmAddress(a?: string | null, b?: string | null): boolean {
  return Boolean(a && b && a.toLowerCase() === b.toLowerCase());
}

export function shortWallet(addr: string): string {
  const value = addr.trim();
  if (value.length < 12) return value;
  return `${value.slice(0, 6)}…${value.slice(-4)}`;
}

export type PayoutDisplayStatus =
  | 'PENDING'
  | 'SCHEDULED'
  | 'PROCESSING'
  | 'EXECUTED'
  | 'FAILED'
  | 'CANCELLED';

function latestPayoutTx(payout: { transactions?: Array<{ createdAt?: string; type?: string; status?: string }> }) {
  const txs = Array.isArray(payout.transactions) ? payout.transactions : [];
  const payoutTxs = txs.filter((tx) => !tx.type || tx.type === 'PAYOUT');
  return [...payoutTxs].sort(
    (a, b) => new Date(b.createdAt ?? 0).getTime() - new Date(a.createdAt ?? 0).getTime(),
  )[0];
}

/** On-chain / MTXM status for Activity, not the raw create-time intent status. */
export function payoutDisplayStatus(payout: {
  status?: string;
  txHash?: string | null;
  transactions?: Array<{ createdAt?: string; type?: string; status?: string }>;
}): PayoutDisplayStatus {
  const txStatus = latestPayoutTx(payout)?.status;
  if (txStatus === 'FAILED' || payout.status === 'FAILED') return 'FAILED';
  if (txStatus === 'CONFIRMED') return 'EXECUTED';
  if (txStatus === 'PENDING') return 'PROCESSING';
  if (payout.status === 'EXECUTED') return 'EXECUTED';
  if (payout.status === 'CANCELLED') return 'CANCELLED';
  if (payout.status === 'SCHEDULED') return 'SCHEDULED';
  if (payout.txHash && payout.status === 'PENDING') return 'PROCESSING';
  return 'PENDING';
}

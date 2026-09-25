'use client';

import { useCallback, useEffect, useState } from 'react';
import { ArrowUpRight, Check, Copy, ExternalLink, Loader2, X } from 'lucide-react';
import {
  blockExplorerAddressUrl,
  blockExplorerTxUrl,
  chainDisplayName,
  isNativeToken,
} from '@noderails/common';
import { Table } from '@/components/ui';
import { Badge } from '@/components/ui/badge';
import { StatusBadge as SharedStatusBadge, MetaBadge } from '@/components/status-badge';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { Spinner } from '@/components/ui/loading';
import { Sheet, SheetContent } from '@/components/ui/sheet';
import { CopyableId } from '@/components/filter-nav';
import { useAuth } from '@/lib/auth';
import * as api from '@/lib/api';
import { useChainRegistry } from '@/lib/use-chain-registry';
import { payoutDisplayStatus, sameEvmAddress, shortWallet, type Family, type PayoutContact } from './payouts-types';

const statusConfig: Record<string, { variant: 'success' | 'warning' | 'destructive' | 'outline'; label: string }> = {
  PENDING: { variant: 'warning', label: 'Pending' },
  SCHEDULED: { variant: 'warning', label: 'Scheduled' },
  PROCESSING: { variant: 'warning', label: 'Processing' },
  EXECUTED: { variant: 'success', label: 'Executed' },
  FAILED: { variant: 'destructive', label: 'Failed' },
  CANCELLED: { variant: 'outline', label: 'Cancelled' },
};

function StatusBadge({ status }: { status: string }) {
  const config = statusConfig[status] ?? { variant: 'outline' as const, label: status };
  return <Badge variant={config.variant}>{config.label}</Badge>;
}

function TxStatusBadge({ status }: { status: string }) {
  const map: Record<string, 'success' | 'warning' | 'destructive' | 'outline'> = {
    PENDING: 'warning',
    CONFIRMED: 'success',
    FAILED: 'destructive',
  };
  return <Badge variant={map[status] ?? 'outline'}>{status}</Badge>;
}

function CopyField({ value, label, mono = true }: { value: string; label?: string; mono?: boolean }) {
  const [copied, setCopied] = useState(false);

  const copy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch { /* ignore */ }
  }, [value]);

  return (
    <div className="group flex items-center gap-1.5 min-w-0">
      {label && <span className="text-xs text-muted-foreground shrink-0">{label}:</span>}
      <span className={`text-sm text-foreground truncate ${mono ? 'font-mono text-xs' : ''}`}>
        {value}
      </span>
      <button
        type="button"
        onClick={copy}
        className="shrink-0 opacity-0 group-hover:opacity-100 transition-opacity p-0.5 rounded hover:bg-muted"
        title="Copy"
      >
        {copied ? (
          <Check className="h-3 w-3 text-emerald-700" />
        ) : (
          <Copy className="h-3 w-3 text-muted-foreground" />
        )}
      </button>
    </div>
  );
}

function DetailRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between py-2.5 border-b border-border/50 last:border-0">
      <span className="text-xs font-medium text-muted-foreground shrink-0 w-36">{label}</span>
      <div className="text-right min-w-0">{children}</div>
    </div>
  );
}

function formatDateTime(dateStr: string | null | undefined) {
  if (!dateStr) return '-';
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return '-';
  return d.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatDate(dateStr: string | null | undefined) {
  if (!dateStr) return '-';
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return '-';
  return d.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function timeAgo(dateStr: string) {
  const seconds = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function payoutLines(payout: any): Array<{ recipient: string; amount: string }> {
  if (Array.isArray(payout.lines) && payout.lines.length > 0) {
    return payout.lines.map((line: any) => ({
      recipient: String(line.recipient ?? ''),
      amount: String(line.amount ?? ''),
    }));
  }
  return [{
    recipient: String(payout.recipientWallet ?? ''),
    amount: String(payout.tokenAmount ?? ''),
  }];
}

function atomicFromStored(raw: unknown): bigint | null {
  if (raw == null || raw === '') return null;
  const s = String(raw).trim();
  const whole = /^(\d+)(?:\.0+)?$/.exec(s)?.[1];
  if (!whole) return null;
  try {
    return BigInt(whole);
  } catch {
    return null;
  }
}

function sameWallet(a?: string | null, b?: string | null): boolean {
  if (!a || !b) return false;
  if (a.startsWith('0x') && b.startsWith('0x')) return sameEvmAddress(a, b);
  return a === b;
}

function contactLabel(wallet: string, contacts: PayoutContact[]): string | null {
  return contacts.find((c) => sameWallet(c.wallet, wallet))?.label ?? null;
}

function resolveTokenLabel(
  payout: any,
  fallback: string,
  registry?: { [chainId: number]: { nativeCurrencySymbol?: string } },
): string {
  if (!isNativeToken(payout.tokenAddress)) return fallback;
  const chainNum = Number(payout.chain);
  return (Number.isFinite(chainNum) && registry?.[chainNum]?.nativeCurrencySymbol) || fallback;
}

function usdLabel(raw: unknown): string | null {
  if (raw == null || raw === '') return null;
  const n = Number(raw);
  if (!Number.isFinite(n) || n === 0) return null;
  return `$${n.toFixed(2)}`;
}

function feePercentLabel(bps: number): string {
  return `${(bps / 100).toFixed(2).replace(/\.?0+$/, '')}%`;
}

function PayoutDetailSheet({
  payout,
  contacts,
  schedules,
  saving,
  formatAtomic,
  familyForPayout,
  decimalsForPayout,
  tokenLabelForPayout,
  onClose,
  onExecute,
  onCancelPayout,
}: {
  payout: any;
  contacts: PayoutContact[];
  schedules: any[];
  saving: boolean;
  formatAtomic: (amount: string, decimals: number) => string;
  familyForPayout: (payout: any) => Family;
  decimalsForPayout: (payout: any) => number;
  tokenLabelForPayout: (payout: any) => string;
  onClose: () => void;
  onExecute: (id: string) => void;
  onCancelPayout: (id: string) => void;
}) {
  const { registry: chainRegistry } = useChainRegistry();
  const chainNum = Number(payout.chain);
  const hasChain = Number.isFinite(chainNum);
  const chainId = hasChain ? chainNum : null;
  const decimals = decimalsForPayout(payout);
  const tokenSymbol = resolveTokenLabel(payout, tokenLabelForPayout(payout), chainRegistry);
  const family = familyForPayout(payout);
  const lines = payoutLines(payout);
  const amountAtomic = atomicFromStored(payout.tokenAmount);
  const feeBps = Number(payout.feeBps ?? 0);
  const feeAtomic = amountAtomic != null && feeBps > 0
    ? (amountAtomic * BigInt(feeBps)) / 10000n
    : null;
  const merchantPays = amountAtomic != null && feeAtomic != null
    ? amountAtomic + feeAtomic
    : null;
  const usd = usdLabel(payout.amountUsd);
  const transactions = Array.isArray(payout.transactions) ? payout.transactions : [];
  const sortedTxs = [...transactions].sort(
    (a: any, b: any) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );
  const schedule = payout.scheduleId
    ? schedules.find((s: any) => s.id === payout.scheduleId)
    : null;
  const displayStatus = payoutDisplayStatus(payout);
  const canExecute = family !== 'SUI' && !payout.txHash && displayStatus !== 'PROCESSING' && (
    payout.status === 'PENDING'
    || payout.status === 'SCHEDULED'
    || payout.status === 'FAILED'
  );
  const canCancel = !payout.txHash && (payout.status === 'PENDING' || payout.status === 'SCHEDULED');
  const txUrl = payout.txHash && chainId != null
    ? blockExplorerTxUrl(chainId, payout.txHash, chainRegistry)
    : null;
  const tokenUrl = chainId != null && payout.tokenAddress && !isNativeToken(payout.tokenAddress)
    ? blockExplorerAddressUrl(chainId, payout.tokenAddress, chainRegistry)
    : null;

  return (
    <Sheet open onOpenChange={(open) => { if (!open) onClose(); }}>
      <SheetContent side="right" className="sm:max-w-lg p-0 overflow-y-auto" showCloseButton={false}>
        <div className="sticky top-0 bg-card border-b border-border px-6 py-4 flex items-center justify-between z-10">
          <div>
            <h2 className="text-lg font-semibold text-foreground">Payout Details</h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              {formatDateTime(payout.createdAt)}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-muted transition-colors"
          >
            <X className="h-4 w-4 text-muted-foreground" />
          </button>
        </div>

        <div className="px-6 py-5 space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-3xl font-semibold text-foreground">
                {formatAtomic(String(payout.tokenAmount ?? ''), decimals)}
                <span className="ml-1.5 text-lg font-medium text-muted-foreground">{tokenSymbol}</span>
              </p>
              {usd && (
                <p className="text-sm text-muted-foreground mt-0.5">{usd} USD record</p>
              )}
            </div>
            <StatusBadge status={displayStatus} />
          </div>

          {(canExecute || canCancel) && (
            <div className="flex gap-2">
              {canExecute && (
                <Button
                  type="button"
                  size="sm"
                  className="flex-1"
                  disabled={saving}
                  onClick={() => onExecute(payout.id)}
                >
                  {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : payout.status === 'FAILED' ? 'Retry' : 'Execute'}
                </Button>
              )}
              {canCancel && (
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className="flex-1"
                  disabled={saving}
                  onClick={() => onCancelPayout(payout.id)}
                >
                  Cancel
                </Button>
              )}
            </div>
          )}

          {payout.error && (
            <div className="rounded-lg bg-destructive/10 border border-destructive/30 px-3.5 py-3 text-xs text-destructive break-words">
              {payout.error}
            </div>
          )}

          <div>
            <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
              Identifiers
            </h3>
            <div className="bg-muted rounded-lg p-3.5 space-y-2">
              <CopyField label="Payout ID" value={payout.id} />
              {payout.nonce && <CopyField label="Nonce" value={payout.nonce} />}
              {payout.scheduleId && <CopyField label="Schedule ID" value={payout.scheduleId} />}
            </div>
          </div>

          {(feeBps > 0 || merchantPays != null) && (
            <div>
              <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                Fee Breakdown
              </h3>
              <div className="bg-muted rounded-lg p-3.5 space-y-0">
                {feeBps > 0 && (
                  <DetailRow label="Platform Fee">
                    <span className="text-sm text-foreground">
                      {feePercentLabel(feeBps)}
                      <span className="text-xs text-muted-foreground/60 ml-1">({feeBps} bps)</span>
                    </span>
                  </DetailRow>
                )}
                <DetailRow label="Recipients get">
                  <span className="text-sm text-foreground">
                    {formatAtomic(String(payout.tokenAmount ?? ''), decimals)} {tokenSymbol}
                  </span>
                </DetailRow>
                {feeAtomic != null && (
                  <DetailRow label="Fee">
                    <span className="text-sm text-muted-foreground">
                      +{formatAtomic(feeAtomic.toString(), decimals)} {tokenSymbol}
                    </span>
                  </DetailRow>
                )}
                {merchantPays != null && (
                  <DetailRow label="Merchant pays">
                    <span className="text-sm font-medium text-foreground">
                      {formatAtomic(merchantPays.toString(), decimals)} {tokenSymbol}
                    </span>
                  </DetailRow>
                )}
                {usd && (
                  <DetailRow label="USD record">
                    <span className="text-sm text-muted-foreground">{usd}</span>
                  </DetailRow>
                )}
              </div>
            </div>
          )}

          <div>
            <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
              Recipients ({lines.length})
            </h3>
            <div className="space-y-2">
              {lines.map((line, i) => {
                const label = contactLabel(line.recipient, contacts);
                const addrUrl = chainId != null
                  ? blockExplorerAddressUrl(chainId, line.recipient, chainRegistry)
                  : null;
                return (
                  <div key={`${line.recipient}-${i}`} className="bg-muted rounded-lg p-3.5 space-y-1.5">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-medium text-foreground truncate">
                        {label ?? shortWallet(line.recipient)}
                      </span>
                      <span className="font-mono text-sm text-foreground shrink-0">
                        {formatAtomic(line.amount, decimals)} {tokenSymbol}
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5 min-w-0">
                      <CopyField value={line.recipient} />
                      {addrUrl && (
                        <a
                          href={addrUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="shrink-0 p-0.5 rounded hover:bg-muted transition-colors"
                          title="View on explorer"
                        >
                          <ExternalLink className="h-3 w-3 text-muted-foreground" />
                        </a>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div>
            <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
              Token & Network
            </h3>
            <div className="bg-muted rounded-lg p-3.5 space-y-0">
              {hasChain && (
                <DetailRow label="Network">
                  <span className="text-sm text-foreground">{chainDisplayName(chainId!, chainRegistry)}</span>
                  <span className="text-xs text-muted-foreground/60 ml-1.5">({chainId})</span>
                </DetailRow>
              )}
              <DetailRow label="Token">
                <span className="text-sm font-medium text-foreground">{tokenSymbol}</span>
                {isNativeToken(payout.tokenAddress) && (
                  <span className="text-xs text-muted-foreground/60 ml-1.5">native</span>
                )}
              </DetailRow>
              {payout.tokenAddress && (
                <DetailRow label="Token address">
                  <div className="flex items-center gap-1.5 justify-end">
                    <CopyField value={payout.tokenAddress} />
                    {tokenUrl && (
                      <a
                        href={tokenUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="shrink-0 p-0.5 rounded hover:bg-muted transition-colors"
                        title="View on explorer"
                      >
                        <ExternalLink className="h-3 w-3 text-muted-foreground" />
                      </a>
                    )}
                  </div>
                </DetailRow>
              )}
              <DetailRow label="Family">
                <MetaBadge hint="chain">{family}</MetaBadge>
              </DetailRow>
            </div>
          </div>

          <div>
            <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
              Wallets
            </h3>
            <div className="bg-muted rounded-lg p-3.5 space-y-0">
              {payout.merchantWallet && (
                <DetailRow label="Paying from">
                  <div className="flex items-center gap-1.5 justify-end">
                    <CopyField value={payout.merchantWallet} />
                    {chainId != null && blockExplorerAddressUrl(chainId, payout.merchantWallet, chainRegistry) && (
                      <a
                        href={blockExplorerAddressUrl(chainId, payout.merchantWallet, chainRegistry) ?? '#'}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="shrink-0 p-0.5 rounded hover:bg-muted transition-colors"
                        title="View on explorer"
                      >
                        <ExternalLink className="h-3 w-3 text-muted-foreground" />
                      </a>
                    )}
                  </div>
                </DetailRow>
              )}
            </div>
          </div>

          <div>
            <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
              Timing
            </h3>
            <div className="bg-muted rounded-lg p-3.5 space-y-0">
              <DetailRow label="Created">
                <span className="text-sm text-foreground">{formatDateTime(payout.createdAt)}</span>
              </DetailRow>
              {payout.scheduledAt && (
                <DetailRow label="Scheduled">
                  <span className="text-sm text-foreground">{formatDateTime(payout.scheduledAt)}</span>
                </DetailRow>
              )}
              {payout.executedAt && (
                <DetailRow label="Executed">
                  <span className="text-sm text-foreground">{formatDateTime(payout.executedAt)}</span>
                </DetailRow>
              )}
              {payout.sessionExpiry && (
                <DetailRow label="Session expiry">
                  <span className="text-sm text-foreground">{formatDateTime(payout.sessionExpiry)}</span>
                </DetailRow>
              )}
              {schedule && (
                <DetailRow label="Schedule">
                  <span className="text-sm text-foreground">
                    Every {schedule.intervalDays} days · {schedule.status}
                  </span>
                </DetailRow>
              )}
            </div>
          </div>

          {payout.sessionSignature && (
            <div>
              <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                Authorization
              </h3>
              <div className="bg-muted rounded-lg p-3.5 space-y-2">
                <CopyField label="Session signature" value={payout.sessionSignature} />
              </div>
            </div>
          )}

          {(payout.txHash || sortedTxs.length > 0) && (
            <div>
              <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                Transactions{sortedTxs.length > 0 ? ` (${sortedTxs.length})` : ''}
              </h3>
              {payout.txHash && (
                <div className="bg-muted rounded-lg p-3.5 mb-2 space-y-1.5">
                  <div className="flex items-center justify-between mb-1">
                    <Badge variant="outline">Payout</Badge>
                    <StatusBadge status={displayStatus} />
                  </div>
                  <div className="flex items-center gap-1.5">
                    <CopyField label="Hash" value={payout.txHash} />
                    {txUrl && (
                      <a
                        href={txUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="shrink-0 p-0.5 rounded hover:bg-muted transition-colors"
                        title="View on explorer"
                      >
                        <ExternalLink className="h-3 w-3 text-muted-foreground" />
                      </a>
                    )}
                  </div>
                </div>
              )}
              <div className="space-y-2">
                {sortedTxs.map((tx: any) => {
                  const txChain = Number(tx.chain);
                  const txChainId = Number.isFinite(txChain) ? txChain : chainId;
                  const hashUrl = tx.txHash && txChainId != null
                    ? blockExplorerTxUrl(txChainId, tx.txHash, chainRegistry)
                    : null;
                  return (
                    <div key={tx.id} className="bg-muted rounded-lg p-3.5">
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <MetaBadge variant="secondary">{tx.type}</MetaBadge>
                          <TxStatusBadge status={tx.status} />
                        </div>
                        {tx.createdAt && (
                          <span className="text-xs text-muted-foreground/60">
                            {timeAgo(tx.createdAt)}
                          </span>
                        )}
                      </div>
                      <div className="space-y-1.5">
                        <CopyField label="Tx ID" value={tx.id} />
                        {tx.txHash && (
                          <div className="flex items-center gap-1.5">
                            <CopyField label="Hash" value={tx.txHash} />
                            {hashUrl && (
                              <a
                                href={hashUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="shrink-0 p-0.5 rounded hover:bg-muted transition-colors"
                                title="View on explorer"
                              >
                                <ExternalLink className="h-3 w-3 text-muted-foreground" />
                              </a>
                            )}
                          </div>
                        )}
                        {tx.mtxmTxId && <CopyField label="MTXM ID" value={tx.mtxmTxId} />}
                        {tx.chain && (
                          <div className="flex items-center gap-1.5">
                            <span className="text-xs text-muted-foreground shrink-0">Chain:</span>
                            <span className="text-xs text-foreground">{tx.chain}</span>
                          </div>
                        )}
                        {tx.error && (
                          <div className="mt-1 text-xs text-destructive bg-destructive/10 rounded px-2 py-1">
                            {tx.error}
                          </div>
                        )}
                        {tx.confirmedAt && (
                          <div className="flex items-center gap-1.5">
                            <span className="text-xs text-muted-foreground">Confirmed:</span>
                            <span className="text-xs text-foreground">{formatDateTime(tx.confirmedAt)}</span>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

export function PayoutActivityPanel({
  schedules,
  payouts,
  contacts,
  saving,
  formatAtomic,
  familyForPayout,
  decimalsForPayout,
  tokenLabelForPayout,
  onPause,
  onResume,
  onCancelSchedule,
  onExecute,
  onCancelPayout,
  onRefreshPayouts,
}: {
  schedules: any[];
  payouts: any[];
  contacts: PayoutContact[];
  saving: boolean;
  formatAtomic: (amount: string, decimals: number) => string;
  familyForPayout: (payout: any) => Family;
  decimalsForPayout: (payout: any) => number;
  tokenLabelForPayout: (payout: any) => string;
  onPause: (id: string) => void;
  onResume: (id: string) => void;
  onCancelSchedule: (id: string) => void;
  onExecute: (id: string) => Promise<void>;
  onCancelPayout: (id: string) => Promise<void>;
  onRefreshPayouts: () => Promise<void>;
}) {
  const { token } = useAuth();
  const { registry: chainRegistry } = useChainRegistry();
  const [selected, setSelected] = useState<any>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);

  const openDetail = useCallback(async (payoutId: string) => {
    setLoadingDetail(true);
    try {
      if (token) {
        const detail = await api.getPayout(token, payoutId);
        setSelected(detail);
        return;
      }
    } catch {
      // fall through to list row
    } finally {
      setLoadingDetail(false);
    }
    const fromList = payouts.find((p: any) => p.id === payoutId);
    if (fromList) setSelected(fromList);
  }, [token, payouts]);

  const runAndRefresh = useCallback(async (payoutId: string, action: (id: string) => Promise<void>) => {
    await action(payoutId);
    if (!token) return;
    try {
      setSelected(await api.getPayout(token, payoutId));
    } catch {
      const fromList = payouts.find((p: any) => p.id === payoutId);
      if (fromList) setSelected(fromList);
    }
  }, [token, payouts]);

  useEffect(() => {
    const processing = payouts.some((p) => payoutDisplayStatus(p) === 'PROCESSING')
      || (selected != null && payoutDisplayStatus(selected) === 'PROCESSING');
    if (!processing) return;
    const timer = setInterval(() => {
      void onRefreshPayouts();
      if (selected?.id && token) {
        void api.getPayout(token, selected.id).then(setSelected).catch(() => {});
      }
    }, 4000);
    return () => clearInterval(timer);
  }, [payouts, selected, token, onRefreshPayouts]);

  return (
    <div className="space-y-6">
      <section>
        <h2 className="text-sm font-semibold text-foreground">Schedules</h2>
        <p className="mt-0.5 mb-3 text-xs text-muted-foreground">Recurring payouts that fire on an interval.</p>
        {schedules.length === 0 ? (
          <p className="text-xs text-muted-foreground">No schedules yet.</p>
        ) : (
          <Table headers={['Interval', 'Next run', 'Status', '']}>
            {schedules.map((s: any) => (
              <tr key={s.id}>
                <td className="px-4 py-3 text-[13px]">Every {s.intervalDays} days</td>
                <td className="px-4 py-3 text-[13px] text-muted-foreground">
                  {s.nextRunAt ? new Date(s.nextRunAt).toLocaleString() : '-'}
                </td>
                <td className="px-4 py-3"><SharedStatusBadge status={s.status} /></td>
                <td className="px-4 py-3 text-right space-x-2">
                  {s.status === 'ACTIVE' && (
                    <Button type="button" size="sm" variant="secondary" disabled={saving} onClick={() => onPause(s.id)}>
                      Pause
                    </Button>
                  )}
                  {s.status === 'PAUSED' && (
                    <Button type="button" size="sm" variant="secondary" disabled={saving} onClick={() => onResume(s.id)}>
                      Resume
                    </Button>
                  )}
                  {s.status !== 'CANCELLED' && (
                    <Button type="button" size="sm" variant="ghost" disabled={saving} onClick={() => onCancelSchedule(s.id)}>
                      Cancel
                    </Button>
                  )}
                </td>
              </tr>
            ))}
          </Table>
        )}
      </section>

      <section>
        <h2 className="text-sm font-semibold text-foreground">History</h2>
        <p className="mt-0.5 mb-3 text-xs text-muted-foreground">
          Click a payout for IDs, wallets, fees, and transactions.
        </p>
        {payouts.length === 0 ? (
          <EmptyState
            icon={ArrowUpRight}
            title="No payouts yet"
            description="No payouts yet."
          />
        ) : (
          <div className="overflow-x-auto rounded-[10px] border border-border bg-card shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">Payout</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">Amount</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">Recipients</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">Network</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">Status</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">Tx</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">Created</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/50">
                {payouts.map((p: any) => {
                  const dec = decimalsForPayout(p);
                  const symbol = resolveTokenLabel(p, tokenLabelForPayout(p), chainRegistry);
                  const lines = payoutLines(p);
                  const firstLabel = contactLabel(lines[0]?.recipient ?? '', contacts);
                  const chainNum = Number(p.chain);
                  const hasChain = Number.isFinite(chainNum);
                  const explorer = p.txHash && hasChain
                    ? blockExplorerTxUrl(chainNum, p.txHash, chainRegistry)
                    : null;
                  const usd = usdLabel(p.amountUsd);

                  return (
                    <tr
                      key={p.id}
                      className="hover:bg-muted/50 transition-colors cursor-pointer group"
                      onClick={() => void openDetail(p.id)}
                      title="Click to view details"
                    >
                      <td className="px-4 py-3.5">
                        <div className="flex items-center gap-2">
                          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-muted">
                            <ArrowUpRight className="h-3.5 w-3.5 text-secondary-foreground" />
                          </div>
                          <div>
                            <CopyableId value={p.id} chars={6} />
                            {p.scheduleId && (
                              <p className="text-[10px] text-muted-foreground/60 mt-0.5">Scheduled</p>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3.5">
                        <span className="font-medium text-foreground">
                          {formatAtomic(String(p.tokenAmount ?? ''), dec)}
                        </span>
                        <span className="text-xs text-muted-foreground/60 ml-1">{symbol}</span>
                        {usd && (
                          <p className="text-[10px] text-muted-foreground/60 mt-0.5">{usd}</p>
                        )}
                      </td>
                      <td className="px-4 py-3.5">
                        <span className="text-sm text-foreground">
                          {firstLabel ?? shortWallet(lines[0]?.recipient ?? '')}
                        </span>
                        {lines.length > 1 && (
                          <p className="text-[10px] text-muted-foreground/60 mt-0.5">
                            +{lines.length - 1} more
                          </p>
                        )}
                      </td>
                      <td className="px-4 py-3.5">
                        {hasChain ? (
                          <span className="text-sm text-secondary-foreground">
                            {chainDisplayName(chainNum, chainRegistry)}
                          </span>
                        ) : (
                          <span className="text-muted-foreground/60">-</span>
                        )}
                      </td>
                      <td className="px-4 py-3.5">
                        <StatusBadge status={payoutDisplayStatus(p)} />
                      </td>
                      <td className="px-4 py-3.5">
                        {p.txHash ? (
                          <div className="flex items-center gap-1">
                            <CopyableId value={p.txHash} chars={4} />
                            {explorer && (
                              <a
                                href={explorer}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="p-0.5 rounded hover:bg-muted transition-colors"
                                title="View on explorer"
                                onClick={(e) => e.stopPropagation()}
                              >
                                <ExternalLink className="h-3 w-3 text-muted-foreground" />
                              </a>
                            )}
                          </div>
                        ) : (
                          <span className="text-muted-foreground/60">-</span>
                        )}
                      </td>
                      <td className="px-4 py-3.5">
                        <span className="text-xs text-muted-foreground">{formatDate(p.createdAt)}</span>
                        {p.createdAt && (
                          <p className="text-[10px] text-muted-foreground/60 mt-0.5">{timeAgo(p.createdAt)}</p>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {selected && (
        <PayoutDetailSheet
          payout={selected}
          contacts={contacts}
          schedules={schedules}
          saving={saving}
          formatAtomic={formatAtomic}
          familyForPayout={familyForPayout}
          decimalsForPayout={decimalsForPayout}
          tokenLabelForPayout={tokenLabelForPayout}
          onClose={() => setSelected(null)}
          onExecute={(id) => { void runAndRefresh(id, onExecute); }}
          onCancelPayout={(id) => { void runAndRefresh(id, onCancelPayout); }}
        />
      )}

      {loadingDetail && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/10">
          <div className="bg-card rounded-xl p-6 shadow-lg">
            <Spinner />
          </div>
        </div>
      )}
    </div>
  );
}

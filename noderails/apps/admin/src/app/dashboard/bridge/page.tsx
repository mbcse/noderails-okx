'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { blockExplorerAddressUrl } from '@noderails/common';
import { Card, Badge, Select, Spinner, EmptyState, Button, Input } from '@/components/ui';
import { Alert, PageHeader } from '@/components/page';
import { useAdminAuth } from '@/lib/auth';
import * as api from '@/lib/api';
import { Check, Copy, ExternalLink, RefreshCw } from 'lucide-react';
import {
  type BridgeRow,
  type PipelineState,
  bridgeBadge,
  chainLabel,
  destMismatch,
  explorerTx,
  formatToken,
  parseLiFi,
  paymentBadge,
  pipelineSteps,
  shortHash,
  timeAgo,
  tokenSymbol,
} from './bridge-view';

const POLL_MS = 8_000;

const STATUS_OPTIONS = [
  { value: '', label: 'All statuses' },
  { value: 'pending', label: 'Pending' },
  { value: 'done', label: 'Done' },
  { value: 'failed', label: 'Failed' },
  { value: 'refunded', label: 'Refunded' },
  { value: 'retrying', label: 'Retrying' },
  { value: 'stuck', label: 'Stuck' },
  { value: 'stuck_settling', label: 'Stuck settling' },
  { value: 'stuck_settled', label: 'Stuck settled' },
];

function asBridgeRow(value: unknown): BridgeRow {
  return value as BridgeRow;
}

function HashLink({
  hash,
  chainId,
  href,
}: {
  hash: string | null | undefined;
  chainId?: number | null;
  href?: string | null;
}) {
  const [copied, setCopied] = useState(false);
  if (!hash) return <span className="text-[#a3acb9]">—</span>;
  const url = href ?? explorerTx(chainId, hash);
  return (
    <span className="inline-flex items-center gap-1 font-mono text-xs">
      <button
        type="button"
        className="text-[#425466] hover:text-[#0a2540]"
        title={hash}
        onClick={() => {
          void navigator.clipboard.writeText(hash);
          setCopied(true);
          setTimeout(() => setCopied(false), 1600);
        }}
      >
        {shortHash(hash)}
      </button>
      {copied ? <Check className="h-3 w-3 text-[#097c43]" /> : <Copy className="h-3 w-3 opacity-40" />}
      {url && (
        <a href={url} target="_blank" rel="noopener noreferrer" title="View on explorer">
          <ExternalLink className="h-3 w-3 text-[#697386] hover:text-[#0a2540]" />
        </a>
      )}
    </span>
  );
}

function stepColor(state: PipelineState): string {
  if (state === 'done') return 'bg-[#097c43]';
  if (state === 'failed') return 'bg-[#df1b41]';
  if (state === 'active') return 'bg-[#635bff] animate-pulse';
  return 'bg-[#d1d8e0]';
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <p className="text-[11px] font-medium uppercase tracking-wider text-[#697386]">{label}</p>
      <div className="mt-1 text-sm text-[#0a2540] break-words">{children}</div>
    </div>
  );
}

export default function BridgePaymentsPage() {
  const { token } = useAdminAuth();
  const [items, setItems] = useState<BridgeRow[]>([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState('');
  const [queryDraft, setQueryDraft] = useState('');
  const [query, setQuery] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<BridgeRow | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [actionPending, setActionPending] = useState<string | null>(null);
  const [lastRefresh, setLastRefresh] = useState<string | null>(null);
  const [liveOn, setLiveOn] = useState(true);
  const [showRaw, setShowRaw] = useState(false);

  const loadList = useCallback(async (silent = false) => {
    if (!token) return;
    try {
      if (!silent) setLoading(true);
      const params: Record<string, string> = { page: String(page), pageSize: '25' };
      if (status) params.status = status;
      if (query) params.q = query;
      const result = await api.getBridgePayments(token, params);
      setItems((result.items ?? []).map(asBridgeRow));
      setTotal(result.total ?? 0);
      setTotalPages(result.totalPages ?? 1);
      setLastRefresh(new Date().toISOString());
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [token, status, query, page]);

  const loadDetail = useCallback(async (id: string, silent = false) => {
    if (!token) return;
    try {
      if (!silent) setDetailLoading(true);
      const row = asBridgeRow(await api.getBridgePayment(token, id));
      setDetail(row);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setDetailLoading(false);
    }
  }, [token]);

  useEffect(() => {
    void loadList();
  }, [loadList]);

  useEffect(() => {
    if (!selectedId) {
      setDetail(null);
      return;
    }
    void loadDetail(selectedId);
  }, [selectedId, loadDetail]);

  useEffect(() => {
    if (!token || !liveOn) return;
    const tick = () => {
      if (document.visibilityState !== 'visible') return;
      void loadList(true);
      if (selectedId) void loadDetail(selectedId, true);
    };
    const timer = window.setInterval(tick, POLL_MS);
    return () => window.clearInterval(timer);
  }, [token, liveOn, selectedId, loadList, loadDetail]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const next = queryDraft.trim();
      if (next === query) return;
      setPage(1);
      setQuery(next);
    }, 400);
    return () => window.clearTimeout(timer);
  }, [queryDraft, query]);

  const selected = detail ?? items.find((row) => row.id === selectedId) ?? null;
  const live = selected?.live;
  const liveLiFi = parseLiFi(live?.lifi);
  const storedLiFi = parseLiFi(selected?.bridgeLastStatusPayload);
  const lifi = liveLiFi ?? storedLiFi;
  const steps = selected ? pipelineSteps(selected) : [];
  const decimals = live?.destTokenDecimals ?? selected?.cryptoTokenDecimals ?? 6;
  const destSymbol = live?.destTokenSymbol ?? tokenSymbol(selected?.settlementTokenKey ?? selected?.cryptoTokenKey);
  const sourceSymbol = tokenSymbol(selected?.authorizationTokenKey ?? selected?.cryptoTokenKey);
  const mismatch = selected ? destMismatch(selected) : false;

  const destBalanceNote = useMemo(() => {
    if (!selected || !live?.destEscrowTokenBalance || live.destCreditConsumedOnChain) return null;
    try {
      const bal = BigInt(live.destEscrowTokenBalance);
      const promised = BigInt(selected.promisedSettlementAmount ?? '0');
      if (bal > 0n && promised > 0n && bal >= promised) {
        return 'Dest escrow holds at least the promised amount. Stuck dest credit can finish this payment.';
      }
      if (bal > 0n) {
        return 'Dest escrow has leftover tokens below the promised amount.';
      }
    } catch {
      return null;
    }
    return null;
  }, [selected, live]);

  async function runAction(kind: 'retry' | 'stuck') {
    if (!token || !selectedId) return;
    setActionPending(kind);
    setError(null);
    try {
      if (kind === 'retry') await api.retryBridgePayment(token, selectedId);
      else await api.stuckCreditBridgePayment(token, selectedId);
      await loadList(true);
      await loadDetail(selectedId, true);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setActionPending(null);
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Operations"
        title="Bridge transfers"
        description="Live LI.FI and dest-escrow status for single-chain settlements. Retry and stuck credit still go through MTXM."
        actions={
          <div className="flex items-center gap-3 text-xs text-[#697386]">
            <span className="inline-flex items-center gap-1.5">
              <span className={`h-2 w-2 rounded-full ${liveOn ? 'bg-[#097c43]' : 'bg-[#d1d8e0]'}`} />
              {liveOn ? 'Live' : 'Paused'}
              {lastRefresh ? ` · ${timeAgo(lastRefresh)}` : ''}
            </span>
            <Button size="sm" variant="secondary" onClick={() => setLiveOn((on) => !on)}>
              {liveOn ? 'Pause' : 'Resume'}
            </Button>
            <Button
              size="sm"
              variant="secondary"
              onClick={() => {
                void loadList();
                if (selectedId) void loadDetail(selectedId);
              }}
            >
              <RefreshCw className="h-3.5 w-3.5" />
              Refresh
            </Button>
          </div>
        }
      />

      <div className="flex flex-wrap items-end gap-3">
        <div className="w-56">
          <Select
            value={status}
            onChange={(e) => {
              setPage(1);
              setStatus(e.target.value);
            }}
            options={STATUS_OPTIONS}
          />
        </div>
        <div className="w-72">
          <Input
            placeholder="Search payment id"
            value={queryDraft}
            onChange={(e) => setQueryDraft(e.target.value)}
          />
        </div>
        <p className="pb-2 text-xs text-[#697386]">{total} transfers</p>
      </div>

      {error && <Alert onDismiss={() => setError(null)}>{error}</Alert>}

      {loading && items.length === 0 ? (
        <Spinner />
      ) : items.length === 0 ? (
        <EmptyState title="No bridged payments" description="LI.FI transfers will appear here." />
      ) : (
        <Card className="p-0 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wider text-[#697386]">
                  <th className="px-4 py-3">Payment</th>
                  <th className="px-4 py-3">Merchant</th>
                  <th className="px-4 py-3">Route</th>
                  <th className="px-4 py-3">Amounts</th>
                  <th className="px-4 py-3">LI.FI</th>
                  <th className="px-4 py-3">Dest</th>
                  <th className="px-4 py-3">Updated</th>
                </tr>
              </thead>
              <tbody>
                {items.map((row) => {
                  const lifiStatus = row.bridgeLiFiStatus ?? row.bridgeStatus;
                  const active = row.id === selectedId;
                  return (
                    <tr
                      key={row.id}
                      className={`border-t border-[#e3e8ee] cursor-pointer ${active ? 'bg-[#f0f0ff]' : 'hover:bg-[#f6f8fa]'}`}
                      onClick={() => setSelectedId(row.id)}
                    >
                      <td className="px-4 py-3">
                        <div className="font-mono text-xs text-[#0a2540]">{row.id.slice(0, 8)}</div>
                        <div className="mt-1">
                          <Badge variant={paymentBadge(row.status)}>{row.status}</Badge>
                        </div>
                      </td>
                      <td className="px-4 py-3">{row.app?.merchant?.orgName ?? row.app?.name ?? '—'}</td>
                      <td className="px-4 py-3 text-xs">
                        {chainLabel(row.authorizationChainId)} → {chainLabel(row.settlementChainId)}
                      </td>
                      <td className="px-4 py-3 text-xs">
                        <div>
                          {formatToken(row.settleAmount, row.cryptoTokenDecimals)} {tokenSymbol(row.authorizationTokenKey ?? row.cryptoTokenKey)}
                        </div>
                        <div className="text-[#697386]">
                          dest {formatToken(row.promisedSettlementAmount, row.cryptoTokenDecimals)} {tokenSymbol(row.settlementTokenKey ?? row.cryptoTokenKey)}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <Badge variant={bridgeBadge(lifiStatus)}>{lifiStatus ?? '—'}</Badge>
                        {row.bridgeLiFiSubstatus && (
                          <div className="mt-1 text-[11px] text-[#697386]">{row.bridgeLiFiSubstatus}</div>
                        )}
                        <div className="mt-1 text-[11px] text-[#697386]">retry {row.settleBridgeRetryCount ?? 0}/4</div>
                      </td>
                      <td className="px-4 py-3">
                        <Badge variant={row.settlementCreditConsumed ? 'success' : 'warning'}>
                          {row.settlementCreditConsumed ? 'consumed' : 'open'}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 text-xs text-[#697386]">{timeAgo(row.updatedAt)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {totalPages > 1 && (
            <div className="flex items-center justify-between border-t border-[#e3e8ee] px-4 py-3 text-xs text-[#697386]">
              <span>Page {page} of {totalPages}</span>
              <div className="flex gap-2">
                <Button size="sm" variant="secondary" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
                  Previous
                </Button>
                <Button size="sm" variant="secondary" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>
                  Next
                </Button>
              </div>
            </div>
          )}
        </Card>
      )}

      {selected && (
        <Card>
          <div className="flex items-start justify-between gap-3 mb-4">
            <div>
              <h3 className="text-sm font-semibold text-[#0a2540]">Live bridge status</h3>
              <p className="mt-1 font-mono text-xs text-[#697386]">{selected.id}</p>
            </div>
            <button
              type="button"
              className="text-xs text-[#635bff]"
              onClick={() => {
                setSelectedId(null);
                setDetail(null);
                setShowRaw(false);
              }}
            >
              Close
            </button>
          </div>

          <div className="mb-5 grid grid-cols-2 gap-3 md:grid-cols-4">
            {steps.map((step, index) => (
              <div key={step.key} className="relative rounded-lg border border-[#e3e8ee] bg-[#f6f9fc] p-3">
                <div className="flex items-center gap-2">
                  <span className={`h-2.5 w-2.5 rounded-full ${stepColor(step.state)}`} />
                  <p className="text-xs font-semibold text-[#0a2540]">
                    {index + 1}. {step.label}
                  </p>
                </div>
                <p className="mt-2 text-[11px] text-[#697386]">{step.detail}</p>
              </div>
            ))}
          </div>

          {mismatch && (
            <p className="mb-4 rounded-lg border border-[#fde68a] bg-[#fef9ee] px-3 py-2 text-xs text-[#9e6c00]">
              DB dest consumed is {selected.settlementCreditConsumed ? 'yes' : 'no'}, on-chain is{' '}
              {live?.destCreditConsumedOnChain ? 'yes' : 'no'}. Trust the on-chain value.
            </p>
          )}
          {destBalanceNote && (
            <p className="mb-4 rounded-lg border border-[#d4d2ff] bg-[#f0f0ff] px-3 py-2 text-xs text-[#635bff]">
              {destBalanceNote}
            </p>
          )}
          {selected.bridgeLastError && (
            <p className="mb-4 rounded-lg border border-[#fbb8c5] bg-[#fdf2f4] px-3 py-2 text-xs text-[#df1b41]">
              {selected.bridgeLastError}
            </p>
          )}
          {live?.lifiError && (
            <p className="mb-4 rounded-lg border border-[#fde68a] bg-[#fef9ee] px-3 py-2 text-xs text-[#9e6c00]">
              Live LI.FI poll failed: {live.lifiError}
            </p>
          )}
          {live?.destOnChainError && (
            <p className="mb-4 rounded-lg border border-[#fde68a] bg-[#fef9ee] px-3 py-2 text-xs text-[#9e6c00]">
              Dest on-chain read failed: {live.destOnChainError}
            </p>
          )}

          {detailLoading && !live ? (
            <Spinner />
          ) : (
            <div className="space-y-5">
              <div className="grid gap-4 md:grid-cols-3">
                <Field label="Payment">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant={paymentBadge(selected.status)}>{selected.status}</Badge>
                    <span>{selected.amount} {selected.currency}</span>
                  </div>
                </Field>
                <Field label="Merchant">
                  {selected.app?.merchant?.orgName ?? selected.app?.name ?? '—'}
                  {selected.app?.merchant?.email && (
                    <div className="text-xs text-[#697386]">{selected.app.merchant.email}</div>
                  )}
                </Field>
                <Field label="Route">
                  {chainLabel(selected.authorizationChainId, live?.sourceChain?.displayName)} →{' '}
                  {chainLabel(selected.settlementChainId, live?.destChain?.displayName)}
                </Field>
                <Field label="Source leftover">
                  {formatToken(selected.settleAmount, selected.cryptoTokenDecimals)} {sourceSymbol}
                </Field>
                <Field label="Promised dest">
                  {formatToken(selected.promisedSettlementAmount, decimals)} {destSymbol}
                </Field>
                <Field label="Dest escrow balance">
                  {live?.destEscrowTokenBalance != null
                    ? `${formatToken(live.destEscrowTokenBalance, decimals)} ${destSymbol}`
                    : '—'}
                </Field>
                <Field label="Worker LI.FI">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant={bridgeBadge(selected.bridgeLiFiStatus ?? selected.bridgeStatus)}>
                      {selected.bridgeLiFiStatus ?? selected.bridgeStatus ?? '—'}
                    </Badge>
                    {selected.bridgeLiFiSubstatus && (
                      <span className="text-xs text-[#697386]">{selected.bridgeLiFiSubstatus}</span>
                    )}
                  </div>
                </Field>
                <Field label="Live LI.FI">
                  {liveLiFi ? (
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant={bridgeBadge(liveLiFi.status)}>{liveLiFi.status ?? '—'}</Badge>
                      {liveLiFi.substatus && <span className="text-xs text-[#697386]">{liveLiFi.substatus}</span>}
                    </div>
                  ) : (
                    <span className="text-[#a3acb9]">{live?.sourceTxHash ? 'No live payload' : 'No source hash to poll'}</span>
                  )}
                  {liveLiFi?.substatusMessage && (
                    <div className="mt-1 text-xs text-[#697386]">{liveLiFi.substatusMessage}</div>
                  )}
                  {liveLiFi?.tool && <div className="mt-1 text-xs text-[#697386]">Tool {liveLiFi.tool}</div>}
                </Field>
                <Field label="Dest credit">
                  <div className="flex flex-wrap gap-2">
                    <Badge variant={selected.settlementCreditConsumed ? 'success' : 'warning'}>
                      DB {selected.settlementCreditConsumed ? 'consumed' : 'open'}
                    </Badge>
                    {live?.destCreditConsumedOnChain != null && (
                      <Badge variant={live.destCreditConsumedOnChain ? 'success' : 'warning'}>
                        Chain {live.destCreditConsumedOnChain ? 'consumed' : 'open'}
                      </Badge>
                    )}
                  </div>
                </Field>
                <Field label="Retries">
                  {selected.settleBridgeRetryCount ?? 0}/4
                  {selected.bridgeRetryAvailableAt && (
                    <div className="text-xs text-[#697386]">
                      Next retry {new Date(selected.bridgeRetryAvailableAt).toLocaleString()}
                    </div>
                  )}
                </Field>
                <Field label="Hash source">
                  {live?.hashSource ?? '—'}
                </Field>
                <Field label="Last live poll">
                  {live?.fetchedAt ? timeAgo(live.fetchedAt) : '—'}
                </Field>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="rounded-lg border border-[#e3e8ee] p-4 space-y-3">
                  <p className="text-xs font-semibold uppercase tracking-wider text-[#697386]">Source</p>
                  <Field label="Capture tx">
                    <HashLink hash={selected.captureTxHash} chainId={selected.authorizationChainId} />
                  </Field>
                  <Field label="Settle / bridge tx">
                    <HashLink
                      hash={live?.sourceTxHash ?? selected.bridgeTransferId}
                      chainId={selected.authorizationChainId}
                      href={lifi?.sending.txLink}
                    />
                  </Field>
                  <Field label="MTXM settle id">
                    <HashLink hash={live?.mtxmTxId ?? selected.bridgeRetryMtxmTxId} />
                  </Field>
                  <Field label="Merchant dest wallet">
                    {selected.settlementWalletAddress ? (
                      <HashLink
                        hash={selected.settlementWalletAddress}
                        href={
                          selected.settlementChainId != null || selected.authorizationChainId != null
                            ? blockExplorerAddressUrl(
                                selected.settlementChainId ?? selected.authorizationChainId ?? 0,
                                selected.settlementWalletAddress,
                              )
                            : null
                        }
                      />
                    ) : '—'}
                  </Field>
                </div>
                <div className="rounded-lg border border-[#e3e8ee] p-4 space-y-3">
                  <p className="text-xs font-semibold uppercase tracking-wider text-[#697386]">Destination</p>
                  <Field label="LI.FI receiving tx">
                    <HashLink
                      hash={lifi?.receiving.txHash ?? selected.settlementCreditTxHash}
                      chainId={lifi?.receiving.chainId ?? selected.settlementChainId}
                      href={lifi?.receiving.txLink}
                    />
                  </Field>
                  <Field label="Received amount">
                    {lifi?.receiving.amount
                      ? `${formatToken(lifi.receiving.amount, lifi.receiving.decimals ?? decimals)} ${lifi.receiving.tokenSymbol ?? destSymbol}`
                      : '—'}
                  </Field>
                  <Field label="Credit tx">
                    <HashLink hash={selected.settlementCreditTxHash} chainId={selected.settlementChainId} />
                  </Field>
                  <Field label="Dest escrow">
                    {live?.destEscrowAddress ? (
                      <HashLink
                        hash={live.destEscrowAddress}
                        href={
                          selected.settlementChainId != null
                            ? blockExplorerAddressUrl(selected.settlementChainId, live.destEscrowAddress)
                            : null
                        }
                      />
                    ) : '—'}
                  </Field>
                  {lifi?.explorerLink && (
                    <a
                      href={lifi.explorerLink}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-xs text-[#635bff]"
                    >
                      LI.FI explorer <ExternalLink className="h-3 w-3" />
                    </a>
                  )}
                </div>
              </div>

              {selected.transactions && selected.transactions.length > 0 && (
                <div>
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-[#697386]">MTXM transactions</p>
                  <div className="space-y-2">
                    {selected.transactions.map((tx) => (
                      <div key={tx.id} className="flex flex-wrap items-center gap-2 rounded-lg bg-[#f6f8fa] px-3 py-2 text-xs">
                        <Badge variant={tx.status === 'CONFIRMED' ? 'success' : tx.status === 'FAILED' ? 'destructive' : 'warning'}>
                          {tx.type} {tx.status}
                        </Badge>
                        <HashLink
                          hash={tx.txHash}
                          chainId={Number(tx.chain) || selected.authorizationChainId}
                        />
                        {tx.mtxmTxId && <span className="font-mono text-[#697386]">{shortHash(tx.mtxmTxId)}</span>}
                        <span className="text-[#697386]">{new Date(tx.createdAt).toLocaleString()}</span>
                        {tx.error && <span className="text-[#df1b41]">{tx.error}</span>}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="flex flex-wrap gap-2">
                <Button size="sm" disabled={!token || !!actionPending} onClick={() => void runAction('retry')}>
                  {actionPending === 'retry' ? 'Retrying…' : 'Retry bridge'}
                </Button>
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={!token || !!actionPending}
                  onClick={() => void runAction('stuck')}
                >
                  {actionPending === 'stuck' ? 'Submitting…' : 'Stuck dest credit'}
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setShowRaw((open) => !open)}>
                  {showRaw ? 'Hide raw JSON' : 'Show raw JSON'}
                </Button>
              </div>

              {showRaw && (
                <pre className="text-[11px] bg-[#f6f8fa] rounded-lg p-3 overflow-auto max-h-80">
                  {JSON.stringify(detail ?? selected, null, 2)}
                </pre>
              )}
            </div>
          )}
        </Card>
      )}
    </div>
  );
}

'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams } from 'next/navigation';
import { useAuth } from '@/lib/auth';
import * as api from '@/lib/api';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { EnvBadge, StatusBadge as SharedStatusBadge } from '@/components/status-badge';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/empty-state';
import { Spinner } from '@/components/ui/loading';
import { CopyableId } from '@/components/filter-nav';
import { IconWell, type Icon } from '@/components/icons';
import {
  ArrowDownRight,
  ArrowsClockwise,
  CaretRight,
  Coins,
  CreditCard,
  CurrencyDollar,
  Globe,
  Invoice,
  Gear,
  Money,
  Pulse,
  TrendUp,
  ArrowUpRight,
  Warning,
} from '@phosphor-icons/react';
import { payoutDisplayStatus, shortWallet } from './payouts/payouts-types';

function listItems(value: unknown): any[] {
  if (Array.isArray(value)) return value;
  if (value && typeof value === 'object') {
    const row = value as Record<string, unknown>;
    for (const key of ['items', 'payouts', 'data']) {
      if (Array.isArray(row[key])) return row[key] as any[];
    }
  }
  return [];
}

function formatAtomicAmount(raw: string, decimals: number): string {
  try {
    const value = BigInt(raw);
    const base = 10n ** BigInt(decimals);
    const whole = value / base;
    const frac = value % base;
    if (frac === 0n) return whole.toLocaleString();
    const fracStr = frac.toString().padStart(decimals, '0').replace(/0+$/, '');
    return `${whole.toLocaleString()}.${fracStr}`;
  } catch {
    return raw;
  }
}

function payoutAmountLabel(payout: any): string {
  const usd = Number(payout?.amountUsd);
  if (Number.isFinite(usd) && usd > 0) {
    return `$${usd.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }
  const raw = String(payout?.tokenAmount ?? '').trim();
  if (!raw) return '-';
  const key = String(payout?.tokenKey ?? '').toLowerCase();
  const decimals = key.includes('usdc') || key.includes('usdt') || raw.length <= 10 ? 6 : 18;
  const amount = formatAtomicAmount(raw, decimals);
  const symbol = String(payout?.tokenKey ?? '').split('-')[0];
  return symbol ? `${amount} ${symbol}` : amount;
}

function QuickLink({
  href,
  icon: Glyph,
  label,
  description,
}: {
  href: string;
  icon: Icon;
  label: string;
  description: string;
}) {
  return (
    <a
      href={href}
      className="nr-card group flex cursor-pointer items-center gap-3 rounded-lg border border-border bg-card p-4 no-underline hover:border-primary/20"
    >
      <IconWell icon={Glyph} />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-foreground">{label}</p>
        <p className="text-xs text-muted-foreground">{description}</p>
      </div>
      <CaretRight className="h-4 w-4 shrink-0 text-muted-foreground/50 transition-colors group-hover:text-foreground" />
    </a>
  );
}

function payoutRecipientLabel(payout: any): string {
  const line = Array.isArray(payout?.lines) ? payout.lines[0] : null;
  const wallet = String(line?.recipient ?? payout?.recipientWallet ?? '').trim();
  if (!wallet) return '-';
  return shortWallet(wallet);
}

/* ── Stat Card (same style as main dashboard) ── */
function OverviewStatCard({
  title,
  value,
  subtitle,
  icon: Glyph,
  loading,
}: {
  title: string;
  value: string;
  subtitle?: string;
  icon: Icon;
  loading?: boolean;
}) {
  return (
    <Card className="relative overflow-hidden p-5 gap-2">
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardDescription className="text-xs font-medium tracking-[0.06em] uppercase">
          {title}
        </CardDescription>
        <IconWell icon={Glyph} />
      </CardHeader>
      <CardContent>
        {loading ? (
          <Skeleton className="h-8 w-20" />
        ) : (
          <>
            <p className="text-[26px] font-semibold tracking-tight">{value}</p>
            {subtitle && (
              <p className="text-xs text-muted-foreground mt-1">{subtitle}</p>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}

export default function AppDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { token } = useAuth();

  const [app, setApp] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<any>(null);
  const [statsLoading, setStatsLoading] = useState(true);
  const [recentPayments, setRecentPayments] = useState<any[]>([]);
  const [recentPayouts, setRecentPayouts] = useState<any[]>([]);


  const loadAll = useCallback(async () => {
    if (!token || !id) return;
    try {
      const appData = await api.getApp(token, id);
      setApp(appData);
    } catch {
      /* ignore */
    } finally {
      setLoading(false);
    }
  }, [token, id]);

  // Load stats separately
  const loadStats = useCallback(async () => {
    if (!token || !id) return;
    setStatsLoading(true);
    try {
      const [statsData, paymentsData, payoutsData] = await Promise.all([
        api.getStats(token, { appId: id }).catch(() => null),
        api.getPayments(token, { appId: id, pageSize: '5' }).catch(() => ({ items: [] })),
        api.getPayouts(token, { appId: id, pageSize: '5' }).catch(() => ({ items: [] })),
      ]);
      setStats(statsData);
      setRecentPayments(paymentsData?.items ?? []);
      setRecentPayouts(listItems(payoutsData));
    } catch {
      /* ignore */
    } finally {
      setStatsLoading(false);
    }
  }, [token, id]);

  useEffect(() => { loadAll(); }, [loadAll]);
  useEffect(() => { loadStats(); }, [loadStats]);

  if (loading) return <Spinner />;
  if (!app) return <EmptyState icon={Warning} title="App not found" description="This application does not exist or you don't have access." />;

  const fmtCurrency = (v: string | number | null | undefined) => {
    const n = Number(v ?? 0);
    return `$${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  return (
    <div className="space-y-6">
      {/* App Header */}
      <div>
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">{app.name}</h1>
          <EnvBadge env={app.environment} />
        </div>
        <div className="flex items-center gap-2 mt-1">
          <span className="text-xs font-medium text-muted-foreground">App ID:</span>
          <CopyableId value={app.id} chars={10} />
        </div>
        <p className="text-xs text-muted-foreground mt-0.5">
          Created {new Date(app.createdAt).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' })}
        </p>
      </div>

      {/* Testnet Warning Banner */}
      {app.environment === 'TEST' && (
        <div className="flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
          <Warning className="h-4 w-4 shrink-0" weight="regular" />
          <p>
            Test app - testnet only. Create a Production app when you are ready for real payments.
          </p>
        </div>
      )}

      {/* ═══ Financial Stat Cards ═══ */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <OverviewStatCard
          title="Total Payments"
          value={String(stats?.totalPayments ?? 0)}
          subtitle={stats ? `${stats.capturedPayments ?? 0} captured · ${stats.settledPayments ?? 0} settled` : undefined}
          icon={CreditCard}
          loading={statsLoading}
        />
        <OverviewStatCard
          title="Captured Volume"
          value={fmtCurrency(stats?.capturedVolume)}
          subtitle={stats?.settledVolume && Number(stats.settledVolume) > 0 ? `${fmtCurrency(stats.settledVolume)} settled` : undefined}
          icon={CurrencyDollar}
          loading={statsLoading}
        />
        <OverviewStatCard
          title="Active Subscriptions"
          value={String(stats?.activeSubscriptions ?? 0)}
          subtitle={stats ? `${stats.totalSubscriptions ?? 0} total` : undefined}
          icon={ArrowsClockwise}
          loading={statsLoading}
        />
        <OverviewStatCard
          title="Paid Invoices"
          value={String(stats?.paidInvoices ?? 0)}
          subtitle={stats ? `${stats.totalInvoices ?? 0} total` : undefined}
          icon={Invoice}
          loading={statsLoading}
        />
      </div>

      {/* ═══ Settled Volume + Refunds + Disputes + Revenue ═══ */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <OverviewStatCard
          title="Settled Volume"
          value={fmtCurrency(stats?.settledVolume)}
          icon={Money}
          loading={statsLoading}
        />
        <OverviewStatCard
          title="Refunded"
          value={String(stats?.refundedPayments ?? 0)}
          icon={ArrowDownRight}
          loading={statsLoading}
        />
        <OverviewStatCard
          title="Disputes"
          value={String(stats?.activeDisputes ?? 0)}
          subtitle={stats ? `${stats.totalDisputes ?? 0} total` : undefined}
          icon={Warning}
          loading={statsLoading}
        />
        <OverviewStatCard
          title="MRR"
          value={fmtCurrency(stats?.mrr)}
          subtitle={stats?.arr ? `ARR ${fmtCurrency(stats.arr)}` : undefined}
          icon={TrendUp}
          loading={statsLoading}
        />
      </div>

      {/* ═══ Analytics: By Chain + By Token ═══ */}
      <div className="grid gap-4 lg:grid-cols-2">
        {/* Per-Chain Breakdown */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <div className="flex items-center gap-3">
              <IconWell icon={Globe} />
              <div>
                <CardTitle className="text-sm font-semibold">Payments by Network</CardTitle>
                <CardDescription className="text-xs">Volume per chain</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {statsLoading ? (
              <div className="space-y-3">{[1, 2, 3].map((i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
            ) : stats?.perChain?.length > 0 ? (
              <div className="space-y-3">
                {stats.perChain.map((chain: any) => {
                  const maxCount = Math.max(...stats.perChain.map((c: any) => c.count));
                  const pct = maxCount > 0 ? (chain.count / maxCount) * 100 : 0;
                  return (
                    <div key={chain.chainId}>
                      <div className="flex items-center justify-between mb-1">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium text-foreground">{chain.chainName}</span>
                          <span className="text-[10px] text-muted-foreground/60">({chain.chainId})</span>
                        </div>
                        <div className="flex items-center gap-3">
                          <span className="text-xs text-muted-foreground">{chain.count} payment{chain.count !== 1 ? 's' : ''}</span>
                          {chain.volume && Number(chain.volume) > 0 && (
                            <span className="text-xs font-medium text-foreground">{fmtCurrency(chain.volume)}</span>
                          )}
                        </div>
                      </div>
                      <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                        <div className="h-full rounded-full bg-primary/60 transition-all" style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground text-center py-6">No payment data yet</p>
            )}
          </CardContent>
        </Card>

        {/* Per-Token Breakdown */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <div className="flex items-center gap-3">
              <IconWell icon={Coins} />
              <div>
                <CardTitle className="text-sm font-semibold">Payments by Token</CardTitle>
                <CardDescription className="text-xs">Volume per cryptocurrency</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {statsLoading ? (
              <div className="space-y-3">{[1, 2, 3].map((i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
            ) : stats?.perCrypto?.length > 0 ? (
              <div className="space-y-3">
                {stats.perCrypto.map((crypto: any) => {
                  const maxCount = Math.max(...stats.perCrypto.map((c: any) => c.count));
                  const pct = maxCount > 0 ? (crypto.count / maxCount) * 100 : 0;
                  return (
                    <div key={crypto.tokenKey}>
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-sm font-medium text-foreground">{crypto.tokenKey}</span>
                        <div className="flex items-center gap-3">
                          <span className="text-xs text-muted-foreground">{crypto.count} payment{crypto.count !== 1 ? 's' : ''}</span>
                          {crypto.volume && Number(crypto.volume) > 0 && (
                            <span className="text-xs font-medium text-foreground">{fmtCurrency(crypto.volume)}</span>
                          )}
                        </div>
                      </div>
                      <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                        <div className="h-full rounded-full bg-primary/60 transition-all" style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground text-center py-6">No payment data yet</p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* ═══ Recent Payments + Recent Payouts ═══ */}
      <div className="grid gap-4 lg:grid-cols-2">
        {/* Recent Payments */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <div className="flex items-center gap-3">
              <IconWell icon={Pulse} />
              <div>
                <CardTitle className="text-sm font-semibold">Recent Payments</CardTitle>
                <CardDescription className="text-xs">Latest payment activity</CardDescription>
              </div>
            </div>
            <a
              href={`/dashboard/apps/${id}/payments`}
              className="text-xs font-medium text-primary hover:underline flex cursor-pointer items-center gap-1"
            >
              View all <CaretRight className="h-3 w-3" />
            </a>
          </CardHeader>
          <CardContent>
            {statsLoading ? (
              <div className="space-y-3">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="flex items-center gap-3">
                    <Skeleton className="h-10 w-10 rounded-lg" />
                    <div className="flex-1 space-y-1.5">
                      <Skeleton className="h-4 w-24" />
                      <Skeleton className="h-3 w-16" />
                    </div>
                    <Skeleton className="h-5 w-16 rounded-full" />
                  </div>
                ))}
              </div>
            ) : recentPayments.length > 0 ? (
              <div className="space-y-2">
                {recentPayments.slice(0, 5).map((p: any) => (
                  <div
                    key={p.id}
                    className="flex items-center justify-between rounded-lg border bg-card px-4 py-3 transition-colors hover:bg-muted/50"
                  >
                    <div className="flex items-center gap-3">
                      <IconWell icon={CreditCard} />
                      <div>
                        <p className="text-sm font-medium">
                          {p.amount ? `$${Number(p.amount).toFixed(2)} ${p.currency ?? ''}`.trim() : '-'}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {p.cryptoTokenKey ?? p.authorizationMethod ?? '-'}
                        </p>
                      </div>
                    </div>
                    <SharedStatusBadge status={p.status} />
                  </div>
                ))}
              </div>
            ) : (
              <EmptyState
                icon={CreditCard}
                title="No payments yet"
                description="No payments yet."
              />
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <div className="flex items-center gap-3">
              <IconWell icon={ArrowUpRight} />
              <div>
                <CardTitle className="text-sm font-semibold">Recent Payouts</CardTitle>
                <CardDescription className="text-xs">Latest payout activity</CardDescription>
              </div>
            </div>
            <a
              href={`/dashboard/apps/${id}/payouts`}
              className="text-xs font-medium text-primary hover:underline flex cursor-pointer items-center gap-1"
            >
              View all <CaretRight className="h-3 w-3" />
            </a>
          </CardHeader>
          <CardContent>
            {statsLoading ? (
              <div className="space-y-3">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="flex items-center gap-3">
                    <Skeleton className="h-10 w-10 rounded-lg" />
                    <div className="flex-1 space-y-1.5">
                      <Skeleton className="h-4 w-24" />
                      <Skeleton className="h-3 w-16" />
                    </div>
                    <Skeleton className="h-5 w-16 rounded-full" />
                  </div>
                ))}
              </div>
            ) : recentPayouts.length > 0 ? (
              <div className="space-y-2">
                {recentPayouts.slice(0, 5).map((payout: any) => (
                  <div
                    key={payout.id}
                    className="flex items-center justify-between rounded-lg border bg-card px-4 py-3 transition-colors hover:bg-muted/50"
                  >
                    <div className="flex items-center gap-3">
                      <IconWell icon={ArrowUpRight} />
                      <div>
                        <p className="text-sm font-medium">{payoutAmountLabel(payout)}</p>
                        <p className="text-xs text-muted-foreground">{payoutRecipientLabel(payout)}</p>
                      </div>
                    </div>
                    <SharedStatusBadge status={payoutDisplayStatus(payout)} />
                  </div>
                ))}
              </div>
            ) : (
              <EmptyState
                icon={ArrowUpRight}
                title="No payouts yet"
                description="No payouts yet."
              />
            )}
          </CardContent>
        </Card>
      </div>

      {/* ═══ Quick Links ═══ */}
      <div>
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">Quick Links</h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {[
            { href: `/dashboard/apps/${id}/payments`, icon: CreditCard, label: 'Payments', desc: 'View all payment intents' },
            { href: `/dashboard/apps/${id}/subscriptions`, icon: ArrowsClockwise, label: 'Subscriptions', desc: 'Manage recurring billing' },
            { href: `/dashboard/apps/${id}/invoices`, icon: Invoice, label: 'Invoices', desc: 'View and send invoices' },
            { href: `/dashboard/apps/${id}/settings`, icon: Gear, label: 'Settings', desc: 'Chains, tokens, webhooks' },
          ].map((item) => (
            <QuickLink
              key={item.href}
              href={item.href}
              icon={item.icon}
              label={item.label}
              description={item.desc}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

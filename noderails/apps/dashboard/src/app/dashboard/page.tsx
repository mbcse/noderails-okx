'use client';

import { useEffect, useState, useMemo } from 'react';
import { useAuth } from '@/lib/auth';
import { resolveMerchantDisplayName } from '@noderails/common';
import { useRouter } from 'next/navigation';
import * as api from '@/lib/api';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { EnvBadge, StatusBadge as SharedStatusBadge } from '@/components/status-badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Separator } from '@/components/ui/separator';
import { Select as NativeSelect } from '@/components/ui';
import { Spinner } from '@/components/ui/loading';
import { EmptyState } from '@/components/ui/empty-state';
import { CopyableId } from '@/components/filter-nav';
import { IconWell, type Icon } from '@/components/icons';
import {
  ArrowsClockwise,
  CaretRight,
  Coins,
  CreditCard,
  CurrencyDollar,
  Gear,
  Globe,
  Invoice,
  Lightning,
  Plus,
  Pulse,
  Stack,
} from '@phosphor-icons/react';
import Link from 'next/link';

interface AppInfo {
  id: string;
  name: string;
  environment: string;
}

/* ── Stat Card ── */
function OverviewStatCard({
  title,
  value,
  icon: Icon,
  loading,
}: {
  title: string;
  value: string;
  icon: Icon;
  loading?: boolean;
}) {
  return (
    <Card className="relative overflow-hidden p-5 gap-2">
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardDescription className="text-xs font-medium tracking-[0.06em] uppercase">
          {title}
        </CardDescription>
        <IconWell icon={Icon} />
      </CardHeader>
      <CardContent>
        {loading ? (
          <Skeleton className="h-8 w-20" />
        ) : (
          <p className="text-[26px] font-semibold tracking-tight">{value}</p>
        )}
      </CardContent>
    </Card>
  );
}

export default function DashboardOverview() {
  const { token, merchant, teamMember } = useAuth();
  const router = useRouter();
  const [apps, setApps] = useState<AppInfo[]>([]);
  const [selectedAppId, setSelectedAppId] = useState<string>('all');
  const [stats, setStats] = useState<any>(null);
  const [recentPayments, setRecentPayments] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!token) return;
    api.getApps(token).then((result) => {
      const list = Array.isArray(result) ? result : [];
      setApps(list);
      // Auto-redirect to first app only on initial login, not when user clicks "Overview"
      const hasVisited = sessionStorage.getItem('nr_visited_overview');
      if (!hasVisited && list.length > 0) {
        sessionStorage.setItem('nr_visited_overview', '1');
        router.replace(`/dashboard/apps/${list[0].id}`);
      }
    }).catch(() => {});
  }, [token, router]);

  useEffect(() => {
    if (!token) return;
    setLoading(true);
    const statsParams: Record<string, string> = {};
    const paymentsParams: Record<string, string> = { pageSize: '5' };
    if (selectedAppId !== 'all') {
      statsParams.appId = selectedAppId;
      paymentsParams.appId = selectedAppId;
    }

    Promise.all([
      api.getStats(token, statsParams).catch(() => null),
      api.getPayments(token, paymentsParams).catch(() => ({ items: [] })),
    ]).then(([statsData, paymentsData]) => {
      setStats(statsData);
      setRecentPayments(paymentsData?.items ?? []);
    }).finally(() => setLoading(false));
  }, [token, selectedAppId]);

  const appOptions = useMemo(() => [
    { value: 'all', label: 'All Apps' },
    ...apps.map((a) => ({ value: a.id, label: a.name })),
  ], [apps]);

  const selectedApp = apps.find((a) => a.id === selectedAppId);
  const welcomeName =
    (merchant ? resolveMerchantDisplayName(merchant) : null) ??
    teamMember?.orgName ??
    null;

  return (
    <div className="space-y-6">
      {/* ── Header ── */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            Welcome back{welcomeName ? `, ${welcomeName}` : ''}
          </h1>
          <p className="mt-1.5 text-sm text-muted-foreground">
            Overview of your apps and recent activity.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <NativeSelect
            options={appOptions}
            value={selectedAppId}
            onChange={(e) => setSelectedAppId(e.target.value)}
            className="w-48"
          />
          {selectedApp && (
            <EnvBadge env={selectedApp.environment} />
          )}
        </div>
      </div>

      {/* ── Stat Cards ── */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <OverviewStatCard
          title="Total Payments"
          value={String(stats?.totalPayments ?? 0)}
          icon={CreditCard}
          loading={loading}
        />
        <OverviewStatCard
          title="Captured Volume"
          value={stats?.capturedVolume ? `$${Number(stats.capturedVolume).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '$0.00'}
          icon={CurrencyDollar}
          loading={loading}
        />
        <OverviewStatCard
          title="Active Subscriptions"
          value={String(stats?.activeSubscriptions ?? 0)}
          icon={ArrowsClockwise}
          loading={loading}
        />
        <OverviewStatCard
          title="Paid Invoices"
          value={String(stats?.paidInvoices ?? 0)}
          icon={Invoice}
          loading={loading}
        />
      </div>

      {/* ── Analytics Grid ── */}
      <div className="grid gap-4 lg:grid-cols-2">
        {/* Per-Chain Breakdown */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <div className="flex items-center gap-3">
              <IconWell icon={Globe} />
              <div>
                <CardTitle className="text-sm font-semibold">By Network</CardTitle>
                <CardDescription className="text-xs">Payment volume per chain</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="space-y-3">{[1, 2, 3].map((i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
            ) : stats?.perChain?.length > 0 ? (
              <div className="space-y-2">
                {stats.perChain.map((chain: any) => {
                  const maxCount = Math.max(...stats.perChain.map((c: any) => c.count));
                  const pct = maxCount > 0 ? (chain.count / maxCount) * 100 : 0;
                  return (
                    <div key={chain.chainId} className="group">
                      <div className="flex items-center justify-between mb-1">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium text-foreground">{chain.chainName}</span>
                          <span className="text-[10px] text-muted-foreground/60">({chain.chainId})</span>
                        </div>
                        <div className="flex items-center gap-3">
                          <span className="text-xs text-muted-foreground">{chain.count} payments</span>
                          {chain.volume && Number(chain.volume) > 0 && (
                            <span className="text-xs font-medium text-foreground">
                              ${Number(chain.volume).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </span>
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

        {/* Per-Crypto Breakdown */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <div className="flex items-center gap-3">
              <IconWell icon={Coins} />
              <div>
                <CardTitle className="text-sm font-semibold">By Token</CardTitle>
                <CardDescription className="text-xs">Payment volume per cryptocurrency</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="space-y-3">{[1, 2, 3].map((i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
            ) : stats?.perCrypto?.length > 0 ? (
              <div className="space-y-2">
                {stats.perCrypto.map((crypto: any) => {
                  const maxCount = Math.max(...stats.perCrypto.map((c: any) => c.count));
                  const pct = maxCount > 0 ? (crypto.count / maxCount) * 100 : 0;
                  return (
                    <div key={crypto.tokenKey} className="group">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-sm font-medium text-foreground">{crypto.tokenKey}</span>
                        <div className="flex items-center gap-3">
                          <span className="text-xs text-muted-foreground">{crypto.count} payments</span>
                          {crypto.volume && Number(crypto.volume) > 0 && (
                            <span className="text-xs font-medium text-foreground">
                              ${Number(crypto.volume).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </span>
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

      {/* ── Content Grid ── */}
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
            {selectedAppId !== 'all' && (
              <Button variant="ghost" size="sm" asChild>
                <Link href={`/dashboard/apps/${selectedAppId}/payments`}>
                  View all
                  <CaretRight className="ml-1 h-3 w-3" />
                </Link>
              </Button>
            )}
          </CardHeader>
          <CardContent>
            {loading ? (
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
                          {p.amount ? `${p.amount} ${p.currency ?? ''}`.trim() : '-'}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {p.authorizationMethod ?? 'WALLET'}
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

        {/* Apps Overview */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <div className="flex items-center gap-3">
              <IconWell icon={Stack} />
              <div>
                <CardTitle className="text-sm font-semibold">Your Apps</CardTitle>
                <CardDescription className="text-xs">{apps.length} app{apps.length !== 1 ? 's' : ''} configured</CardDescription>
              </div>
            </div>
            <Button variant="ghost" size="sm" asChild>
              <Link href="/dashboard/apps">
                Manage
                <CaretRight className="ml-1 h-3 w-3" />
              </Link>
            </Button>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="space-y-3">
                {[1, 2].map((i) => (
                  <div key={i} className="flex items-center gap-3">
                    <Skeleton className="h-10 w-10 rounded-lg" />
                    <div className="flex-1 space-y-1.5">
                      <Skeleton className="h-4 w-32" />
                      <Skeleton className="h-3 w-20" />
                    </div>
                    <Skeleton className="h-5 w-20 rounded-full" />
                  </div>
                ))}
              </div>
            ) : apps.length > 0 ? (
              <div className="space-y-2">
                {apps.slice(0, 4).map((app) => (
                  <Link key={app.id} href={`/dashboard/apps/${app.id}`}>
                    <div className="flex items-center justify-between rounded-lg border bg-card px-4 py-3 transition-colors hover:bg-muted/50 cursor-pointer">
                      <div className="flex items-center gap-3">
                        <IconWell icon={Lightning} />
                        <div>
                          <p className="text-sm font-medium">{app.name}</p>
                          <CopyableId value={app.id} chars={6} />
                        </div>
                      </div>
                      <EnvBadge env={app.environment} />
                    </div>
                  </Link>
                ))}
                {apps.length > 4 && (
                  <p className="text-center text-xs text-muted-foreground pt-2">
                    +{apps.length - 4} more apps
                  </p>
                )}
              </div>
            ) : (
              <EmptyState
                icon={Stack}
                title="No apps created"
                description="Create an app to start accepting payments."
                action={
                  <Button size="sm" asChild>
                    <Link href="/dashboard/apps">
                      <Plus className="mr-1 h-3.5 w-3.5" />
                      Create App
                    </Link>
                  </Button>
                }
              />
            )}
          </CardContent>
        </Card>
      </div>

      {/* ── Quick Actions ── */}
      <div>
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-4">
          Quick Actions
        </h2>
        <div className="grid gap-4 sm:grid-cols-3">
          <QuickAction
            href="/dashboard/apps"
            icon={Stack}
            label="Manage Apps"
            description="Apps and API keys"
          />
          <QuickAction
            href={selectedAppId !== 'all' ? `/dashboard/apps/${selectedAppId}/payments` : '/dashboard/apps'}
            icon={CreditCard}
            label="View Payments"
            description={selectedAppId !== 'all' ? 'Payments for this app' : 'Select an app'}
          />
          <QuickAction
            href="/dashboard/settings"
            icon={Gear}
            label="Settings"
            description="Account and organization"
          />
        </div>
      </div>
    </div>
  );
}

function QuickAction({
  href,
  icon: Icon,
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
      className="nr-card group flex cursor-pointer items-center gap-4 rounded-lg border border-border bg-card p-4 no-underline hover:border-primary/20"
    >
      <IconWell icon={Icon} className="h-10 w-10" size={20} />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-foreground">{label}</p>
        <p className="text-xs text-muted-foreground">{description}</p>
      </div>
      <CaretRight className="h-4 w-4 text-muted-foreground/50 transition-colors group-hover:text-foreground" />
    </a>
  );
}

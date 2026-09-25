'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import {
  ArrowLeftRight,
  Banknote,
  FileText,
  Fuel,
  Landmark,
  Percent,
  User,
  Wallet,
} from 'lucide-react';
import { Spinner } from '@/components/ui/loading';
import { Button } from '@/components/ui/button';
import { useAuth, usePermission } from '@/lib/auth';
import * as api from '@/lib/api';
import { prettyStatus, railDisplay } from '../bank-meta';
import { CurrencyFlag, DepositInstructionCard } from '../bank-ui';
import { StatusBadge as SharedStatusBadge } from '@/components/status-badge';

function activityStatus(type: string) {
  if (type === 'payment_processed') return 'Delivered';
  if (type === 'payment_submitted') return 'Sending crypto';
  if (type === 'funds_received') return 'Received';
  if (type === 'funds_scheduled') return 'Scheduled';
  if (type === 'in_review') return 'In review';
  if (type.startsWith('refund')) return 'Refunded';
  return prettyStatus(type);
}

function activityStatusKey(type: string): string {
  if (type === 'payment_processed' || type === 'funds_received') return 'CONFIRMED';
  if (type === 'payment_submitted' || type === 'funds_scheduled') return 'PENDING';
  if (type === 'in_review') return 'PENDING_REVIEW';
  if (type.startsWith('refund')) return 'REFUNDED';
  return type;
}

function activityTone(status: string): 'live' | 'open' | 'danger' | 'muted' {
  const key = activityStatusKey(status);
  if (key === 'CONFIRMED') return 'live';
  if (key === 'PENDING' || key === 'PENDING_REVIEW') return 'open';
  if (key === 'REFUNDED' || status.toLowerCase().includes('fail')) return 'danger';
  return 'muted';
}

function moneyBps(bps: number) {
  return `${(bps / 100).toFixed(2)}%`;
}

function moneyCents(cents: number) {
  return `$${(cents / 100).toFixed(2)}`;
}

export default function GlobalBankAccountPage() {
  const { accountId } = useParams<{ accountId: string }>();
  const { token } = useAuth();
  const hasPermission = usePermission();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!token || !accountId) return;
    setLoading(true);
    setError('');
    try {
      setData(await api.getGlobalBankAccount(token, accountId));
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Account not found');
    } finally {
      setLoading(false);
    }
  }, [token, accountId]);

  useEffect(() => { void load(); }, [load]);

  if (!hasPermission('BANK_MANAGE')) {
    return <p className="text-sm text-foreground/80">You need the Manage Bank permission to view this account.</p>;
  }
  if (loading) return <Spinner />;
  if (error || !data?.account) {
    return <p className="text-sm text-destructive">{error || 'Account not found'}</p>;
  }

  const account = data.account;
  const meta = railDisplay(String(account.rail ?? ''));
  const rate = data.rateCard ?? {};
  const activity = Array.isArray(data.activity) ? data.activity : [];

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <Link
          href="/dashboard/bank"
          className="text-xs font-medium text-primary underline-offset-2 hover:underline"
        >
          Back to Bank
        </Link>
        <div className="mt-4 flex items-start gap-4">
          <CurrencyFlag iso={meta.flag} code={meta.code} size={64} />
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-2xl font-semibold tracking-tight">{meta.code}</h1>
              <SharedStatusBadge status={account.status ?? 'active'} />
            </div>
            <p className="mt-1 text-sm font-medium text-foreground/80">{meta.label}</p>
            <p className="mt-0.5 text-xs text-muted-foreground">{meta.hint}</p>
          </div>
        </div>
      </div>

      <DepositInstructionCard
        meta={meta}
        account={account}
        environmentLabel={account.environment === 'TEST' ? 'Test' : 'Production'}
      />

      <section className="rounded-xl border border-border bg-card p-5 shadow-sm">
        <h2 className="text-sm font-semibold">Published fees</h2>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          {[
            { icon: Percent, label: 'Onramp', value: moneyBps(rate.onrampFeeBps ?? 50) },
            { icon: Percent, label: 'Offramp', value: moneyBps(rate.offrampFeeBps ?? 25) },
            { icon: ArrowLeftRight, label: 'FX USD-EUR', value: moneyBps(rate.fxUsdEurBps ?? 50) },
            { icon: ArrowLeftRight, label: 'FX USD-MXN', value: moneyBps(rate.fxUsdMxnBps ?? 50) },
            { icon: ArrowLeftRight, label: 'FX USD-GBP', value: moneyBps(rate.fxUsdGbpBps ?? 50) },
            { icon: ArrowLeftRight, label: 'FX USD-BRL', value: moneyBps(rate.fxUsdBrlBps ?? 55) },
            { icon: Banknote, label: 'ACH', value: moneyCents(rate.achFeeCents ?? 50) },
            { icon: Landmark, label: 'Wire', value: moneyCents(rate.wireFeeCents ?? 1000) },
          ].map((item) => (
            <div key={item.label} className="flex items-center gap-3 rounded-lg border border-border px-3 py-2.5">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-muted">
                <item.icon className="h-3.5 w-3.5 text-muted-foreground" />
              </div>
              <div className="min-w-0">
                <p className="text-[11px] text-muted-foreground">{item.label}</p>
                <p className="text-sm font-semibold">{item.value}</p>
              </div>
            </div>
          ))}
        </div>
        {rate.gasFeeNote && (
          <p className="mt-3 flex items-start gap-2 text-xs text-muted-foreground">
            <Fuel className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            {rate.gasFeeNote}
          </p>
        )}
      </section>

      <section className="rounded-xl border border-border bg-card p-5 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-semibold">Activity</h2>
          {account.environment === 'TEST' && (
            <Button
              size="sm"
              variant="outline"
              disabled={busy}
              onClick={async () => {
                if (!token) return;
                setBusy(true);
                try {
                  const result = await api.simulateGlobalBankInbound(token, account.id);
                  setData({ ...data, activity: result.activity });
                } catch (err: unknown) {
                  setError(err instanceof Error ? err.message : 'Simulate failed');
                } finally {
                  setBusy(false);
                }
              }}
            >
              Simulate inbound
            </Button>
          )}
        </div>
        {activity.length === 0 && (
          <p className="mt-4 text-sm text-muted-foreground">Waiting for first inbound.</p>
        )}
        <ol className="mt-4 space-y-0">
          {activity.map((row: any, index: number) => (
            <li key={row.depositId ?? index} className="relative flex gap-3 pb-5 last:pb-0">
              <span className="relative mt-1.5 flex h-2.5 w-2.5 shrink-0">
                <span className={`h-2.5 w-2.5 rounded-full ${
                  activityTone(row.status) === 'live' ? 'bg-emerald-500'
                    : activityTone(row.status) === 'open' ? 'bg-primary'
                      : activityTone(row.status) === 'danger' ? 'bg-destructive'
                        : 'bg-muted-foreground/40'
                }`} />
                {index < activity.length - 1 && (
                  <span className="absolute top-3 left-1/2 h-full w-px -translate-x-1/2 bg-border" />
                )}
              </span>
              <div className="min-w-0 flex-1 rounded-lg border border-border px-3 py-3">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <p className="text-sm font-semibold">
                    {row.amount} {row.currency}
                  </p>
                  <SharedStatusBadge status={activityStatusKey(row.status)} label={activityStatus(row.status)} />
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  {row.paymentRail ?? meta.hint}
                </p>
                <p className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground">
                  <User className="h-3.5 w-3.5 shrink-0" />
                  {row.senderName ?? 'Sender n/a'}
                  {row.senderLast4 ? ` ····${row.senderLast4}` : ''}
                </p>
                {row.senderReference && (
                  <p className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
                    <FileText className="h-3.5 w-3.5 shrink-0" />
                    {row.senderReference}
                  </p>
                )}
                {(row.developerFee || row.exchangeFee || row.gasFee || row.subtotal) && (
                  <p className="mt-2 text-xs text-muted-foreground">
                    Fees: developer {row.developerFee ?? 'n/a'}, exchange {row.exchangeFee ?? 'n/a'}, gas {row.gasFee ?? 'n/a'}, subtotal {row.subtotal ?? 'n/a'}
                  </p>
                )}
                {row.destinationTxHash && (
                  <p className="mt-1 flex items-start gap-1.5 break-all text-xs text-muted-foreground">
                    <Wallet className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                    {row.destinationTxHash}
                  </p>
                )}
              </div>
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}

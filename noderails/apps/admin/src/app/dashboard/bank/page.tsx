'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { Card, Button, Input, Spinner, Badge, Select, Table } from '@/components/ui';
import { Alert, PageHeader, SegmentedControl } from '@/components/page';
import { useAdminAuth } from '@/lib/auth';
import * as api from '@/lib/api';

type Tab = 'fees' | 'charges' | 'reviews' | 'accounts';

function moneyBps(bps: number) {
  return `${(bps / 100).toFixed(2)}%`;
}

function cents(value: number) {
  return `$${(value / 100).toFixed(2)}`;
}

export default function AdminBankPage() {
  const { token } = useAdminAuth();
  const [tab, setTab] = useState<Tab>('fees');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [ok, setOk] = useState('');
  const [config, setConfig] = useState<any>(null);
  const [form, setForm] = useState<Record<string, string>>({});
  const [charges, setCharges] = useState<any[]>([]);
  const [chargeTotal, setChargeTotal] = useState(0);
  const [chargeFilter, setChargeFilter] = useState('');
  const [selectedCharge, setSelectedCharge] = useState<any>(null);
  const [reviews, setReviews] = useState<any[]>([]);
  const [reviewStatus, setReviewStatus] = useState('PENDING_REVIEW');
  const [rejectById, setRejectById] = useState<Record<string, string>>({});
  const [selectedReviewId, setSelectedReviewId] = useState<string | null>(null);
  const [reviewDetail, setReviewDetail] = useState<any>(null);
  const [reviewLoading, setReviewLoading] = useState(false);
  const [accounts, setAccounts] = useState<any[]>([]);
  const [accountDetail, setAccountDetail] = useState<any>(null);

  const loadConfig = useCallback(async () => {
    if (!token) return;
    const data = await api.getBankFeeConfig(token);
    setConfig(data);
    setForm({
      bankFeeIndividualUsd: data.bankFeeIndividualUsd ?? '30.00',
      bankFeeBusinessUsd: data.bankFeeBusinessUsd ?? '40.00',
      bankFeeTestAppId: data.bankFeeTestAppId ?? '',
      bankFeeTestApiKey: '',
      bankFeeLiveAppId: data.bankFeeLiveAppId ?? '',
      bankFeeLiveApiKey: '',
      bankOnrampFeeBps: String(data.rateCard?.onrampFeeBps ?? 50),
      bankOfframpFeeBps: String(data.rateCard?.offrampFeeBps ?? 25),
      bankFxUsdEurBps: String(data.rateCard?.fxUsdEurBps ?? 50),
      bankFxUsdMxnBps: String(data.rateCard?.fxUsdMxnBps ?? 50),
      bankFxUsdGbpBps: String(data.rateCard?.fxUsdGbpBps ?? 50),
      bankFxUsdBrlBps: String(data.rateCard?.fxUsdBrlBps ?? 55),
      bankAchFeeCents: String(data.rateCard?.achFeeCents ?? 50),
      bankWireFeeCents: String(data.rateCard?.wireFeeCents ?? 1000),
      bankGasFeeNote: data.rateCard?.gasFeeNote ?? '',
    });
  }, [token]);

  const loadCharges = useCallback(async () => {
    if (!token) return;
    const params: Record<string, string> = {};
    if (chargeFilter) params.status = chargeFilter;
    const data = await api.getBankCharges(token, params);
    setCharges(data.items ?? []);
    setChargeTotal(data.total ?? 0);
  }, [token, chargeFilter]);

  const loadReviews = useCallback(async () => {
    if (!token) return;
    const data = await api.getBankOwnAccounts(token, reviewStatus ? { status: reviewStatus } : undefined);
    setReviews(Array.isArray(data) ? data : []);
  }, [token, reviewStatus]);

  const loadAccounts = useCallback(async () => {
    if (!token) return;
    const data = await api.getBankAccounts(token);
    setAccounts(Array.isArray(data) ? data : []);
  }, [token]);

  useEffect(() => {
    if (!token) return;
    setLoading(true);
    setError('');
    Promise.all([loadConfig(), loadCharges(), loadReviews(), loadAccounts()])
      .catch((err: unknown) => setError(err instanceof Error ? err.message : 'Failed to load'))
      .finally(() => setLoading(false));
  }, [token, loadConfig, loadCharges, loadReviews, loadAccounts]);

  const save = async () => {
    if (!token) return;
    setSaving(true);
    setError('');
    setOk('');
    try {
      const payload: Record<string, unknown> = {
        bankFeeIndividualUsd: form.bankFeeIndividualUsd,
        bankFeeBusinessUsd: form.bankFeeBusinessUsd,
        bankOnrampFeeBps: Number(form.bankOnrampFeeBps),
        bankOfframpFeeBps: Number(form.bankOfframpFeeBps),
        bankFxUsdEurBps: Number(form.bankFxUsdEurBps),
        bankFxUsdMxnBps: Number(form.bankFxUsdMxnBps),
        bankFxUsdGbpBps: Number(form.bankFxUsdGbpBps),
        bankFxUsdBrlBps: Number(form.bankFxUsdBrlBps),
        bankAchFeeCents: Number(form.bankAchFeeCents),
        bankWireFeeCents: Number(form.bankWireFeeCents),
        bankGasFeeNote: form.bankGasFeeNote || null,
      };
      if (form.bankFeeTestAppId) payload.bankFeeTestAppId = form.bankFeeTestAppId;
      if (form.bankFeeTestApiKey) payload.bankFeeTestApiKey = form.bankFeeTestApiKey;
      if (form.bankFeeLiveAppId) payload.bankFeeLiveAppId = form.bankFeeLiveAppId;
      if (form.bankFeeLiveApiKey) payload.bankFeeLiveApiKey = form.bankFeeLiveApiKey;
      const next = await api.updateBankFeeConfig(token, payload);
      setConfig(next);
      setForm((prev) => ({ ...prev, bankFeeTestApiKey: '', bankFeeLiveApiKey: '' }));
      setOk('Saved opening fees and published rate card.');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <Spinner />;

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Operations"
        title="Bank"
        description="Opening fees, the published rate card, charges, own-account reviews, and global accounts."
      />

      {error && <Alert onDismiss={() => setError('')}>{error}</Alert>}
      {ok && <Alert tone="success" onDismiss={() => setOk('')}>{ok}</Alert>}

      <SegmentedControl
        value={tab}
        onChange={setTab}
        options={[
          { value: 'fees', label: 'Fees' },
          { value: 'charges', label: `Charges (${chargeTotal})` },
          { value: 'reviews', label: 'Reviews' },
          { value: 'accounts', label: 'Accounts' },
        ]}
      />

      {tab === 'fees' && (
        <div className="space-y-6">
          <Card>
            <h3 className="text-sm font-semibold text-[#0a2540]">Opening fees</h3>
            <p className="mt-1 text-xs text-[#697386]">
              Collected via NodeRails checkout. Paste a TEST and/or PRODUCTION project id plus secret key.
            </p>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <Input
                label="Individual USD / year"
                value={form.bankFeeIndividualUsd ?? ''}
                onChange={(e) => setForm({ ...form, bankFeeIndividualUsd: e.target.value })}
              />
              <Input
                label="Business USD / year"
                value={form.bankFeeBusinessUsd ?? ''}
                onChange={(e) => setForm({ ...form, bankFeeBusinessUsd: e.target.value })}
              />
              <Input
                label="TEST project id"
                value={form.bankFeeTestAppId ?? ''}
                onChange={(e) => setForm({ ...form, bankFeeTestAppId: e.target.value })}
              />
              <Input
                label={`TEST secret key ${config?.bankFeeTestApiKeyMasked ? `(${config.bankFeeTestApiKeyMasked})` : ''}`}
                type="password"
                value={form.bankFeeTestApiKey ?? ''}
                onChange={(e) => setForm({ ...form, bankFeeTestApiKey: e.target.value })}
              />
              <Input
                label="PRODUCTION project id"
                value={form.bankFeeLiveAppId ?? ''}
                onChange={(e) => setForm({ ...form, bankFeeLiveAppId: e.target.value })}
              />
              <Input
                label={`PRODUCTION secret key ${config?.bankFeeLiveApiKeyMasked ? `(${config.bankFeeLiveApiKeyMasked})` : ''}`}
                type="password"
                value={form.bankFeeLiveApiKey ?? ''}
                onChange={(e) => setForm({ ...form, bankFeeLiveApiKey: e.target.value })}
              />
            </div>
            <div className="mt-3 flex gap-2 text-xs text-[#697386]">
              <Badge variant={config?.bankFeeTestWebhookConfigured ? 'success' : 'outline'}>
                TEST webhook {config?.bankFeeTestWebhookConfigured ? 'ready' : 'not set'}
              </Badge>
              <Badge variant={config?.bankFeeLiveWebhookConfigured ? 'success' : 'outline'}>
                Live webhook {config?.bankFeeLiveWebhookConfigured ? 'ready' : 'not set'}
              </Badge>
            </div>
          </Card>

          <Card>
            <h3 className="text-sm font-semibold text-[#0a2540]">Published rate card</h3>
            <p className="mt-1 text-xs text-[#697386]">Display only. Shown on merchant account pages. Not collected this pass.</p>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <Input label="Onramp bps" value={form.bankOnrampFeeBps ?? ''} onChange={(e) => setForm({ ...form, bankOnrampFeeBps: e.target.value })} />
              <Input label="Offramp bps" value={form.bankOfframpFeeBps ?? ''} onChange={(e) => setForm({ ...form, bankOfframpFeeBps: e.target.value })} />
              <Input label="FX USD-EUR bps" value={form.bankFxUsdEurBps ?? ''} onChange={(e) => setForm({ ...form, bankFxUsdEurBps: e.target.value })} />
              <Input label="FX USD-MXN bps" value={form.bankFxUsdMxnBps ?? ''} onChange={(e) => setForm({ ...form, bankFxUsdMxnBps: e.target.value })} />
              <Input label="FX USD-GBP bps" value={form.bankFxUsdGbpBps ?? ''} onChange={(e) => setForm({ ...form, bankFxUsdGbpBps: e.target.value })} />
              <Input label="FX USD-BRL bps" value={form.bankFxUsdBrlBps ?? ''} onChange={(e) => setForm({ ...form, bankFxUsdBrlBps: e.target.value })} />
              <Input label="ACH cents" value={form.bankAchFeeCents ?? ''} onChange={(e) => setForm({ ...form, bankAchFeeCents: e.target.value })} />
              <Input label="Wire cents" value={form.bankWireFeeCents ?? ''} onChange={(e) => setForm({ ...form, bankWireFeeCents: e.target.value })} />
              <div className="sm:col-span-2">
                <Input label="Gas note" value={form.bankGasFeeNote ?? ''} onChange={(e) => setForm({ ...form, bankGasFeeNote: e.target.value })} />
              </div>
            </div>
            {config?.rateCard && (
              <p className="mt-3 text-xs text-[#697386]">
                Preview: onramp {moneyBps(Number(form.bankOnrampFeeBps || 0))}, offramp {moneyBps(Number(form.bankOfframpFeeBps || 0))},
                ACH {cents(Number(form.bankAchFeeCents || 0))}, wire {cents(Number(form.bankWireFeeCents || 0))}.
              </p>
            )}
          </Card>

          <Button onClick={() => void save()} disabled={saving}>
            {saving ? 'Saving…' : 'Save'}
          </Button>
        </div>
      )}

      {tab === 'charges' && (
        <Card>
          <div className="mb-4 flex items-center justify-between gap-3">
            <h3 className="text-sm font-semibold text-[#0a2540]">Who paid which charge</h3>
            <Select
              value={chargeFilter}
              onChange={(e) => setChargeFilter(e.target.value)}
              options={[
                { value: '', label: 'All statuses' },
                { value: 'PENDING', label: 'Pending' },
                { value: 'CONFIRMED', label: 'Captured' },
                { value: 'EXPIRED', label: 'Expired' },
                { value: 'FAILED', label: 'Failed' },
              ]}
            />
          </div>
          <Table headers={['When', 'Merchant', 'Type', 'Country', 'Amount', 'Period', 'Status', 'Account']}>
            {charges.map((row) => (
              <tr key={row.id} className="hover:bg-[#f6f8fa]">
                <td className="px-4 py-3 text-xs text-[#425466]">{new Date(row.createdAt).toLocaleString()}</td>
                <td className="px-4 py-3">
                  <Link href={`/dashboard/merchants/${row.merchant?.id}`} className="text-[#635bff] hover:underline">
                    {row.merchant?.orgName || row.merchant?.email || row.merchant?.id}
                  </Link>
                </td>
                <td className="px-4 py-3 text-xs">{row.accountType}</td>
                <td className="px-4 py-3 text-xs">{String(row.rail ?? '').toUpperCase()}</td>
                <td className="px-4 py-3 text-xs">${row.amountUsd}</td>
                <td className="px-4 py-3 text-xs">
                  {row.periodStart
                    ? `${new Date(row.periodStart).toLocaleDateString()} - ${row.periodEnd ? new Date(row.periodEnd).toLocaleDateString() : '—'}`
                    : '—'}
                </td>
                <td className="px-4 py-3 text-xs">{row.status}</td>
                <td className="px-4 py-3 text-xs">{row.accountOpen ? 'Open' : '—'}</td>
              </tr>
            ))}
          </Table>
          {charges.length === 0 && <p className="mt-3 text-sm text-[#697386]">No charges yet.</p>}
          {selectedCharge && (
            <pre className="mt-4 overflow-auto rounded-lg bg-[#f6f8fa] p-3 text-xs">{JSON.stringify(selectedCharge, null, 2)}</pre>
          )}
          {charges[0] && (
            <Button
              className="mt-3"
              size="sm"
              variant="secondary"
              onClick={async () => {
                if (!token) return;
                setSelectedCharge(await api.getBankCharge(token, charges[0].id));
              }}
            >
              Latest charge detail
            </Button>
          )}
        </Card>
      )}

      {tab === 'reviews' && (
        <div className="grid gap-4 xl:grid-cols-[minmax(0,22rem)_1fr]">
          <Card>
            <div className="mb-4 flex items-center justify-between gap-3">
              <h3 className="text-sm font-semibold text-[#0a2540]">Own-account reviews</h3>
              <Select
                value={reviewStatus}
                onChange={(e) => setReviewStatus(e.target.value)}
                options={[
                  { value: 'PENDING_REVIEW', label: 'Pending review' },
                  { value: 'VERIFIED', label: 'Verified' },
                  { value: 'REJECTED', label: 'Rejected' },
                  { value: '', label: 'All' },
                ]}
              />
            </div>
            <div className="space-y-2">
              {reviews.map((row) => (
                <button
                  key={row.id}
                  type="button"
                  onClick={() => {
                    if (!token) return;
                    setSelectedReviewId(row.id);
                    setReviewLoading(true);
                    setReviewDetail(null);
                    void api.getBankOwnAccount(token, row.id)
                      .then(setReviewDetail)
                      .catch((err: unknown) => setError(err instanceof Error ? err.message : 'Failed to load review'))
                      .finally(() => setReviewLoading(false));
                  }}
                  className={`w-full rounded-lg border p-3 text-left ${
                    selectedReviewId === row.id
                      ? 'border-[#635bff] bg-[#f6f5ff]'
                      : 'border-[#e3e8ee] hover:bg-[#f6f8fa]'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-sm font-semibold text-[#0a2540]">
                      {row.merchant?.orgName || row.merchant?.email}
                    </p>
                    <Badge>{row.status === 'CHANGE_PENDING' ? 'CHANGE PENDING' : row.status}</Badge>
                  </div>
                  <p className="mt-1 text-xs text-[#697386]">
                    {row.environment} · {row.accountType} · identity {row.identityStatus ?? 'n/a'}
                  </p>
                  <p className="mt-0.5 text-xs text-[#697386]">{row.country ?? 'Country n/a'} · {row.name ?? 'Name n/a'}</p>
                </button>
              ))}
              {reviews.length === 0 && <p className="text-sm text-[#697386]">No reviews in this filter.</p>}
            </div>
          </Card>

          <Card>
            {!selectedReviewId && (
              <p className="text-sm text-[#697386]">Select a review to see bank details, identity data, and the statement.</p>
            )}
            {reviewLoading && <Spinner />}
            {reviewDetail && !reviewLoading && token && (
              <OwnAccountReviewDetail
                token={token}
                detail={reviewDetail}
                rejectReason={rejectById[reviewDetail.id] ?? ''}
                onRejectReason={(value) => setRejectById((prev) => ({ ...prev, [reviewDetail.id]: value }))}
                onReload={async () => {
                  if (!token) return;
                  await loadReviews();
                  setReviewDetail(await api.getBankOwnAccount(token, reviewDetail.id));
                }}
              />
            )}
          </Card>
        </div>
      )}

      {tab === 'accounts' && (
        <div className="space-y-4">
          <Card>
            <h3 className="text-sm font-semibold text-[#0a2540]">Opened global bank accounts</h3>
            <Table headers={['Merchant', 'Env', 'Country', 'Status', 'Opened']}>
              {accounts.map((row) => (
                <tr key={row.id} className="hover:bg-[#f6f8fa]">
                  <td className="px-4 py-3">
                    <button
                      className="text-left text-[#635bff] hover:underline"
                      onClick={async () => {
                        if (!token) return;
                        setAccountDetail(await api.getBankAccountActivity(token, row.id));
                      }}
                    >
                      {row.merchant?.orgName || row.merchant?.email || row.merchant?.id}
                    </button>
                  </td>
                  <td className="px-4 py-3 text-xs">{row.environment}</td>
                  <td className="px-4 py-3 text-xs">{String(row.rail ?? '').toUpperCase()}</td>
                  <td className="px-4 py-3 text-xs">{row.status}</td>
                  <td className="px-4 py-3 text-xs">{new Date(row.createdAt).toLocaleDateString()}</td>
                </tr>
              ))}
            </Table>
            {accounts.length === 0 && <p className="mt-3 text-sm text-[#697386]">No accounts opened yet.</p>}
          </Card>
          {accountDetail && (
            <Card>
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-sm font-semibold text-[#0a2540]">
                  {String(accountDetail.account?.rail ?? '').toUpperCase()} activity
                </h3>
                {accountDetail.account?.environment === 'TEST' && (
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={async () => {
                      if (!token) return;
                      const result = await api.simulateBankInbound(token, accountDetail.account.id);
                      setAccountDetail({ ...accountDetail, activity: result.activity });
                    }}
                  >
                    Simulate inbound
                  </Button>
                )}
              </div>
              <pre className="mt-3 overflow-auto rounded-lg bg-[#f6f8fa] p-3 text-xs">
                {JSON.stringify(accountDetail.account?.depositInstructions ?? {}, null, 2)}
              </pre>
              <div className="mt-3 space-y-2">
                {(accountDetail.activity ?? []).map((row: any) => (
                  <div key={row.depositId} className="rounded-lg border border-[#e3e8ee] p-3 text-sm">
                    <p className="font-medium text-[#0a2540]">
                      {row.amount} {row.currency} · {row.status}
                    </p>
                    <p className="text-xs text-[#697386]">
                      {row.senderName ?? 'Sender n/a'} {row.senderLast4 ? `····${row.senderLast4}` : ''}
                    </p>
                  </div>
                ))}
                {(accountDetail.activity ?? []).length === 0 && (
                  <p className="text-sm text-[#697386]">Waiting for first inbound.</p>
                )}
              </div>
            </Card>
          )}
        </div>
      )}
    </div>
  );
}

const CORRIDOR_LABELS: Record<string, string> = {
  country: 'Country',
  name: 'Account name',
  currency: 'Currency',
  bankName: 'Bank name',
  bank_name: 'Bank name',
  accountNumber: 'Account number',
  account_number: 'Account number',
  routingNumber: 'Routing number',
  routing_number: 'Routing number',
  iban: 'IBAN',
  destinationType: 'Destination type',
  beneficiaryType: 'Beneficiary type',
};

function prettyKey(key: string) {
  return CORRIDOR_LABELS[key] ?? key.replaceAll('_', ' ');
}

function DetailGrid({ rows }: { rows: Array<{ label: string; value: string }> }) {
  if (rows.length === 0) {
    return <p className="text-sm text-[#697386]">No data yet.</p>;
  }
  return (
    <dl className="grid gap-3 sm:grid-cols-2">
      {rows.map((row) => (
        <div key={`${row.label}:${row.value}`} className="rounded-lg border border-[#e3e8ee] px-3 py-2">
          <dt className="text-[11px] font-medium uppercase tracking-wide text-[#697386]">{row.label}</dt>
          <dd className="mt-0.5 break-all text-sm font-medium text-[#0a2540]">{row.value}</dd>
        </div>
      ))}
    </dl>
  );
}

function OwnAccountReviewDetail({
  token,
  detail,
  rejectReason,
  onRejectReason,
  onReload,
}: {
  token: string;
  detail: any;
  rejectReason: string;
  onRejectReason: (value: string) => void;
  onReload: () => Promise<void>;
}) {
  const [busy, setBusy] = useState('');
  const [actionError, setActionError] = useState('');
  const corridor = detail.corridor && typeof detail.corridor === 'object' ? detail.corridor as Record<string, unknown> : {};
  const pendingCorridor = detail.pendingCorridor && typeof detail.pendingCorridor === 'object'
    ? detail.pendingCorridor as Record<string, unknown>
    : {};
  const corridorRows = Object.entries(corridor)
    .filter(([, value]) => value != null && String(value).trim() !== '')
    .map(([key, value]) => ({ label: prettyKey(key), value: String(value) }));
  const pendingRows = Object.entries(pendingCorridor)
    .filter(([, value]) => value != null && String(value).trim() !== '')
    .map(([key, value]) => ({ label: prettyKey(key), value: String(value) }));
  const reviewingChange = detail.changeStatus === 'PENDING_REVIEW';
  const canReview = detail.status === 'PENDING_REVIEW' || reviewingChange;
  const diditRows = Array.isArray(detail.diditSummary) ? detail.diditSummary : [];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link href={`/dashboard/merchants/${detail.merchant?.id}`} className="text-lg font-semibold text-[#635bff] hover:underline">
            {detail.merchant?.orgName || detail.merchant?.email}
          </Link>
          <p className="mt-1 text-xs text-[#697386]">
            {detail.environment} · {detail.accountType} · {detail.merchant?.email}
          </p>
        </div>
        <Badge>{reviewingChange ? 'CHANGE PENDING' : detail.status}</Badge>
      </div>

      {reviewingChange && (
        <p className="rounded-lg border border-[#e3e8ee] bg-[#f6f8fa] px-3 py-2 text-sm text-[#425466]">
          Bank-account change. Identity stays the same. The current account stays live until you approve.
        </p>
      )}

      <section className="space-y-2">
        <h4 className="text-sm font-semibold text-[#0a2540]">
          {reviewingChange || pendingRows.length > 0 ? 'Current bank details' : 'Merchant bank details'}
        </h4>
        <DetailGrid rows={corridorRows} />
      </section>

      {pendingRows.length > 0 && (
        <section className="space-y-2">
          <h4 className="text-sm font-semibold text-[#0a2540]">Proposed bank details</h4>
          <DetailGrid rows={pendingRows} />
        </section>
      )}

      <section className="space-y-2">
        <h4 className="text-sm font-semibold text-[#0a2540]">Identity (Didit)</h4>
        <p className="text-xs text-[#697386]">
          {detail.identity
            ? `${detail.identity.kind} · ${detail.identity.status} · session ${detail.identity.externalId}${
                detail.diditSource === 'stored' ? ' · stored webhook' : detail.diditSource === 'live' ? ' · live Didit' : ''
              }`
            : 'No identity session'}
        </p>
        {detail.diditError && (
          <p className="text-sm text-red-600">{detail.diditError}</p>
        )}
        <DetailGrid rows={diditRows} />
        {detail.didit && (
          <details className="rounded-lg border border-[#e3e8ee] bg-[#f6f8fa] p-3">
            <summary className="cursor-pointer text-xs font-medium text-[#425466]">Full Didit session</summary>
            <pre className="mt-2 max-h-80 overflow-auto text-xs text-[#0a2540]">
              {JSON.stringify(detail.didit, null, 2)}
            </pre>
          </details>
        )}
      </section>

      <section className="space-y-2">
        <h4 className="text-sm font-semibold text-[#0a2540]">Statement</h4>
        <div className="flex flex-wrap gap-2">
          {detail.hasStatement ? (
            <Button
              size="sm"
              variant="secondary"
              onClick={async () => {
                const { url } = await api.getBankOwnAccountStatement(token, detail.id, 'live');
                window.open(url, '_blank');
              }}
            >
              {detail.hasPendingStatement ? 'Open current statement' : 'Open statement PDF'}
            </Button>
          ) : (
            !detail.hasPendingStatement && <p className="text-sm text-[#697386]">No statement uploaded.</p>
          )}
          {detail.hasPendingStatement && (
            <Button
              size="sm"
              variant="secondary"
              onClick={async () => {
                const { url } = await api.getBankOwnAccountStatement(token, detail.id, 'pending');
                window.open(url, '_blank');
              }}
            >
              Open new statement
            </Button>
          )}
        </div>
      </section>

      {(detail.rejectionReason || detail.changeRejectionReason || detail.reviewNote || detail.submittedAt || detail.pendingSubmittedAt || detail.reviewedAt) && (
        <section className="space-y-1 text-xs text-[#697386]">
          {detail.submittedAt && <p>Submitted {new Date(detail.submittedAt).toLocaleString()}</p>}
          {detail.pendingSubmittedAt && <p>Change submitted {new Date(detail.pendingSubmittedAt).toLocaleString()}</p>}
          {detail.reviewedAt && <p>Reviewed {new Date(detail.reviewedAt).toLocaleString()}</p>}
          {detail.reviewNote && <p>Note: {detail.reviewNote}</p>}
          {detail.rejectionReason && <p className="text-red-600">Rejected: {detail.rejectionReason}</p>}
          {detail.changeRejectionReason && <p className="text-red-600">Change rejected: {detail.changeRejectionReason}</p>}
        </section>
      )}

      {canReview && (
        <div className="flex flex-col gap-2 border-t border-[#e3e8ee] pt-4">
          {actionError && (
            <p className="text-sm text-red-600">{actionError}</p>
          )}
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              size="sm"
              disabled={busy !== ''}
              onClick={async () => {
                setBusy('approve');
                setActionError('');
                try {
                  await api.approveBankOwnAccount(token, detail.id);
                  await onReload();
                } catch (err: unknown) {
                  setActionError(err instanceof Error ? err.message : 'Approve failed');
                } finally {
                  setBusy('');
                }
              }}
            >
              {busy === 'approve' ? 'Approving…' : 'Approve'}
            </Button>
          </div>
          <Input
            placeholder="Rejection reason"
            value={rejectReason}
            onChange={(e) => onRejectReason(e.target.value)}
          />
          <Button
            type="button"
            size="sm"
            variant="secondary"
            disabled={busy !== ''}
            onClick={async () => {
              if (!rejectReason.trim()) {
                setActionError('Enter a rejection reason.');
                return;
              }
              setBusy('reject');
              setActionError('');
              try {
                await api.rejectBankOwnAccount(token, detail.id, rejectReason.trim());
                onRejectReason('');
                await onReload();
              } catch (err: unknown) {
                setActionError(err instanceof Error ? err.message : 'Reject failed');
              } finally {
                setBusy('');
              }
            }}
          >
            {busy === 'reject' ? 'Rejecting…' : 'Reject'}
          </Button>
        </div>
      )}
    </div>
  );
}

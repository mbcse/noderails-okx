'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useAdminAuth } from '@/lib/auth';
import * as api from '@/lib/api';
import { Badge, Button, Card, Input, Spinner, Table, Toggle } from '@/components/ui';
import { Alert, PageHeader, SegmentedControl } from '@/components/page';
import {
  ArrowLeft,
  Clock,
  Copy,
  Download,
  Loader2,
  Mail,
  MousePointerClick,
  RefreshCw,
  Search,
  Trash2,
} from 'lucide-react';

type Detail = Awaited<ReturnType<typeof api.getShortLink>>;
type Tab = 'overview' | 'emails' | 'clicks' | 'activity';

function formatAbsolute(iso: string) {
  const d = new Date(iso);
  return d.toLocaleString(undefined, {
    weekday: 'short',
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

function formatRelative(iso: string) {
  const ms = Date.now() - new Date(iso).getTime();
  const sec = Math.round(ms / 1000);
  if (sec < 60) return `${sec}s ago`;
  const min = Math.round(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.round(min / 60);
  if (hr < 48) return `${hr}h ago`;
  const day = Math.round(hr / 24);
  if (day < 30) return `${day}d ago`;
  return formatAbsolute(iso);
}

function copyText(value: string) {
  return navigator.clipboard.writeText(value);
}

export default function ShortLinkDetailPage() {
  const { token } = useAdminAuth();
  const params = useParams();
  const router = useRouter();
  const id = String(params.id ?? '');

  const [detail, setDetail] = useState<Detail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [tab, setTab] = useState<Tab>('overview');
  const [emailQuery, setEmailQuery] = useState('');
  const [clickQuery, setClickQuery] = useState('');
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [form, setForm] = useState({
    destinationUrl: '',
    title: '',
    collectEmail: false,
    requirePassword: false,
    password: '',
  });

  const load = useCallback(async () => {
    if (!token || !id) return;
    try {
      const data = await api.getShortLink(token, id);
      setDetail(data);
      setForm({
        destinationUrl: data.destinationUrl,
        title: data.title ?? '',
        collectEmail: data.collectEmail,
        requirePassword: data.hasPassword,
        password: '',
      });
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [token, id]);

  useEffect(() => {
    load();
  }, [load]);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token || !detail) return;
    if (form.requirePassword && !detail.hasPassword && form.password.trim().length < 4) {
      setError('Set a password of at least 4 characters');
      return;
    }
    if (form.requirePassword && form.password.trim() && form.password.trim().length < 4) {
      setError('Password must be at least 4 characters');
      return;
    }
    setSaving(true);
    setError('');
    try {
      const payload: Record<string, unknown> = {
        destinationUrl: form.destinationUrl.trim(),
        title: form.title.trim() || null,
        collectEmail: form.collectEmail,
      };
      if (!form.requirePassword && detail.hasPassword) {
        payload.clearPassword = true;
      } else if (form.requirePassword && form.password.trim()) {
        payload.password = form.password.trim();
      }
      await api.updateShortLink(token, detail.id, payload);
      await load();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const toggleStatus = async () => {
    if (!token || !detail) return;
    try {
      await api.updateShortLink(token, detail.id, {
        status: detail.status === 'ACTIVE' ? 'DISABLED' : 'ACTIVE',
      });
      await load();
    } catch (err: any) {
      setError(err.message);
    }
  };

  const remove = async () => {
    if (!token || !detail) return;
    if (!confirm(`Delete /link/${detail.slug}?`)) return;
    try {
      await api.deleteShortLink(token, detail.id);
      router.push('/dashboard/links');
    } catch (err: any) {
      setError(err.message);
    }
  };

  const markCopied = (key: string) => {
    setCopiedId(key);
    setTimeout(() => setCopiedId(null), 1200);
  };

  const filteredLeads = useMemo(() => {
    if (!detail) return [];
    const q = emailQuery.trim().toLowerCase();
    if (!q) return detail.analytics.leads;
    return detail.analytics.leads.filter((l) => l.email.toLowerCase().includes(q));
  }, [detail, emailQuery]);

  const filteredClicks = useMemo(() => {
    if (!detail) return [];
    const q = clickQuery.trim().toLowerCase();
    if (!q) return detail.analytics.clicks;
    return detail.analytics.clicks.filter((c) => {
      const hay = [
        c.referrer,
        c.referrerHost,
        c.browser,
        c.os,
        c.device,
        c.userAgent,
        formatAbsolute(c.createdAt),
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return hay.includes(q);
    });
  }, [detail, clickQuery]);

  const exportEmailsCsv = () => {
    if (!detail) return;
    const lines = ['email,captured_at_iso,captured_at_local'];
    for (const l of detail.analytics.leads) {
      lines.push(
        [
          JSON.stringify(l.email),
          l.createdAt,
          JSON.stringify(formatAbsolute(l.createdAt)),
        ].join(','),
      );
    }
    const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${detail.slug}-emails.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (loading) return <Spinner />;
  if (!detail) {
    return (
      <div className="space-y-4">
        <Alert>{error || 'Link not found'}</Alert>
        <Link href="/dashboard/links" className="text-sm text-[#635bff] hover:underline">
          Back to links
        </Link>
      </div>
    );
  }

  const maxDay = Math.max(1, ...detail.analytics.clicksByDay.map((d) => d.count));
  const todayClicks =
    detail.analytics.clicksByDay[detail.analytics.clicksByDay.length - 1]?.count ?? 0;

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Operations"
        title={detail.title?.trim() || detail.slug}
        description={detail.publicUrl}
        actions={
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" onClick={() => router.push('/dashboard/links')}>
              <ArrowLeft className="h-4 w-4" /> Back
            </Button>
            <Button
              variant="secondary"
              onClick={async () => {
                await copyText(detail.publicUrl);
                markCopied('url');
              }}
            >
              <Copy className="h-4 w-4" /> {copiedId === 'url' ? 'Copied' : 'Copy URL'}
            </Button>
            <Button variant="secondary" onClick={() => { setLoading(true); load(); }}>
              <RefreshCw className="h-4 w-4" /> Refresh
            </Button>
            <Button variant="secondary" onClick={toggleStatus}>
              {detail.status === 'ACTIVE' ? 'Disable' : 'Activate'}
            </Button>
            <Button variant="secondary" onClick={remove}>
              <Trash2 className="h-4 w-4" /> Delete
            </Button>
          </div>
        }
      />

      {error && <Alert onDismiss={() => setError('')}>{error}</Alert>}

      <Card className="!p-0 overflow-hidden">
        <div className="border-b border-[#e8edf3] bg-[#f7fafc] px-5 py-3">
          <p className="text-[11px] font-medium uppercase tracking-wide text-[#697386]">Public URL</p>
          <p className="mt-1 break-all font-mono text-sm font-medium text-[#0a2540]">{detail.publicUrl}</p>
        </div>
        <form onSubmit={save} className="space-y-4 p-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-base font-semibold text-[#0a2540]">Destination & settings</h2>
            <Button type="submit" size="sm" disabled={saving}>
              {saving && <Loader2 className="h-4 w-4 animate-spin" />}
              Save
            </Button>
          </div>
          <Input
            label="Destination URL (https)"
            value={form.destinationUrl}
            onChange={(e) => setForm({ ...form, destinationUrl: e.target.value })}
            required
          />
          <div className="grid gap-4 sm:grid-cols-2">
            <Input
              label="Title"
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              maxLength={200}
            />
            <div className="space-y-3 pb-1">
              <Toggle
                checked={form.collectEmail}
                onChange={(checked) => setForm({ ...form, collectEmail: checked })}
                label="Ask for email before redirect"
              />
              <Toggle
                checked={form.requirePassword}
                onChange={(checked) =>
                  setForm({
                    ...form,
                    requirePassword: checked,
                    password: checked ? form.password : '',
                  })
                }
                label="Require password before redirect"
              />
            </div>
          </div>
          {form.requirePassword && (
            <Input
              label={detail.hasPassword ? 'New password (leave blank to keep current)' : 'Password'}
              type="password"
              placeholder="At least 4 characters"
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
              minLength={detail.hasPassword ? undefined : 4}
              maxLength={128}
              required={!detail.hasPassword}
            />
          )}
          {!form.requirePassword && detail.hasPassword && (
            <p className="text-xs text-[#697386]">Saving will remove the password gate.</p>
          )}
        </form>
      </Card>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="!p-5">
          <div className="text-xs font-medium uppercase tracking-wide text-[#697386]">Status</div>
          <div className="mt-2 flex items-center gap-2">
            <Badge variant={detail.status === 'ACTIVE' ? 'success' : 'outline'}>
              {detail.status === 'ACTIVE' ? 'Active' : 'Disabled'}
            </Badge>
            {detail.collectEmail && <Badge variant="default">Email gate</Badge>}
            {detail.hasPassword && <Badge variant="warning">Password</Badge>}
          </div>
        </Card>
        <Card className="!p-5">
          <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-[#697386]">
            <MousePointerClick className="h-3.5 w-3.5" /> Total clicks
          </div>
          <div className="mt-1 text-2xl font-semibold text-[#0a2540]">{detail.clickCount}</div>
          <div className="mt-1 text-xs text-[#697386]">
            {todayClicks} today
            {detail.analytics.lastClickAt
              ? ` - last ${formatRelative(detail.analytics.lastClickAt)}`
              : ''}
          </div>
        </Card>
        <Card className="!p-5">
          <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-[#697386]">
            <Mail className="h-3.5 w-3.5" /> Emails captured
          </div>
          <div className="mt-1 text-2xl font-semibold text-[#0a2540]">{detail.leadCount}</div>
          <div className="mt-1 text-xs text-[#697386]">
            {detail.analytics.lastLeadAt
              ? `Last ${formatRelative(detail.analytics.lastLeadAt)}`
              : detail.collectEmail
                ? 'Waiting for first email'
                : 'Email gate off'}
          </div>
        </Card>
        <Card className="!p-5">
          <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-[#697386]">
            <Clock className="h-3.5 w-3.5" /> Created
          </div>
          <div className="mt-1 text-sm font-medium text-[#0a2540]">
            {formatAbsolute(detail.createdAt)}
          </div>
          <div className="mt-1 text-xs text-[#697386]">{formatRelative(detail.createdAt)}</div>
        </Card>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <SegmentedControl
          value={tab}
          onChange={setTab}
          options={[
            { value: 'overview', label: 'Overview' },
            { value: 'emails', label: `Emails (${detail.leadCount})` },
            { value: 'clicks', label: `Clicks (${detail.clickCount})` },
            { value: 'activity', label: 'Activity' },
          ]}
        />
      </div>

      {tab === 'overview' && (
        <div className="space-y-4">
          <Card className="!p-6">
            <div className="mb-4 flex items-end justify-between gap-3">
              <div>
                <h2 className="text-lg font-medium text-[#0a2540]">Clicks - last 30 days</h2>
                <p className="mt-1 text-sm text-[#697386]">Hover a bar for the exact day count.</p>
              </div>
            </div>
            <div className="flex h-40 items-end gap-1">
              {detail.analytics.clicksByDay.map((d) => (
                <div
                  key={d.date}
                  className="group relative flex flex-1 flex-col items-center justify-end"
                >
                  <div className="pointer-events-none absolute bottom-full mb-2 hidden rounded-md bg-[#0a2540] px-2 py-1 text-[11px] text-white shadow-lg group-hover:block">
                    {d.date}: {d.count}
                  </div>
                  <div
                    className="w-full rounded-t bg-[#635bff]/85 transition-colors group-hover:bg-[#635bff]"
                    style={{
                      height: `${d.count === 0 ? 3 : Math.max(8, (d.count / maxDay) * 100)}%`,
                      opacity: d.count === 0 ? 0.25 : 1,
                    }}
                  />
                </div>
              ))}
            </div>
            <div className="mt-2 flex justify-between text-[10px] text-[#697386]">
              <span>{detail.analytics.clicksByDay[0]?.date}</span>
              <span>{detail.analytics.clicksByDay.at(-1)?.date}</span>
            </div>
          </Card>

          <Card className="!p-6">
            <h2 className="mb-3 text-lg font-medium text-[#0a2540]">Latest activity</h2>
            {detail.analytics.activity.length === 0 ? (
              <p className="text-sm text-[#697386]">No clicks or emails yet. Share the public URL to start.</p>
            ) : (
              <ul className="divide-y divide-[#f0f2f5]">
                {detail.analytics.activity.slice(0, 8).map((item) => (
                  <li key={item.id} className="flex items-start justify-between gap-4 py-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <Badge variant={item.kind === 'email' ? 'default' : 'outline'}>
                          {item.kind === 'email' ? 'Email' : 'Click'}
                        </Badge>
                        <span className="truncate text-sm font-medium text-[#0a2540]">
                          {item.summary}
                        </span>
                      </div>
                      <div className="mt-1 text-xs text-[#697386]">
                        {formatAbsolute(item.createdAt)}
                      </div>
                    </div>
                    <span className="shrink-0 text-xs text-[#697386]">
                      {formatRelative(item.createdAt)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      )}

      {tab === 'emails' && (
        <Card className="!p-0 overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#e8edf3] px-5 py-4">
            <div>
              <h2 className="text-lg font-medium text-[#0a2540]">Emails captured</h2>
              <p className="mt-0.5 text-sm text-[#697386]">
                Showing {filteredLeads.length}
                {detail.analytics.leadsReturned < detail.leadCount
                  ? ` of latest ${detail.analytics.leadsReturned}`
                  : ''}{' '}
                - total {detail.leadCount}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#a3acb9]" />
                <input
                  value={emailQuery}
                  onChange={(e) => setEmailQuery(e.target.value)}
                  placeholder="Search email…"
                  className="w-56 rounded-lg border border-[#e3e8ee] bg-white py-2 pl-9 pr-3 text-sm outline-none focus:border-[#635bff] focus:ring-2 focus:ring-[#635bff]/20"
                />
              </div>
              <Button
                variant="secondary"
                onClick={exportEmailsCsv}
                disabled={detail.analytics.leads.length === 0}
              >
                <Download className="h-4 w-4" /> Export CSV
              </Button>
            </div>
          </div>
          {filteredLeads.length === 0 ? (
            <p className="p-8 text-sm text-[#697386]">
              {detail.leadCount === 0
                ? detail.collectEmail
                  ? 'No emails yet. When someone submits the gate, they appear here with the exact time.'
                  : 'Email gate is off for this link. Turn it on in Overview → Settings to capture emails.'
                : 'No emails match your search.'}
            </p>
          ) : (
            <Table headers={['#', 'Email', 'Captured (local)', 'Relative', '']}>
              {filteredLeads.map((l, idx) => (
                <tr key={l.id}>
                  <td className="px-4 py-3 text-xs text-[#a3acb9]">{idx + 1}</td>
                  <td className="px-4 py-3">
                    <a
                      href={`mailto:${l.email}`}
                      className="font-medium text-[#0a2540] hover:text-[#635bff]"
                    >
                      {l.email}
                    </a>
                  </td>
                  <td className="px-4 py-3 text-sm text-[#425466]">
                    {formatAbsolute(l.createdAt)}
                  </td>
                  <td className="px-4 py-3 text-sm text-[#697386]">
                    {formatRelative(l.createdAt)}
                  </td>
                  <td className="px-4 py-3">
                    <button
                      type="button"
                      className="rounded p-1.5 text-[#a3acb9] hover:bg-[#f0f4f8] hover:text-[#0a2540]"
                      title="Copy email"
                      onClick={async () => {
                        await copyText(l.email);
                        markCopied(l.id);
                      }}
                    >
                      <Copy className="h-4 w-4" />
                    </button>
                    {copiedId === l.id && (
                      <span className="ml-1 text-xs text-[#635bff]">Copied</span>
                    )}
                  </td>
                </tr>
              ))}
            </Table>
          )}
        </Card>
      )}

      {tab === 'clicks' && (
        <Card className="!p-0 overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#e8edf3] px-5 py-4">
            <div>
              <h2 className="text-lg font-medium text-[#0a2540]">Click log</h2>
              <p className="mt-0.5 text-sm text-[#697386]">
                Showing {filteredClicks.length}
                {detail.analytics.clicksReturned < detail.clickCount
                  ? ` of latest ${detail.analytics.clicksReturned}`
                  : ''}{' '}
                - total {detail.clickCount}
              </p>
            </div>
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#a3acb9]" />
              <input
                value={clickQuery}
                onChange={(e) => setClickQuery(e.target.value)}
                placeholder="Search referrer, browser…"
                className="w-64 rounded-lg border border-[#e3e8ee] bg-white py-2 pl-9 pr-3 text-sm outline-none focus:border-[#635bff] focus:ring-2 focus:ring-[#635bff]/20"
              />
            </div>
          </div>
          {filteredClicks.length === 0 ? (
            <p className="p-8 text-sm text-[#697386]">
              {detail.clickCount === 0
                ? 'No clicks yet.'
                : 'No clicks match your search.'}
            </p>
          ) : (
            <Table headers={['When', 'Relative', 'Source', 'Browser', 'Device', 'OS']}>
              {filteredClicks.map((c) => (
                <tr key={c.id}>
                  <td className="px-4 py-3 text-sm text-[#0a2540]">
                    <div>{formatAbsolute(c.createdAt)}</div>
                    <div className="mt-0.5 font-mono text-[11px] text-[#a3acb9]">
                      {new Date(c.createdAt).toISOString()}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-sm text-[#697386]">
                    {formatRelative(c.createdAt)}
                  </td>
                  <td className="px-4 py-3 text-sm text-[#425466]">
                    {c.referrerHost ? (
                      <a
                        href={c.referrer ?? undefined}
                        target="_blank"
                        rel="noreferrer"
                        className="text-[#635bff] hover:underline"
                        title={c.referrer ?? undefined}
                      >
                        {c.referrerHost}
                      </a>
                    ) : (
                      <span className="text-[#a3acb9]">Direct / unknown</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <Badge variant="outline">{c.browser}</Badge>
                  </td>
                  <td className="px-4 py-3 text-sm text-[#425466]">{c.device}</td>
                  <td className="px-4 py-3 text-sm text-[#425466]">{c.os}</td>
                </tr>
              ))}
            </Table>
          )}
        </Card>
      )}

      {tab === 'activity' && (
        <Card className="!p-0 overflow-hidden">
          <div className="border-b border-[#e8edf3] px-5 py-4">
            <h2 className="text-lg font-medium text-[#0a2540]">Combined timeline</h2>
            <p className="mt-0.5 text-sm text-[#697386]">
              Emails and clicks in one feed (latest 100 events loaded).
            </p>
          </div>
          {detail.analytics.activity.length === 0 ? (
            <p className="p-8 text-sm text-[#697386]">No activity yet.</p>
          ) : (
            <ul className="divide-y divide-[#f0f2f5]">
              {detail.analytics.activity.map((item) => (
                <li key={item.id} className="flex items-start gap-4 px-5 py-4">
                  <div
                    className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${
                      item.kind === 'email'
                        ? 'bg-[#f0f0ff] text-[#635bff]'
                        : 'bg-[#f6f9fc] text-[#425466]'
                    }`}
                  >
                    {item.kind === 'email' ? (
                      <Mail className="h-4 w-4" />
                    ) : (
                      <MousePointerClick className="h-4 w-4" />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant={item.kind === 'email' ? 'default' : 'outline'}>
                        {item.kind === 'email' ? 'Email entered' : 'Link clicked'}
                      </Badge>
                      <span className="text-sm font-medium text-[#0a2540]">{item.summary}</span>
                    </div>
                    <div className="mt-1 text-sm text-[#425466]">
                      {formatAbsolute(item.createdAt)}
                      <span className="text-[#a3acb9]"> - {formatRelative(item.createdAt)}</span>
                    </div>
                    {item.kind === 'email' && item.email && (
                      <button
                        type="button"
                        className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-[#635bff]"
                        onClick={async () => {
                          await copyText(item.email!);
                          markCopied(item.id);
                        }}
                      >
                        <Copy className="h-3.5 w-3.5" />
                        {copiedId === item.id ? 'Copied' : 'Copy email'}
                      </button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>
      )}
    </div>
  );
}

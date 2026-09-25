'use client';

import { Copy, Eye, MousePointerClick, Pencil, Send, Trash2, Users } from 'lucide-react';
import { Badge, Button, EmptyState, Input, Select, StatCard, Table } from '@/components/ui';
import {
  PersonCell,
  campaignTemplateLabel,
  formatWhen,
  percent,
  recipientStatusLabel,
  recipientStatusVariant,
  sourceLabel,
  statusVariant,
} from './campaign-shared';

export type HistoryDetailTab = 'overview' | 'recipients' | 'links';

export function CampaignHistoryDetail({
  detail,
  tab,
  activity,
  activitySearch,
  selectedRecipientIds,
  saving,
  onTabChange,
  onActivityChange,
  onActivitySearchChange,
  onToggleRecipient,
  onEditDraft,
  onDeleteDraft,
  onDuplicate,
  onResendAll,
  onResendUndelivered,
  onResendSelected,
  onCancel,
}: {
  detail: any;
  tab: HistoryDetailTab;
  activity: string;
  activitySearch: string;
  selectedRecipientIds: Set<string>;
  saving: boolean;
  onTabChange: (tab: HistoryDetailTab) => void;
  onActivityChange: (value: string) => void;
  onActivitySearchChange: (value: string) => void;
  onToggleRecipient: (id: string) => void;
  onEditDraft: () => void;
  onDeleteDraft: () => void;
  onDuplicate: () => void;
  onResendAll: () => void;
  onResendUndelivered: () => void;
  onResendSelected: () => void;
  onCancel: () => void;
}) {
  const isDraft = detail.status === 'DRAFT';
  const canResend = detail.status === 'COMPLETED' || detail.status === 'CANCELLED';

  return (
    <div className="min-w-0 flex-1 space-y-4 p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="truncate text-lg font-semibold text-[#0a2540]">{detail.subject}</h2>
            <Badge variant={statusVariant(detail.status)}>{detail.status}</Badge>
          </div>
          <p className="mt-1 text-xs text-[#697386]">
            {campaignTemplateLabel(detail.templateId)} · {detail.fromAddress}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {isDraft ? (
            <>
              <Button size="sm" variant="secondary" onClick={onEditDraft}>
                <Pencil className="h-4 w-4" />
                Edit in compose
              </Button>
              <Button size="sm" variant="destructive" onClick={onDeleteDraft}>
                <Trash2 className="h-4 w-4" />
                Delete draft
              </Button>
            </>
          ) : (
            <>
              <Button size="sm" variant="secondary" disabled={saving} onClick={onDuplicate}>
                <Copy className="h-4 w-4" />
                Duplicate
              </Button>
              {canResend && (
                <>
                  <Button size="sm" variant="secondary" onClick={onResendAll}>
                    Resend to all
                  </Button>
                  <Button size="sm" variant="secondary" onClick={onResendUndelivered}>
                    Resend undelivered
                  </Button>
                  {selectedRecipientIds.size > 0 && (
                    <Button size="sm" onClick={onResendSelected}>
                      Resend selected ({selectedRecipientIds.size})
                    </Button>
                  )}
                </>
              )}
              {detail.status !== 'COMPLETED' && detail.status !== 'CANCELLED' && (
                <Button size="sm" variant="destructive" onClick={onCancel}>
                  Cancel remaining
                </Button>
              )}
            </>
          )}
        </div>
      </div>

      <div className="inline-flex rounded-xl bg-white p-1 ring-1 ring-[#e3e8ee]">
        {([
          ['overview', 'Overview'],
          ['recipients', 'Recipients'],
          ['links', 'Links'],
        ] as const).map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => onTabChange(id)}
            className={`rounded-lg px-3 py-1.5 text-xs font-medium ${
              tab === id ? 'bg-[#0a2540] text-white' : 'text-[#425466]'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === 'overview' && (
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard title="Sent" value={String(detail.sentCount ?? 0)} icon={Send} />
            <StatCard title="Unique opens" value={`${detail.uniqueOpens ?? 0}`} subtitle={percent(detail.openRate)} icon={Eye} />
            <StatCard title="Unique clicks" value={`${detail.uniqueClicks ?? 0}`} subtitle={percent(detail.clickRate)} icon={MousePointerClick} />
            <StatCard title="Skipped / failed" value={`${detail.skippedCount ?? 0} / ${detail.failedCount ?? 0}`} icon={Users} />
          </div>
          <div className="grid gap-2 rounded-xl border border-[#eef1f5] bg-[#f6f9fc] px-4 py-3 text-xs text-[#425466] sm:grid-cols-2">
            <p><span className="text-[#697386]">Heading:</span> {detail.heading}</p>
            <p><span className="text-[#697386]">Audience:</span> {detail.audience}</p>
            <p><span className="text-[#697386]">Created:</span> {formatWhen(detail.createdAt)}</p>
            <p><span className="text-[#697386]">Started:</span> {formatWhen(detail.startedAt)}</p>
          </div>
          {detail.previewHtml ? (
            <div className="overflow-hidden rounded-2xl border border-[#1b2430] bg-[#111827]">
              <div className="border-b border-white/10 px-4 py-2 text-xs text-white/60">Sent email preview</div>
              <iframe title="Campaign preview" className="h-[640px] w-full bg-white" srcDoc={detail.previewHtml} />
            </div>
          ) : (
            <EmptyState icon={Eye} title="No preview" description="This campaign has no rendered preview yet." />
          )}
        </div>
      )}

      {tab === 'recipients' && (
        <div className="space-y-3">
          <div className="flex flex-wrap gap-2">
            <Select
              value={activity}
              onChange={(e) => onActivityChange(e.target.value)}
              options={[
                { value: 'all', label: 'All' },
                { value: 'sent', label: 'Sent' },
                { value: 'not_sent', label: 'Not sent' },
                { value: 'skipped', label: 'Skipped' },
                { value: 'failed', label: 'Failed' },
                { value: 'unsubscribed', label: 'Unsubscribed' },
                { value: 'opened', label: 'Opened' },
                { value: 'clicked', label: 'Clicked' },
                { value: 'not_opened', label: 'Not opened' },
                { value: 'not_clicked', label: 'Not clicked' },
              ]}
            />
            <Input placeholder="Search email" value={activitySearch} onChange={(e) => onActivitySearchChange(e.target.value)} />
          </div>
          <Table headers={['', 'Person', 'Delivery', 'Source', 'Opened', 'Clicked']}>
            {(detail.recipients ?? []).map((row: any) => (
              <tr key={row.id}>
                <td className="px-4 py-3">
                  {canResend && (
                    <input
                      type="checkbox"
                      checked={selectedRecipientIds.has(row.id)}
                      onChange={() => onToggleRecipient(row.id)}
                      className="h-4 w-4 rounded border-[#cfd6de] text-[#635bff]"
                      aria-label={`Select ${row.email}`}
                    />
                  )}
                </td>
                <td className="px-4 py-3">
                  <PersonCell email={row.email} name={row.displayName} merchantId={row.merchantId} />
                </td>
                <td className="px-4 py-3">
                  <div className="space-y-1">
                    <Badge variant={recipientStatusVariant(row.status)}>{recipientStatusLabel(row.status)}</Badge>
                    {row.deliveryNote && (
                      <p className="max-w-xs text-xs leading-relaxed text-[#697386]">{row.deliveryNote}</p>
                    )}
                  </div>
                </td>
                <td className="px-4 py-3"><Badge variant="outline">{sourceLabel(row.source)}</Badge></td>
                <td className="px-4 py-3 text-xs text-[#697386]">
                  {row.firstOpenedAt ? `${row.openCount} · ${formatWhen(row.firstOpenedAt)}` : '-'}
                </td>
                <td className="px-4 py-3 text-xs text-[#697386]">
                  {row.firstClickedAt ? `${row.clickCount} · ${formatWhen(row.firstClickedAt)}` : '-'}
                </td>
              </tr>
            ))}
          </Table>
        </div>
      )}

      {tab === 'links' && (
        <div className="space-y-5">
          {(detail.clicksByCta ?? []).length === 0 && (detail.otherLinkClicks ?? detail.clicksByUrl ?? []).length === 0 ? (
            <EmptyState icon={MousePointerClick} title="No clicks yet" description="Clicks appear when someone follows a tracked link." />
          ) : (
            <>
              {(detail.clicksByCta ?? []).length > 0 && (
                <div>
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-[#697386]">Buttons</p>
                  <Table headers={['Button', 'URL', 'Clicks', 'Emails']}>
                    {detail.clicksByCta.map((row: any) => (
                      <tr key={row.ctaId}>
                        <td className="px-4 py-3 text-sm font-medium text-[#0a2540]">{row.label || 'Button'}</td>
                        <td className="px-4 py-3 text-xs break-all">{row.url}</td>
                        <td className="px-4 py-3 text-sm">{row.count}</td>
                        <td className="px-4 py-3 text-xs text-[#697386]">{(row.emails ?? []).join(', ') || '—'}</td>
                      </tr>
                    ))}
                  </Table>
                </div>
              )}
              {((detail.otherLinkClicks ?? detail.clicksByUrl) ?? []).length > 0 && (
                <div>
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-[#697386]">Other links</p>
                  <Table headers={['URL', 'Clicks', 'Emails']}>
                    {(detail.otherLinkClicks ?? detail.clicksByUrl).map((row: any) => (
                      <tr key={row.url}>
                        <td className="px-4 py-3 text-xs break-all">{row.url}</td>
                        <td className="px-4 py-3 text-sm">{row.count}</td>
                        <td className="px-4 py-3 text-xs text-[#697386]">{row.emails.join(', ')}</td>
                      </tr>
                    ))}
                  </Table>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

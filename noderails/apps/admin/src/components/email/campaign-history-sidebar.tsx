'use client';

import { Search, Trash2 } from 'lucide-react';
import { Badge } from '@/components/ui';
import { campaignTemplateLabel, formatWhen, percent, statusVariant } from './campaign-shared';

export type HistoryStatusFilter = 'all' | 'drafts' | 'sent';

export interface HistoryCampaignRow {
  id: string;
  subject: string;
  status: string;
  templateId?: string;
  fromAddress: string;
  sentCount: number;
  uniqueOpens: number;
  uniqueClicks: number;
  openRate?: number;
  createdAt: string;
}

export function CampaignHistorySidebar({
  campaigns,
  selectedId,
  status,
  search,
  page,
  total,
  pageSize,
  onSelect,
  onStatusChange,
  onSearchChange,
  onPageChange,
  onDeleteDraft,
}: {
  campaigns: HistoryCampaignRow[];
  selectedId: string | null;
  status: HistoryStatusFilter;
  search: string;
  page: number;
  total: number;
  pageSize: number;
  onSelect: (id: string) => void;
  onStatusChange: (status: HistoryStatusFilter) => void;
  onSearchChange: (value: string) => void;
  onPageChange: (page: number) => void;
  onDeleteDraft: (id: string) => void;
}) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  return (
    <div className="flex h-full min-h-[640px] w-full flex-col border-r border-[#eef1f5] bg-white lg:w-[320px] lg:shrink-0">
      <div className="space-y-3 border-b border-[#eef1f5] p-3">
        <div className="inline-flex w-full rounded-xl bg-[#f6f9fc] p-1">
          {([
            ['all', 'All'],
            ['drafts', 'Drafts'],
            ['sent', 'Sent'],
          ] as const).map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => onStatusChange(id)}
              className={`flex-1 rounded-lg px-2 py-1.5 text-xs font-medium ${
                status === id ? 'bg-white text-[#0a2540] shadow-sm' : 'text-[#425466]'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[#a3acb9]" />
          <input
            className="w-full rounded-lg border border-[#e3e8ee] bg-white py-2 pl-8 pr-3 text-sm text-[#0a2540] placeholder:text-[#a3acb9] focus:border-[#635bff] focus:outline-none focus:ring-2 focus:ring-[#635bff]/20"
            placeholder="Search campaigns"
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
          />
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-auto">
        {campaigns.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-[#697386]">No campaigns match this filter.</p>
        ) : campaigns.map((campaign) => {
          const active = selectedId === campaign.id;
          return (
            <div
              key={campaign.id}
              className={`flex items-start gap-2 border-b border-[#f0f2f5] ${
                active ? 'bg-[#f7f7ff]' : 'hover:bg-[#f6f9fc]'
              }`}
            >
              <button
                type="button"
                onClick={() => onSelect(campaign.id)}
                className="min-w-0 flex-1 px-4 py-3 text-left"
              >
                <div className="flex items-center gap-2">
                  <p className="truncate text-sm font-semibold text-[#0a2540]">{campaign.subject}</p>
                  <Badge variant={statusVariant(campaign.status)}>{campaign.status}</Badge>
                </div>
                <p className="mt-1 truncate text-[11px] text-[#697386]">
                  {campaignTemplateLabel(campaign.templateId)} · {formatWhen(campaign.createdAt)}
                </p>
                <p className="mt-1 text-[11px] text-[#697386]">
                  {campaign.sentCount} sent · {campaign.uniqueOpens} opens ({percent(campaign.openRate)})
                </p>
              </button>
              {campaign.status === 'DRAFT' && (
                <button
                  type="button"
                  className="mr-2 mt-3 rounded-md p-1 text-[#a3acb9] hover:bg-white hover:text-[#df1b41]"
                  onClick={() => onDeleteDraft(campaign.id)}
                  aria-label="Delete draft"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          );
        })}
      </div>
      <div className="flex items-center justify-between border-t border-[#eef1f5] px-3 py-2 text-[11px] text-[#697386]">
        <span>{total} campaigns</span>
        <div className="flex items-center gap-2">
          <button type="button" disabled={page <= 1} onClick={() => onPageChange(page - 1)} className="disabled:opacity-40">
            Prev
          </button>
          <span>{page}/{totalPages}</span>
          <button type="button" disabled={page >= totalPages} onClick={() => onPageChange(page + 1)} className="disabled:opacity-40">
            Next
          </button>
        </div>
      </div>
    </div>
  );
}

'use client';

import {
  CAMPAIGN_TEMPLATE_CATALOG,
  type CampaignTemplateMeta,
  type EmailCampaignTemplateId,
} from '@noderails/common';
import { Check } from 'lucide-react';
import { choiceCardClass } from '@/components/email/campaign-shared';

function Mini({ id }: { id: EmailCampaignTemplateId }) {
  switch (id) {
    case 'PARTNERSHIP':
      return (
        <div className="space-y-1.5 rounded-md border border-[#e3e8ee] bg-white p-2.5">
          <div className="flex items-center justify-between">
            <div className="h-1.5 w-10 rounded-full bg-[#0a2540]" />
            <div className="rounded-full border border-[#d2d2d7] px-1.5 py-0.5 text-[8px] font-semibold uppercase tracking-wide text-[#6e6e73]">
              Proposal
            </div>
          </div>
          <div className="h-2 w-4/5 rounded-sm bg-[#0a2540]/90" />
          <div className="space-y-1 rounded-md border border-[#eceff3] bg-[#f8fafc] p-1.5">
            <div className="h-1 w-full rounded-full bg-[#d9dee7]" />
            <div className="h-1 w-5/6 rounded-full bg-[#d9dee7]" />
            <div className="h-1 w-2/3 rounded-full bg-[#d9dee7]" />
          </div>
        </div>
      );
    case 'EVENT_INVITE':
      return (
        <div className="overflow-hidden rounded-md border border-[#e3e8ee] bg-white">
          <div className="h-1 bg-[#635bff]" />
          <div className="space-y-1.5 p-2.5">
            <div className="text-[8px] font-medium text-[#6e6e73]">You are invited</div>
            <div className="h-2 w-3/4 rounded-sm bg-[#0a2540]" />
            <div className="flex items-center gap-2 rounded-md border border-[#eceff3] bg-[#f7f7ff] px-1.5 py-1">
              <div className="flex h-6 w-6 flex-col items-center justify-center rounded bg-white text-[7px] font-semibold leading-none text-[#635bff] shadow-[0_0_0_1px_#eceff3]">
                <span>OCT</span>
                <span className="text-[9px] text-[#0a2540]">2</span>
              </div>
              <div className="min-w-0 flex-1 space-y-1">
                <div className="h-1 w-full rounded-full bg-[#d9dee7]" />
                <div className="h-1 w-2/3 rounded-full bg-[#d9dee7]" />
              </div>
            </div>
          </div>
        </div>
      );
    case 'DIRECT_OUTREACH':
      return (
        <div className="space-y-1.5 rounded-md border border-[#e3e8ee] bg-white p-2.5">
          <div className="h-1.5 w-16 rounded-sm bg-[#0a2540]/80" />
          <div className="space-y-1">
            <div className="h-1 w-full rounded-full bg-[#d9dee7]" />
            <div className="h-1 w-11/12 rounded-full bg-[#d9dee7]" />
            <div className="h-1 w-2/3 rounded-full bg-[#d9dee7]" />
          </div>
          <div className="pt-1">
            <div className="h-1.5 w-14 rounded-sm bg-[#0a2540]" />
            <div className="mt-1 h-1 w-12 rounded-full bg-[#b4bac4]" />
          </div>
        </div>
      );
    case 'BUSINESS_OUTREACH':
      return (
        <div className="space-y-1.5 rounded-md border border-[#e3e8ee] bg-white p-2.5">
          <div className="flex items-center gap-1.5">
            <div className="h-3 w-3 rounded bg-[#0a2540]" />
            <div className="h-1.5 w-12 rounded-full bg-[#0a2540]" />
          </div>
          <div className="h-2 w-4/5 rounded-sm bg-[#0a2540]" />
          <div className="space-y-1">
            <div className="h-1 w-full rounded-full bg-[#d9dee7]" />
            <div className="h-1 w-5/6 rounded-full bg-[#d9dee7]" />
          </div>
          <div className="h-4 w-16 rounded border border-[#0a2540]" />
        </div>
      );
    case 'FOLLOW_UP':
      return (
        <div className="space-y-1.5 rounded-md border border-[#e3e8ee] bg-white p-2.5">
          <div className="h-1.5 w-20 rounded-sm bg-[#0a2540]/80" />
          <div className="space-y-1">
            <div className="h-1 w-full rounded-full bg-[#d9dee7]" />
            <div className="h-1 w-3/4 rounded-full bg-[#d9dee7]" />
          </div>
          <div className="space-y-1 border-l-2 border-[#cfd6de] pl-2">
            <div className="h-1 w-full rounded-full bg-[#e6e9ef]" />
            <div className="h-1 w-4/5 rounded-full bg-[#e6e9ef]" />
          </div>
        </div>
      );
    case 'ANNOUNCEMENT':
      return (
        <div className="space-y-1.5 rounded-md border border-[#e3e8ee] bg-white p-2.5">
          <div className="text-[8px] font-semibold uppercase tracking-[0.12em] text-[#635bff]">Notice</div>
          <div className="h-2 w-3/4 rounded-sm bg-[#0a2540]" />
          <div className="rounded-md bg-[#f4f6f8] px-1.5 py-1.5">
            <div className="h-1 w-full rounded-full bg-[#d9dee7]" />
            <div className="mt-1 h-1 w-2/3 rounded-full bg-[#d9dee7]" />
          </div>
        </div>
      );
    case 'UPDATES':
    default:
      return (
        <div className="overflow-hidden rounded-md border border-[#e3e8ee] bg-white">
          <div className="space-y-1.5 bg-black px-2.5 py-2">
            <div className="mx-auto h-1.5 w-10 rounded-full bg-white/80" />
            <div className="mx-auto h-2 w-3/4 rounded-sm bg-white" />
          </div>
          <div className="space-y-1 p-2.5">
            <div className="h-1 w-full rounded-full bg-[#d9dee7]" />
            <div className="h-1 w-4/5 rounded-full bg-[#d9dee7]" />
            <div className="mx-auto mt-1 h-3.5 w-14 rounded-full bg-black" />
          </div>
        </div>
      );
  }
}

function TemplateCard({
  meta,
  active,
  onSelect,
}: {
  meta: CampaignTemplateMeta;
  active: boolean;
  onSelect: (id: EmailCampaignTemplateId) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onSelect(meta.id)}
      className={`relative overflow-hidden rounded-xl border p-3 text-left transition-all ${choiceCardClass(active, false)}`}
    >
      {active && (
        <>
          <span className="absolute inset-y-0 left-0 w-1.5 bg-[#0a2540]" />
          <span className="absolute right-2.5 top-2.5 z-10 flex h-6 w-6 items-center justify-center rounded-full bg-[#0a2540] text-white shadow-sm">
            <Check className="h-3.5 w-3.5" strokeWidth={3} />
          </span>
        </>
      )}
      <Mini id={meta.id} />
      <p className="mt-2 text-sm font-semibold text-[#0a2540]">{meta.label}</p>
      <p className="mt-0.5 text-xs leading-relaxed text-[#697386]">{meta.description}</p>
    </button>
  );
}

export function CampaignTemplatePicker({
  value,
  onChange,
}: {
  value: EmailCampaignTemplateId;
  onChange: (id: EmailCampaignTemplateId) => void;
}) {
  const outreach = CAMPAIGN_TEMPLATE_CATALOG.filter((item) => item.category === 'outreach');
  const broadcast = CAMPAIGN_TEMPLATE_CATALOG.filter((item) => item.category === 'broadcast');
  return (
    <div className="space-y-4">
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#697386]">Outreach and partnerships</p>
        <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
          {outreach.map((meta) => (
            <TemplateCard key={meta.id} meta={meta} active={value === meta.id} onSelect={onChange} />
          ))}
        </div>
      </div>
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#697386]">Broadcast and product</p>
        <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
          {broadcast.map((meta) => (
            <TemplateCard key={meta.id} meta={meta} active={value === meta.id} onSelect={onChange} />
          ))}
        </div>
      </div>
    </div>
  );
}

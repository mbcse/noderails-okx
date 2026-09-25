'use client';

import Link from 'next/link';
import { CAMPAIGN_TEMPLATE_CATALOG } from '@noderails/common';

export function choiceCardClass(active: boolean, filled = true): string {
  if (active) {
    return filled
      ? 'border-[#0a2540] bg-[#0a2540] text-white ring-2 ring-[#0a2540]/30 ring-offset-2'
      : 'border-[#0a2540] bg-[#f4f6f8] ring-2 ring-[#0a2540] ring-offset-2';
  }
  return 'border-[#e3e8ee] bg-white hover:border-[#cfd6de]';
}

export function campaignTemplateLabel(id?: string | null): string {
  return CAMPAIGN_TEMPLATE_CATALOG.find((item) => item.id === id)?.label ?? 'Product updates';
}

export function percent(rate: number | undefined): string {
  if (!rate) return '0%';
  return `${Math.round(rate * 1000) / 10}%`;
}

export function initials(name: string | null, email: string): string {
  const source = (name || email.split('@')[0] || '?').trim();
  const parts = source.split(/[\s._-]+/).filter(Boolean);
  if (parts.length >= 2) return `${parts[0]![0]}${parts[1]![0]}`.toUpperCase();
  return source.slice(0, 2).toUpperCase();
}

export function formatWhen(value?: string | null): string {
  if (!value) return '-';
  return new Date(value).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

export function statusVariant(status: string): 'default' | 'success' | 'warning' | 'destructive' | 'outline' {
  if (status === 'COMPLETED') return 'success';
  if (status === 'SENDING' || status === 'QUEUED') return 'warning';
  if (status === 'CANCELLED' || status === 'FAILED') return 'destructive';
  return 'outline';
}

export function recipientStatusVariant(status: string): 'default' | 'success' | 'warning' | 'destructive' | 'outline' {
  if (status === 'SENT') return 'success';
  if (status === 'PENDING') return 'warning';
  if (status === 'SKIPPED' || status === 'CANCELLED') return 'outline';
  if (status === 'FAILED') return 'destructive';
  return 'default';
}

export function recipientStatusLabel(status: string): string {
  if (status === 'SENT') return 'Sent';
  if (status === 'PENDING') return 'Pending';
  if (status === 'SKIPPED') return 'Skipped';
  if (status === 'FAILED') return 'Failed';
  if (status === 'CANCELLED') return 'Cancelled';
  return status;
}

export function sourceLabel(source?: string): string {
  if (source === 'REGISTERED') return 'Registered';
  if (source === 'TEST') return 'Test';
  return 'Added';
}

export function PersonCell({
  email,
  name,
  merchantId,
}: {
  email: string;
  name?: string | null;
  merchantId?: string | null;
}) {
  const inner = (
    <div className="flex items-center gap-3">
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#f0f0ff] text-[11px] font-semibold text-[#635bff]">
        {initials(name ?? null, email)}
      </div>
      <div className="min-w-0">
        <p className="truncate text-sm font-medium text-[#0a2540]">{name || email}</p>
        {name ? <p className="truncate text-xs text-[#697386]">{email}</p> : null}
      </div>
    </div>
  );
  if (merchantId) {
    return (
      <Link href={`/dashboard/merchants/${merchantId}`} className="block hover:opacity-80">
        {inner}
      </Link>
    );
  }
  return inner;
}

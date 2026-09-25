'use client';

import type { ReactNode } from 'react';
import { clsx } from 'clsx';
import { AlertCircle, CheckCircle2, Info, X } from 'lucide-react';

export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        {eyebrow && (
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#635bff]">{eyebrow}</p>
        )}
        <h1 className={clsx('text-2xl font-bold tracking-tight text-[#0a2540]', eyebrow && 'mt-1')}>
          {title}
        </h1>
        {description && <p className="mt-1 max-w-2xl text-sm leading-relaxed text-[#697386]">{description}</p>}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}

export function Alert({
  tone = 'danger',
  children,
  onDismiss,
}: {
  tone?: 'danger' | 'success' | 'info';
  children: ReactNode;
  onDismiss?: () => void;
}) {
  const styles = {
    danger: 'border-[#fbb8c5] bg-[#fdf2f4] text-[#df1b41]',
    success: 'border-[#b8ebc9] bg-[#edfcf2] text-[#097c43]',
    info: 'border-[#d4d2ff] bg-[#f7f7ff] text-[#4f46c8]',
  };
  const Icon = tone === 'success' ? CheckCircle2 : tone === 'info' ? Info : AlertCircle;
  return (
    <div className={clsx('flex items-start gap-3 rounded-xl border px-4 py-3 text-sm', styles[tone])}>
      <Icon className="mt-0.5 h-4 w-4 shrink-0" />
      <div className="min-w-0 flex-1 leading-relaxed">{children}</div>
      {onDismiss && (
        <button type="button" onClick={onDismiss} className="shrink-0 opacity-60 hover:opacity-100">
          <X className="h-4 w-4" />
        </button>
      )}
    </div>
  );
}

export function SegmentedControl<T extends string>({
  value,
  onChange,
  options,
  dark,
}: {
  value: T;
  onChange: (value: T) => void;
  options: Array<{ value: T; label: string }>;
  dark?: boolean;
}) {
  return (
    <div className="inline-flex rounded-xl bg-white p-1 ring-1 ring-[#e3e8ee] shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
      {options.map((opt) => {
        const active = value === opt.value;
        return (
          <button
            key={opt.value}
            type="button"
            onClick={() => onChange(opt.value)}
            className={clsx(
              'rounded-lg px-3.5 py-1.5 text-sm font-medium transition-all',
              active
                ? dark
                  ? 'bg-[#0a2540] text-white shadow-sm'
                  : 'bg-[#f0f0ff] text-[#635bff]'
                : 'text-[#425466] hover:text-[#0a2540]',
            )}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}

export function Modal({
  title,
  description,
  children,
  onClose,
}: {
  title: string;
  description?: string;
  children: ReactNode;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#0a2540]/40 p-4 backdrop-blur-[2px]">
      <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-[0_24px_80px_rgba(10,37,64,0.28)]">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="text-lg font-semibold text-[#0a2540]">{title}</h3>
            {description && <p className="mt-1 text-sm leading-relaxed text-[#697386]">{description}</p>}
          </div>
          <button type="button" onClick={onClose} className="text-[#a3acb9] hover:text-[#425466]">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="mt-5">{children}</div>
      </div>
    </div>
  );
}

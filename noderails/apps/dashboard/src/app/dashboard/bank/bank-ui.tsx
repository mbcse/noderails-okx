'use client';

import { useState, type ComponentType, type ReactNode } from 'react';
import Image from 'next/image';
import {
  Banknote,
  Building2,
  Check,
  ChevronRight,
  Copy,
  CreditCard,
  FileText,
  Globe,
  Hash,
  Info,
  Landmark,
  MapPin,
  User,
  Wallet,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { currencyTheme, flagUrl, regionSceneUrl } from './bank-meta';

export const INSTRUCTION_FIELDS: Array<{
  keys: string[];
  label: string;
  icon: ComponentType<{ className?: string }>;
  mono?: boolean;
}> = [
  { keys: ['bank_name', 'bankName'], label: 'Bank name', icon: Building2 },
  { keys: ['bank_beneficiary_name', 'beneficiary_name', 'account_holder_name', 'account_holder'], label: 'Beneficiary', icon: User },
  { keys: ['account_number', 'bank_account_number', 'accountNumber'], label: 'Account number', icon: Hash, mono: true },
  { keys: ['iban'], label: 'IBAN', icon: CreditCard, mono: true },
  { keys: ['clabe'], label: 'CLABE', icon: CreditCard, mono: true },
  { keys: ['routing_number', 'bank_routing_number', 'routingNumber'], label: 'Routing number', icon: Landmark, mono: true },
  { keys: ['sort_code', 'sortCode'], label: 'Sort code', icon: Landmark, mono: true },
  { keys: ['bic', 'swift_code', 'swift'], label: 'SWIFT / BIC', icon: Globe, mono: true },
  { keys: ['bank_address', 'bank_beneficiary_address'], label: 'Bank address', icon: MapPin },
  { keys: ['reference', 'payment_reference', 'memo'], label: 'Reference', icon: FileText, mono: true },
];

function fieldText(value: unknown) {
  if (typeof value === 'string' && value.trim()) return value.trim();
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  return null;
}

export function flattenRecord(value: unknown, into: Record<string, unknown> = {}) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return into;
  for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
    if (nested && typeof nested === 'object' && !Array.isArray(nested)) {
      flattenRecord(nested, into);
    } else if (into[key] == null) {
      into[key] = nested;
    }
  }
  return into;
}

export function instructionRows(instructions: Record<string, unknown>) {
  const flat = flattenRecord(instructions);
  const seen = new Set<string>();
  const rows: Array<{
    label: string;
    value: string;
    icon: ComponentType<{ className?: string }>;
    mono?: boolean;
  }> = [];
  for (const field of INSTRUCTION_FIELDS) {
    if (seen.has(field.label)) continue;
    const raw = field.keys.map((key) => fieldText(flat[key])).find((item) => item);
    if (!raw) continue;
    seen.add(field.label);
    rows.push({
      label: field.label,
      value: raw,
      icon: field.icon,
      mono: field.mono,
    });
  }
  return rows;
}

export function CurrencyFlag({
  iso,
  code,
  size = 56,
  className,
}: {
  iso: string;
  code: string;
  size?: number;
  className?: string;
}) {
  return (
    <Image
      src={flagUrl(iso)}
      alt={`${code} region`}
      width={size}
      height={size}
      unoptimized
      className={cn(
        'rounded-full border-2 border-white object-cover shadow-sm ring-1 ring-border',
        className,
      )}
      style={{ width: size, height: size }}
    />
  );
}

export function SegmentedControl<T extends string>({
  value,
  onChange,
  options,
}: {
  value: T;
  onChange: (value: T) => void;
  options: Array<{ value: T; label: string }>;
}) {
  return (
    <div className="flex items-center gap-1 rounded-lg bg-white/70 p-1 ring-1 ring-black/5 backdrop-blur-sm">
      {options.map((opt) => (
        <button
          key={opt.value}
          type="button"
          onClick={() => onChange(opt.value)}
          className={cn(
            'rounded-md px-3 py-1.5 text-xs font-medium transition-all',
            value === opt.value
              ? 'bg-white text-foreground shadow-sm'
              : 'text-muted-foreground hover:bg-white/60 hover:text-foreground',
          )}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

/** @deprecated Use StatusBadge from @/components/status-badge for new code. */
export function StatusChip({
  children,
  tone = 'muted',
}: {
  children: ReactNode;
  tone?: 'muted' | 'live' | 'open' | 'renew' | 'warn' | 'danger';
}) {
  const toneToVariant: Record<string, 'success' | 'warning' | 'default' | 'destructive' | 'outline'> = {
    live: 'success',
    open: 'default',
    renew: 'warning',
    warn: 'warning',
    danger: 'destructive',
    muted: 'outline',
  };
  return (
    <Badge variant={toneToVariant[tone] ?? 'outline'}>
      {children}
    </Badge>
  );
}

export function CopyIconButton({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      /* ignore */
    }
  };

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          className="shrink-0 text-muted-foreground hover:text-foreground"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            void copy();
          }}
          aria-label={copied ? 'Copied' : 'Copy'}
        >
          {copied ? <Check className="text-emerald-600" /> : <Copy />}
        </Button>
      </TooltipTrigger>
      <TooltipContent>{copied ? 'Copied' : 'Copy'}</TooltipContent>
    </Tooltip>
  );
}

export function IconDetailRow({
  icon: Icon,
  label,
  value,
  mono,
}: {
  icon: ComponentType<{ className?: string }>;
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="flex items-start gap-3 py-3">
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-muted">
        <Icon className="h-4 w-4 text-muted-foreground" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
          {label}
        </p>
        <p className={cn('mt-0.5 break-all text-sm font-semibold text-foreground', mono && 'font-mono')}>
          {value}
        </p>
      </div>
      <CopyIconButton value={value} />
    </div>
  );
}

export function AccountDetailTile({
  icon: Icon,
  label,
  children,
  fullWidth,
}: {
  icon: ComponentType<{ className?: string }>;
  label: string;
  children: ReactNode;
  fullWidth?: boolean;
}) {
  return (
    <div className={cn('rounded-lg border border-border/70 bg-muted/30 px-3 py-2.5', fullWidth && 'col-span-full')}>
      <div className="mb-1 flex items-center gap-1.5">
        <Icon className="h-3.5 w-3.5 text-muted-foreground" />
        <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">{label}</p>
      </div>
      <div className="min-w-0">{children}</div>
    </div>
  );
}

export function CopyField({ value, mono = false }: { value: string; mono?: boolean }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      /* ignore */
    }
  };

  return (
    <div className="group inline-flex min-w-0 items-center gap-1.5">
      <span
        className={cn(
          'text-foreground',
          mono ? 'font-mono text-xs' : 'text-sm font-medium',
          value.length > 22 ? 'break-all' : 'whitespace-nowrap',
        )}
      >
        {value}
      </span>
      <button
        type="button"
        onClick={() => void copy()}
        className="shrink-0 rounded-md p-1 text-muted-foreground opacity-60 transition-opacity hover:bg-muted group-hover:opacity-100"
        title={copied ? 'Copied' : 'Copy'}
      >
        {copied ? <Check className="h-3 w-3 text-emerald-600" /> : <Copy className="h-3 w-3" />}
      </button>
    </div>
  );
}

export function DepositInstructionCard({
  meta,
  account,
  environmentLabel,
  footer,
}: {
  meta: { code: string; label: string; hint: string; flag: string };
  account: {
    status?: string | null;
    depositInstructions?: unknown;
    destinationAddress?: string | null;
    destinationChainId?: string | number | null;
    destinationTokenKey?: string | null;
  };
  environmentLabel?: string;
  footer?: ReactNode;
}) {
  const instructions = (account.depositInstructions && typeof account.depositInstructions === 'object')
    ? account.depositInstructions as Record<string, unknown>
    : {};
  const rows = instructionRows(instructions);
  const destBits = [
    account.destinationTokenKey,
    account.destinationChainId != null && account.destinationChainId !== ''
      ? `chain ${account.destinationChainId}`
      : null,
  ].filter(Boolean);
  const theme = currencyTheme(meta.code);
  const rails = meta.hint.split('·').map((item) => item.trim()).filter(Boolean);
  const wide = new Set(['Bank address', 'Receives as']);
  const statusLabel = prettyChip(account.status);
  const statusActive = statusLabel === 'active' || statusLabel === 'activated';

  return (
    <section className="group relative w-full overflow-hidden rounded-xl border border-border/80 bg-card shadow-sm">
      <div className="relative overflow-hidden px-3 pb-3.5 pt-3.5">
        <RegionScene flag={meta.flag} />
        <div className={cn('pointer-events-none absolute inset-0 bg-gradient-to-br opacity-40', theme.header)} />
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-slate-950/80 via-slate-950/35 to-slate-950/15" />
        <div className="relative flex items-start justify-between gap-2">
          <div className="flex min-w-0 items-center gap-2.5">
            <div className="relative shrink-0 pb-0.5 pr-0.5">
              <CurrencyFlag iso={meta.flag} code={meta.code} size={36} />
              <span className="absolute -bottom-0.5 -right-0.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-white px-0.5 text-[9px] font-bold text-slate-900 shadow ring-2 ring-white/80">
                {meta.code}
              </span>
            </div>
            <div className="min-w-0">
              <p className={cn('text-[10px] font-semibold uppercase tracking-[0.16em]', theme.accent)}>
                {meta.label}
              </p>
              <h3 className="mt-0.5 truncate text-sm font-semibold tracking-tight text-white">
                {meta.code} account
              </h3>
              <p className="mt-0.5 truncate text-[10px] text-white/60">
                {environmentLabel ?? 'Ready for deposits'}
                {destBits.length > 0 ? ` · ${destBits.join(' on ')}` : ''}
              </p>
            </div>
          </div>
          <Badge variant={statusActive ? 'success' : 'warning'}>
            {statusActive ? 'Active' : statusLabel}
          </Badge>
        </div>
        <div className="relative mt-2.5 flex flex-wrap gap-1">
          {rails.map((rail) => (
            <span
              key={rail}
              className="inline-flex items-center rounded-full border border-white/15 bg-white/10 px-2 py-0.5 text-[9px] font-medium text-white/90 backdrop-blur-sm"
            >
              {rail}
            </span>
          ))}
        </div>
      </div>
      <div className="space-y-2.5 p-3">
        {rows.length === 0 && !account.destinationAddress ? (
          <p className="text-xs text-muted-foreground">
            Deposit details appear after the account is ready.
          </p>
        ) : (
          <div className="grid grid-cols-2 gap-2">
            {rows.map((row) => (
              <AccountDetailTile
                key={row.label}
                icon={row.icon}
                label={row.label === 'Beneficiary' ? 'Account name' : row.label}
                fullWidth={wide.has(row.label)}
              >
                <CopyField value={row.value} mono={row.mono} />
              </AccountDetailTile>
            ))}
            {account.destinationAddress && (
              <AccountDetailTile icon={Wallet} label="Receives as" fullWidth>
                <CopyField value={account.destinationAddress} />
              </AccountDetailTile>
            )}
          </div>
        )}
        <div className="flex gap-2 rounded-lg border border-amber-200/70 bg-gradient-to-r from-amber-50/90 to-orange-50/50 px-2.5 py-2">
          <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-700" />
          <p className="text-[10px] leading-relaxed text-amber-950/90">
            This account only accepts {meta.hint.replaceAll(' · ', ', ')} transfers.
          </p>
        </div>
        {footer}
      </div>
    </section>
  );
}

function prettyChip(status?: string | null) {
  if (!status) return 'active';
  return status.replaceAll('_', ' ').toLowerCase();
}

function maskLast4(value: string | null | undefined) {
  if (!value) return null;
  const compact = value.replace(/\s/g, '');
  if (!compact) return null;
  if (compact.length < 4) return compact;
  return `····${compact.slice(-4)}`;
}

export function maskedPrimaryAccount(account: { depositInstructions?: unknown }) {
  const instructions = (account.depositInstructions && typeof account.depositInstructions === 'object')
    ? account.depositInstructions as Record<string, unknown>
    : {};
  const row = instructionRows(instructions).find((item) => (
    item.label === 'Account number' || item.label === 'IBAN' || item.label === 'CLABE'
  ));
  return maskLast4(row?.value);
}

export function maskedOwnAccount(corridor: Record<string, unknown> | null | undefined) {
  if (!corridor) return null;
  const raw = String(corridor.iban || corridor.accountNumber || corridor.account_number || '');
  return maskLast4(raw);
}

function RegionScene({ flag }: { flag: string }) {
  return (
    <Image
      src={regionSceneUrl(flag)}
      alt=""
      fill
      unoptimized
      sizes="280px"
      className="object-cover"
    />
  );
}

const PICK_CARD_CLASS =
  'group relative flex min-h-[188px] w-full cursor-pointer flex-col overflow-hidden rounded-2xl px-4 pb-0 pt-3.5 text-left shadow-[0_10px_28px_-14px_rgba(15,23,42,0.55)] transition-all';

function AccountPickShell({
  flag,
  themeClass,
  selected,
  onSelect,
  children,
}: {
  flag: string;
  themeClass: string;
  selected?: boolean;
  onSelect: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      className={cn(
        PICK_CARD_CLASS,
        selected
          ? 'ring-2 ring-primary ring-offset-2 ring-offset-background'
          : 'ring-1 ring-black/10 hover:-translate-y-1 hover:shadow-[0_18px_36px_-16px_rgba(15,23,42,0.75)]',
      )}
    >
      <RegionScene flag={flag} />
      <div className={cn('pointer-events-none absolute inset-0 bg-gradient-to-br opacity-45', themeClass)} />
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-slate-950/88 via-slate-950/40 to-slate-950/15" />
      <div className="relative flex min-h-0 flex-1 flex-col">
        {children}
        <div
          className={cn(
            'mt-auto flex items-center justify-between border-t px-0 py-2.5 text-[11px] font-medium',
            selected
              ? 'border-white/20 text-white'
              : 'border-white/15 text-white/80 group-hover:border-white/30 group-hover:text-white',
          )}
        >
          <span>{selected ? 'Showing details' : 'View details'}</span>
          {selected ? (
            <Check className="h-3.5 w-3.5" />
          ) : (
            <ChevronRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
          )}
        </div>
      </div>
    </button>
  );
}

export function OpenedAccountCard({
  meta,
  account,
  environmentLabel,
  selected,
  onSelect,
}: {
  meta: { code: string; label: string; hint: string; flag: string };
  account: {
    status?: string | null;
    depositInstructions?: unknown;
  };
  environmentLabel?: string;
  selected?: boolean;
  onSelect: () => void;
}) {
  const theme = currencyTheme(meta.code);
  const rails = meta.hint.split('·').map((item) => item.trim()).filter(Boolean);
  const masked = maskedPrimaryAccount(account);
  const statusLabel = prettyChip(account.status);
  const statusActive = statusLabel === 'active' || statusLabel === 'activated';

  return (
    <AccountPickShell
      flag={meta.flag}
      themeClass={theme.header}
      selected={selected}
      onSelect={onSelect}
    >
      <div className="flex items-start justify-between gap-2">
        <CurrencyFlag iso={meta.flag} code={meta.code} size={32} className="border-white/80" />
        <span className="inline-flex items-center gap-1 rounded-full bg-white/15 px-2 py-0.5 text-[10px] font-semibold text-white/95 ring-1 ring-white/20 backdrop-blur-sm">
          {statusActive && <Check className="h-2.5 w-2.5" />}
          {statusActive ? 'Active' : statusLabel}
        </span>
      </div>
      <div className="mt-3 min-w-0">
        <p className="text-[22px] font-semibold leading-none tracking-tight text-white">{meta.code}</p>
        <p className="mt-1 truncate text-[11px] font-medium text-white/70">{meta.label}</p>
        <p className="mt-2 font-mono text-[13px] tracking-[0.18em] text-white/90">
          {masked ?? 'Ready'}
        </p>
      </div>
      <div className="mt-2.5 flex flex-wrap items-center gap-1">
        {environmentLabel && (
          <span className="inline-flex items-center rounded-full bg-black/25 px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-wide text-white/75">
            {environmentLabel}
          </span>
        )}
        {rails.slice(0, 3).map((rail) => (
          <span
            key={rail}
            className="inline-flex items-center rounded-full border border-white/15 bg-white/10 px-1.5 py-0.5 text-[9px] font-medium text-white/85 backdrop-blur-sm"
          >
            {rail}
          </span>
        ))}
      </div>
    </AccountPickShell>
  );
}

export function OwnAccountPickCard({
  selected,
  status,
  corridor,
  onSelect,
}: {
  selected?: boolean;
  status?: string | null;
  corridor?: Record<string, unknown> | null;
  onSelect: () => void;
}) {
  const theme = currencyTheme('OWN');
  const verified = status === 'VERIFIED';
  const masked = maskedOwnAccount(corridor);
  const statusLabel = prettyChip(status ?? 'not started');

  return (
    <AccountPickShell
      flag="own"
      themeClass={theme.header}
      selected={selected}
      onSelect={onSelect}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex h-8 w-8 items-center justify-center rounded-full border-2 border-white/80 bg-white/15 shadow-sm backdrop-blur-sm">
          <Landmark className="h-3.5 w-3.5 text-white" />
        </div>
        <span className="inline-flex items-center gap-1 rounded-full bg-white/15 px-2 py-0.5 text-[10px] font-semibold text-white/95 ring-1 ring-white/20 backdrop-blur-sm">
          {verified && <Check className="h-2.5 w-2.5" />}
          {verified ? 'Verified' : statusLabel}
        </span>
      </div>
      <div className="mt-3 min-w-0">
        <p className="text-[22px] font-semibold leading-none tracking-tight text-white">OWN</p>
        <p className="mt-1 truncate text-[11px] font-medium text-white/70">Your bank</p>
        <p className="mt-2 font-mono text-[13px] tracking-[0.18em] text-white/90">
          {masked ?? (verified ? 'Connected' : 'Free')}
        </p>
      </div>
      <div className="mt-2.5">
        <span className="inline-flex items-center rounded-full border border-white/15 bg-white/10 px-1.5 py-0.5 text-[9px] font-medium text-white/85 backdrop-blur-sm">
          {verified ? 'Pay out' : 'Connect'}
        </span>
      </div>
    </AccountPickShell>
  );
}

export function ownAccountDetailRows(corridor: Record<string, unknown> | null | undefined) {
  if (!corridor) return [];
  const value = (...keys: string[]) => {
    const raw = keys.map((key) => corridor[key]).find((item) => typeof item === 'string' && item.trim());
    return typeof raw === 'string' ? raw.trim() : '';
  };
  return [
    { label: 'Account name', value: value('name', 'account_holder_name', 'accountHolder'), icon: User },
    { label: 'Bank name', value: value('bankName', 'bank_name'), icon: Building2 },
    { label: 'Country', value: value('country'), icon: Globe },
    { label: 'Currency', value: value('currency'), icon: Banknote },
    { label: 'Account number', value: value('accountNumber', 'account_number'), icon: Hash, mono: true },
    { label: 'Routing number', value: value('routingNumber', 'routing_number'), icon: Landmark, mono: true },
    { label: 'IBAN', value: value('iban'), icon: CreditCard, mono: true },
  ].filter((row) => row.value);
}

export function OwnAccountDetailsCard({
  corridor,
  status,
  rejectionReason,
  changeStatus,
  changeRejectionReason,
  onChangeClick,
}: {
  corridor: Record<string, unknown> | null | undefined;
  status?: string | null;
  rejectionReason?: string | null;
  changeStatus?: string | null;
  changeRejectionReason?: string | null;
  onChangeClick?: () => void;
}) {
  const rows = ownAccountDetailRows(corridor);
  const verified = status === 'VERIFIED';
  const changePending = changeStatus === 'PENDING_REVIEW';
  const changeRejected = changeStatus === 'REJECTED';
  const changeLabel = changePending ? 'View change' : changeRejected ? 'Try again' : 'Change details';

  return (
    <section className="rounded-xl border border-emerald-200/60 bg-gradient-to-br from-emerald-50/40 via-card to-card p-6 shadow-sm">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Landmark className="h-4 w-4 text-emerald-700" />
          <span className="text-sm font-semibold text-foreground">Own account</span>
        </div>
        <div className="flex items-center gap-3">
          {verified && onChangeClick && (
            <button
              type="button"
              onClick={onChangeClick}
              className="text-xs font-medium text-primary underline-offset-2 hover:underline"
            >
              {changeLabel}
            </button>
          )}
          <Badge variant={verified ? 'success' : status === 'REJECTED' ? 'destructive' : status === 'PENDING_REVIEW' ? 'default' : 'outline'}>
            {changePending ? 'Verified · change in review' : prettyChip(status ?? 'not started')}
          </Badge>
        </div>
      </div>
      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Add a bank account for settle-to-bank payouts.
        </p>
      ) : (
        <div className="rounded-xl border border-border bg-card/80 px-5 py-4">
          {rows.map((row) => (
            <div key={row.label} className="flex items-start justify-between gap-4 border-b border-border/50 py-2.5 last:border-0">
              <span className="w-36 shrink-0 text-xs font-medium text-muted-foreground">{row.label}</span>
              <div className="min-w-0 flex-1 text-right">
                <CopyField value={row.value} mono={row.mono} />
              </div>
            </div>
          ))}
        </div>
      )}
      {verified && !changePending && !changeRejected && (
        <p className="mt-4 text-xs text-emerald-800">
          Verified. Enable settle to bank in app Settings.
        </p>
      )}
      {changePending && (
        <p className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          New bank details are in review. This account stays active until the change is approved.
        </p>
      )}
      {changeRejected && (
        <p className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-destructive">
          {changeRejectionReason
            ? `Change rejected: ${changeRejectionReason}. This account is still active.`
            : 'Change rejected. Your current account is still active.'}
        </p>
      )}
      {rejectionReason && (
        <p className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-destructive">
          {rejectionReason}
        </p>
      )}
    </section>
  );
}

export function WorkspaceTabs<T extends string>({
  value,
  onChange,
  tabs,
}: {
  value: T;
  onChange: (value: T) => void;
  tabs: Array<{ id: T; label: string }>;
}) {
  return (
    <div className="flex gap-1 border-b border-border px-1">
      {tabs.map((item) => (
        <button
          key={item.id}
          type="button"
          onClick={() => onChange(item.id)}
          className={cn(
            'relative px-3 py-2.5 text-[13px] font-medium transition-colors',
            value === item.id ? 'text-foreground' : 'text-muted-foreground hover:text-foreground',
          )}
        >
          {item.label}
          {value === item.id && (
            <span className="absolute inset-x-2 bottom-0 h-0.5 rounded-full bg-primary" />
          )}
        </button>
      ))}
    </div>
  );
}

import * as React from 'react';
import { clsx } from 'clsx';

export function Card({
  children,
  className,
  gradient,
}: {
  children: React.ReactNode;
  className?: string;
  gradient?: boolean;
}) {
  return (
    <div
      className={clsx(
        'nr-card rounded-lg border border-border bg-card p-6',
        className,
      )}
    >
      {children}
    </div>
  );
}

export function StatCard({
  title,
  value,
  subtitle,
  trend,
  icon: Icon,
  gradient,
}: {
  title: string;
  value: string;
  subtitle?: string;
  trend?: { value: string; positive: boolean };
  icon?: React.ComponentType<{ className?: string }>;
  gradient?: boolean;
}) {
  return (
    <div className="nr-card rounded-xl border border-border bg-card p-5">
      <div className="flex items-start justify-between">
        <div className="space-y-1">
          <p className="text-xs font-medium text-muted-foreground tracking-wide uppercase">{title}</p>
          <p className="text-2xl font-bold tracking-tight">{value}</p>
          {trend && (
            <div className="flex items-center gap-1.5 mt-1">
              <span className={clsx(
                'inline-flex items-center rounded-md px-1.5 py-0.5 text-[10px] font-semibold',
                trend.positive
                  ? 'bg-emerald-50 text-success'
                  : 'bg-red-50 text-destructive',
              )}>
                {trend.positive ? '+' : ''}{trend.value}
              </span>
              {subtitle && <span className="text-xs text-muted-foreground">{subtitle}</span>}
            </div>
          )}
          {!trend && subtitle && (
            <p className="text-xs text-muted-foreground">{subtitle}</p>
          )}
        </div>
        {Icon && (
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-muted">
            <Icon className="h-5 w-5 text-muted-foreground" />
          </div>
        )}
      </div>
    </div>
  );
}

export function Badge({
  children,
  variant = 'default',
}: {
  children: React.ReactNode;
  variant?: 'default' | 'success' | 'warning' | 'destructive' | 'outline';
}) {
  const styles = {
    default: 'bg-primary/10 text-primary ring-primary/20',
    success: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
    warning: 'bg-amber-50 text-amber-700 ring-amber-200',
    destructive: 'bg-red-50 text-destructive ring-red-200',
    outline: 'bg-muted text-secondary-foreground ring-border',
  };

  return (
    <span
      className={clsx(
        'inline-flex items-center rounded-[6px] px-2 py-[3px] text-[11px] font-semibold ring-1 ring-inset',
        styles[variant],
      )}
    >
      {children}
    </span>
  );
}

export function Button({
  children,
  variant = 'primary',
  size = 'md',
  className,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary' | 'ghost' | 'destructive';
  size?: 'sm' | 'md' | 'lg';
}) {
  const variantStyles = {
    primary:
      'bg-primary text-primary-foreground hover:bg-[var(--primary-hover)] shadow-sm',
    secondary:
      'bg-card text-foreground hover:bg-muted ring-1 ring-border shadow-sm',
    ghost:
      'text-secondary-foreground hover:bg-muted hover:text-foreground',
    destructive:
      'bg-card text-destructive hover:bg-red-50 ring-1 ring-red-200 shadow-sm',
  };

  const sizeStyles = {
    sm: 'px-3 py-1.5 text-xs',
    md: 'px-4 py-2 text-sm',
    lg: 'px-6 py-2.5 text-sm',
  };

  return (
    <button
      className={clsx(
        'inline-flex items-center justify-center gap-2 rounded-md font-medium transition-colors duration-150 disabled:opacity-40 disabled:pointer-events-none cursor-pointer',
        variantStyles[variant],
        sizeStyles[size],
        className,
      )}
      {...props}
    >
      {children}
    </button>
  );
}

export function Input({
  label,
  error,
  icon: Icon,
  trailing,
  className,
  ...props
}: React.InputHTMLAttributes<HTMLInputElement> & {
  label?: string;
  error?: string;
  icon?: React.ComponentType<{ className?: string }>;
  trailing?: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      {label && (
        <label className="text-[13px] font-medium tracking-wide text-secondary-foreground">{label}</label>
      )}
      <div className="relative">
        {Icon && (
          <Icon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        )}
        <input
          className={clsx(
            'w-full rounded-[8px] border border-border/80 bg-card py-3 text-sm text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:ring-[3px] focus:ring-ring/20 focus:border-primary transition-all disabled:opacity-50 disabled:bg-muted',
            Icon ? 'pl-10' : 'pl-3.5',
            trailing ? 'pr-10' : 'pr-3.5',
            error && 'border-destructive focus:ring-destructive/20',
            className,
          )}
          {...props}
        />
        {trailing && (
          <div className="absolute right-2 top-1/2 -translate-y-1/2">{trailing}</div>
        )}
      </div>
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}

export function Select({
  label,
  options,
  className,
  ...props
}: React.SelectHTMLAttributes<HTMLSelectElement> & {
  label?: string;
  options: { value: string; label: string }[];
}) {
  return (
    <div className="space-y-1.5">
      {label && (
        <label className="text-[13px] font-medium tracking-wide text-secondary-foreground">{label}</label>
      )}
      <select
        className={clsx(
          'w-full rounded-[8px] border border-border/80 bg-card px-3.5 py-3 text-sm text-foreground focus:outline-none focus:ring-[3px] focus:ring-ring/20 focus:border-primary transition-all appearance-none cursor-pointer',
          className,
        )}
        {...props}
      >
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
    </div>
  );
}

export function Textarea({
  label,
  error,
  className,
  ...props
}: React.TextareaHTMLAttributes<HTMLTextAreaElement> & {
  label?: string;
  error?: string;
}) {
  return (
    <div className="space-y-1.5">
      {label && (
        <label className="text-[13px] font-medium tracking-wide text-secondary-foreground">{label}</label>
      )}
      <textarea
        className={clsx(
          'w-full rounded-[8px] border border-border/80 bg-card px-3.5 py-3 text-sm text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:ring-[3px] focus:ring-ring/20 focus:border-primary transition-all disabled:opacity-50 resize-none',
          error && 'border-destructive focus:ring-destructive/20',
          className,
        )}
        {...props}
      />
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}

export function Table({
  headers,
  children,
}: {
  headers: string[];
  children: React.ReactNode;
}) {
  return (
    <div className="overflow-x-auto rounded-lg border border-border bg-card shadow-none">
      <table className="w-full text-sm">
        <thead className="bg-muted/40">
          <tr className="border-b border-border">
            {headers.map((h) => (
              <th
                key={h}
                className="px-4 py-3.5 text-left text-xs font-medium text-muted-foreground uppercase tracking-wide"
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-border/40">{children}</tbody>
      </table>
    </div>
  );
}

export function EmptyState({
  title,
  description,
  action,
  icon: Icon,
}: {
  title: string;
  description: string;
  action?: React.ReactNode;
  icon?: React.ComponentType<{ className?: string }>;
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border py-10 bg-muted/30">
      {Icon && (
        <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-card shadow-sm border border-border">
          <Icon className="h-5 w-5 text-muted-foreground" />
        </div>
      )}
      <p className="text-sm font-semibold">{title}</p>
      <p className="mt-1 text-sm text-muted-foreground max-w-sm text-center">{description}</p>
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export function Spinner() {
  return (
    <div className="flex items-center justify-center py-12">
      <div className="h-7 w-7 animate-spin rounded-full border-2 border-border border-t-primary" />
    </div>
  );
}

export function Toggle({
  checked,
  onChange,
  label,
  disabled,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label?: string;
  disabled?: boolean;
}) {
  return (
    <label className={clsx('inline-flex items-center gap-2.5 cursor-pointer', disabled && 'opacity-50 pointer-events-none')}>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        disabled={disabled}
        className={clsx(
          'relative inline-flex h-[22px] w-[42px] items-center rounded-full transition-colors duration-200',
          checked ? 'bg-primary' : 'bg-border',
        )}
      >
        <span
          className={clsx(
            'inline-block h-4 w-4 rounded-full bg-card shadow-sm transition-transform duration-200',
            checked ? 'translate-x-[20px]' : 'translate-x-[3px]',
          )}
        />
      </button>
      {label && <span className="text-sm text-secondary-foreground">{label}</span>}
    </label>
  );
}

export function Checkbox({
  checked,
  onChange,
  label,
  disabled,
  className,
  ...props
}: Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type' | 'onChange' | 'checked'> & {
  checked?: boolean;
  onChange?: (checked: boolean) => void;
  label?: string;
}) {
  return (
    <label className={clsx('inline-flex items-center gap-2.5 cursor-pointer', disabled && 'opacity-50 pointer-events-none', className)}>
      <span className="relative inline-flex h-[18px] w-[18px] shrink-0 items-center justify-center">
        <input
          type="checkbox"
          checked={checked}
          disabled={disabled}
          onChange={(e) => onChange?.(e.target.checked)}
          className="peer h-[18px] w-[18px] cursor-pointer appearance-none rounded-[4px] border-2 border-border bg-card transition-all checked:border-primary checked:bg-primary focus:outline-none focus:ring-[3px] focus:ring-ring/20"
          {...props}
        />
        <svg
          viewBox="0 0 16 16"
          fill="none"
          className="pointer-events-none absolute h-3 w-3 text-primary-foreground opacity-0 peer-checked:opacity-100"
          aria-hidden
        >
          <path d="M3.5 8.2 6.4 11.1 12.5 4.8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </span>
      {label && <span className="text-sm text-secondary-foreground">{label}</span>}
    </label>
  );
}
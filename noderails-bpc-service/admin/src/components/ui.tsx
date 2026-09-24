import { clsx } from 'clsx';

export function Card({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={clsx(
        'rounded-[10px] border border-[#e3e8ee] bg-white p-6 shadow-[0_1px_3px_rgba(0,0,0,0.04)]',
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
  icon: Icon,
}: {
  title: string;
  value: string;
  subtitle?: string;
  icon?: React.ComponentType<{ className?: string }>;
}) {
  return (
    <div className="stat-shimmer rounded-[10px] border border-[#e3e8ee] bg-white p-5 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
      <div className="flex items-start justify-between">
        <div className="space-y-1">
          <p className="text-xs font-medium tracking-wide text-[#697386]">{title}</p>
          <p className="text-2xl font-semibold tracking-tight text-[#0a2540]">{value}</p>
          {subtitle && <p className="text-xs text-[#697386]">{subtitle}</p>}
        </div>
        {Icon && (
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-[#f6f8fa]">
            <Icon className="h-5 w-5 text-[#425466]" />
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
    default: 'bg-[#f0f0ff] text-[#635bff] ring-[#d4d2ff]',
    success: 'bg-[#edfcf2] text-[#097c43] ring-[#b8ebc9]',
    warning: 'bg-[#fef9ee] text-[#9e6c00] ring-[#fde68a]',
    destructive: 'bg-[#fdf2f4] text-[#df1b41] ring-[#fbb8c5]',
    outline: 'bg-[#f6f8fa] text-[#425466] ring-[#e3e8ee]',
  };

  return (
    <span
      className={clsx(
        'inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-semibold ring-1 ring-inset',
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
      'bg-[#635bff] text-white hover:bg-[#5851ea] shadow-[0_1px_2px_rgba(0,0,0,0.06),0_1px_3px_rgba(0,0,0,0.1)]',
    secondary:
      'bg-white text-[#0a2540] hover:bg-[#f6f8fa] ring-1 ring-[#e3e8ee] shadow-[0_1px_2px_rgba(0,0,0,0.04)]',
    ghost: 'text-[#425466] hover:bg-[#f6f8fa] hover:text-[#0a2540]',
    destructive:
      'bg-white text-[#df1b41] hover:bg-[#fdf2f4] ring-1 ring-[#fbb8c5] shadow-[0_1px_2px_rgba(0,0,0,0.04)]',
  };

  const sizeStyles = {
    sm: 'px-3 py-1.5 text-xs',
    md: 'px-4 py-2 text-sm',
    lg: 'px-6 py-2.5 text-sm',
  };

  return (
    <button
      className={clsx(
        'inline-flex cursor-pointer items-center justify-center gap-2 rounded-lg font-medium transition-all duration-150 disabled:pointer-events-none disabled:opacity-40',
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
  className,
  ...props
}: React.InputHTMLAttributes<HTMLInputElement> & {
  label?: string;
  error?: string;
}) {
  return (
    <div className="space-y-1.5">
      {label && <label className="text-[13px] font-medium text-[#425466]">{label}</label>}
      <input
        className={clsx(
          'w-full rounded-lg border border-[#e3e8ee] bg-white px-3.5 py-2.5 text-sm text-[#0a2540] placeholder:text-[#a3acb9] transition-all focus:border-[#635bff] focus:outline-none focus:ring-2 focus:ring-[#635bff]/20 disabled:bg-[#f6f8fa] disabled:opacity-50',
          error && 'border-[#df1b41] focus:ring-[#df1b41]/20',
          className,
        )}
        {...props}
      />
      {error && <p className="text-xs text-[#df1b41]">{error}</p>}
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
      {label && <label className="text-[13px] font-medium text-[#425466]">{label}</label>}
      <select
        className={clsx(
          'w-full cursor-pointer appearance-none rounded-lg border border-[#e3e8ee] bg-white px-3.5 py-2.5 text-sm text-[#0a2540] transition-all focus:border-[#635bff] focus:outline-none focus:ring-2 focus:ring-[#635bff]/20 disabled:cursor-not-allowed disabled:bg-[#f6f8fa] disabled:opacity-50',
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

export function Table({
  headers,
  children,
}: {
  headers: string[];
  children: React.ReactNode;
}) {
  return (
    <div className="overflow-x-auto rounded-[10px] border border-[#e3e8ee] bg-white shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-[#e3e8ee]">
            {headers.map((h) => (
              <th key={h} className="px-4 py-3 text-left text-xs font-medium text-[#697386]">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-[#f0f2f5]">{children}</tbody>
      </table>
    </div>
  );
}

export function PageHeader({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="mb-8 flex flex-wrap items-start justify-between gap-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-[#0a2540]">{title}</h1>
        {description && <p className="mt-1 text-sm text-[#697386]">{description}</p>}
      </div>
      {action}
    </div>
  );
}

export function Spinner() {
  return (
    <div className="flex items-center justify-center py-12">
      <div className="h-7 w-7 animate-spin rounded-full border-2 border-[#e3e8ee] border-t-[#635bff]" />
    </div>
  );
}

export function Alert({
  children,
  variant = 'error',
}: {
  children: React.ReactNode;
  variant?: 'error' | 'info';
}) {
  return (
    <div
      className={clsx(
        'mb-4 rounded-lg border px-4 py-3 text-sm',
        variant === 'error'
          ? 'border-[#fbb8c5] bg-[#fdf2f4] text-[#df1b41]'
          : 'border-[#bae6fd] bg-[#f0f9ff] text-[#0369a1]',
      )}
    >
      {children}
    </div>
  );
}

export function EmptyValue({ value }: { value?: string | null }) {
  if (value) return <>{value}</>;
  return <span className="text-[#a3acb9]">None</span>;
}

'use client';

import { IconWell, type Icon } from '@/components/icons';
import { cn } from '@/lib/utils';

export function StatCard({
  title,
  value,
  subtitle,
  trend,
  icon: Icon,
  className,
}: {
  title: string;
  value: string;
  subtitle?: string;
  trend?: { value: string; positive: boolean };
  icon?: Icon;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'nr-card rounded-lg border border-border bg-card p-5',
        className,
      )}
    >
      <div className="flex items-start justify-between">
        <div className="space-y-1">
          <p className="text-xs font-medium uppercase tracking-[0.06em] text-muted-foreground">
            {title}
          </p>
          <p className="text-[26px] font-semibold tracking-tight leading-none">
            {value}
          </p>
          {trend && (
            <div className="mt-1 flex items-center gap-1.5">
              <span
                className={cn(
                  'inline-flex items-center rounded-md px-1.5 py-0.5 text-xs font-medium',
                  trend.positive
                    ? 'bg-success-muted text-success'
                    : 'bg-destructive-muted text-destructive',
                )}
              >
                {trend.positive ? '+' : ''}
                {trend.value}
              </span>
              {subtitle && (
                <span className="text-xs text-muted-foreground">{subtitle}</span>
              )}
            </div>
          )}
          {!trend && subtitle && (
            <p className="text-xs text-muted-foreground">{subtitle}</p>
          )}
        </div>
        {Icon && <IconWell icon={Icon} />}
      </div>
    </div>
  );
}

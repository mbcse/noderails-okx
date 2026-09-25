import type { ComponentType, ReactNode } from 'react';
import { cn } from '@/lib/utils';

export function EmptyState({
  title,
  description,
  action,
  icon: Icon,
  className,
}: {
  title: string;
  description: string;
  action?: ReactNode;
  icon?: ComponentType<{ className?: string }>;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center rounded-xl border border-dashed border-border bg-muted/30 py-10',
        className,
      )}
    >
      {Icon && (
        <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl border border-black/[0.05] bg-white/90 shadow-[inset_0_1px_0_rgba(255,255,255,1)] backdrop-blur-sm">
          <Icon className="h-5 w-5 text-foreground" />
        </div>
      )}
      <p className="text-sm font-medium">{title}</p>
      <p className="mt-1 max-w-sm text-center text-sm text-muted-foreground">
        {description}
      </p>
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

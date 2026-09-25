import { cn } from '@/lib/utils';

export function Spinner({ className }: { className?: string }) {
  return (
    <div className={cn('flex items-center justify-center py-12', className)}>
      <div className="h-6 w-6 animate-spin rounded-full border-2 border-border border-t-primary" />
    </div>
  );
}

export function SkeletonRows({
  rows = 5,
  cols = 4,
  className,
}: {
  rows?: number;
  cols?: number;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'overflow-hidden rounded-xl border border-border bg-card',
        className,
      )}
    >
      <div className="border-b border-border bg-muted/50 px-4 py-3">
        <div className="flex gap-8">
          {Array.from({ length: cols }).map((_, i) => (
            <div
              key={i}
              className="h-3 animate-pulse rounded bg-muted-foreground/10"
              style={{ width: `${60 + (i % 3) * 20}px` }}
            />
          ))}
        </div>
      </div>
      {Array.from({ length: rows }).map((_, i) => (
        <div
          key={i}
          className="flex items-center gap-8 border-b border-border/50 px-4 py-4 last:border-0"
        >
          {Array.from({ length: cols }).map((_, j) => (
            <div
              key={j}
              className="h-3 animate-pulse rounded bg-muted-foreground/10"
              style={{
                width: `${40 + ((i + j) % 4) * 25}px`,
                animationDelay: `${(i * cols + j) * 50}ms`,
              }}
            />
          ))}
        </div>
      ))}
    </div>
  );
}

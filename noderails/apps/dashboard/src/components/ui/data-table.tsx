import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

export function DataTable({
  headers,
  children,
  className,
}: {
  headers: string[];
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'overflow-x-auto rounded-xl border border-border bg-card shadow-[var(--shadow-xs)]',
        className,
      )}
    >
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border bg-muted/50">
            {headers.map((h) => (
              <th
                key={h}
                className="h-10 px-4 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground"
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-border/50">{children}</tbody>
      </table>
    </div>
  );
}

export function DataTableRow({
  children,
  onClick,
  className,
}: {
  children: ReactNode;
  onClick?: () => void;
  className?: string;
}) {
  return (
    <tr
      onClick={onClick}
      className={cn(
        'h-12 border-b border-border/50 last:border-0 transition-colors duration-100',
        onClick && 'cursor-pointer hover:bg-muted/30',
        className,
      )}
    >
      {children}
    </tr>
  );
}

export function DataTableCell({
  children,
  mono,
  className,
}: {
  children: ReactNode;
  mono?: boolean;
  className?: string;
}) {
  return (
    <td
      className={cn(
        'px-4 py-3',
        mono && 'font-mono text-[13px]',
        className,
      )}
    >
      {children}
    </td>
  );
}

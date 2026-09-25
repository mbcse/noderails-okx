'use client';

import type { Icon, IconProps } from '@phosphor-icons/react';
import { IconContext } from '@phosphor-icons/react';
import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

export type { Icon, IconProps };
export { IconContext };

/** App-wide Phosphor defaults - regular stroke. Duotone looks cracked below ~24px. */
export const PHOSPHOR_DEFAULTS: IconProps = {
  weight: 'regular',
  size: 18,
  mirrored: false,
};

export function IconProvider({ children }: { children: ReactNode }) {
  return <IconContext.Provider value={PHOSPHOR_DEFAULTS}>{children}</IconContext.Provider>;
}

/** Quiet well for featured icons. Regular stroke only. */
export function IconWell({
  icon: Glyph,
  className,
  size = 20,
}: {
  icon: Icon;
  className?: string;
  size?: number;
}) {
  return (
    <div
      className={cn(
        'flex h-9 w-9 shrink-0 items-center justify-center rounded-[8px] bg-muted/60',
        className,
      )}
    >
      <Glyph weight="regular" size={size} className="text-foreground" />
    </div>
  );
}

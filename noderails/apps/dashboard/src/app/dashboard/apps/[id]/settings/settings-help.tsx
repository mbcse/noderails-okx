'use client';

import type { ReactNode } from 'react';
import { CircleHelp } from 'lucide-react';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';

export function HelpTip({
  content,
  children,
}: {
  content: string;
  children?: ReactNode;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        {children ?? (
          <button
            type="button"
            className="inline-flex text-foreground/55 hover:text-foreground cursor-help"
            aria-label={content}
          >
            <CircleHelp className="h-3.5 w-3.5" />
          </button>
        )}
      </TooltipTrigger>
      <TooltipContent side="top" className="max-w-xs text-left leading-snug">
        {content}
      </TooltipContent>
    </Tooltip>
  );
}

/** Disabled controls ignore pointer events; wrap so the tooltip still opens. */
export function TipWrap({
  content,
  disabled,
  children,
}: {
  content: string;
  disabled: boolean;
  children: ReactNode;
}) {
  if (!disabled) return <>{children}</>;
  return (
    <HelpTip content={content}>
      <span className="inline-flex">{children}</span>
    </HelpTip>
  );
}

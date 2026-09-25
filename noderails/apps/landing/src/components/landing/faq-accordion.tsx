'use client';

import { useState } from 'react';
import { Reveal } from '@/components/landing/motion';

export type FaqEntry = { q: string; a: string };

/**
 * Accessible accordion with buttery grid-rows height animation.
 * Multiple items can stay open (same behavior as the previous
 * <details> markup); question/answer content is passed through as-is.
 */
export function FaqAccordion({ items }: { items: readonly FaqEntry[] }) {
  const [open, setOpen] = useState<ReadonlySet<number>>(new Set());

  const toggle = (index: number) => {
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  };

  return (
    <div className="space-y-3">
      {items.map((item, i) => {
        const isOpen = open.has(i);
        const panelId = `faq-panel-${i}`;
        return (
          <Reveal
            key={item.q}
            delay={Math.min(i * 60, 240)}
            className={`nr-faq-item rounded-2xl px-6 py-5${isOpen ? ' is-open' : ''}`}
          >
            <button
              type="button"
              onClick={() => toggle(i)}
              aria-expanded={isOpen}
              aria-controls={panelId}
              className="flex w-full cursor-pointer items-center justify-between gap-4 text-left text-lg font-semibold text-zinc-900"
            >
              {item.q}
              <span className="nr-faq-icon text-zinc-400" aria-hidden>
                +
              </span>
            </button>
            <div id={panelId} className="nr-faq-body">
              <div className="overflow-hidden">
                <p className="pt-4 leading-relaxed text-zinc-600">{item.a}</p>
              </div>
            </div>
          </Reveal>
        );
      })}
    </div>
  );
}

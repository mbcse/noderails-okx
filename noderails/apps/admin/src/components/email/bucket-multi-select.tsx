'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Check, ChevronDown, Search, X } from 'lucide-react';

export interface SelectableBucket {
  id: string;
  name: string;
  memberCount?: number;
}

export function BucketMultiSelect({
  buckets,
  selected,
  onChange,
  label = 'Buckets',
  hint,
  emptyHint,
  placeholder = 'Select buckets',
}: {
  buckets: SelectableBucket[];
  selected: string[];
  onChange: (ids: string[]) => void;
  label?: string;
  hint?: string;
  emptyHint?: string;
  placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const rootRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const selectedSet = useMemo(() => new Set(selected), [selected]);
  const chosen = buckets.filter((bucket) => selectedSet.has(bucket.id));
  const visible = buckets.filter((bucket) => {
    const q = query.trim().toLowerCase();
    return !q || bucket.name.toLowerCase().includes(q);
  });

  const toggle = (id: string) => {
    onChange(selectedSet.has(id) ? selected.filter((item) => item !== id) : [...selected, id]);
  };

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
        setQuery('');
      }
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false);
        setQuery('');
      }
    };
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKey);
    const timer = window.setTimeout(() => searchRef.current?.focus(), 0);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKey);
      window.clearTimeout(timer);
    };
  }, [open]);

  return (
    <div ref={rootRef} className="space-y-2">
      <div className="flex items-center justify-between gap-3">
        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#697386]">{label}</p>
        {chosen.length > 0 && (
          <button type="button" className="text-[11px] font-medium text-[#635bff]" onClick={() => onChange([])}>
            Clear
          </button>
        )}
      </div>
      {hint && <p className="text-xs text-[#697386]">{hint}</p>}
      {!buckets.length ? (
        <div className="rounded-xl border border-dashed border-[#d4dbe3] bg-[#f6f9fc] px-3 py-4 text-xs text-[#697386]">
          {emptyHint ?? 'Create a bucket first, then tag people.'}
        </div>
      ) : (
        <div className="relative">
          <button
            type="button"
            onClick={() => setOpen((prev) => !prev)}
            aria-expanded={open}
            className={`flex w-full items-center gap-2 rounded-xl border bg-white px-3 py-2.5 text-left transition-colors ${
              open ? 'border-[#635bff] ring-2 ring-[#635bff]/15' : 'border-[#e3e8ee] hover:border-[#cfd6de]'
            }`}
          >
            <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5">
              {chosen.length === 0 ? (
                <span className="text-sm text-[#a3acb9]">{placeholder}</span>
              ) : chosen.map((bucket) => (
                <span
                  key={bucket.id}
                  className="inline-flex items-center gap-1 rounded-lg bg-[#f0f0ff] px-2 py-1 text-xs font-medium text-[#635bff] ring-1 ring-[#d8d4ff]"
                >
                  {bucket.name}
                  <span
                    role="button"
                    tabIndex={0}
                    onClick={(event) => {
                      event.stopPropagation();
                      toggle(bucket.id);
                    }}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault();
                        event.stopPropagation();
                        toggle(bucket.id);
                      }
                    }}
                    aria-label={`Remove ${bucket.name}`}
                  >
                    <X className="h-3 w-3" />
                  </span>
                </span>
              ))}
            </div>
            <ChevronDown className={`h-4 w-4 shrink-0 text-[#697386] transition-transform ${open ? 'rotate-180' : ''}`} />
          </button>
          {open && (
            <div className="absolute z-20 mt-2 w-full overflow-hidden rounded-xl border border-[#e3e8ee] bg-white shadow-[0_12px_32px_rgba(10,37,64,0.12)]">
              <div className="relative border-b border-[#eef1f5]">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[#a3acb9]" />
                <input
                  ref={searchRef}
                  className="w-full py-2.5 pl-9 pr-3 text-sm text-[#0a2540] placeholder:text-[#a3acb9] focus:outline-none"
                  placeholder="Search buckets"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                />
              </div>
              <div className="max-h-56 overflow-auto">
                {visible.length === 0 ? (
                  <p className="px-3 py-4 text-xs text-[#697386]">No buckets match that search.</p>
                ) : visible.map((bucket) => {
                  const active = selectedSet.has(bucket.id);
                  return (
                    <button
                      key={bucket.id}
                      type="button"
                      onClick={() => toggle(bucket.id)}
                      className={`flex w-full items-center gap-3 px-3 py-2.5 text-left ${
                        active ? 'bg-[#f7f7ff]' : 'hover:bg-[#f6f9fc]'
                      }`}
                    >
                      <span className={`flex h-4 w-4 items-center justify-center rounded border ${
                        active ? 'border-[#635bff] bg-[#635bff] text-white' : 'border-[#cfd6de] bg-white'
                      }`}>
                        {active && <Check className="h-3 w-3" />}
                      </span>
                      <span className="min-w-0 flex-1 truncate text-sm font-medium text-[#0a2540]">{bucket.name}</span>
                      {typeof bucket.memberCount === 'number' && (
                        <span className="text-[11px] text-[#697386]">{bucket.memberCount}</span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}
      {chosen.length > 0 && (
        <p className="text-[11px] text-[#697386]">{chosen.length} selected</p>
      )}
    </div>
  );
}

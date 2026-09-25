'use client';

import { CAMPAIGN_CTA_STYLE_CATALOG, defaultStyleForTemplate, type CampaignCtaAlign, type CampaignCtaInput, type CampaignCtaLayout, type CampaignCtaPlacement } from '@noderails/common';
import { Button, Input } from '@/components/ui';
import { GripVertical, Plus, Trash2 } from 'lucide-react';

export type ComposeCta = CampaignCtaInput;

const PLACEMENT_LABELS: Record<CampaignCtaPlacement, string> = {
  after_heading: 'After heading',
  after_body: 'After body',
  before_signer: 'Before sign-off',
};

function newCtaId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return `cta-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function createEmptyCta(templateId?: string): ComposeCta {
  const style = defaultStyleForTemplate(templateId);
  const meta = CAMPAIGN_CTA_STYLE_CATALOG.find((s) => s.id === style);
  return {
    id: newCtaId(),
    label: '',
    url: '',
    placement: 'after_body',
    style,
    align: meta?.defaultAlign ?? 'left',
    withArrow: false,
  };
}

interface CampaignCtaEditorProps {
  ctas: ComposeCta[];
  onChange: (ctas: ComposeCta[]) => void;
  ctaLayout: CampaignCtaLayout;
  onLayoutChange: (layout: CampaignCtaLayout) => void;
  templateId: string;
  showSignerSlot: boolean;
}

export function CampaignCtaEditor({
  ctas,
  onChange,
  ctaLayout,
  onLayoutChange,
  templateId,
  showSignerSlot,
}: CampaignCtaEditorProps) {
  const update = (id: string, patch: Partial<ComposeCta>) => {
    onChange(ctas.map((cta) => (cta.id === id ? { ...cta, ...patch } : cta)));
  };

  const remove = (id: string) => onChange(ctas.filter((cta) => cta.id !== id));

  const add = () => {
    if (ctas.length >= 5) return;
    onChange([...ctas, createEmptyCta(templateId)]);
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="text-sm font-semibold text-[#0a2540]">Buttons</p>
          <p className="mt-0.5 text-xs text-[#697386]">
            Add up to 5. Use Place buttons in the preview to set where each one appears. Each click is tracked separately.
          </p>
        </div>
        <Button size="sm" variant="secondary" onClick={add} disabled={ctas.length >= 5}>
          <Plus className="h-3.5 w-3.5" />
          Add button
        </Button>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <p className="text-[11px] font-medium uppercase tracking-wide text-[#697386]">Layout</p>
        <div className="inline-flex rounded-lg bg-[#f6f9fc] p-0.5 ring-1 ring-[#e3e8ee]">
          {([
            { value: 'stack' as const, label: 'Multiple rows' },
            { value: 'row' as const, label: 'Single row' },
          ]).map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => onLayoutChange(opt.value)}
              className={`rounded-md px-2.5 py-1 text-[11px] font-medium ${
                ctaLayout === opt.value ? 'bg-white text-[#0a2540] shadow-sm' : 'text-[#697386]'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
        <p className="text-[11px] text-[#a3acb9]">
          {ctaLayout === 'row'
            ? 'Buttons in the same placement sit side by side.'
            : 'Each button gets its own row.'}
        </p>
      </div>

      {ctas.length === 0 ? (
        <div className="rounded-xl border border-dashed border-[#d1d8e0] bg-[#f6f9fc] px-4 py-5 text-center text-xs text-[#697386]">
          No buttons yet. Add one, then drag it onto the preview.
        </div>
      ) : (
        <ul className="space-y-3">
          {ctas.map((cta, index) => (
            <li key={cta.id} className="rounded-xl border border-[#e3e8ee] bg-white p-3 shadow-sm">
              <div className="mb-2 flex items-center justify-between gap-2">
                <p className="text-xs font-medium text-[#425466]">
                  Button {index + 1}
                  <span className="ml-2 font-normal text-[#a3acb9]">
                    {PLACEMENT_LABELS[cta.placement]}
                    {!showSignerSlot && cta.placement === 'before_signer' ? ' → after body' : ''}
                  </span>
                </p>
                <button
                  type="button"
                  className="rounded-md p-1 text-[#a3acb9] hover:bg-[#f6f9fc] hover:text-[#df1b41]"
                  onClick={() => remove(cta.id)}
                  aria-label="Remove button"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
              <div className="grid gap-2 sm:grid-cols-2">
                <Input
                  label="Label"
                  value={cta.label}
                  onChange={(e) => update(cta.id, { label: e.target.value })}
                  placeholder="Get started"
                />
                <Input
                  label="URL"
                  value={cta.url}
                  onChange={(e) => update(cta.id, { url: e.target.value })}
                  placeholder="https://"
                />
              </div>

              <div className="mt-3">
                <p className="mb-1.5 text-[11px] font-medium uppercase tracking-wide text-[#697386]">Style</p>
                <div className="grid grid-cols-3 gap-1.5 sm:grid-cols-4">
                  {CAMPAIGN_CTA_STYLE_CATALOG.map((style) => {
                    const selected = cta.style === style.id;
                    return (
                      <button
                        key={style.id}
                        type="button"
                        onClick={() => update(cta.id, {
                          style: style.id,
                          align: cta.align ?? style.defaultAlign,
                        })}
                        className={`rounded-lg border px-1.5 py-2 text-left transition-colors ${
                          selected
                            ? 'border-[#635bff] bg-[#f7f7ff] ring-1 ring-[#635bff]/30'
                            : 'border-[#e3e8ee] hover:border-[#cfd6de]'
                        }`}
                      >
                        <span
                          className="mb-1 flex h-6 items-center justify-center px-2 text-[10px] font-medium"
                          style={{
                            backgroundColor: style.swatch.bg,
                            color: style.swatch.fg,
                            borderRadius: style.swatch.radius,
                            border: style.swatch.border ? `1px solid ${style.swatch.border}` : undefined,
                          }}
                        >
                          Aa
                        </span>
                        <span className="block truncate text-[10px] text-[#425466]">{style.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="mt-3 flex flex-wrap items-center gap-3">
                <div className="inline-flex rounded-lg bg-[#f6f9fc] p-0.5 ring-1 ring-[#e3e8ee]">
                  {(['left', 'center'] as CampaignCtaAlign[]).map((align) => (
                    <button
                      key={align}
                      type="button"
                      onClick={() => update(cta.id, { align })}
                      className={`rounded-md px-2.5 py-1 text-[11px] font-medium capitalize ${
                        (cta.align ?? 'left') === align ? 'bg-white text-[#0a2540] shadow-sm' : 'text-[#697386]'
                      }`}
                    >
                      {align}
                    </button>
                  ))}
                </div>
                <label className="inline-flex items-center gap-2 text-xs text-[#425466]">
                  <input
                    type="checkbox"
                    className="h-3.5 w-3.5 accent-[#635bff]"
                    checked={Boolean(cta.withArrow)}
                    onChange={(e) => update(cta.id, { withArrow: e.target.checked })}
                  />
                  Show arrow
                </label>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

interface PlacementCanvasProps {
  ctas: ComposeCta[];
  onChange: (ctas: ComposeCta[]) => void;
  heading: string;
  showSignerSlot: boolean;
  showBackedBy: boolean;
  ctaLayout?: CampaignCtaLayout;
}

export function CampaignCtaPlacementCanvas({
  ctas,
  onChange,
  heading,
  showSignerSlot,
  showBackedBy,
  ctaLayout = 'stack',
}: PlacementCanvasProps) {
  const moveTo = (ctaId: string, placement: CampaignCtaPlacement, beforeId?: string) => {
    const moving = ctas.find((c) => c.id === ctaId);
    if (!moving) return;
    const rest = ctas.filter((c) => c.id !== ctaId);
    const updated = { ...moving, placement };
    const same = rest.filter((c) => c.placement === placement);
    const other = rest.filter((c) => c.placement !== placement);
    let nextSame: ComposeCta[];
    if (beforeId) {
      const idx = same.findIndex((c) => c.id === beforeId);
      nextSame = idx >= 0
        ? [...same.slice(0, idx), updated, ...same.slice(idx)]
        : [...same, updated];
    } else {
      nextSame = [...same, updated];
    }
    onChange([...other, ...nextSame]);
  };

  const zones: Array<{ placement: CampaignCtaPlacement; label: string; hint: string }> = [
    { placement: 'after_heading', label: 'After heading', hint: 'Drop buttons here' },
    { placement: 'after_body', label: 'After body', hint: 'Drop buttons here' },
  ];
  if (showSignerSlot) {
    zones.push({ placement: 'before_signer', label: 'Before sign-off', hint: 'Drop buttons here' });
  }

  return (
    <div className="rounded-xl border border-[#e3e8ee] bg-[#f6f9fc] p-3">
      <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-[#697386]">
        Place buttons — drag onto a zone
        {ctaLayout === 'row' ? ' · same zone = single row' : ' · same zone = stacked rows'}
      </p>
      <div className="space-y-2 rounded-lg bg-white p-3 ring-1 ring-[#e3e8ee]">
        <div className="rounded-md bg-[#0a2540] px-3 py-2">
          <p className="truncate text-xs font-medium text-white">{heading.trim() || 'Heading'}</p>
        </div>

        {zones.map((zone, i) => {
          const inZone = ctas.filter((c) => {
            if (c.placement === zone.placement) return true;
            if (!showSignerSlot && zone.placement === 'after_body' && c.placement === 'before_signer') return true;
            return false;
          });
          return (
            <div key={zone.placement}>
              {i === 1 && (
                <div className="mb-2 rounded-md border border-dashed border-[#e3e8ee] px-3 py-4 text-center text-[11px] text-[#a3acb9]">
                  Body content
                </div>
              )}
              <DropZone
                label={zone.label}
                hint={zone.hint}
                ctas={inZone}
                layout={ctaLayout}
                onDrop={(ctaId, beforeId) => moveTo(ctaId, zone.placement, beforeId)}
              />
              {zone.placement === 'before_signer' && (
                <div className="mt-2 rounded-md bg-[#f6f9fc] px-3 py-2 text-[11px] text-[#697386]">
                  Sign-off
                </div>
              )}
            </div>
          );
        })}

        <div className="rounded-md border border-[#eef2f6] px-3 py-2 text-[10px] leading-relaxed text-[#697386]">
          Footer{showBackedBy ? ' · backed-by on' : ' · backed-by off'}
        </div>
      </div>
    </div>
  );
}

function DropZone({
  label,
  hint,
  ctas,
  layout = 'stack',
  onDrop,
}: {
  label: string;
  hint: string;
  ctas: ComposeCta[];
  layout?: CampaignCtaLayout;
  onDrop: (ctaId: string, beforeId?: string) => void;
}) {
  return (
    <div
      className="min-h-[48px] rounded-lg border border-dashed border-[#cfd6de] bg-[#fafbfd] p-2 transition-colors"
      onDragOver={(e) => {
        e.preventDefault();
        e.currentTarget.classList.add('border-[#635bff]', 'bg-[#f7f7ff]');
      }}
      onDragLeave={(e) => {
        e.currentTarget.classList.remove('border-[#635bff]', 'bg-[#f7f7ff]');
      }}
      onDrop={(e) => {
        e.preventDefault();
        e.currentTarget.classList.remove('border-[#635bff]', 'bg-[#f7f7ff]');
        const ctaId = e.dataTransfer.getData('text/cta-id');
        if (ctaId) onDrop(ctaId);
      }}
    >
      <p className="mb-1 text-[10px] font-medium uppercase tracking-wide text-[#a3acb9]">{label}</p>
      {ctas.length === 0 ? (
        <p className="py-2 text-center text-[11px] text-[#c1c7d0]">{hint}</p>
      ) : (
        <div className={layout === 'row' ? 'flex flex-nowrap gap-1.5 overflow-x-auto' : 'flex flex-col gap-1.5'}>
          {ctas.map((cta) => (
            <div
              key={cta.id}
              draggable
              onDragStart={(e) => {
                e.dataTransfer.setData('text/cta-id', cta.id);
                e.dataTransfer.effectAllowed = 'move';
              }}
              className="inline-flex cursor-grab items-center gap-1 rounded-full bg-white px-2.5 py-1 text-[11px] font-medium text-[#0a2540] ring-1 ring-[#e3e8ee] active:cursor-grabbing"
            >
              <GripVertical className="h-3 w-3 text-[#a3acb9]" />
              {cta.label.trim() || 'Untitled'}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

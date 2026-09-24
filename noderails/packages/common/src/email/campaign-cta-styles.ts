import { CAMPAIGN_EMAIL } from './campaign-brand.js';

export const CAMPAIGN_CTA_STYLE_IDS = [
  'black_pill',
  'black_rect',
  'purple_fill',
  'purple_pill',
  'outline_dark',
  'outline_purple',
  'soft_gray',
  'navy_fill',
  'text_link',
  'text_underline',
  'ghost',
  'arrow_row',
] as const;

export type CampaignCtaStyleId = (typeof CAMPAIGN_CTA_STYLE_IDS)[number];

export const CAMPAIGN_CTA_PLACEMENTS = ['after_heading', 'after_body', 'before_signer'] as const;
export type CampaignCtaPlacement = (typeof CAMPAIGN_CTA_PLACEMENTS)[number];

export const CAMPAIGN_CTA_ALIGNS = ['left', 'center'] as const;
export type CampaignCtaAlign = (typeof CAMPAIGN_CTA_ALIGNS)[number];

export const CAMPAIGN_CTA_LAYOUTS = ['stack', 'row'] as const;
export type CampaignCtaLayout = (typeof CAMPAIGN_CTA_LAYOUTS)[number];

export interface CampaignCtaInput {
  id: string;
  label: string;
  url: string;
  placement: CampaignCtaPlacement;
  style: CampaignCtaStyleId;
  align?: CampaignCtaAlign;
  withArrow?: boolean;
}

export interface CampaignCtaStyleMeta {
  id: CampaignCtaStyleId;
  label: string;
  /** Default align when user has not picked one. */
  defaultAlign: CampaignCtaAlign;
  /** Swatch hint for admin UI. */
  swatch: { bg: string; fg: string; border?: string; radius: string };
}

export const CAMPAIGN_CTA_STYLE_CATALOG: CampaignCtaStyleMeta[] = [
  { id: 'black_pill', label: 'Black pill', defaultAlign: 'center', swatch: { bg: '#000000', fg: '#ffffff', radius: '980px' } },
  { id: 'black_rect', label: 'Black rect', defaultAlign: 'center', swatch: { bg: '#000000', fg: '#ffffff', radius: '8px' } },
  { id: 'purple_fill', label: 'Purple fill', defaultAlign: 'center', swatch: { bg: '#635bff', fg: '#ffffff', radius: '8px' } },
  { id: 'purple_pill', label: 'Purple pill', defaultAlign: 'center', swatch: { bg: '#635bff', fg: '#ffffff', radius: '980px' } },
  { id: 'outline_dark', label: 'Outline dark', defaultAlign: 'left', swatch: { bg: '#ffffff', fg: '#1d1d1f', border: '#1d1d1f', radius: '8px' } },
  { id: 'outline_purple', label: 'Outline purple', defaultAlign: 'left', swatch: { bg: '#ffffff', fg: '#635bff', border: '#635bff', radius: '8px' } },
  { id: 'soft_gray', label: 'Soft gray', defaultAlign: 'left', swatch: { bg: '#f5f5f7', fg: '#1d1d1f', radius: '8px' } },
  { id: 'navy_fill', label: 'Navy fill', defaultAlign: 'center', swatch: { bg: '#0a2540', fg: '#ffffff', radius: '8px' } },
  { id: 'text_link', label: 'Text link', defaultAlign: 'left', swatch: { bg: '#ffffff', fg: '#635bff', radius: '4px' } },
  { id: 'text_underline', label: 'Text underline', defaultAlign: 'left', swatch: { bg: '#ffffff', fg: '#1d1d1f', radius: '4px' } },
  { id: 'ghost', label: 'Ghost', defaultAlign: 'left', swatch: { bg: '#ffffff', fg: '#1d1d1f', border: '#d2d2d7', radius: '8px' } },
  { id: 'arrow_row', label: 'Arrow row', defaultAlign: 'left', swatch: { bg: '#f5f5f7', fg: '#1d1d1f', radius: '8px' } },
];

export function isCampaignCtaStyleId(value: string): value is CampaignCtaStyleId {
  return (CAMPAIGN_CTA_STYLE_IDS as readonly string[]).includes(value);
}

export function isCampaignCtaPlacement(value: string): value is CampaignCtaPlacement {
  return (CAMPAIGN_CTA_PLACEMENTS as readonly string[]).includes(value);
}

export function isCampaignCtaLayout(value: string): value is CampaignCtaLayout {
  return (CAMPAIGN_CTA_LAYOUTS as readonly string[]).includes(value);
}

export function defaultStyleForTemplate(templateId?: string | null): CampaignCtaStyleId {
  switch (templateId) {
    case 'EVENT_INVITE':
      return 'purple_fill';
    case 'BUSINESS_OUTREACH':
    case 'DIRECT_OUTREACH':
      return 'outline_dark';
    case 'ANNOUNCEMENT':
    case 'PARTNERSHIP':
    case 'FOLLOW_UP':
      return 'text_link';
    case 'UPDATES':
    default:
      return 'black_pill';
  }
}

export interface RenderStyledCtaOptions {
  labelEscaped: string;
  hrefEscaped: string;
  style: CampaignCtaStyleId;
  align?: CampaignCtaAlign;
  withArrow?: boolean;
  cellPadding?: string;
}

function labelWithArrow(labelEscaped: string, withArrow: boolean, force = false): string {
  if (!withArrow && !force) return labelEscaped;
  return `${labelEscaped}&nbsp;&nbsp;<span style="font-weight:600;">&rarr;</span>`;
}

function buttonInner(options: {
  labelEscaped: string;
  hrefEscaped: string;
  bg: string;
  fg: string;
  border?: string;
  radius: string;
  withArrow?: boolean;
  forceArrow?: boolean;
}): string {
  const border = options.border
    ? `border:1px solid ${options.border};`
    : `border:1px solid ${options.bg};`;
  const label = labelWithArrow(options.labelEscaped, Boolean(options.withArrow), options.forceArrow);
  return `<table role="presentation" cellpadding="0" cellspacing="0">
                <tr>
                  <td align="center" style="border-radius:${options.radius};background-color:${options.bg};${border}">
                    <a href="${options.hrefEscaped}" style="display:inline-block;padding:12px 26px;font-family:${CAMPAIGN_EMAIL.font};font-size:15px;font-weight:500;color:${options.fg};text-decoration:none;letter-spacing:-0.01em;border-radius:${options.radius};">
                      ${label}
                    </a>
                  </td>
                </tr>
              </table>`;
}

function textInner(options: {
  labelEscaped: string;
  hrefEscaped: string;
  color: string;
  underline: boolean;
  withArrow?: boolean;
}): string {
  const deco = options.underline ? 'underline' : 'none';
  const label = labelWithArrow(options.labelEscaped, Boolean(options.withArrow));
  return `<a href="${options.hrefEscaped}" style="font-family:${CAMPAIGN_EMAIL.font};font-size:15px;font-weight:500;color:${options.color};text-decoration:${deco};text-underline-offset:2px;">
                ${label}
              </a>`;
}

/** Inner button/link HTML only (no outer email row). */
export function renderStyledCampaignCtaInner(options: Omit<RenderStyledCtaOptions, 'align' | 'cellPadding'>): string {
  const base = {
    labelEscaped: options.labelEscaped,
    hrefEscaped: options.hrefEscaped,
    withArrow: options.withArrow,
  };

  switch (options.style) {
    case 'black_pill':
      return buttonInner({ ...base, bg: CAMPAIGN_EMAIL.black, fg: '#ffffff', radius: '980px' });
    case 'black_rect':
      return buttonInner({ ...base, bg: CAMPAIGN_EMAIL.black, fg: '#ffffff', radius: '8px' });
    case 'purple_fill':
      return buttonInner({ ...base, bg: CAMPAIGN_EMAIL.link, fg: '#ffffff', radius: '8px' });
    case 'purple_pill':
      return buttonInner({ ...base, bg: CAMPAIGN_EMAIL.link, fg: '#ffffff', radius: '980px' });
    case 'outline_dark':
      return buttonInner({
        ...base,
        bg: CAMPAIGN_EMAIL.white,
        fg: CAMPAIGN_EMAIL.text,
        border: CAMPAIGN_EMAIL.text,
        radius: '8px',
      });
    case 'outline_purple':
      return buttonInner({
        ...base,
        bg: CAMPAIGN_EMAIL.white,
        fg: CAMPAIGN_EMAIL.link,
        border: CAMPAIGN_EMAIL.link,
        radius: '8px',
      });
    case 'soft_gray':
      return buttonInner({ ...base, bg: '#f5f5f7', fg: CAMPAIGN_EMAIL.text, border: '#f5f5f7', radius: '8px' });
    case 'navy_fill':
      return buttonInner({ ...base, bg: '#0a2540', fg: '#ffffff', radius: '8px' });
    case 'text_link':
      return textInner({ ...base, color: CAMPAIGN_EMAIL.link, underline: false });
    case 'text_underline':
      return textInner({ ...base, color: CAMPAIGN_EMAIL.text, underline: true });
    case 'ghost':
      return buttonInner({
        ...base,
        bg: CAMPAIGN_EMAIL.white,
        fg: CAMPAIGN_EMAIL.text,
        border: CAMPAIGN_EMAIL.borderLight,
        radius: '8px',
      });
    case 'arrow_row':
      return buttonInner({
        ...base,
        bg: '#f5f5f7',
        fg: CAMPAIGN_EMAIL.text,
        border: '#f5f5f7',
        radius: '8px',
        forceArrow: true,
      });
    default:
      return buttonInner({ ...base, bg: CAMPAIGN_EMAIL.black, fg: '#ffffff', radius: '980px' });
  }
}

/** Render one CTA as a full email table row. */
export function renderStyledCampaignCta(options: RenderStyledCtaOptions): string {
  const align = options.align ?? CAMPAIGN_CTA_STYLE_CATALOG.find((s) => s.id === options.style)?.defaultAlign ?? 'left';
  const pad = options.cellPadding ?? '4px 48px 16px';
  const textAlign = align === 'center' ? 'center' : 'left';
  const tableAlign = align === 'center' ? ' align="center" style="margin:0 auto;"' : '';
  const inner = renderStyledCampaignCtaInner(options);
  return `
          <tr>
            <td style="padding:${pad};text-align:${textAlign};background-color:${CAMPAIGN_EMAIL.white};">
              <table role="presentation" cellpadding="0" cellspacing="0"${tableAlign}>
                <tr>
                  <td style="vertical-align:middle;">${inner}</td>
                </tr>
              </table>
            </td>
          </tr>`;
}

export interface PreparedCtaForLayout {
  labelEscaped: string;
  hrefEscaped: string;
  style: CampaignCtaStyleId;
  align: CampaignCtaAlign;
  withArrow: boolean;
}

/** Stack (one per row) or single horizontal row for a CTA group. */
export function renderCampaignCtaGroup(
  ctas: PreparedCtaForLayout[],
  layout: CampaignCtaLayout = 'stack',
  cellPadding = '4px 48px 16px',
): string {
  if (!ctas.length) return '';
  if (layout !== 'row' || ctas.length === 1) {
    return ctas
      .map((cta) =>
        renderStyledCampaignCta({
          labelEscaped: cta.labelEscaped,
          hrefEscaped: cta.hrefEscaped,
          style: cta.style,
          align: cta.align,
          withArrow: cta.withArrow,
          cellPadding,
        }),
      )
      .join('');
  }

  const align = ctas.some((c) => c.align === 'center') ? 'center' : 'left';
  const textAlign = align === 'center' ? 'center' : 'left';
  const tableAlign = align === 'center' ? ' align="center" style="margin:0 auto;"' : '';
  const cells = ctas
    .map((cta, index) => {
      const gap = index < ctas.length - 1 ? 'padding-right:10px;' : '';
      return `<td style="vertical-align:middle;${gap}">${renderStyledCampaignCtaInner({
        labelEscaped: cta.labelEscaped,
        hrefEscaped: cta.hrefEscaped,
        style: cta.style,
        withArrow: cta.withArrow,
      })}</td>`;
    })
    .join('');

  return `
          <tr>
            <td style="padding:${cellPadding};text-align:${textAlign};background-color:${CAMPAIGN_EMAIL.white};">
              <table role="presentation" cellpadding="0" cellspacing="0"${tableAlign}>
                <tr>
                  ${cells}
                </tr>
              </table>
            </td>
          </tr>`;
}

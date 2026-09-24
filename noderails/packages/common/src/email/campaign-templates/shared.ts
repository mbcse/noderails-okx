import { campaignEyebrow } from '../email-from.js';
import {
  CAMPAIGN_EMAIL,
  CAMPAIGN_FOOTER_SITE_URL,
  NODERAILS_EMAIL_LOGO_URL,
  renderCampaignEmailFooter,
} from '../campaign-brand.js';
import {
  CAMPAIGN_CTA_STYLE_CATALOG,
  defaultStyleForTemplate,
  isCampaignCtaLayout,
  isCampaignCtaPlacement,
  isCampaignCtaStyleId,
  renderCampaignCtaGroup,
  type CampaignCtaAlign,
  type CampaignCtaInput,
  type CampaignCtaLayout,
  type CampaignCtaPlacement,
  type CampaignCtaStyleId,
} from '../campaign-cta-styles.js';
import { getCampaignTemplateMeta, resolveCampaignSigner } from '../campaign-template-catalog.js';
import {
  campaignPreheaderText,
  escapeHtml,
  isSafeHttpUrl,
  renderCampaignBodyHtml,
  trackingPixel,
} from '../campaign-html.js';
import type {
  CampaignCtaStyle,
  CampaignTemplateData,
  PreparedCampaignContent,
  PreparedCampaignCta,
} from './types.js';

const MAX_CTAS = 5;

function mapLegacyStyle(style: CampaignCtaStyle): CampaignCtaStyleId {
  if (style === 'pill') return 'black_pill';
  if (style === 'outline') return 'outline_dark';
  if (style === 'accent') return 'purple_fill';
  if (style === 'text') return 'text_link';
  if (isCampaignCtaStyleId(style)) return style;
  return 'black_pill';
}

function resolveCtaInputs(data: CampaignTemplateData): CampaignCtaInput[] {
  if (data.ctas?.length) {
    return data.ctas.slice(0, MAX_CTAS);
  }
  const label = data.ctaLabel?.trim();
  const url = data.ctaUrl?.trim();
  if (!label || !url) return [];
  const style = defaultStyleForTemplate(data.templateId);
  const align = CAMPAIGN_CTA_STYLE_CATALOG.find((s) => s.id === style)?.defaultAlign ?? 'left';
  return [{
    id: 'legacy-1',
    label,
    url,
    placement: 'after_body',
    style,
    align,
    withArrow: false,
  }];
}

function prepareCtas(data: CampaignTemplateData): PreparedCampaignCta[] {
  const prepared: PreparedCampaignCta[] = [];
  for (const raw of resolveCtaInputs(data)) {
    const label = raw.label?.trim();
    const url = raw.url?.trim();
    if (!label || !url || !isSafeHttpUrl(url)) continue;
    const style = isCampaignCtaStyleId(raw.style) ? raw.style : defaultStyleForTemplate(data.templateId);
    const placement: CampaignCtaPlacement = isCampaignCtaPlacement(raw.placement) ? raw.placement : 'after_body';
    const align: CampaignCtaAlign =
      raw.align === 'center' || raw.align === 'left'
        ? raw.align
        : (CAMPAIGN_CTA_STYLE_CATALOG.find((s) => s.id === style)?.defaultAlign ?? 'left');
    const href = data.wrapLink ? data.wrapLink(url, raw.id) : url;
    prepared.push({
      id: raw.id || `cta-${prepared.length + 1}`,
      labelEscaped: escapeHtml(label),
      hrefEscaped: escapeHtml(href),
      placement,
      style,
      align,
      withArrow: Boolean(raw.withArrow),
    });
  }
  return prepared;
}

export function prepareCampaignContent(data: CampaignTemplateData): PreparedCampaignContent {
  const headingRaw = data.heading.trim() || 'Update from NodeRails';
  const headingEscaped = escapeHtml(headingRaw);
  const bodyHtml = renderCampaignBodyHtml(data.body, data.wrapLink);
  const meta = getCampaignTemplateMeta(data.templateId);
  const logoUrl = data.logoUrl ?? NODERAILS_EMAIL_LOGO_URL;
  const preparedCtas = prepareCtas(data);
  const first = preparedCtas[0];
  const ctaLayout: CampaignCtaLayout = isCampaignCtaLayout(data.ctaLayout ?? '') ? data.ctaLayout! : 'stack';

  return {
    headingRaw,
    headingEscaped,
    eyebrowEscaped: escapeHtml(campaignEyebrow(data.fromAddress)),
    bodyHtml,
    preheaderEscaped: escapeHtml(campaignPreheaderText(headingRaw, data.body)),
    logoUrl,
    ctaLabelEscaped: first?.labelEscaped,
    ctaHrefEscaped: first?.hrefEscaped,
    preparedCtas,
    ctaLayout,
    pixelHtml: data.openPixelUrl ? trackingPixel(data.openPixelUrl) : '',
    footerHtml: renderCampaignEmailFooter({
      logoUrl,
      escapeHtml,
      wrapLink: data.wrapLink,
      showConfidentialDisclaimer: meta.showConfidentialDisclaimer,
      showBackedBy: data.showBackedBy !== false,
    }),
  };
}

/** Render all prepared CTAs for a placement (order preserved). */
export function renderCtasForPlacement(
  content: PreparedCampaignContent,
  placement: CampaignCtaPlacement,
  cellPadding?: string,
): string {
  const ctas = content.preparedCtas.filter((cta) => cta.placement === placement);
  return renderCampaignCtaGroup(ctas, content.ctaLayout, cellPadding);
}

/**
 * CTAs for after_body, including any before_signer buttons when the template
 * has no signer slot (non-DIRECT templates).
 */
export function renderCtasAfterBody(
  content: PreparedCampaignContent,
  opts?: { includeOrphanBeforeSigner?: boolean; cellPadding?: string },
): string {
  const includeOrphan = opts?.includeOrphanBeforeSigner !== false;
  const ctas = content.preparedCtas.filter(
    (cta) => cta.placement === 'after_body' || (includeOrphan && cta.placement === 'before_signer'),
  );
  return renderCampaignCtaGroup(ctas, content.ctaLayout, opts?.cellPadding);
}

/** @deprecated Prefer renderCtasForPlacement / renderCtasAfterBody. */
export function renderPreparedCta(
  content: PreparedCampaignContent,
  style: CampaignCtaStyle,
  outlinePadding?: string,
): string {
  if (content.preparedCtas.length) {
    return renderCampaignCtaGroup(
      content.preparedCtas.map((cta) => ({
        ...cta,
        style: cta.style || mapLegacyStyle(style),
      })),
      content.ctaLayout,
      outlinePadding,
    );
  }
  if (!content.ctaLabelEscaped || !content.ctaHrefEscaped) return '';
  const mapped = mapLegacyStyle(style);
  return renderCampaignCtaGroup(
    [{
      labelEscaped: content.ctaLabelEscaped,
      hrefEscaped: content.ctaHrefEscaped,
      style: mapped,
      align: 'left',
      withArrow: false,
    }],
    'stack',
    outlinePadding,
  );
}

export function renderCampaignSignerRow(
  data: { signerName?: string | null; signerTitle?: string | null },
): string {
  const signer = resolveCampaignSigner(data.signerName, data.signerTitle);
  const titleHtml = signer.title
    ? `<div style="margin:2px 0 0;font-family:${CAMPAIGN_EMAIL.font};color:${CAMPAIGN_EMAIL.textSecondary};font-size:14px;line-height:1.45;font-weight:400;">${escapeHtml(signer.title)}</div>`
    : '';
  return `
          <tr>
            <td style="padding:8px 48px 36px;background-color:${CAMPAIGN_EMAIL.white};">
              <div style="font-family:${CAMPAIGN_EMAIL.font};color:${CAMPAIGN_EMAIL.text};font-size:15px;line-height:1.45;font-weight:600;letter-spacing:-0.011em;">${escapeHtml(signer.name)}</div>
              ${titleHtml}
              <div style="margin:2px 0 0;font-family:${CAMPAIGN_EMAIL.font};color:${CAMPAIGN_EMAIL.textSecondary};font-size:14px;line-height:1.45;font-weight:400;">${escapeHtml(signer.org)}</div>
            </td>
          </tr>`;
}

export function renderWhiteBodyRow(bodyHtml: string, padding = '36px 48px 12px'): string {
  if (!bodyHtml) {
    return `
          <tr>
            <td style="padding:${padding};background-color:${CAMPAIGN_EMAIL.white};font-size:0;line-height:0;">&nbsp;</td>
          </tr>`;
  }
  return `
          <tr>
            <td style="padding:${padding};background-color:${CAMPAIGN_EMAIL.white};">
              <div style="font-family:${CAMPAIGN_EMAIL.font};color:${CAMPAIGN_EMAIL.text};font-size:17px;line-height:1.65;font-weight:400;letter-spacing:-0.011em;">
                ${bodyHtml}
              </div>
            </td>
          </tr>`;
}

export function renderCampaignEmailDocument(options: {
  titleEscaped: string;
  preheaderEscaped: string;
  pixelHtml: string;
  innerRows: string;
  wrapLink?: (url: string, ctaId?: string) => string;
}): string {
  const siteHref = escapeHtml(options.wrapLink ? options.wrapLink(CAMPAIGN_FOOTER_SITE_URL) : CAMPAIGN_FOOTER_SITE_URL);
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="color-scheme" content="light">
  <meta name="supported-color-schemes" content="light">
  <title>${options.titleEscaped}</title>
</head>
<body style="margin:0;padding:0;background-color:${CAMPAIGN_EMAIL.canvas};font-family:${CAMPAIGN_EMAIL.font};-webkit-font-smoothing:antialiased;">
  <div style="display:none;max-height:0;overflow:hidden;mso-hide:all;">${options.preheaderEscaped}&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:${CAMPAIGN_EMAIL.canvas};">
    <tr>
      <td align="center" style="padding:52px 20px;">
        <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background-color:${CAMPAIGN_EMAIL.white};border-radius:${CAMPAIGN_EMAIL.cardRadius};overflow:hidden;border:1px solid ${CAMPAIGN_EMAIL.cardBorder};box-shadow:${CAMPAIGN_EMAIL.cardShadow};">
          ${options.pixelHtml ? `<tr><td style="font-size:0;line-height:0;">${options.pixelHtml}</td></tr>` : ''}
          ${options.innerRows}
        </table>
        <p style="margin:22px 0 0;font-family:${CAMPAIGN_EMAIL.font};font-size:11px;color:${CAMPAIGN_EMAIL.textTertiary};text-align:center;line-height:1.5;font-weight:400;letter-spacing:-0.01em;">
          <a href="${siteHref}" style="color:${CAMPAIGN_EMAIL.textTertiary};text-decoration:none;">example.local</a>
        </p>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

export function finishCampaignTemplate(content: PreparedCampaignContent, innerRows: string, wrapLink?: (url: string, ctaId?: string) => string): string {
  return renderCampaignEmailDocument({
    titleEscaped: content.headingEscaped,
    preheaderEscaped: content.preheaderEscaped,
    pixelHtml: content.pixelHtml,
    innerRows: `${innerRows}${content.footerHtml}`,
    wrapLink,
  });
}

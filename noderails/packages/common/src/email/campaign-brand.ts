/** API-served logo path (use with your public API base URL). */
export const NODERAILS_EMAIL_LOGO_PATH = '/public/email/noderails-logo-48.png';

/** Legacy fallback only — prefer API-hosted logo for faster loads. */
export const NODERAILS_EMAIL_LOGO_URL = 'https://example.local/favicon-48x48.png';

export const CAMPAIGN_FOOTER_SITE_URL = 'https://example.local/?ref=emailoutreach';
export const CAMPAIGN_FOOTER_DOCS_URL = 'https://example.local/docs/?ref=emailoutreach';
export const CAMPAIGN_FOOTER_DASHBOARD_URL = 'https://merchant.example.local/?ref=emailoutreach';

export const CAMPAIGN_FOOTER_URLS = [
  CAMPAIGN_FOOTER_SITE_URL,
  CAMPAIGN_FOOTER_DOCS_URL,
  CAMPAIGN_FOOTER_DASHBOARD_URL,
] as const;

export const CAMPAIGN_CONFIDENTIAL_DISCLAIMER =
  'This message and any attachments are confidential and intended only for the recipient. If you received this email in error, please delete it and notify the sender. Do not forward, copy, or share its contents without permission.';

export const CAMPAIGN_FOOTER_TAGLINE = 'Stablecoin and crypto financial infrastructure';

export const CAMPAIGN_FOOTER_BACKED_BY =
  'Backed and supported by W3X Incubation, LvlUp Ventures, VenturEdu, and fibonacciX.';

/** Website footer legal copy (not used in campaign emails). */
export const NODERAILS_FINTECH_DISCLAIMER =
  'NodeRails is a financial technology company, not a bank or a money services business. Certain services are provided by our licensed partners across the globe. By creating an account on NodeRails, you agree to our terms and conditions, our partners\' terms, and all applicable laws and regulations, and you are responsible for compliance with any applicable local laws.';

/** Apple / Mobbin — white canvas, black hero card, SF typography. */
export const CAMPAIGN_EMAIL = {
  black: '#000000',
  white: '#ffffff',
  canvas: '#ffffff',
  text: '#1d1d1f',
  textSecondary: '#6e6e73',
  textTertiary: '#86868b',
  borderLight: '#d2d2d7',
  borderGlassDark: 'rgba(255,255,255,0.14)',
  borderGlassLight: 'rgba(255,255,255,0.72)',
  glassOnBlack: 'rgba(255,255,255,0.06)',
  glassOnWhite: 'rgba(255,255,255,0.94)',
  font:
    "-apple-system,BlinkMacSystemFont,'SF Pro Display','SF Pro Text','Helvetica Neue',Helvetica,Arial,sans-serif",
  cardRadius: '20px',
  cardShadow: '0 0 0 1px rgba(0,0,0,0.06), 0 18px 48px rgba(0,0,0,0.10)',
  cardBorder: '#d2d2d7',
  glassInset: 'inset 0 1px 0 rgba(255,255,255,0.22)',
  link: '#635bff',
} as const;

const footerLinkStyle = `color:${CAMPAIGN_EMAIL.link};text-decoration:underline;text-underline-offset:2px;font-weight:500;`;

function wordmarkSpans(fontSize: number, nodeColor: string, railsColor: string, weight = 600): string {
  return `<span style="font-size:${fontSize}px;font-weight:${weight};color:${nodeColor};letter-spacing:-0.022em;">Node</span><span style="font-size:${fontSize}px;font-weight:${weight};color:${railsColor};letter-spacing:-0.022em;">Rails</span>`;
}

function logoMark(size: number, radius: number, logoUrl: string, alt = 'NodeRails'): string {
  return `<img src="${logoUrl}" width="${size}" height="${size}" alt="${alt}" style="display:block;border:0;border-radius:${radius}px;" />`;
}

export function renderCampaignWordmarkLockup(options: {
  logoUrl: string;
  logoSize: number;
  logoRadius: number;
  fontSize: number;
  nodeColor: string;
  railsColor: string;
  gap: number;
}): string {
  const { logoUrl, logoSize, logoRadius, fontSize, nodeColor, railsColor, gap } = options;
  return `
              <table role="presentation" cellpadding="0" cellspacing="0" align="center" style="margin:0 auto;">
                <tr>
                  <td style="padding-right:${gap}px;vertical-align:middle;line-height:0;">
                    ${logoMark(logoSize, logoRadius, logoUrl)}
                  </td>
                  <td style="vertical-align:middle;font-family:${CAMPAIGN_EMAIL.font};">
                    ${wordmarkSpans(fontSize, nodeColor, railsColor)}
                  </td>
                </tr>
              </table>`;
}

/** Pure black hero with frosted glass panel. */
export function renderCampaignEmailHero(
  eyebrowEscaped: string,
  headingEscaped: string,
  logoUrl = NODERAILS_EMAIL_LOGO_URL,
): string {
  const lockup = renderCampaignWordmarkLockup({
    logoUrl,
    logoSize: 34,
    logoRadius: 8,
    fontSize: 19,
    nodeColor: CAMPAIGN_EMAIL.white,
    railsColor: 'rgba(255,255,255,0.72)',
    gap: 8,
  });

  return `
          <tr>
            <td style="padding:24px 24px 0;background-color:${CAMPAIGN_EMAIL.black};">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid ${CAMPAIGN_EMAIL.borderGlassDark};border-radius:16px;background-color:${CAMPAIGN_EMAIL.glassOnBlack};box-shadow:${CAMPAIGN_EMAIL.glassInset};">
                <tr>
                  <td style="padding:32px 28px 30px;text-align:center;">
                    ${lockup}
                    <p style="margin:14px 0 0;display:inline-block;background-color:rgba(255,255,255,0.08);color:rgba(255,255,255,0.82);font-family:${CAMPAIGN_EMAIL.font};font-size:11px;font-weight:500;letter-spacing:0.04em;text-transform:uppercase;padding:5px 12px;border-radius:980px;border:1px solid ${CAMPAIGN_EMAIL.borderGlassDark};">
                      ${eyebrowEscaped}
                    </p>
                    <h1 style="margin:16px 0 0;font-family:${CAMPAIGN_EMAIL.font};color:${CAMPAIGN_EMAIL.white};font-size:32px;font-weight:600;letter-spacing:-0.028em;line-height:1.12;">
                      ${headingEscaped}
                    </h1>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="height:20px;background-color:${CAMPAIGN_EMAIL.black};font-size:0;line-height:0;">&nbsp;</td>
          </tr>`;
}

/** Apple-style black pill CTA. */
export function renderCampaignEmailCta(labelEscaped: string, hrefEscaped: string): string {
  return `
          <tr>
            <td style="padding:4px 48px 40px;text-align:center;background-color:${CAMPAIGN_EMAIL.white};">
              <table role="presentation" cellpadding="0" cellspacing="0" align="center" style="margin:0 auto;">
                <tr>
                  <td align="center" style="border-radius:980px;background-color:${CAMPAIGN_EMAIL.black};border:1px solid ${CAMPAIGN_EMAIL.black};">
                    <a href="${hrefEscaped}" style="display:inline-block;padding:12px 26px;font-family:${CAMPAIGN_EMAIL.font};font-size:15px;font-weight:500;color:#ffffff;text-decoration:none;letter-spacing:-0.01em;border-radius:980px;">
                      ${labelEscaped}
                    </a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>`;
}

export function renderCampaignEmailOutlineCta(
  labelEscaped: string,
  hrefEscaped: string,
  cellPadding = '4px 48px 40px',
): string {
  return `
          <tr>
            <td style="padding:${cellPadding};text-align:left;background-color:${CAMPAIGN_EMAIL.white};">
              <table role="presentation" cellpadding="0" cellspacing="0">
                <tr>
                  <td align="center" style="border-radius:8px;border:1px solid ${CAMPAIGN_EMAIL.text};background-color:${CAMPAIGN_EMAIL.white};">
                    <a href="${hrefEscaped}" style="display:inline-block;padding:11px 22px;font-family:${CAMPAIGN_EMAIL.font};font-size:15px;font-weight:500;color:${CAMPAIGN_EMAIL.text};text-decoration:none;letter-spacing:-0.01em;border-radius:8px;">
                      ${labelEscaped}
                    </a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>`;
}

export function renderCampaignEmailAccentCta(labelEscaped: string, hrefEscaped: string): string {
  return `
          <tr>
            <td style="padding:4px 48px 40px;text-align:center;background-color:${CAMPAIGN_EMAIL.white};">
              <table role="presentation" cellpadding="0" cellspacing="0" align="center" style="margin:0 auto;">
                <tr>
                  <td align="center" style="border-radius:8px;background-color:${CAMPAIGN_EMAIL.link};">
                    <a href="${hrefEscaped}" style="display:inline-block;padding:12px 26px;font-family:${CAMPAIGN_EMAIL.font};font-size:15px;font-weight:500;color:#ffffff;text-decoration:none;letter-spacing:-0.01em;border-radius:8px;">
                      ${labelEscaped}
                    </a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>`;
}

export function renderCampaignEmailTextCta(labelEscaped: string, hrefEscaped: string): string {
  return `
          <tr>
            <td style="padding:4px 48px 36px;background-color:${CAMPAIGN_EMAIL.white};">
              <a href="${hrefEscaped}" style="font-family:${CAMPAIGN_EMAIL.font};font-size:15px;font-weight:500;color:${CAMPAIGN_EMAIL.link};text-decoration:underline;text-underline-offset:2px;">
                ${labelEscaped}
              </a>
            </td>
          </tr>`;
}

export interface CampaignEmailFooterOptions {
  logoUrl?: string;
  escapeHtml: (value: string) => string;
  wrapLink?: (url: string, ctaId?: string) => string;
  showConfidentialDisclaimer?: boolean;
  showBackedBy?: boolean;
}

export function renderCampaignEmailFooter(options: CampaignEmailFooterOptions): string {
  const year = new Date().getFullYear();
  const logoUrl = options.logoUrl ?? NODERAILS_EMAIL_LOGO_URL;
  const lockup = renderCampaignWordmarkLockup({
    logoUrl,
    logoSize: 28,
    logoRadius: 7,
    fontSize: 15,
    nodeColor: CAMPAIGN_EMAIL.text,
    railsColor: CAMPAIGN_EMAIL.textSecondary,
    gap: 7,
  });

  const hrefFor = (url: string) => options.escapeHtml(options.wrapLink ? options.wrapLink(url) : url);

  const confidential = options.showConfidentialDisclaimer
    ? `<p style="margin:14px auto 0;max-width:440px;font-family:${CAMPAIGN_EMAIL.font};color:${CAMPAIGN_EMAIL.textTertiary};font-size:11px;line-height:1.55;font-weight:400;font-style:italic;">
         ${options.escapeHtml(CAMPAIGN_CONFIDENTIAL_DISCLAIMER)}
       </p>`
    : '';

  const showBackedBy = options.showBackedBy !== false;
  const backedBy = showBackedBy
    ? `<p style="margin:8px auto 0;max-width:440px;font-family:${CAMPAIGN_EMAIL.font};color:${CAMPAIGN_EMAIL.textSecondary};font-size:11px;line-height:1.55;font-weight:500;letter-spacing:-0.01em;">
                      ${options.escapeHtml(CAMPAIGN_FOOTER_BACKED_BY)}
                    </p>`
    : '';

  const miniLockup = `
                    <div style="font-family:${CAMPAIGN_EMAIL.font};">
                      ${wordmarkSpans(11, '#ffffff', 'rgba(255,255,255,0.65)', 500)}
                    </div>`;

  return `
          <tr>
            <td style="padding:0;background-color:${CAMPAIGN_EMAIL.white};border-top:1px solid ${CAMPAIGN_EMAIL.borderLight};">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-top:1px solid ${CAMPAIGN_EMAIL.borderGlassLight};">
                <tr>
                  <td style="padding:32px 48px 28px;text-align:center;">
                    ${lockup}
                    <p style="margin:8px 0 0;font-family:${CAMPAIGN_EMAIL.font};color:${CAMPAIGN_EMAIL.textSecondary};font-size:12px;line-height:1.5;font-weight:400;letter-spacing:-0.01em;">
                      ${options.escapeHtml(CAMPAIGN_FOOTER_TAGLINE)}
                    </p>
                    ${backedBy}
                    <p style="margin:16px 0 0;font-family:${CAMPAIGN_EMAIL.font};font-size:12px;line-height:1.55;font-weight:400;">
                      <a href="${hrefFor(CAMPAIGN_FOOTER_SITE_URL)}" style="${footerLinkStyle}">Website</a>
                      <span style="color:${CAMPAIGN_EMAIL.borderLight};padding:0 8px;">·</span>
                      <a href="${hrefFor(CAMPAIGN_FOOTER_DOCS_URL)}" style="${footerLinkStyle}">Docs</a>
                      <span style="color:${CAMPAIGN_EMAIL.borderLight};padding:0 8px;">·</span>
                      <a href="${hrefFor(CAMPAIGN_FOOTER_DASHBOARD_URL)}" style="${footerLinkStyle}">Dashboard</a>
                    </p>
                    ${confidential}
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="background-color:${CAMPAIGN_EMAIL.black};padding:14px 48px;border-top:1px solid ${CAMPAIGN_EMAIL.borderGlassDark};">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td align="left" style="vertical-align:middle;">
                    ${miniLockup}
                  </td>
                  <td align="right" style="vertical-align:middle;">
                    <span style="font-family:${CAMPAIGN_EMAIL.font};font-size:11px;color:${CAMPAIGN_EMAIL.textTertiary};letter-spacing:-0.01em;font-weight:400;">&copy; ${year} NodeRails</span>
                  </td>
                </tr>
              </table>
            </td>
          </tr>`;
}

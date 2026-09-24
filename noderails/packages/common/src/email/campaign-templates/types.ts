import type { EmailCampaignTemplateId } from '../campaign-template-catalog.js';
import type {
  CampaignCtaAlign,
  CampaignCtaInput,
  CampaignCtaPlacement,
  CampaignCtaStyleId,
} from '../campaign-cta-styles.js';

export type {
  CampaignCtaAlign,
  CampaignCtaInput,
  CampaignCtaPlacement,
  CampaignCtaStyleId,
} from '../campaign-cta-styles.js';

/** @deprecated Use CampaignCtaStyleId from campaign-cta-styles. Kept for older callers. */
export type CampaignCtaStyle = 'pill' | 'outline' | 'accent' | 'text' | CampaignCtaStyleId;

export interface CampaignTemplateData {
  templateId?: EmailCampaignTemplateId | string;
  fromAddress: string;
  heading: string;
  body: string;
  logoUrl?: string;
  /** Legacy single CTA — used when `ctas` is empty. */
  ctaLabel?: string;
  ctaUrl?: string;
  /** Structured buttons (preferred). */
  ctas?: CampaignCtaInput[];
  /** stack = one button per row (default); row = buttons in the same placement sit side by side. */
  ctaLayout?: 'stack' | 'row';
  showBackedBy?: boolean;
  signerName?: string;
  signerTitle?: string;
  openPixelUrl?: string;
  /**
   * Rewrite http(s) hrefs (CTA + body links + footer).
   * Second arg is set for structured CTAs so click tracking can attribute the button.
   */
  wrapLink?: (url: string, ctaId?: string) => string;
}

export interface PreparedCampaignCta {
  id: string;
  labelEscaped: string;
  hrefEscaped: string;
  placement: CampaignCtaPlacement;
  style: CampaignCtaStyleId;
  align: CampaignCtaAlign;
  withArrow: boolean;
}

export interface PreparedCampaignContent {
  headingRaw: string;
  headingEscaped: string;
  eyebrowEscaped: string;
  bodyHtml: string;
  preheaderEscaped: string;
  logoUrl: string;
  /** First CTA (legacy helpers). */
  ctaLabelEscaped?: string;
  ctaHrefEscaped?: string;
  preparedCtas: PreparedCampaignCta[];
  ctaLayout: 'stack' | 'row';
  pixelHtml: string;
  footerHtml: string;
}

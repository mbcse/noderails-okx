/**
 * @noderails/common - Shared types, utilities, and constants
 */

// Types
export * from './types/index.js';

// Errors
export * from './errors/index.js';

// Utils
export * from './utils/index.js';

// Constants
export * from './constants/index.js';

// Config
export * from './config/index.js';

// Format helpers (crypto amount display)
export * from './format/index.js';

// Merchant display helpers
export * from './merchant-display.js';

// Team permissions
export * from './permissions.js';

// Email utilities — NOT re-exported here because pdfkit requires Node.js (fs).
// Import via '@noderails/common/email' subpath in server-only code.
// Template catalog / CTA style metadata / brand copy are browser-safe.
export {
  CAMPAIGN_TEMPLATE_CATALOG,
  DEFAULT_CAMPAIGN_SIGNER_NAME,
  DEFAULT_CAMPAIGN_SIGNER_ORG,
  EMAIL_CAMPAIGN_TEMPLATE_IDS,
  getCampaignTemplateMeta,
  isEmailCampaignTemplateId,
  listCampaignTemplateCatalog,
  resolveCampaignSigner,
  resolveCampaignTemplateId,
} from './email/campaign-template-catalog.js';
export type {
  CampaignTemplateCategory,
  CampaignTemplateMeta,
  EmailCampaignTemplateId,
} from './email/campaign-template-catalog.js';

export {
  CAMPAIGN_CTA_ALIGNS,
  CAMPAIGN_CTA_LAYOUTS,
  CAMPAIGN_CTA_PLACEMENTS,
  CAMPAIGN_CTA_STYLE_CATALOG,
  CAMPAIGN_CTA_STYLE_IDS,
  defaultStyleForTemplate,
  isCampaignCtaLayout,
  isCampaignCtaPlacement,
  isCampaignCtaStyleId,
} from './email/campaign-cta-styles.js';
export type {
  CampaignCtaAlign,
  CampaignCtaInput,
  CampaignCtaLayout,
  CampaignCtaPlacement,
  CampaignCtaStyleId,
  CampaignCtaStyleMeta,
} from './email/campaign-cta-styles.js';

export {
  CAMPAIGN_CONFIDENTIAL_DISCLAIMER,
  CAMPAIGN_FOOTER_BACKED_BY,
  CAMPAIGN_FOOTER_TAGLINE,
  CAMPAIGN_FOOTER_URLS,
  NODERAILS_FINTECH_DISCLAIMER,
} from './email/campaign-brand.js';

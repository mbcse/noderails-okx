export const EMAIL_CAMPAIGN_TEMPLATE_IDS = [
  'UPDATES',
  'BUSINESS_OUTREACH',
  'DIRECT_OUTREACH',
  'PARTNERSHIP',
  'EVENT_INVITE',
  'ANNOUNCEMENT',
  'FOLLOW_UP',
] as const;

export type EmailCampaignTemplateId = (typeof EMAIL_CAMPAIGN_TEMPLATE_IDS)[number];

export type CampaignTemplateCategory = 'outreach' | 'broadcast';

export interface CampaignTemplateMeta {
  id: EmailCampaignTemplateId;
  label: string;
  description: string;
  category: CampaignTemplateCategory;
  suggestedFrom: string;
  showConfidentialDisclaimer: boolean;
}

export const CAMPAIGN_TEMPLATE_CATALOG: CampaignTemplateMeta[] = [
  {
    id: 'UPDATES',
    label: 'Product updates',
    description: 'Feature launches, changelog, and product news.',
    category: 'broadcast',
    suggestedFrom: 'updates@example.com',
    showConfidentialDisclaimer: false,
  },
  {
    id: 'BUSINESS_OUTREACH',
    label: 'Business outreach',
    description: 'Cold or warm B2B introductions.',
    category: 'outreach',
    suggestedFrom: 'business@example.com',
    showConfidentialDisclaimer: true,
  },
  {
    id: 'DIRECT_OUTREACH',
    label: 'Direct 1:1 outreach',
    description: 'Personal founder-style note or warm intro.',
    category: 'outreach',
    suggestedFrom: 'business@example.com',
    showConfidentialDisclaimer: true,
  },
  {
    id: 'PARTNERSHIP',
    label: 'Partnership proposal',
    description: 'API integration or co-marketing proposal.',
    category: 'outreach',
    suggestedFrom: 'business@example.com',
    showConfidentialDisclaimer: true,
  },
  {
    id: 'EVENT_INVITE',
    label: 'Event invite',
    description: 'Webinars, conferences, and meetups.',
    category: 'outreach',
    suggestedFrom: 'hello@example.com',
    showConfidentialDisclaimer: true,
  },
  {
    id: 'ANNOUNCEMENT',
    label: 'Announcement',
    description: 'Maintenance, policy, and short notices.',
    category: 'broadcast',
    suggestedFrom: 'updates@example.com',
    showConfidentialDisclaimer: false,
  },
  {
    id: 'FOLLOW_UP',
    label: 'Follow-up',
    description: 'Gentle nudge after no reply.',
    category: 'outreach',
    suggestedFrom: 'business@example.com',
    showConfidentialDisclaimer: true,
  },
];

const CATALOG_BY_ID = new Map(CAMPAIGN_TEMPLATE_CATALOG.map((item) => [item.id, item]));

export function isEmailCampaignTemplateId(value: unknown): value is EmailCampaignTemplateId {
  return typeof value === 'string' && CATALOG_BY_ID.has(value as EmailCampaignTemplateId);
}

export function resolveCampaignTemplateId(value?: string | null): EmailCampaignTemplateId {
  return isEmailCampaignTemplateId(value) ? value : 'UPDATES';
}

export function getCampaignTemplateMeta(id?: string | null): CampaignTemplateMeta {
  return CATALOG_BY_ID.get(resolveCampaignTemplateId(id))!;
}

export function listCampaignTemplateCatalog(): CampaignTemplateMeta[] {
  return CAMPAIGN_TEMPLATE_CATALOG.slice();
}

export interface CampaignTemplateSample {
  heading: string;
  body: string;
  ctaLabel: string;
  ctaUrl: string;
}

const TEMPLATE_SAMPLES: Record<EmailCampaignTemplateId, CampaignTemplateSample> = {
  UPDATES: {
    heading: 'New on NodeRails',
    body: 'A short look at what we shipped this week. Hosted checkout, payouts, and bank settlement updates.',
    ctaLabel: 'Read more',
    ctaUrl: 'https://example.local',
  },
  BUSINESS_OUTREACH: {
    heading: 'Partnership with your team',
    body: 'Hi there. We help companies accept stablecoin payments with escrow and compliance built in. Happy to walk through a fit for your stack.',
    ctaLabel: 'Book a call',
    ctaUrl: 'https://example.local',
  },
  DIRECT_OUTREACH: {
    heading: 'Quick note',
    body: 'Hi there. I noticed your team is building on-chain payments. We launched NodeRails to make crypto checkout feel as simple as Stripe. Happy to share how similar teams integrated in a week.\n\nWould a 15-min call next week work?',
    ctaLabel: '',
    ctaUrl: 'https://example.local',
  },
  PARTNERSHIP: {
    heading: 'Integration opportunity',
    body: 'We think a native integration could help your merchants accept USDC with hosted checkout, escrow, and webhooks.',
    ctaLabel: 'View integration docs',
    ctaUrl: 'https://example.local/docs',
  },
  EVENT_INVITE: {
    heading: 'Stablecoin payments for SaaS',
    body: 'Thu, Oct 2 at 11:00 AM ET. Virtual, 45 min. Join us for a live walkthrough of NodeRails checkout, payouts, and bank settlement.',
    ctaLabel: 'RSVP',
    ctaUrl: 'https://example.local',
  },
  ANNOUNCEMENT: {
    heading: 'Scheduled maintenance',
    body: 'API and dashboard will be briefly unavailable Saturday 2-4 AM UTC. No action needed.',
    ctaLabel: 'Status page',
    ctaUrl: 'https://example.local',
  },
  FOLLOW_UP: {
    heading: 'Following up',
    body: 'Hi. Quick follow-up on my note below. Still happy to walk through how NodeRails handles stablecoin checkout and escrow if useful for your roadmap.',
    ctaLabel: '',
    ctaUrl: '',
  },
};

export const DEFAULT_CAMPAIGN_SIGNER_NAME = 'Business team';
export const DEFAULT_CAMPAIGN_SIGNER_ORG = 'NodeRails';

export function resolveCampaignSigner(name?: string | null, title?: string | null): {
  name: string;
  title?: string;
  org: string;
} {
  const resolvedName = name?.trim() || DEFAULT_CAMPAIGN_SIGNER_NAME;
  const resolvedTitle = title?.trim() || undefined;
  return {
    name: resolvedName,
    title: resolvedTitle,
    org: DEFAULT_CAMPAIGN_SIGNER_ORG,
  };
}

export function getCampaignTemplateSample(id?: string | null): CampaignTemplateSample {
  return TEMPLATE_SAMPLES[resolveCampaignTemplateId(id)];
}

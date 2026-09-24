import {
  CAMPAIGN_TEMPLATE_CATALOG,
  getCampaignTemplateMeta,
  listCampaignTemplateCatalog,
  resolveCampaignTemplateId,
  type CampaignTemplateMeta,
  type EmailCampaignTemplateId,
} from '../campaign-template-catalog.js';
import { renderAnnouncementTemplate } from './announcement.js';
import { renderBusinessOutreachTemplate } from './business-outreach.js';
import { renderDirectOutreachTemplate } from './direct-outreach.js';
import { renderEventInviteTemplate } from './event-invite.js';
import { renderFollowUpTemplate } from './follow-up.js';
import { renderPartnershipTemplate } from './partnership.js';
import { renderUpdatesTemplate } from './updates.js';
import type { CampaignTemplateData } from './types.js';

export type { CampaignTemplateData } from './types.js';

export interface CampaignTemplateDefinition extends CampaignTemplateMeta {
  render: (data: CampaignTemplateData) => string;
}

const RENDERERS: Record<EmailCampaignTemplateId, CampaignTemplateDefinition['render']> = {
  UPDATES: renderUpdatesTemplate,
  BUSINESS_OUTREACH: renderBusinessOutreachTemplate,
  DIRECT_OUTREACH: renderDirectOutreachTemplate,
  PARTNERSHIP: renderPartnershipTemplate,
  EVENT_INVITE: renderEventInviteTemplate,
  ANNOUNCEMENT: renderAnnouncementTemplate,
  FOLLOW_UP: renderFollowUpTemplate,
};

export const CAMPAIGN_TEMPLATES: CampaignTemplateDefinition[] = CAMPAIGN_TEMPLATE_CATALOG.map((meta) => ({
  ...meta,
  render: RENDERERS[meta.id],
}));

const BY_ID = new Map(CAMPAIGN_TEMPLATES.map((item) => [item.id, item]));

export function getCampaignTemplateDefinition(id?: string | null): CampaignTemplateDefinition {
  return BY_ID.get(resolveCampaignTemplateId(id))!;
}

export function renderCampaignTemplate(data: CampaignTemplateData): string {
  return getCampaignTemplateDefinition(data.templateId).render(data);
}

export { getCampaignTemplateMeta, listCampaignTemplateCatalog, resolveCampaignTemplateId };

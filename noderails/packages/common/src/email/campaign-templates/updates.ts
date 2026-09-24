import { renderCampaignEmailHero } from '../campaign-brand.js';
import {
  finishCampaignTemplate,
  prepareCampaignContent,
  renderCtasAfterBody,
  renderCtasForPlacement,
  renderWhiteBodyRow,
} from './shared.js';
import type { CampaignTemplateData } from './types.js';

export function renderUpdatesTemplate(data: CampaignTemplateData): string {
  const content = prepareCampaignContent(data);
  const hero = renderCampaignEmailHero(content.eyebrowEscaped, content.headingEscaped, content.logoUrl);
  const afterHeading = renderCtasForPlacement(content, 'after_heading');
  const body = renderWhiteBodyRow(content.bodyHtml);
  const afterBody = renderCtasAfterBody(content);
  return finishCampaignTemplate(content, `${hero}${afterHeading}${body}${afterBody}`, data.wrapLink);
}

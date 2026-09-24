import {
  finishCampaignTemplate,
  prepareCampaignContent,
  renderCtasAfterBody,
  renderCtasForPlacement,
  renderWhiteBodyRow,
} from './shared.js';
import type { CampaignTemplateData } from './types.js';

export function renderFollowUpTemplate(data: CampaignTemplateData): string {
  const content = prepareCampaignContent(data);
  const afterHeading = renderCtasForPlacement(content, 'after_heading', '4px 48px 8px');
  const body = renderWhiteBodyRow(content.bodyHtml, '40px 48px 8px');
  const afterBody = renderCtasAfterBody(content, { cellPadding: '4px 48px 16px' });
  return finishCampaignTemplate(content, `${afterHeading}${body}${afterBody}`, data.wrapLink);
}

import {
  finishCampaignTemplate,
  prepareCampaignContent,
  renderCampaignSignerRow,
  renderCtasAfterBody,
  renderCtasForPlacement,
  renderWhiteBodyRow,
} from './shared.js';
import type { CampaignTemplateData } from './types.js';

export function renderDirectOutreachTemplate(data: CampaignTemplateData): string {
  const content = prepareCampaignContent(data);
  const afterHeading = renderCtasForPlacement(content, 'after_heading', '4px 48px 8px');
  const body = renderWhiteBodyRow(content.bodyHtml, '40px 48px 8px');
  const afterBody = renderCtasAfterBody(content, { includeOrphanBeforeSigner: false, cellPadding: '4px 48px 8px' });
  const beforeSigner = renderCtasForPlacement(content, 'before_signer', '4px 48px 8px');
  const signer = renderCampaignSignerRow(data);
  return finishCampaignTemplate(
    content,
    `${afterHeading}${body}${afterBody}${beforeSigner}${signer}`,
    data.wrapLink,
  );
}

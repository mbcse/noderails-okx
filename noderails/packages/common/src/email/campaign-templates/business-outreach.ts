import { CAMPAIGN_EMAIL, renderCampaignWordmarkLockup } from '../campaign-brand.js';
import {
  finishCampaignTemplate,
  prepareCampaignContent,
  renderCtasAfterBody,
  renderCtasForPlacement,
  renderWhiteBodyRow,
} from './shared.js';
import type { CampaignTemplateData } from './types.js';

export function renderBusinessOutreachTemplate(data: CampaignTemplateData): string {
  const content = prepareCampaignContent(data);
  const lockup = renderCampaignWordmarkLockup({
    logoUrl: content.logoUrl,
    logoSize: 28,
    logoRadius: 7,
    fontSize: 16,
    nodeColor: CAMPAIGN_EMAIL.text,
    railsColor: CAMPAIGN_EMAIL.textSecondary,
    gap: 7,
  });
  const header = `
          <tr>
            <td style="padding:36px 48px 8px;background-color:${CAMPAIGN_EMAIL.white};text-align:left;">
              ${lockup}
              <h1 style="margin:20px 0 0;font-family:${CAMPAIGN_EMAIL.font};color:${CAMPAIGN_EMAIL.text};font-size:26px;font-weight:600;letter-spacing:-0.022em;line-height:1.2;">
                ${content.headingEscaped}
              </h1>
            </td>
          </tr>`;
  const afterHeading = renderCtasForPlacement(content, 'after_heading');
  const body = renderWhiteBodyRow(content.bodyHtml, '16px 48px 8px');
  const afterBody = renderCtasAfterBody(content);
  return finishCampaignTemplate(content, `${header}${afterHeading}${body}${afterBody}`, data.wrapLink);
}

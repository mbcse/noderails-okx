import { CAMPAIGN_EMAIL } from '../campaign-brand.js';
import {
  finishCampaignTemplate,
  prepareCampaignContent,
  renderCtasAfterBody,
  renderCtasForPlacement,
  renderWhiteBodyRow,
} from './shared.js';
import type { CampaignTemplateData } from './types.js';

export function renderAnnouncementTemplate(data: CampaignTemplateData): string {
  const content = prepareCampaignContent(data);
  const header = `
          <tr>
            <td style="padding:36px 48px 8px;background-color:${CAMPAIGN_EMAIL.white};">
              <p style="margin:0;font-family:${CAMPAIGN_EMAIL.font};color:${CAMPAIGN_EMAIL.link};font-size:11px;font-weight:600;letter-spacing:0.08em;text-transform:uppercase;">
                Announcement
              </p>
              <h1 style="margin:10px 0 0;font-family:${CAMPAIGN_EMAIL.font};color:${CAMPAIGN_EMAIL.text};font-size:26px;font-weight:600;letter-spacing:-0.022em;line-height:1.2;">
                ${content.headingEscaped}
              </h1>
            </td>
          </tr>`;
  const afterHeading = renderCtasForPlacement(content, 'after_heading');
  const body = renderWhiteBodyRow(content.bodyHtml, '12px 48px 8px');
  const afterBody = renderCtasAfterBody(content);
  return finishCampaignTemplate(content, `${header}${afterHeading}${body}${afterBody}`, data.wrapLink);
}

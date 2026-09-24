import { CAMPAIGN_EMAIL } from '../campaign-brand.js';
import {
  finishCampaignTemplate,
  prepareCampaignContent,
  renderCtasAfterBody,
  renderCtasForPlacement,
} from './shared.js';
import type { CampaignTemplateData } from './types.js';

export function renderEventInviteTemplate(data: CampaignTemplateData): string {
  const content = prepareCampaignContent(data);
  const header = `
          <tr>
            <td style="height:4px;background-color:${CAMPAIGN_EMAIL.link};font-size:0;line-height:0;">&nbsp;</td>
          </tr>
          <tr>
            <td style="padding:28px 48px 8px;background-color:${CAMPAIGN_EMAIL.white};">
              <p style="margin:0;font-family:${CAMPAIGN_EMAIL.font};color:${CAMPAIGN_EMAIL.textSecondary};font-size:13px;font-weight:500;letter-spacing:0.01em;">
                You are invited
              </p>
              <h1 style="margin:8px 0 0;font-family:${CAMPAIGN_EMAIL.font};color:${CAMPAIGN_EMAIL.text};font-size:26px;font-weight:600;letter-spacing:-0.022em;line-height:1.2;">
                ${content.headingEscaped}
              </h1>
            </td>
          </tr>`;
  const afterHeading = renderCtasForPlacement(content, 'after_heading');
  const details = content.bodyHtml
    ? `
          <tr>
            <td style="padding:16px 48px 8px;background-color:${CAMPAIGN_EMAIL.white};">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid ${CAMPAIGN_EMAIL.borderLight};border-radius:12px;">
                <tr>
                  <td style="padding:18px 20px;">
                    <div style="font-family:${CAMPAIGN_EMAIL.font};color:${CAMPAIGN_EMAIL.text};font-size:16px;line-height:1.6;font-weight:400;">
                      ${content.bodyHtml}
                    </div>
                  </td>
                </tr>
              </table>
            </td>
          </tr>`
    : '';
  const afterBody = renderCtasAfterBody(content);
  return finishCampaignTemplate(content, `${header}${afterHeading}${details}${afterBody}`, data.wrapLink);
}

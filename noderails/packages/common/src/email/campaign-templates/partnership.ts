import { CAMPAIGN_EMAIL, renderCampaignWordmarkLockup } from '../campaign-brand.js';
import {
  finishCampaignTemplate,
  prepareCampaignContent,
  renderCtasAfterBody,
  renderCtasForPlacement,
  renderWhiteBodyRow,
} from './shared.js';
import type { CampaignTemplateData } from './types.js';

export function renderPartnershipTemplate(data: CampaignTemplateData): string {
  const content = prepareCampaignContent(data);
  const lockup = renderCampaignWordmarkLockup({
    logoUrl: content.logoUrl,
    logoSize: 26,
    logoRadius: 7,
    fontSize: 15,
    nodeColor: CAMPAIGN_EMAIL.text,
    railsColor: CAMPAIGN_EMAIL.textSecondary,
    gap: 7,
  });
  const header = `
          <tr>
            <td style="padding:32px 48px 8px;background-color:${CAMPAIGN_EMAIL.white};">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td align="left" style="vertical-align:middle;">${lockup}</td>
                  <td align="right" style="vertical-align:middle;">
                    <span style="display:inline-block;font-family:${CAMPAIGN_EMAIL.font};font-size:11px;font-weight:600;letter-spacing:0.04em;text-transform:uppercase;color:${CAMPAIGN_EMAIL.textSecondary};border:1px solid ${CAMPAIGN_EMAIL.borderLight};border-radius:980px;padding:4px 10px;">
                      Partnership
                    </span>
                  </td>
                </tr>
              </table>
              <h1 style="margin:18px 0 0;font-family:${CAMPAIGN_EMAIL.font};color:${CAMPAIGN_EMAIL.text};font-size:24px;font-weight:600;letter-spacing:-0.022em;line-height:1.25;">
                ${content.headingEscaped}
              </h1>
            </td>
          </tr>`;
  const afterHeading = renderCtasForPlacement(content, 'after_heading');
  const body = renderWhiteBodyRow(content.bodyHtml, '16px 48px 8px');
  const afterBody = renderCtasAfterBody(content);
  return finishCampaignTemplate(content, `${header}${afterHeading}${body}${afterBody}`, data.wrapLink);
}

export { escapeHtml, extractHttpUrls, isSafeHttpUrl } from './campaign-html.js';
export type { CampaignTemplateData } from './campaign-templates/types.js';

import { renderCampaignTemplate } from './campaign-templates/index.js';
import type { CampaignTemplateData } from './campaign-templates/types.js';

export function renderCampaignEmail(data: CampaignTemplateData): string {
  return renderCampaignTemplate(data);
}

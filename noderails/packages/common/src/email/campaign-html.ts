import { CAMPAIGN_EMAIL } from './campaign-brand.js';
import {
  extractHtmlHrefs,
  looksLikeHtml,
  rewriteCampaignAnchors,
  sanitizeCampaignHtml,
} from './campaign-sanitize.js';

const URL_RE = /https?:\/\/[^\s<>"'()]+/gi;

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function extractHttpUrls(text: string): string[] {
  const unique: string[] = [];
  const seen = new Set<string>();
  const push = (raw: string) => {
    const url = raw.replace(/[.,;:]+$/, '');
    if (!/^https?:\/\//i.test(url) || seen.has(url)) return;
    seen.add(url);
    unique.push(url);
  };
  if (looksLikeHtml(text)) {
    for (const href of extractHtmlHrefs(text)) push(href);
  }
  const found = text.match(URL_RE) ?? [];
  for (const raw of found) push(raw);
  return unique;
}

export function isSafeHttpUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

function linkifyEscapedParagraph(escaped: string, wrapLink?: (url: string, ctaId?: string) => string): string {
  return escaped.replace(/https?:\/\/[^\s<]+/gi, (match) => {
    const trimmed = match.replace(/[.,;:]+$/, '');
    const url = trimmed.replace(/&amp;/g, '&');
    if (!isSafeHttpUrl(url)) return match;
    const href = wrapLink ? wrapLink(url) : url;
    return `<a href="${escapeHtml(href)}" style="color:${CAMPAIGN_EMAIL.text};text-decoration:underline;font-weight:400;">${trimmed}</a>`;
  });
}

function renderPlainBodyHtml(body: string, wrapLink?: (url: string, ctaId?: string) => string): string {
  const blocks = body.replace(/\r\n/g, '\n').trim().split(/\n{2,}/);
  if (blocks.length === 1 && !blocks[0]) {
    return '';
  }
  return blocks
    .map((block) => {
      const escaped = escapeHtml(block).replace(/\n/g, '<br>');
      return `<p style="margin:0 0 20px;font-family:${CAMPAIGN_EMAIL.font};color:${CAMPAIGN_EMAIL.text};font-size:17px;line-height:1.65;font-weight:400;letter-spacing:-0.011em;">${linkifyEscapedParagraph(escaped, wrapLink)}</p>`;
    })
    .join('');
}

export function renderCampaignBodyHtml(body: string, wrapLink?: (url: string, ctaId?: string) => string): string {
  if (!looksLikeHtml(body)) {
    return renderPlainBodyHtml(body, wrapLink);
  }
  const sanitized = sanitizeCampaignHtml(body);
  return wrapLink ? rewriteCampaignAnchors(sanitized, wrapLink) : sanitized;
}

export function campaignPreheaderText(heading: string, body: string): string {
  const plain = body.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  const snippet = plain.slice(0, 120);
  if (snippet) return snippet;
  return heading;
}

export function trackingPixel(url: string): string {
  return `<img src="${escapeHtml(url)}" width="1" height="1" alt="" style="display:block;width:1px;height:1px;border:0;" />`;
}

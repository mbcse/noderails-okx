function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function isSafeHttpUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

const VOID_TAGS = new Set(['br', 'img']);
const ALLOWED_TAGS = new Set([
  'p', 'br', 'strong', 'b', 'em', 'i', 'u', 's',
  'h1', 'h2', 'h3', 'ul', 'ol', 'li', 'a', 'img', 'blockquote', 'span',
]);

const FONT =
  "-apple-system,BlinkMacSystemFont,'SF Pro Display','SF Pro Text','Helvetica Neue',Helvetica,Arial,sans-serif";
const HREF_STYLE = 'color:#1d1d1f;text-decoration:underline;font-weight:400;';
const IMG_STYLE =
  'max-width:100%;height:auto;border:0;display:block;margin:24px auto;border-radius:12px;';
const BLOCK_STYLE: Record<string, string> = {
  p: `margin:0 0 20px;font-family:${FONT};color:#1d1d1f;font-size:17px;line-height:1.65;font-weight:400;letter-spacing:-0.011em;`,
  h1: `margin:0 0 16px;font-family:${FONT};color:#1d1d1f;font-size:24px;font-weight:600;line-height:1.2;letter-spacing:-0.022em;`,
  h2: `margin:0 0 14px;font-family:${FONT};color:#1d1d1f;font-size:21px;font-weight:600;line-height:1.25;letter-spacing:-0.02em;`,
  h3: `margin:0 0 12px;font-family:${FONT};color:#1d1d1f;font-size:19px;font-weight:600;line-height:1.3;letter-spacing:-0.018em;`,
  ul: `margin:0 0 20px 22px;padding:0;font-family:${FONT};color:#1d1d1f;font-size:17px;line-height:1.65;font-weight:400;`,
  ol: `margin:0 0 20px 22px;padding:0;font-family:${FONT};color:#1d1d1f;font-size:17px;line-height:1.65;font-weight:400;`,
  li: 'margin:0 0 8px;',
  blockquote: `margin:0 0 20px;padding:16px 20px;border:1px solid #d2d2d7;border-radius:12px;background-color:#ffffff;font-family:${FONT};color:#1d1d1f;font-size:17px;line-height:1.65;font-weight:400;`,
};

export function looksLikeHtml(body: string): boolean {
  return /<\/?[a-z][\s\S]*>/i.test(body.trim());
}

function decodeAttr(value: string): string {
  return value
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
}

function parseAttrs(raw: string): Record<string, string> {
  const attrs: Record<string, string> = {};
  const re = /([a-zA-Z_:][\w:.-]*)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(raw))) {
    attrs[match[1].toLowerCase()] = decodeAttr(match[2] ?? match[3] ?? match[4] ?? '');
  }
  return attrs;
}

function dropDangerous(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<iframe[\s\S]*?<\/iframe>/gi, '')
    .replace(/<!--[\s\S]*?-->/g, '');
}

function sanitizeHref(raw: string): string | null {
  const url = raw.trim();
  if (!isSafeHttpUrl(url)) return null;
  return url;
}

function openTag(name: string, attrs: Record<string, string>): string {
  if (name === 'br') return '<br>';
  if (name === 'a') {
    const href = attrs.href ? sanitizeHref(attrs.href) : null;
    if (!href) return '';
    return `<a href="${escapeHtml(href)}" style="${HREF_STYLE}">`;
  }
  if (name === 'img') {
    const src = attrs.src ? sanitizeHref(attrs.src) : null;
    if (!src) return '';
    const alt = escapeHtml(attrs.alt ?? '');
    const width = attrs.width && /^\d+$/.test(attrs.width) ? ` width="${attrs.width}"` : '';
    const height = attrs.height && /^\d+$/.test(attrs.height) ? ` height="${attrs.height}"` : '';
    return `<img src="${escapeHtml(src)}" alt="${alt}"${width}${height} style="${IMG_STYLE}" />`;
  }
  const style = BLOCK_STYLE[name];
  if (style) return `<${name} style="${style}">`;
  return `<${name}>`;
}

/**
 * Allowlisted campaign HTML. Strips scripts, event handlers, and unsafe URLs.
 */
export function sanitizeCampaignHtml(input: string): string {
  const source = dropDangerous(input);
  let out = '';
  const open: string[] = [];
  const tokenRe = /<\/?([a-zA-Z][a-zA-Z0-9]*)\b([^>]*)>|([^<]+)/g;
  let match: RegExpExecArray | null;
  while ((match = tokenRe.exec(source))) {
    if (match[3] != null) {
      out += escapeHtml(decodeAttr(match[3]));
      continue;
    }
    const name = match[1].toLowerCase();
    const rawAttrs = match[2] ?? '';
    const closing = match[0].startsWith('</');
    if (!ALLOWED_TAGS.has(name)) continue;
    if (closing) {
      const idx = open.lastIndexOf(name);
      if (idx === -1) continue;
      while (open.length > idx) {
        const popped = open.pop();
        if (popped && !VOID_TAGS.has(popped)) out += `</${popped}>`;
      }
      continue;
    }
    const rendered = openTag(name, parseAttrs(rawAttrs));
    if (!rendered) continue;
    if (VOID_TAGS.has(name)) {
      out += rendered;
      continue;
    }
    open.push(name);
    out += rendered;
  }
  while (open.length) {
    const popped = open.pop();
    if (popped && !VOID_TAGS.has(popped)) out += `</${popped}>`;
  }
  return out.trim();
}

export function rewriteCampaignAnchors(html: string, wrapLink: (url: string, ctaId?: string) => string): string {
  return html.replace(/<a href="([^"]+)"/gi, (_all, href: string) => {
    const url = decodeAttr(href);
    if (!isSafeHttpUrl(url)) return `<a href="${escapeHtml(url)}"`;
    return `<a href="${escapeHtml(wrapLink(url))}"`;
  });
}

export function extractHtmlHrefs(html: string): string[] {
  const found: string[] = [];
  const re = /<a\s[^>]*href=(?:"([^"]+)"|'([^']+)')/gi;
  let match: RegExpExecArray | null;
  while ((match = re.exec(html))) {
    const url = decodeAttr(match[1] ?? match[2] ?? '').trim();
    if (isSafeHttpUrl(url)) found.push(url);
  }
  return found;
}

import { describe, expect, it } from 'vitest';
import { looksLikeHtml, sanitizeCampaignHtml } from './campaign-sanitize.js';

describe('sanitizeCampaignHtml', () => {
  it('detects HTML bodies', () => {
    expect(looksLikeHtml('<p>Hi</p>')).toBe(true);
    expect(looksLikeHtml('Just text\n\nNext')).toBe(false);
  });

  it('keeps allowlisted markup and images', () => {
    const html = sanitizeCampaignHtml(
      '<p>Hello <strong>there</strong></p><img src="https://example.local/a.png" alt="A" /><a href="https://example.local">Site</a>',
    );
    expect(html).toContain('<strong>');
    expect(html).toContain('src="https://example.local/a.png"');
    expect(html).toContain('href="https://example.local"');
    expect(html).toContain('max-width:100%');
  });

  it('strips scripts, handlers, and javascript URLs', () => {
    const html = sanitizeCampaignHtml(
      '<p onclick="alert(1)">Hi</p><script>alert(1)</script><a href="javascript:alert(1)">x</a><img src="javascript:alert(1)" />',
    );
    expect(html).not.toContain('script');
    expect(html).not.toContain('onclick');
    expect(html).not.toContain('javascript:');
    expect(html).toContain('Hi');
    expect(html).not.toContain('<a ');
    expect(html).not.toContain('<img');
  });
});

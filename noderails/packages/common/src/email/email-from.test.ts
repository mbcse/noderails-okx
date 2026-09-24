import { describe, expect, it } from 'vitest';
import {
  DEFAULT_CAMPAIGN_FROM,
  assertCampaignFrom,
  campaignEyebrow,
  emailFromDisplayName,
  formatFromHeader,
  isAllowedCampaignFrom,
  resolveEmailFrom,
} from './email-from.js';

describe('campaign from allowlist', () => {
  it('accepts the marketing identities', () => {
    expect(isAllowedCampaignFrom('updates@example.com')).toBe(true);
    expect(isAllowedCampaignFrom('Hello@example.com')).toBe(true);
    expect(isAllowedCampaignFrom('business@example.com')).toBe(true);
    expect(isAllowedCampaignFrom('no-reply@example.com')).toBe(false);
  });

  it('rejects unknown campaign From', () => {
    expect(() => assertCampaignFrom('promo@example.com')).toThrow(/not allowed/);
  });

  it('resolves purposes', () => {
    expect(resolveEmailFrom('auth', { auth: 'no-reply@example.com', transactional: 'transactions@example.com' }))
      .toBe('no-reply@example.com');
    expect(resolveEmailFrom('transactional', { auth: 'no-reply@example.com', transactional: 'transactions@example.com' }))
      .toBe('transactions@example.com');
    expect(resolveEmailFrom('campaign', { auth: 'a', transactional: 'b' }))
      .toBe(DEFAULT_CAMPAIGN_FROM);
  });

  it('maps eyebrow from From', () => {
    expect(campaignEyebrow('security@example.com')).toBe('NodeRails Security');
    expect(campaignEyebrow('hello@example.com')).toBe('NodeRails');
    expect(campaignEyebrow('updates@example.com')).toBe('NodeRails Updates');
    expect(campaignEyebrow('business@example.com')).toBe('NodeRails Business');
  });

  it('formats inbox display names', () => {
    expect(emailFromDisplayName('no-reply@example.com')).toBe('NodeRails');
    expect(emailFromDisplayName('transactions@example.com')).toBe('NodeRails');
    expect(formatFromHeader('updates@example.com'))
      .toBe('"NodeRails Updates" <updates@example.com>');
    expect(formatFromHeader('NodeRails <support@example.com>'))
      .toBe('"NodeRails Support" <support@example.com>');
  });
});

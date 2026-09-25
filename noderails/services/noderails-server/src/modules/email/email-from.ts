import { resolveEmailFrom, type EmailFromPurpose } from '@noderails/common/email';
import { env } from '../../config.js';

export function emailFrom(purpose: EmailFromPurpose, campaignFrom?: string): string {
  return resolveEmailFrom(
    purpose,
    {
      auth: env.SES_FROM_EMAIL,
      transactional: env.SES_TRANSACTIONAL_FROM_EMAIL,
    },
    campaignFrom ?? env.EMAIL_CAMPAIGN_FROM_DEFAULT,
  );
}

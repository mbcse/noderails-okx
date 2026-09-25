import { getDatabaseClient } from '@noderails/database';
import { QUEUE_NAMES } from '@noderails/common';
import { configureSes, sendEmail } from '@noderails/common/email';
import { createWorker, configureQueue } from '@noderails/queue';
import type { EmailCampaignSendJob } from '@noderails/queue';
import { getRedis } from '@noderails/redis';
import type { Logger } from '@noderails/service-base';
import { env } from '../../config.js';
import { emailLog } from './email-log.js';
import { getCampaignSuppressionCode } from './ses-notifications.service.js';
import { checkEmailDeliverability } from '../../lib/email-mx.js';
import { maybeCompleteCampaign, parseStoredCtas, renderCampaignHtml } from './email-campaign.service.js';
import { publicEmailUrl, signUnsubscribeToken } from './email-tracking.js';

function stampHour(): string {
  const d = new Date();
  return `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, '0')}${String(d.getUTCDate()).padStart(2, '0')}${String(d.getUTCHours()).padStart(2, '0')}`;
}

function stampDay(): string {
  const d = new Date();
  return `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, '0')}${String(d.getUTCDate()).padStart(2, '0')}`;
}

async function assertSendBudget(): Promise<void> {
  const redis = getRedis();
  const hourKey = `noderails:email:campaign:hour:${stampHour()}`;
  const dayKey = `noderails:email:campaign:day:${stampDay()}`;
  const [hour, day] = await Promise.all([redis.get(hourKey), redis.get(dayKey)]);
  if (Number(hour ?? 0) >= env.EMAIL_CAMPAIGN_MAX_PER_HOUR) {
    throw new Error('Campaign hourly send cap reached');
  }
  if (Number(day ?? 0) >= env.EMAIL_CAMPAIGN_DAILY_CAP) {
    throw new Error('Campaign daily send cap reached');
  }
}

async function incrementSendBudget(): Promise<void> {
  const redis = getRedis();
  const hourKey = `noderails:email:campaign:hour:${stampHour()}`;
  const dayKey = `noderails:email:campaign:day:${stampDay()}`;
  const hourCount = await redis.incr(hourKey);
  if (hourCount === 1) await redis.expire(hourKey, 2 * 60 * 60);
  const dayCount = await redis.incr(dayKey);
  if (dayCount === 1) await redis.expire(dayKey, 48 * 60 * 60);
}

export function startEmailCampaignWorker(logger: Logger) {
  configureSes({
    region: env.AWS_REGION,
    accessKeyId: env.AWS_ACCESS_KEY_ID,
    secretAccessKey: env.AWS_SECRET_ACCESS_KEY,
    fromEmail: env.SES_FROM_EMAIL,
  });
  configureQueue({ redisUrl: env.REDIS_URL });

  const db = getDatabaseClient();
  const perSecond = Math.max(1, env.EMAIL_CAMPAIGN_MAX_PER_SECOND);

  const worker = createWorker<EmailCampaignSendJob>(
    QUEUE_NAMES.EMAIL_CAMPAIGN,
    async (job) => {
      const { campaignId, recipientId } = job.data;
      const campaign = await db.emailCampaign.findUnique({ where: { id: campaignId } });
      const recipient = await db.emailCampaignRecipient.findUnique({ where: { id: recipientId } });
      if (!campaign || !recipient) return;
      if (campaign.status === 'CANCELLED' || recipient.status === 'CANCELLED') return;
      if (recipient.status === 'SENT' || recipient.status === 'SKIPPED') return;

      const suppression = await getCampaignSuppressionCode(recipient.email);
      if (suppression) {
        await db.emailCampaignRecipient.update({
          where: { id: recipient.id },
          data: { status: 'SKIPPED', lastError: suppression },
        });
        await db.emailCampaign.update({
          where: { id: campaignId },
          data: { skippedCount: { increment: 1 }, status: 'SENDING' },
        });
        emailLog.info('Campaign recipient skipped', {
          campaignId,
          recipientId,
          to: recipient.email,
          reason: suppression,
        });
        await maybeCompleteCampaign(campaignId);
        return;
      }

      const deliverability = await checkEmailDeliverability(recipient.email);
      if (!deliverability.ok) {
        const reason = deliverability.code ?? 'undeliverable';
        await db.emailCampaignRecipient.update({
          where: { id: recipient.id },
          data: { status: 'SKIPPED', lastError: reason },
        });
        await db.emailCampaign.update({
          where: { id: campaignId },
          data: { skippedCount: { increment: 1 }, status: 'SENDING' },
        });
        emailLog.info('Campaign recipient skipped', {
          campaignId,
          recipientId,
          to: recipient.email,
          reason,
          detail: deliverability.detail,
        });
        await maybeCompleteCampaign(campaignId);
        return;
      }

      try {
        await assertSendBudget();
      } catch (err) {
        emailLog.warn('Campaign send waiting on rate cap', {
          campaignId,
          recipientId,
          error: err instanceof Error ? err.message : String(err),
        });
        throw err;
      }

      const html = renderCampaignHtml({
        templateId: campaign.templateId,
        fromAddress: campaign.fromAddress,
        heading: campaign.heading,
        body: campaign.body,
        ctaLabel: campaign.ctaLabel,
        ctaUrl: campaign.ctaUrl,
        ctas: parseStoredCtas(campaign.ctas),
        ctaLayout: campaign.ctaLayout,
        showBackedBy: campaign.showBackedBy,
        signerName: campaign.signerName,
        signerTitle: campaign.signerTitle,
        recipientId: recipient.id,
        openToken: recipient.openToken,
        email: recipient.email,
        track: true,
      });
      const unsubscribeUrl = publicEmailUrl(
        `/public/email/unsubscribe?token=${signUnsubscribeToken(recipient.email)}`,
      );

      const result = await sendEmail({
        to: recipient.email,
        from: campaign.fromAddress,
        subject: campaign.subject,
        html,
        headers: {
          'List-Unsubscribe': `<${unsubscribeUrl}>`,
          'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
        },
      });

      await incrementSendBudget();
      await db.emailCampaignRecipient.update({
        where: { id: recipient.id },
        data: { status: 'SENT', lastError: null },
      });
      await db.emailCampaign.update({
        where: { id: campaignId },
        data: { sentCount: { increment: 1 }, status: 'SENDING' },
      });
      await maybeCompleteCampaign(campaignId);
      emailLog.info('Campaign email sent', {
        campaignId,
        recipientId,
        to: recipient.email,
        from: campaign.fromAddress,
        messageId: result.messageId,
      });
    },
    {
      concurrency: 1,
      limiter: { max: perSecond, duration: 1000 },
    },
    {
      onFailed: async (job, err) => {
        const { campaignId, recipientId } = job.data;
        const exhausted = job.attemptsMade >= 8;
        emailLog.error('Campaign email job failed', {
          campaignId,
          recipientId,
          attempt: job.attemptsMade,
          error: err.message,
        });
        if (!exhausted) return;
        await db.emailCampaignRecipient.update({
          where: { id: recipientId },
          data: { status: 'FAILED', lastError: err.message },
        }).catch(() => undefined);
        await db.emailCampaign.update({
          where: { id: campaignId },
          data: { failedCount: { increment: 1 } },
        }).catch(() => undefined);
        await maybeCompleteCampaign(campaignId).catch(() => undefined);
      },
    },
  );

  logger.info('Email campaign worker started', { perSecond });
  return worker;
}

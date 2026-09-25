import {
  EmailCampaignAudience,
  getDatabaseClient,
  type Prisma,
} from '@noderails/database';
import {
  DEFAULT_PAGE_SIZE,
  MAX_PAGE_SIZE,
  NotFoundError,
  QUEUE_NAMES,
  ValidationError,
  resolveMerchantDisplayName,
} from '@noderails/common';
import {
  assertCampaignFrom,
  CAMPAIGN_FOOTER_URLS,
  CAMPAIGN_FROM_ADDRESSES,
  DEFAULT_CAMPAIGN_FROM,
  defaultStyleForTemplate,
  extractHttpUrls,
  isCampaignCtaLayout,
  isCampaignCtaPlacement,
  isCampaignCtaStyleId,
  isSafeHttpUrl,
  getCampaignTemplateSample,
  listCampaignTemplateCatalog,
  looksLikeHtml,
  renderCampaignEmail,
  resolveCampaignTemplateId,
  sanitizeCampaignHtml,
  type CampaignCtaInput,
  type CampaignCtaLayout,
} from '@noderails/common/email';
import {
  buildS3Key,
  publicS3ObjectUrl,
  S3_BUCKETS,
  S3_FOLDERS,
  STORAGE_LIMITS,
  uploadToS3,
} from '@noderails/storage';
import { randomUUID } from 'crypto';
import { queueRegistry } from '@noderails/queue';
import type { EmailCampaignSendJob } from '@noderails/queue';
import { env } from '../../config.js';
import { emailLog } from './email-log.js';
import { getCampaignSuppressionCode } from './ses-notifications.service.js';
import {
  assertEmailCanReceiveMail,
  checkEmailDeliverability,
  describeDeliveryIssue,
} from '../../lib/email-mx.js';
import { resolveAudiencePeople, type EmailPerson } from './email-people.service.js';
import {
  newOpenToken,
  publicEmailUrl,
  signClickToken,
} from './email-tracking.js';
import { CAMPAIGN_EMAIL_LOGO_PUBLIC_PATH } from './email-campaign-logo.js';

function normalizeCampaignBody(body: string): string {
  const trimmed = body.trim();
  return looksLikeHtml(trimmed) ? sanitizeCampaignHtml(trimmed) : trimmed;
}

const IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/gif', 'image/webp']);

export async function uploadCampaignImage(file: {
  buffer: Buffer;
  mimetype: string;
  originalname: string;
}): Promise<{ url: string; key: string }> {
  if (!IMAGE_TYPES.has(file.mimetype)) {
    throw new ValidationError('Use a JPEG, PNG, GIF, or WebP image');
  }
  if (file.buffer.length > STORAGE_LIMITS.MAX_IMAGE_BYTES) {
    throw new ValidationError('Image must be 5 MB or smaller');
  }
  const key = buildS3Key(S3_FOLDERS.EMAIL_CAMPAIGN_IMAGES, randomUUID(), file.originalname || 'image');
  await uploadToS3(S3_BUCKETS.EMAIL_IMAGES, key, file.buffer, file.mimetype);
  return {
    url: publicS3ObjectUrl(S3_BUCKETS.EMAIL_IMAGES, key, env.S3_EMAIL_IMAGES_PUBLIC_BASE || undefined),
    key,
  };
}

export function campaignAllowedDestUrls(input: {
  body: string;
  ctaUrl?: string | null;
  ctas?: CampaignCtaInput[] | null;
}): string[] {
  const urls = extractHttpUrls(input.body);
  if (input.ctaUrl && isSafeHttpUrl(input.ctaUrl)) urls.push(input.ctaUrl);
  for (const cta of input.ctas ?? []) {
    if (cta.url && isSafeHttpUrl(cta.url)) urls.push(cta.url);
  }
  urls.push(...CAMPAIGN_FOOTER_URLS);
  return [...new Set(urls)];
}

export function parseStoredCtas(value: unknown): CampaignCtaInput[] {
  if (!Array.isArray(value)) return [];
  const out: CampaignCtaInput[] = [];
  for (const row of value) {
    if (!row || typeof row !== 'object') continue;
    const item = row as Record<string, unknown>;
    const id = typeof item.id === 'string' ? item.id : '';
    const label = typeof item.label === 'string' ? item.label : '';
    const url = typeof item.url === 'string' ? item.url : '';
    if (!id || !label || !url) continue;
    const style = typeof item.style === 'string' && isCampaignCtaStyleId(item.style)
      ? item.style
      : 'black_pill';
    const placement = typeof item.placement === 'string' && isCampaignCtaPlacement(item.placement)
      ? item.placement
      : 'after_body';
    const align = item.align === 'center' || item.align === 'left' ? item.align : undefined;
    out.push({
      id,
      label,
      url,
      style,
      placement,
      align,
      withArrow: Boolean(item.withArrow),
    });
  }
  return out;
}

export function renderCampaignHtml(input: {
  templateId?: string | null;
  fromAddress: string;
  heading: string;
  body: string;
  ctaLabel?: string | null;
  ctaUrl?: string | null;
  ctas?: CampaignCtaInput[] | null;
  ctaLayout?: CampaignCtaLayout | string | null;
  showBackedBy?: boolean | null;
  signerName?: string | null;
  signerTitle?: string | null;
  recipientId?: string;
  openToken?: string;
  email?: string;
  track?: boolean;
}): string {
  const track = Boolean(input.track && input.recipientId && input.openToken && input.email);
  const ctaLayout = normalizeCtaLayout(input.ctaLayout);
  return renderCampaignEmail({
    templateId: resolveCampaignTemplateId(input.templateId),
    fromAddress: input.fromAddress,
    heading: input.heading,
    body: input.body,
    logoUrl: publicEmailUrl(CAMPAIGN_EMAIL_LOGO_PUBLIC_PATH),
    ctaLabel: input.ctaLabel ?? undefined,
    ctaUrl: input.ctaUrl ?? undefined,
    ctas: input.ctas ?? undefined,
    ctaLayout,
    showBackedBy: input.showBackedBy !== false,
    signerName: input.signerName ?? undefined,
    signerTitle: input.signerTitle ?? undefined,
    openPixelUrl: track
      ? publicEmailUrl(`/public/email/open/${input.openToken}.gif`)
      : undefined,
    wrapLink: track && input.recipientId
      ? (url, ctaId) => publicEmailUrl(`/public/email/click/${signClickToken(input.recipientId!, url, ctaId)}`)
      : undefined,
  });
}

function campaignBucketIds(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const ids = value.filter((item): item is string => typeof item === 'string' && item.length > 0);
  return ids.length ? ids : undefined;
}

function assertAudienceSelection(input: {
  audience: EmailCampaignAudience;
  personKeys?: string[];
  bucketIds?: string[];
}) {
  if (input.audience === EmailCampaignAudience.SELECTED_PEOPLE && !input.personKeys?.length) {
    throw new ValidationError('Select at least one person');
  }
  if (input.audience === EmailCampaignAudience.BUCKETS && !input.bucketIds?.length) {
    throw new ValidationError('Select at least one bucket');
  }
}

function normalizeCta(ctaLabel?: string, ctaUrl?: string) {
  const label = ctaLabel?.trim() || undefined;
  const url = ctaUrl?.trim() || undefined;
  if (url && !isSafeHttpUrl(url)) {
    throw new ValidationError('Button URL must be http or https');
  }
  if ((label && !url) || (url && !label)) {
    throw new ValidationError('Button label and URL are both required');
  }
  return { ctaLabel: label ?? null, ctaUrl: url ?? null };
}

const MAX_CTAS = 5;

function normalizeCtas(input: {
  ctas?: CampaignCtaInput[];
  ctaLabel?: string;
  ctaUrl?: string;
  templateId?: string;
}): { ctas: CampaignCtaInput[] | null; ctaLabel: string | null; ctaUrl: string | null } {
  let raw = input.ctas;
  if ((!raw || raw.length === 0) && (input.ctaLabel || input.ctaUrl)) {
    const legacy = normalizeCta(input.ctaLabel, input.ctaUrl);
    if (legacy.ctaLabel && legacy.ctaUrl) {
      raw = [{
        id: 'legacy-1',
        label: legacy.ctaLabel,
        url: legacy.ctaUrl,
        placement: 'after_body',
        style: defaultStyleForTemplate(input.templateId),
        withArrow: false,
      }];
    }
  }
  if (!raw?.length) {
    return { ctas: null, ctaLabel: null, ctaUrl: null };
  }
  if (raw.length > MAX_CTAS) {
    throw new ValidationError(`At most ${MAX_CTAS} buttons are allowed`);
  }
  const ctas: CampaignCtaInput[] = [];
  for (const row of raw) {
    const label = row.label?.trim();
    const url = row.url?.trim();
    const id = row.id?.trim() || randomUUID();
    if (!label || !url) {
      throw new ValidationError('Each button needs a label and URL');
    }
    if (!isSafeHttpUrl(url)) {
      throw new ValidationError('Button URL must be http or https');
    }
    const style = isCampaignCtaStyleId(row.style) ? row.style : defaultStyleForTemplate(input.templateId);
    const placement = isCampaignCtaPlacement(row.placement) ? row.placement : 'after_body';
    const align = row.align === 'center' || row.align === 'left' ? row.align : undefined;
    ctas.push({
      id,
      label: label.slice(0, 80),
      url: url.slice(0, 2000),
      style,
      placement,
      align,
      withArrow: Boolean(row.withArrow),
    });
  }
  return {
    ctas,
    ctaLabel: ctas[0]?.label ?? null,
    ctaUrl: ctas[0]?.url ?? null,
  };
}

function normalizeCtaLayout(value?: string | null): CampaignCtaLayout {
  return isCampaignCtaLayout(value ?? '') ? value as CampaignCtaLayout : 'stack';
}

function normalizeSigner(signerName?: string, signerTitle?: string) {
  return {
    signerName: signerName?.trim() || null,
    signerTitle: signerTitle?.trim() || null,
  };
}

export function listCampaignTemplates() {
  return listCampaignTemplateCatalog();
}

export async function createCampaign(input: {
  adminEmail: string;
  fromAddress?: string;
  templateId?: string;
  subject?: string;
  heading: string;
  body: string;
  ctaLabel?: string;
  ctaUrl?: string;
  ctas?: CampaignCtaInput[];
  ctaLayout?: string;
  showBackedBy?: boolean;
  signerName?: string;
  signerTitle?: string;
  audience: EmailCampaignAudience;
  personKeys?: string[];
  bucketIds?: string[];
}) {
  const heading = input.heading.trim();
  if (!heading) throw new ValidationError('heading is required');
  const body = normalizeCampaignBody(input.body);
  if (!body) throw new ValidationError('body is required');
  const fromAddress = assertCampaignFrom(input.fromAddress ?? env.EMAIL_CAMPAIGN_FROM_DEFAULT);
  const subject = (input.subject?.trim() || heading).slice(0, 200);
  const templateId = resolveCampaignTemplateId(input.templateId);
  const { ctas, ctaLabel, ctaUrl } = normalizeCtas({
    ctas: input.ctas,
    ctaLabel: input.ctaLabel,
    ctaUrl: input.ctaUrl,
    templateId,
  });
  const ctaLayout = normalizeCtaLayout(input.ctaLayout);
  const { signerName, signerTitle } = normalizeSigner(input.signerName, input.signerTitle);
  assertAudienceSelection(input);

  const db = getDatabaseClient();
  return db.emailCampaign.create({
    data: {
      subject,
      heading,
      body,
      ctaLabel,
      ctaUrl,
      ctas: (ctas ?? []) as unknown as Prisma.InputJsonValue,
      ctaLayout,
      showBackedBy: input.showBackedBy !== false,
      signerName,
      signerTitle,
      fromAddress,
      templateId,
      audience: input.audience,
      selectedPersonKeys: input.personKeys ?? undefined,
      selectedBucketIds: input.bucketIds ?? undefined,
      createdByAdminEmail: input.adminEmail,
    },
  });
}

export function previewCampaignHtml(input: {
  fromAddress?: string;
  templateId?: string;
  heading?: string;
  body?: string;
  ctaLabel?: string;
  ctaUrl?: string;
  ctas?: CampaignCtaInput[];
  ctaLayout?: string;
  showBackedBy?: boolean;
  signerName?: string;
  signerTitle?: string;
}): string {
  const sample = getCampaignTemplateSample(input.templateId);
  const hasUserCopy = Boolean(input.heading?.trim() || input.body?.trim());
  const heading = input.heading?.trim() || sample.heading;
  const body = normalizeCampaignBody(input.body ?? '') || (hasUserCopy ? '' : sample.body);
  const fromAddress = assertCampaignFrom(input.fromAddress ?? env.EMAIL_CAMPAIGN_FROM_DEFAULT);
  const templateId = resolveCampaignTemplateId(input.templateId);
  const hasUserCtas = Boolean(input.ctas?.length || input.ctaLabel || input.ctaUrl);
  const normalized = hasUserCtas || hasUserCopy
    ? normalizeCtas({
      ctas: input.ctas,
      ctaLabel: input.ctaLabel,
      ctaUrl: input.ctaUrl,
      templateId,
    })
    : normalizeCtas({
      ctaLabel: sample.ctaLabel,
      ctaUrl: sample.ctaUrl,
      templateId,
    });
  const { signerName, signerTitle } = normalizeSigner(input.signerName, input.signerTitle);
  return renderCampaignHtml({
    templateId,
    fromAddress,
    heading,
    body,
    ctaLabel: normalized.ctaLabel,
    ctaUrl: normalized.ctaUrl,
    ctas: normalized.ctas,
    ctaLayout: normalizeCtaLayout(input.ctaLayout),
    showBackedBy: input.showBackedBy !== false,
    signerName,
    signerTitle,
    track: false,
  });
}

export async function updateCampaign(
  id: string,
  input: {
    fromAddress?: string;
    templateId?: string;
    subject?: string;
    heading: string;
    body: string;
    ctaLabel?: string;
    ctaUrl?: string;
    ctas?: CampaignCtaInput[];
    ctaLayout?: string;
    showBackedBy?: boolean;
    signerName?: string;
    signerTitle?: string;
    audience: EmailCampaignAudience;
    personKeys?: string[];
    bucketIds?: string[];
  },
) {
  const db = getDatabaseClient();
  const existing = await db.emailCampaign.findUnique({ where: { id } });
  if (!existing) throw new NotFoundError('EmailCampaign', id);
  if (existing.status !== 'DRAFT') {
    throw new ValidationError('Only drafts can be edited');
  }
  const heading = input.heading.trim();
  if (!heading) throw new ValidationError('heading is required');
  const body = normalizeCampaignBody(input.body);
  if (!body) throw new ValidationError('body is required');
  const fromAddress = assertCampaignFrom(input.fromAddress ?? existing.fromAddress);
  const subject = (input.subject?.trim() || heading).slice(0, 200);
  const templateId = resolveCampaignTemplateId(input.templateId ?? existing.templateId);
  const { ctas, ctaLabel, ctaUrl } = normalizeCtas({
    ctas: input.ctas,
    ctaLabel: input.ctaLabel,
    ctaUrl: input.ctaUrl,
    templateId,
  });
  const { signerName, signerTitle } = normalizeSigner(input.signerName, input.signerTitle);
  assertAudienceSelection(input);
  return db.emailCampaign.update({
    where: { id },
    data: {
      subject,
      heading,
      body,
      ctaLabel,
      ctaUrl,
      ctas: (ctas ?? []) as unknown as Prisma.InputJsonValue,
      ctaLayout: normalizeCtaLayout(input.ctaLayout),
      showBackedBy: input.showBackedBy !== false,
      signerName,
      signerTitle,
      fromAddress,
      templateId,
      audience: input.audience,
      selectedPersonKeys: input.personKeys ?? undefined,
      selectedBucketIds: input.bucketIds ?? undefined,
    },
  });
}

export async function listCampaigns(input: {
  page?: number;
  pageSize?: number;
  status?: 'all' | 'drafts' | 'sent';
  search?: string;
}) {
  const db = getDatabaseClient();
  const page = input.page ?? 1;
  const pageSize = Math.min(input.pageSize ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE);
  const skip = (page - 1) * pageSize;
  const search = input.search?.trim();
  const where: Prisma.EmailCampaignWhereInput = {};
  if (input.status === 'drafts') where.status = 'DRAFT';
  if (input.status === 'sent') where.status = { not: 'DRAFT' };
  if (search) {
    where.OR = [
      { subject: { contains: search, mode: 'insensitive' } },
      { heading: { contains: search, mode: 'insensitive' } },
      { fromAddress: { contains: search, mode: 'insensitive' } },
    ];
  }
  const [campaigns, total] = await Promise.all([
    db.emailCampaign.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip,
      take: pageSize,
    }),
    db.emailCampaign.count({ where }),
  ]);
  return {
    campaigns: campaigns.map(withRates),
    total,
    page,
    pageSize,
  };
}

function withRates<T extends { sentCount: number; uniqueOpens: number; uniqueClicks: number }>(row: T) {
  const sent = row.sentCount || 0;
  return {
    ...row,
    openRate: sent ? row.uniqueOpens / sent : 0,
    clickRate: sent ? row.uniqueClicks / sent : 0,
  };
}

async function resolveRecipientSkipReason(email: string): Promise<string | null> {
  const suppression = await getCampaignSuppressionCode(email);
  if (suppression) return suppression;
  const deliverability = await checkEmailDeliverability(email);
  if (!deliverability.ok) return deliverability.code ?? 'undeliverable';
  return null;
}

async function queueCampaignRecipients(
  campaignId: string,
  recipientIds: string[],
): Promise<void> {
  if (!recipientIds.length) return;
  const perSecond = Math.max(1, env.EMAIL_CAMPAIGN_MAX_PER_SECOND);
  const queue = queueRegistry.getOrCreateQueue<EmailCampaignSendJob>(QUEUE_NAMES.EMAIL_CAMPAIGN);
  const runId = Date.now();
  await queue.addBulk(
    recipientIds.map((recipientId, index) => ({
      name: `campaign-${campaignId}-${recipientId}`,
      data: { campaignId, recipientId },
      options: {
        jobId: `campaign-${campaignId}-${recipientId}-${runId}`,
        delay: Math.floor((index * 1000) / perSecond),
        attempts: 8,
        backoff: { type: 'exponential', delay: 60_000 },
        removeOnComplete: 200,
        removeOnFail: 400,
      },
    })),
  );
}

function mapRecipientActivity(row: {
  id: string;
  email: string;
  displayName: string | null;
  source: string;
  status: string;
  merchantId: string | null;
  firstOpenedAt: Date | null;
  lastOpenedAt: Date | null;
  openCount: number;
  firstClickedAt: Date | null;
  lastClickedAt: Date | null;
  clickCount: number;
  lastError: string | null;
  clicks: { url: string }[];
}) {
  return {
    id: row.id,
    email: row.email,
    displayName: row.displayName,
    source: row.source,
    status: row.status,
    merchantId: row.merchantId,
    lastError: row.lastError,
    deliveryNote: describeDeliveryIssue(row.lastError),
    firstOpenedAt: row.firstOpenedAt,
    lastOpenedAt: row.lastOpenedAt,
    openCount: row.openCount,
    firstClickedAt: row.firstClickedAt,
    lastClickedAt: row.lastClickedAt,
    clickCount: row.clickCount,
    urls: [...new Set(row.clicks.map((c) => c.url))],
  };
}

function recipientActivityWhere(
  campaignId: string,
  query?: { activity?: string; search?: string },
): Prisma.EmailCampaignRecipientWhereInput {
  const search = query?.search?.trim();
  const activity = query?.activity ?? 'all';
  const where: Prisma.EmailCampaignRecipientWhereInput = { campaignId };
  if (search) {
    where.OR = [
      { email: { contains: search, mode: 'insensitive' } },
      { displayName: { contains: search, mode: 'insensitive' } },
    ];
  }
  if (activity === 'opened') where.firstOpenedAt = { not: null };
  if (activity === 'clicked') where.firstClickedAt = { not: null };
  if (activity === 'not_opened') where.firstOpenedAt = null;
  if (activity === 'not_clicked') where.firstClickedAt = null;
  if (activity === 'sent') where.status = 'SENT';
  if (activity === 'skipped') where.status = 'SKIPPED';
  if (activity === 'failed') where.status = 'FAILED';
  if (activity === 'unsubscribed') {
    where.status = 'SKIPPED';
    where.lastError = 'unsubscribed';
  }
  if (activity === 'not_sent') where.status = { in: ['PENDING', 'SKIPPED', 'FAILED', 'CANCELLED'] };
  return where;
}

export async function listCampaignActivity(
  id: string,
  query?: { activity?: string; search?: string; page?: number; pageSize?: number },
) {
  const db = getDatabaseClient();
  const campaign = await db.emailCampaign.findUnique({ where: { id }, select: { id: true } });
  if (!campaign) throw new NotFoundError('EmailCampaign', id);

  const page = query?.page ?? 1;
  const pageSize = Math.min(query?.pageSize ?? 50, MAX_PAGE_SIZE);
  const where = recipientActivityWhere(id, query);

  const [recipients, total] = await Promise.all([
    db.emailCampaignRecipient.findMany({
      where,
      orderBy: { email: 'asc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: {
        clicks: {
          select: { url: true, createdAt: true },
          orderBy: { createdAt: 'desc' },
        },
      },
    }),
    db.emailCampaignRecipient.count({ where }),
  ]);

  return {
    items: recipients.map((row) => mapRecipientActivity(row)),
    total,
    page,
    pageSize,
  };
}

export async function getCampaign(
  id: string,
  query?: { activity?: string; search?: string; page?: number; pageSize?: number },
) {
  const db = getDatabaseClient();
  const campaign = await db.emailCampaign.findUnique({ where: { id } });
  if (!campaign) throw new NotFoundError('EmailCampaign', id);

  const [activity, clicks] = await Promise.all([
    listCampaignActivity(id, query),
    db.emailCampaignClick.findMany({
      where: { campaignId: id },
      orderBy: { createdAt: 'desc' },
      take: 500,
    }),
  ]);

  const clicksByUrl = new Map<string, { url: string; count: number; emails: string[] }>();
  const clicksByCta = new Map<string, { ctaId: string; label: string; url: string; count: number; emails: string[] }>();
  for (const click of clicks) {
    const current = clicksByUrl.get(click.url) ?? { url: click.url, count: 0, emails: [] };
    current.count += 1;
    if (!current.emails.includes(click.email)) current.emails.push(click.email);
    clicksByUrl.set(click.url, current);

    if (click.ctaId) {
      const key = click.ctaId;
      const row = clicksByCta.get(key) ?? {
        ctaId: click.ctaId,
        label: click.ctaLabel || 'Button',
        url: click.url,
        count: 0,
        emails: [],
      };
      row.count += 1;
      if (!row.emails.includes(click.email)) row.emails.push(click.email);
      if (click.ctaLabel) row.label = click.ctaLabel;
      clicksByCta.set(key, row);
    }
  }

  const storedCtas = parseStoredCtas(campaign.ctas);
  for (const cta of storedCtas) {
    if (!clicksByCta.has(cta.id)) {
      clicksByCta.set(cta.id, {
        ctaId: cta.id,
        label: cta.label,
        url: cta.url,
        count: 0,
        emails: [],
      });
    }
  }

  const otherLinkClicks = [...clicksByUrl.entries()]
    .filter(([url]) => !clicks.some((c) => c.url === url && c.ctaId))
    .map(([, row]) => row);

  return {
    ...withRates(campaign),
    ctas: storedCtas,
    previewHtml: renderCampaignHtml({
      templateId: campaign.templateId,
      fromAddress: campaign.fromAddress,
      heading: campaign.heading,
      body: campaign.body,
      ctaLabel: campaign.ctaLabel,
      ctaUrl: campaign.ctaUrl,
      ctas: storedCtas,
      ctaLayout: normalizeCtaLayout(campaign.ctaLayout),
      showBackedBy: campaign.showBackedBy,
      signerName: campaign.signerName,
      signerTitle: campaign.signerTitle,
    }),
    fromAddresses: CAMPAIGN_FROM_ADDRESSES,
    recipients: activity.items,
    recipientTotal: activity.total,
    recipientPage: activity.page,
    recipientPageSize: activity.pageSize,
    clicksByUrl: [...clicksByUrl.values()],
    clicksByCta: [...clicksByCta.values()].sort((a, b) => b.count - a.count),
    otherLinkClicks,
  };
}

export async function previewAudience(input: {
  audience: EmailCampaignAudience;
  personKeys?: string[];
  bucketIds?: string[];
}) {
  const people = await resolveAudiencePeople({
    audience: input.audience,
    personKeys: input.personKeys,
    bucketIds: input.bucketIds,
  });
  return {
    count: people.length,
    sample: people.slice(0, 20).map((p) => ({ email: p.email, name: p.name, source: p.source })),
  };
}

export async function sendTestCampaign(id: string, toEmail: string) {
  const db = getDatabaseClient();
  const campaign = await db.emailCampaign.findUnique({ where: { id } });
  if (!campaign) throw new NotFoundError('EmailCampaign', id);
  await assertEmailCanReceiveMail(toEmail);

  const existing = await db.emailCampaignRecipient.findUnique({
    where: { campaignId_email: { campaignId: id, email: toEmail } },
  });
  const recipient = existing
    ? existing
    : await db.emailCampaignRecipient.create({
      data: {
        campaignId: id,
        email: toEmail,
        source: 'TEST',
        status: 'SENT',
        openToken: newOpenToken(),
      },
    });

  if (!existing) {
    await db.emailCampaign.update({
      where: { id },
      data: {
        sentCount: { increment: 1 },
        recipientCount: { increment: 1 },
      },
    });
  } else if (recipient.status !== 'SENT') {
    await db.emailCampaignRecipient.update({
      where: { id: recipient.id },
      data: { status: 'SENT', lastError: null },
    });
  }

  const { sendEmail } = await import('@noderails/common/email');
  const html = renderCampaignHtml({
    templateId: campaign.templateId,
    fromAddress: campaign.fromAddress,
    heading: campaign.heading,
    body: campaign.body,
    ctaLabel: campaign.ctaLabel,
    ctaUrl: campaign.ctaUrl,
    ctas: parseStoredCtas(campaign.ctas),
    ctaLayout: normalizeCtaLayout(campaign.ctaLayout),
    showBackedBy: campaign.showBackedBy,
    signerName: campaign.signerName,
    signerTitle: campaign.signerTitle,
    recipientId: recipient.id,
    openToken: recipient.openToken,
    email: toEmail,
    track: true,
  });
  await sendEmail({
    to: toEmail,
    from: campaign.fromAddress,
    subject: `[Test] ${campaign.subject}`,
    html,
  });
  emailLog.info('Campaign test sent', {
    campaignId: id,
    to: toEmail,
    from: campaign.fromAddress,
    recipientId: recipient.id,
  });
}

export async function sendCampaign(id: string) {
  const db = getDatabaseClient();
  const campaign = await db.emailCampaign.findUnique({ where: { id } });
  if (!campaign) throw new NotFoundError('EmailCampaign', id);
  if (campaign.status !== 'DRAFT' && campaign.status !== 'CANCELLED') {
    throw new ValidationError('Campaign has already been sent or is sending');
  }

  const people = await resolveAudiencePeople({
    audience: campaign.audience,
    personKeys: Array.isArray(campaign.selectedPersonKeys)
      ? (campaign.selectedPersonKeys as string[])
      : undefined,
    bucketIds: campaignBucketIds(campaign.selectedBucketIds),
  });

  const unique = new Map<string, EmailPerson>();
  for (const person of people) {
    unique.set(person.email.toLowerCase(), person);
  }

  const createdIds: string[] = [];
  let skipped = 0;

  for (const person of unique.values()) {
    const skipReason = await resolveRecipientSkipReason(person.email);
    const recipient = await db.emailCampaignRecipient.upsert({
      where: { campaignId_email: { campaignId: id, email: person.email } },
      create: {
        campaignId: id,
        email: person.email,
        displayName: person.name,
        merchantId: person.merchantId,
        listContactId: person.listContactId,
        source: person.source,
        status: skipReason ? 'SKIPPED' : 'PENDING',
        openToken: newOpenToken(),
        lastError: skipReason,
      },
      update: {
        displayName: person.name,
        merchantId: person.merchantId,
        listContactId: person.listContactId,
        source: person.source,
        status: skipReason ? 'SKIPPED' : 'PENDING',
        lastError: skipReason,
      },
    });
    if (skipReason) skipped += 1;
    else createdIds.push(recipient.id);
  }

  await queueCampaignRecipients(id, createdIds);

  const updated = await db.emailCampaign.update({
    where: { id },
    data: {
      status: createdIds.length ? 'QUEUED' : 'COMPLETED',
      recipientCount: unique.size,
      skippedCount: skipped,
      sentCount: 0,
      failedCount: 0,
      startedAt: new Date(),
      completedAt: createdIds.length ? null : new Date(),
    },
  });
  emailLog.info(createdIds.length ? 'Campaign queued' : 'Campaign finished with no deliverable recipients', {
    campaignId: id,
    audience: campaign.audience,
    from: campaign.fromAddress,
    recipients: unique.size,
    queued: createdIds.length,
    skipped,
  });
  return withRates(updated);
}

export type ResendCampaignTargets = 'undelivered' | 'failed' | 'skipped' | 'all' | 'selected';

export async function duplicateCampaign(id: string, adminEmail: string) {
  const db = getDatabaseClient();
  const existing = await db.emailCampaign.findUnique({ where: { id } });
  if (!existing) throw new NotFoundError('EmailCampaign', id);

  const draft = await db.emailCampaign.create({
    data: {
      subject: existing.subject,
      heading: existing.heading,
      body: existing.body,
      ctaLabel: existing.ctaLabel,
      ctaUrl: existing.ctaUrl,
      ctas: (existing.ctas ?? []) as unknown as Prisma.InputJsonValue,
      ctaLayout: existing.ctaLayout,
      showBackedBy: existing.showBackedBy,
      signerName: existing.signerName,
      signerTitle: existing.signerTitle,
      fromAddress: existing.fromAddress,
      templateId: existing.templateId,
      audience: existing.audience,
      selectedPersonKeys: existing.selectedPersonKeys ?? undefined,
      selectedBucketIds: existing.selectedBucketIds ?? undefined,
      createdByAdminEmail: adminEmail,
    },
  });
  emailLog.info('Campaign duplicated', { sourceCampaignId: id, draftCampaignId: draft.id });
  return draft;
}

export async function resendCampaign(
  id: string,
  input?: { targets?: ResendCampaignTargets; recipientIds?: string[] },
) {
  const db = getDatabaseClient();
  const campaign = await db.emailCampaign.findUnique({ where: { id } });
  if (!campaign) throw new NotFoundError('EmailCampaign', id);
  if (campaign.status === 'DRAFT') {
    throw new ValidationError('Send the campaign before resending');
  }
  if (campaign.status === 'QUEUED' || campaign.status === 'SENDING') {
    throw new ValidationError('Campaign is still sending');
  }

  const targets = input?.targets ?? 'undelivered';
  let recipients: Array<{
    id: string;
    email: string;
    status: string;
  }>;

  if (targets === 'selected') {
    const recipientIds = input?.recipientIds ?? [];
    if (!recipientIds.length) {
      throw new ValidationError('Select at least one recipient');
    }
    recipients = await db.emailCampaignRecipient.findMany({
      where: { campaignId: id, id: { in: recipientIds } },
      select: { id: true, email: true, status: true },
    });
    if (recipients.length !== recipientIds.length) {
      throw new ValidationError('Some recipients were not found on this campaign');
    }
  } else if (targets === 'all') {
    recipients = await db.emailCampaignRecipient.findMany({
      where: { campaignId: id },
      select: { id: true, email: true, status: true },
    });
  } else {
    const statusFilter: Array<'FAILED' | 'SKIPPED' | 'CANCELLED'> =
      targets === 'failed' ? ['FAILED']
        : targets === 'skipped' ? ['SKIPPED']
          : ['FAILED', 'SKIPPED', 'CANCELLED'];
    recipients = await db.emailCampaignRecipient.findMany({
      where: { campaignId: id, status: { in: statusFilter } },
      select: { id: true, email: true, status: true },
    });
  }

  if (!recipients.length) {
    throw new ValidationError('No recipients match this resend target');
  }

  const queuedIds: string[] = [];
  let stillSkipped = 0;
  let failedDelta = 0;
  let skippedDelta = 0;

  for (const recipient of recipients) {
    const fromFailed = recipient.status === 'FAILED';
    const fromSkipped = recipient.status === 'SKIPPED';
    const skipReason = await resolveRecipientSkipReason(recipient.email);

    if (skipReason) {
      stillSkipped += 1;
      if (fromFailed) failedDelta -= 1;
      if (!fromSkipped && recipient.status !== 'SENT') skippedDelta += 1;
      await db.emailCampaignRecipient.update({
        where: { id: recipient.id },
        data: { status: 'SKIPPED', lastError: skipReason },
      });
      continue;
    }

    if (fromFailed) failedDelta -= 1;
    if (fromSkipped) skippedDelta -= 1;
    await db.emailCampaignRecipient.update({
      where: { id: recipient.id },
      data: { status: 'PENDING', lastError: null },
    });
    queuedIds.push(recipient.id);
  }

  await queueCampaignRecipients(id, queuedIds);

  const updated = await db.emailCampaign.update({
    where: { id },
    data: {
      status: queuedIds.length ? 'QUEUED' : 'COMPLETED',
      skippedCount: { increment: skippedDelta },
      failedCount: { increment: failedDelta },
      completedAt: queuedIds.length ? null : new Date(),
    },
  });

  emailLog.info('Campaign resend queued', {
    campaignId: id,
    targets,
    matched: recipients.length,
    queued: queuedIds.length,
    skipped: stillSkipped,
    selected: targets === 'selected' ? input?.recipientIds?.length ?? 0 : undefined,
  });

  return {
    ...withRates(updated),
    resend: {
      targets,
      matched: recipients.length,
      queued: queuedIds.length,
      skipped: stillSkipped,
    },
  };
}

export async function deleteDraftCampaign(id: string) {
  const db = getDatabaseClient();
  const existing = await db.emailCampaign.findUnique({ where: { id } });
  if (!existing) throw new NotFoundError('EmailCampaign', id);
  if (existing.status !== 'DRAFT') {
    throw new ValidationError('Only drafts can be deleted');
  }
  await db.emailCampaign.delete({ where: { id } });
  emailLog.info('Campaign draft deleted', { campaignId: id });
}

export async function cancelCampaign(id: string) {
  const db = getDatabaseClient();
  const campaign = await db.emailCampaign.findUnique({ where: { id } });
  if (!campaign) throw new NotFoundError('EmailCampaign', id);
  if (campaign.status === 'COMPLETED') {
    throw new ValidationError('Campaign is already completed');
  }

  const pending = await db.emailCampaignRecipient.findMany({
    where: { campaignId: id, status: 'PENDING' },
    select: { id: true },
  });
  const queue = queueRegistry.getOrCreateQueue<EmailCampaignSendJob>(QUEUE_NAMES.EMAIL_CAMPAIGN);
  for (const row of pending) {
    await queue.removeJob(`campaign-${id}-${row.id}`).catch(() => undefined);
  }
  await db.emailCampaignRecipient.updateMany({
    where: { campaignId: id, status: 'PENDING' },
    data: { status: 'CANCELLED' },
  });
  const cancelled = await db.emailCampaign.update({
    where: { id },
    data: { status: 'CANCELLED', completedAt: new Date() },
  });
  emailLog.info('Campaign cancelled', { campaignId: id, pendingRemoved: pending.length });
  return cancelled;
}

export async function recordOpen(openToken: string): Promise<void> {
  const db = getDatabaseClient();
  const recipient = await db.emailCampaignRecipient.findUnique({
    where: { openToken },
    select: { id: true, campaignId: true, email: true, firstOpenedAt: true },
  });
  if (!recipient) return;
  const now = new Date();
  if (!recipient.firstOpenedAt) {
    await db.$transaction([
      db.emailCampaignRecipient.update({
        where: { id: recipient.id },
        data: { firstOpenedAt: now, lastOpenedAt: now, openCount: { increment: 1 } },
      }),
      db.emailCampaign.update({
        where: { id: recipient.campaignId },
        data: { uniqueOpens: { increment: 1 }, totalOpens: { increment: 1 } },
      }),
    ]);
    emailLog.info('Campaign opened', {
      campaignId: recipient.campaignId,
      recipientId: recipient.id,
      email: recipient.email,
    });
    return;
  }
  await db.$transaction([
    db.emailCampaignRecipient.update({
      where: { id: recipient.id },
      data: { lastOpenedAt: now, openCount: { increment: 1 } },
    }),
    db.emailCampaign.update({
      where: { id: recipient.campaignId },
      data: { totalOpens: { increment: 1 } },
    }),
  ]);
}

export async function recordClick(
  recipientId: string,
  destUrl: string,
  ctaId?: string,
): Promise<string | null> {
  if (!isSafeHttpUrl(destUrl)) return null;
  const db = getDatabaseClient();
  const recipient = await db.emailCampaignRecipient.findUnique({
    where: { id: recipientId },
    include: { campaign: true },
  });
  if (!recipient) return null;

  const storedCtas = parseStoredCtas(recipient.campaign.ctas);
  const allowed = new Set(campaignAllowedDestUrls({
    body: recipient.campaign.body,
    ctaUrl: recipient.campaign.ctaUrl,
    ctas: storedCtas,
  }));
  if (!allowed.has(destUrl)) {
    emailLog.warn('Campaign click rejected — URL is not in this send', {
      campaignId: recipient.campaignId,
      recipientId: recipient.id,
    });
    return null;
  }

  const matchedCta = ctaId
    ? storedCtas.find((cta) => cta.id === ctaId)
    : storedCtas.find((cta) => cta.url === destUrl);
  const resolvedCtaId = matchedCta?.id ?? ctaId ?? null;
  const resolvedCtaLabel = matchedCta?.label
    ?? (resolvedCtaId && recipient.campaign.ctaLabel ? recipient.campaign.ctaLabel : null);

  const now = new Date();
  const firstClick = !recipient.firstClickedAt;
  const firstOpen = !recipient.firstOpenedAt;

  await db.$transaction([
    db.emailCampaignClick.create({
      data: {
        campaignId: recipient.campaignId,
        recipientId: recipient.id,
        email: recipient.email,
        url: destUrl,
        ctaId: resolvedCtaId,
        ctaLabel: resolvedCtaLabel,
      },
    }),
    db.emailCampaignRecipient.update({
      where: { id: recipient.id },
      data: {
        firstClickedAt: recipient.firstClickedAt ?? now,
        lastClickedAt: now,
        clickCount: { increment: 1 },
        ...(firstOpen ? { firstOpenedAt: now, lastOpenedAt: now, openCount: { increment: 1 } } : {}),
      },
    }),
    db.emailCampaign.update({
      where: { id: recipient.campaignId },
      data: {
        uniqueClicks: { increment: firstClick ? 1 : 0 },
        totalClicks: { increment: 1 },
        ...(firstOpen ? { uniqueOpens: { increment: 1 }, totalOpens: { increment: 1 } } : {}),
      },
    }),
  ]);

  if (firstClick) {
    emailLog.info('Campaign clicked', {
      campaignId: recipient.campaignId,
      recipientId: recipient.id,
      email: recipient.email,
      url: destUrl,
    });
  }

  return destUrl;
}

export async function listCampaignUnsubscribes(input: {
  search?: string;
  page?: number;
  pageSize?: number;
}) {
  const db = getDatabaseClient();
  const page = input.page ?? 1;
  const pageSize = Math.min(input.pageSize ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE);
  const search = input.search?.trim();
  const where = {
    reason: 'CAMPAIGN_UNSUBSCRIBE' as const,
    ...(search
      ? { email: { contains: search, mode: 'insensitive' as const } }
      : {}),
  };

  const [rows, total] = await Promise.all([
    db.emailSuppression.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    db.emailSuppression.count({ where }),
  ]);

  const emails = rows.map((row) => row.email.toLowerCase());
  const [merchants, contacts] = emails.length
    ? await Promise.all([
      db.merchant.findMany({
        where: {
          OR: emails.map((email) => ({ email: { equals: email, mode: 'insensitive' as const } })),
        },
        select: {
          id: true,
          email: true,
          orgName: true,
          businessName: true,
          individualName: true,
          merchantType: true,
        },
      }),
      db.emailListContact.findMany({
        where: { email: { in: emails } },
        select: { email: true, name: true },
      }),
    ])
    : [[], []];

  const merchantsByEmail = new Map(
    merchants.map((row) => [row.email.toLowerCase(), row]),
  );
  const contactsByEmail = new Map(
    contacts.map((row) => [row.email.toLowerCase(), row]),
  );

  return {
    items: rows.map((row) => {
      const email = row.email.toLowerCase();
      const merchant = merchantsByEmail.get(email);
      const contact = contactsByEmail.get(email);
      return {
        id: row.id,
        email: row.email,
        reason: row.reason,
        createdAt: row.createdAt,
        source: merchant ? 'REGISTERED' : contact ? 'ADDED' : null,
        name: merchant
          ? resolveMerchantDisplayName(merchant)
          : contact?.name ?? null,
        merchantId: merchant?.id ?? null,
      };
    }),
    total,
    page,
    pageSize,
  };
}

export async function unsubscribeCampaignEmail(email: string): Promise<void> {
  const db = getDatabaseClient();
  const normalized = email.trim().toLowerCase();
  await db.emailSuppression.upsert({
    where: { email: normalized },
    create: { email: normalized, reason: 'CAMPAIGN_UNSUBSCRIBE', detail: 'one-click unsubscribe' },
    update: {},
  });
  emailLog.info('Campaign unsubscribed', { email: normalized });
}

export async function maybeCompleteCampaign(campaignId: string): Promise<void> {
  const db = getDatabaseClient();
  const pending = await db.emailCampaignRecipient.count({
    where: { campaignId, status: 'PENDING' },
  });
  if (pending > 0) return;
  const campaign = await db.emailCampaign.findUnique({ where: { id: campaignId } });
  if (!campaign || campaign.status === 'CANCELLED' || campaign.status === 'COMPLETED') return;
  await db.emailCampaign.update({
    where: { id: campaignId },
    data: { status: 'COMPLETED', completedAt: new Date() },
  });
  emailLog.info('Campaign completed', {
    campaignId,
    sent: campaign.sentCount,
    skipped: campaign.skippedCount,
    failed: campaign.failedCount,
  });
}

export { DEFAULT_CAMPAIGN_FROM, CAMPAIGN_FROM_ADDRESSES };

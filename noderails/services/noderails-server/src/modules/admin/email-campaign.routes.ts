import express, { Router } from 'express';
import multer from 'multer';
import { z } from 'zod';
import { asyncHandler, validate, success, created, paginated } from '@noderails/service-base';
import { optionalPermanentEmail, permanentEmail, ValidationError } from '@noderails/common';
import { CAMPAIGN_FROM_ADDRESSES, EMAIL_CAMPAIGN_TEMPLATE_IDS, isAllowedCampaignFrom, CAMPAIGN_CTA_STYLE_IDS, CAMPAIGN_CTA_PLACEMENTS, CAMPAIGN_CTA_ALIGNS, CAMPAIGN_CTA_LAYOUTS } from '@noderails/common/email';
import { STORAGE_LIMITS } from '@noderails/storage';
import * as peopleService from '../email/email-people.service.js';
import * as campaignService from '../email/email-campaign.service.js';
import * as bucketService from '../email/email-bucket.service.js';
import { isPublicTrackingBase } from '../email/email-tracking.js';
import { env } from '../../config.js';

const imageUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: STORAGE_LIMITS.MAX_IMAGE_BYTES },
  fileFilter: (_req, file, cb) => {
    if (['image/jpeg', 'image/png', 'image/gif', 'image/webp'].includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new ValidationError('Use a JPEG, PNG, GIF, or WebP image') as unknown as null, false);
    }
  },
});

const router: express.Router = Router();

function adminEmail(req: express.Request): string {
  return req.merchant?.email || env.ADMIN_EMAIL;
}

const peopleQuery = z.object({
  filter: z.enum(['all', 'registered', 'added']).optional(),
  search: z.string().optional(),
  bucketId: z.string().optional(),
  page: z.coerce.number().int().positive().optional(),
  pageSize: z.coerce.number().int().positive().max(200).optional(),
});

const bucketIdsSchema = z.array(z.string().min(1)).optional();
const activityEnum = z.enum([
  'all', 'opened', 'clicked', 'not_opened', 'not_clicked',
  'sent', 'skipped', 'failed', 'not_sent', 'unsubscribed',
]);

router.get(
  '/email-people',
  validate(peopleQuery, 'query'),
  asyncHandler(async (req, res) => {
    const result = await peopleService.listEmailPeople(req.query);
    paginated(res, result.people, result.total, result.page, result.pageSize);
  }),
);

router.get(
  '/email-people/stats',
  asyncHandler(async (_req, res) => {
    const counts = await peopleService.getPeopleDirectoryCounts();
    success(res, counts);
  }),
);

router.post(
  '/email-people',
  validate(z.object({
    email: permanentEmail(),
    name: z.string().max(120).optional(),
    bucketIds: bucketIdsSchema,
  })),
  asyncHandler(async (req, res) => {
    const person = await peopleService.addEmailPerson({
      email: req.body.email,
      name: req.body.name,
      adminEmail: adminEmail(req),
      bucketIds: req.body.bucketIds,
    });
    created(res, person);
  }),
);

router.post(
  '/email-people/import',
  validate(z.object({
    csv: z.string().min(1),
    bucketIds: bucketIdsSchema,
  })),
  asyncHandler(async (req, res) => {
    const result = await peopleService.importEmailPeople({
      csv: req.body.csv,
      adminEmail: adminEmail(req),
      bucketIds: req.body.bucketIds,
    });
    success(res, result);
  }),
);

router.put(
  '/email-people/:email/buckets',
  validate(z.object({ bucketIds: z.array(z.string().min(1)) })),
  asyncHandler(async (req, res) => {
    const email = decodeURIComponent(req.params.email);
    const result = await bucketService.setPersonBuckets(email, req.body.bucketIds);
    success(res, result);
  }),
);

router.get(
  '/email-buckets',
  asyncHandler(async (_req, res) => {
    const buckets = await bucketService.listBuckets();
    success(res, { buckets });
  }),
);

router.post(
  '/email-buckets',
  validate(z.object({ name: z.string().min(1).max(80) })),
  asyncHandler(async (req, res) => {
    const bucket = await bucketService.createBucket({
      name: req.body.name,
      adminEmail: adminEmail(req),
    });
    created(res, bucket);
  }),
);

router.patch(
  '/email-buckets/:id',
  validate(z.object({ name: z.string().min(1).max(80) })),
  asyncHandler(async (req, res) => {
    const bucket = await bucketService.renameBucket(req.params.id, req.body.name);
    success(res, bucket);
  }),
);

router.delete(
  '/email-buckets/:id',
  asyncHandler(async (req, res) => {
    await bucketService.deleteBucket(req.params.id);
    success(res, { ok: true });
  }),
);

router.post(
  '/email-buckets/:id/members',
  validate(z.object({
    emails: z.array(z.string().min(1)).optional(),
    personKeys: z.array(z.string().min(1)).optional(),
  })),
  asyncHandler(async (req, res) => {
    const fromKeys = await peopleService.emailsFromPersonKeys(req.body.personKeys ?? []);
    const emails = [...(req.body.emails ?? []), ...fromKeys];
    const result = await bucketService.addMembers(req.params.id, emails);
    success(res, result);
  }),
);

router.delete(
  '/email-buckets/:id/members',
  validate(z.object({ emails: z.array(z.string().min(1)) })),
  asyncHandler(async (req, res) => {
    const result = await bucketService.removeMembers(req.params.id, req.body.emails);
    success(res, result);
  }),
);

router.get(
  '/email-unsubscribes',
  validate(z.object({
    search: z.string().optional(),
    page: z.coerce.number().int().positive().optional(),
    pageSize: z.coerce.number().int().positive().max(100).optional(),
  }), 'query'),
  asyncHandler(async (req, res) => {
    const result = await campaignService.listCampaignUnsubscribes(req.query);
    paginated(res, result.items, result.total, result.page, result.pageSize);
  }),
);

router.delete(
  '/email-people/:listContactId',
  asyncHandler(async (req, res) => {
    await peopleService.deleteEmailPerson(req.params.listContactId);
    success(res, { ok: true });
  }),
);

const audienceEnum = z.enum(['EVERYONE', 'REGISTERED_ACCOUNTS', 'ADDED_CONTACTS', 'SELECTED_PEOPLE', 'BUCKETS']);
const templateIdEnum = z.enum(EMAIL_CAMPAIGN_TEMPLATE_IDS);

const ctaItemSchema = z.object({
  id: z.string().min(1).max(80),
  label: z.string().min(1).max(80),
  url: z.string().min(1).max(2000),
  placement: z.enum(CAMPAIGN_CTA_PLACEMENTS),
  style: z.enum(CAMPAIGN_CTA_STYLE_IDS),
  align: z.enum(CAMPAIGN_CTA_ALIGNS).optional(),
  withArrow: z.boolean().optional(),
});

const campaignBody = z.object({
  fromAddress: z.string().optional().refine((v) => !v || isAllowedCampaignFrom(v), {
    message: 'From address is not allowed',
  }),
  templateId: templateIdEnum.optional(),
  subject: z.string().max(200).optional(),
  heading: z.string().min(1).max(200),
  body: z.string().min(1).max(100_000),
  ctaLabel: z.string().max(80).optional(),
  ctaUrl: z.string().max(2000).optional(),
  ctas: z.array(ctaItemSchema).max(5).optional(),
  ctaLayout: z.enum(CAMPAIGN_CTA_LAYOUTS).optional(),
  showBackedBy: z.boolean().optional(),
  signerName: z.string().max(80).optional(),
  signerTitle: z.string().max(80).optional(),
  audience: audienceEnum,
  personKeys: z.array(z.string()).optional(),
  bucketIds: bucketIdsSchema,
});

router.get(
  '/email-campaign-templates',
  asyncHandler(async (_req, res) => {
    success(res, { templates: campaignService.listCampaignTemplates() });
  }),
);

router.get(
  '/email-campaigns',
  validate(z.object({
    page: z.coerce.number().int().positive().optional(),
    pageSize: z.coerce.number().int().positive().max(100).optional(),
    status: z.enum(['all', 'drafts', 'sent']).optional(),
    search: z.string().optional(),
  }), 'query'),
  asyncHandler(async (req, res) => {
    const result = await campaignService.listCampaigns(req.query);
    paginated(res, result.campaigns, result.total, result.page, result.pageSize);
  }),
);

router.post(
  '/email-campaigns',
  validate(campaignBody),
  asyncHandler(async (req, res) => {
    const campaign = await campaignService.createCampaign({
      adminEmail: adminEmail(req),
      ...req.body,
    });
    created(res, {
      ...campaign,
      fromAddresses: CAMPAIGN_FROM_ADDRESSES,
      defaultFrom: env.EMAIL_CAMPAIGN_FROM_DEFAULT,
    });
  }),
);

router.get(
  '/email-from-addresses',
  asyncHandler(async (_req, res) => {
    success(res, {
      addresses: CAMPAIGN_FROM_ADDRESSES,
      defaultFrom: env.EMAIL_CAMPAIGN_FROM_DEFAULT,
      trackingPublic: isPublicTrackingBase(),
    });
  }),
);

router.post(
  '/email-campaigns/images',
  imageUpload.single('file'),
  asyncHandler(async (req, res) => {
    if (!req.file) throw new ValidationError('Choose an image to upload');
    const uploaded = await campaignService.uploadCampaignImage(req.file);
    created(res, uploaded);
  }),
);

const composeBody = z.object({
  fromAddress: z.string().optional().refine((v) => !v || isAllowedCampaignFrom(v), {
    message: 'From address is not allowed',
  }),
  templateId: templateIdEnum.optional(),
  heading: z.string().min(1).max(200),
  body: z.string().min(1).max(100_000),
  ctaLabel: z.string().max(80).optional(),
  ctaUrl: z.string().max(2000).optional(),
  ctas: z.array(ctaItemSchema).max(5).optional(),
  ctaLayout: z.enum(CAMPAIGN_CTA_LAYOUTS).optional(),
  showBackedBy: z.boolean().optional(),
  signerName: z.string().max(80).optional(),
  signerTitle: z.string().max(80).optional(),
});

const previewComposeBody = composeBody.extend({
  heading: z.string().max(200).optional(),
  body: z.string().max(100_000).optional(),
});

router.post(
  '/email-campaigns/preview-html',
  validate(previewComposeBody),
  asyncHandler(async (req, res) => {
    const html = campaignService.previewCampaignHtml(req.body);
    success(res, { html });
  }),
);

router.patch(
  '/email-campaigns/:id',
  validate(campaignBody),
  asyncHandler(async (req, res) => {
    const campaign = await campaignService.updateCampaign(req.params.id, req.body);
    success(res, campaign);
  }),
);

router.get(
  '/email-campaigns/:id/activity',
  validate(z.object({
    activity: activityEnum.optional(),
    search: z.string().optional(),
    page: z.coerce.number().int().positive().optional(),
    pageSize: z.coerce.number().int().positive().max(100).optional(),
  }), 'query'),
  asyncHandler(async (req, res) => {
    const result = await campaignService.listCampaignActivity(req.params.id, req.query);
    paginated(res, result.items, result.total, result.page, result.pageSize);
  }),
);

router.get(
  '/email-campaigns/:id',
  validate(z.object({
    activity: activityEnum.optional(),
    search: z.string().optional(),
    page: z.coerce.number().int().positive().optional(),
    pageSize: z.coerce.number().int().positive().max(100).optional(),
  }), 'query'),
  asyncHandler(async (req, res) => {
    const campaign = await campaignService.getCampaign(req.params.id, req.query);
    success(res, campaign);
  }),
);

router.post(
  '/email-campaigns/:id/preview',
  validate(z.object({
    audience: audienceEnum,
    personKeys: z.array(z.string()).optional(),
    bucketIds: bucketIdsSchema,
  })),
  asyncHandler(async (req, res) => {
    const preview = await campaignService.previewAudience(req.body);
    success(res, preview);
  }),
);

router.post(
  '/email-campaigns/:id/test',
  validate(z.object({ to: optionalPermanentEmail() })),
  asyncHandler(async (req, res) => {
    const to = (req.body.to as string | undefined) || adminEmail(req);
    await campaignService.sendTestCampaign(req.params.id, to);
    success(res, { ok: true, to });
  }),
);

router.post(
  '/email-campaigns/:id/send',
  asyncHandler(async (req, res) => {
    const campaign = await campaignService.sendCampaign(req.params.id);
    success(res, campaign);
  }),
);

router.post(
  '/email-campaigns/:id/cancel',
  asyncHandler(async (req, res) => {
    const campaign = await campaignService.cancelCampaign(req.params.id);
    success(res, campaign);
  }),
);

router.post(
  '/email-campaigns/:id/resend',
  validate(z.object({
    targets: z.enum(['undelivered', 'failed', 'skipped', 'all', 'selected']).optional(),
    recipientIds: z.array(z.string().min(1)).optional(),
  }).refine(
    (body) => body.targets !== 'selected' || Boolean(body.recipientIds?.length),
    { message: 'Select at least one recipient', path: ['recipientIds'] },
  )),
  asyncHandler(async (req, res) => {
    const campaign = await campaignService.resendCampaign(req.params.id, req.body);
    success(res, campaign);
  }),
);

router.post(
  '/email-campaigns/:id/duplicate',
  asyncHandler(async (req, res) => {
    const campaign = await campaignService.duplicateCampaign(req.params.id, adminEmail(req));
    created(res, campaign);
  }),
);

router.delete(
  '/email-campaigns/:id',
  asyncHandler(async (req, res) => {
    await campaignService.deleteDraftCampaign(req.params.id);
    success(res, { ok: true });
  }),
);

export default router;

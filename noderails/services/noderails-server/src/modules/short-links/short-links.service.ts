import { createHash } from 'crypto';
import bcrypt from 'bcrypt';
import {
  getDatabaseClient,
  ShortLinkStatus,
  type ShortLink,
} from '@noderails/database';
import { ConflictError, NotFoundError, ValidationError } from '@noderails/common';
import { env } from '../../config.js';

const RESERVED_SLUGS = new Set(['admin', 'api', 'new', 'create', 'edit', 'delete', 'list']);
const SLUG_RE = /^[a-z0-9][a-z0-9-]{1,63}$/;
const BCRYPT_ROUNDS = 10;
const PASSWORD_MIN = 4;
const PASSWORD_MAX = 128;

export type ClickMeta = {
  referrer?: string;
  userAgent?: string;
  ip?: string;
};

function hashIp(ip?: string): string | null {
  if (!ip) return null;
  return createHash('sha256').update(`${ip}:${env.JWT_SECRET}`).digest('hex');
}

function normalizeSlug(raw: string): string {
  return raw.trim().toLowerCase();
}

function assertSlug(slug: string): void {
  if (!SLUG_RE.test(slug)) {
    throw new ValidationError('Slug must be 2-64 chars: lowercase letters, numbers, hyphens');
  }
  if (RESERVED_SLUGS.has(slug)) {
    throw new ValidationError(`Slug "${slug}" is reserved`);
  }
}

function assertHttpsUrl(url: string): void {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new ValidationError('Destination must be a valid URL');
  }
  if (parsed.protocol !== 'https:') {
    throw new ValidationError('Destination must use https://');
  }
}

async function hashPassword(plain: string): Promise<string> {
  const p = plain.trim();
  if (p.length < PASSWORD_MIN || p.length > PASSWORD_MAX) {
    throw new ValidationError(`Password must be ${PASSWORD_MIN}-${PASSWORD_MAX} characters`);
  }
  return bcrypt.hash(p, BCRYPT_ROUNDS);
}

function hasPassword(link: ShortLink): boolean {
  return Boolean(link.passwordHash);
}

function publicLinkView(link: ShortLink) {
  return {
    slug: link.slug,
    title: link.title,
    collectEmail: link.collectEmail,
    requirePassword: hasPassword(link),
    status: link.status,
  };
}

function adminLinkView(link: ShortLink) {
  return {
    id: link.id,
    slug: link.slug,
    publicPath: `/link/${link.slug}`,
    publicUrl: `https://example.local/link/${link.slug}`,
    destinationUrl: link.destinationUrl,
    title: link.title,
    status: link.status,
    collectEmail: link.collectEmail,
    hasPassword: hasPassword(link),
    clickCount: link.clickCount,
    leadCount: link.leadCount,
    createdAt: link.createdAt,
    updatedAt: link.updatedAt,
  };
}

export async function listShortLinks() {
  const db = getDatabaseClient();
  const rows = await db.shortLink.findMany({ orderBy: { createdAt: 'desc' } });
  return rows.map(adminLinkView);
}

function parseUserAgent(ua: string | null | undefined): {
  browser: string;
  os: string;
  device: string;
} {
  if (!ua) return { browser: 'Unknown', os: 'Unknown', device: 'Unknown' };
  const device = /Mobile|Android|iPhone|iPad/i.test(ua) ? 'Mobile' : 'Desktop';
  let os = 'Unknown';
  if (/Windows/i.test(ua)) os = 'Windows';
  else if (/Mac OS X|Macintosh/i.test(ua)) os = 'macOS';
  else if (/Android/i.test(ua)) os = 'Android';
  else if (/iPhone|iPad|iOS/i.test(ua)) os = 'iOS';
  else if (/Linux/i.test(ua)) os = 'Linux';
  let browser = 'Unknown';
  if (/Edg\//i.test(ua)) browser = 'Edge';
  else if (/Chrome\//i.test(ua) && !/Edg\//i.test(ua)) browser = 'Chrome';
  else if (/Firefox\//i.test(ua)) browser = 'Firefox';
  else if (/Safari\//i.test(ua) && !/Chrome\//i.test(ua)) browser = 'Safari';
  return { browser, os, device };
}

function referrerHost(referrer: string | null | undefined): string | null {
  if (!referrer) return null;
  try {
    return new URL(referrer).host;
  } catch {
    return referrer.slice(0, 80);
  }
}

export async function getShortLinkAdmin(id: string) {
  const db = getDatabaseClient();
  const link = await db.shortLink.findUnique({ where: { id } });
  if (!link) throw new NotFoundError('Short link not found');

  const since = new Date();
  since.setUTCDate(since.getUTCDate() - 29);
  since.setUTCHours(0, 0, 0, 0);

  const [clicks, leads, dayRows, lastClick, lastLead] = await Promise.all([
    db.shortLinkClick.findMany({
      where: { shortLinkId: id },
      orderBy: { createdAt: 'desc' },
      take: 250,
      select: { id: true, referrer: true, userAgent: true, createdAt: true },
    }),
    db.shortLinkLead.findMany({
      where: { shortLinkId: id },
      orderBy: { createdAt: 'desc' },
      take: 500,
      select: { id: true, email: true, createdAt: true },
    }),
    db.$queryRaw<Array<{ day: Date; count: bigint }>>`
      SELECT date_trunc('day', "createdAt") AS day, COUNT(*)::bigint AS count
      FROM short_link_clicks
      WHERE "shortLinkId" = ${id} AND "createdAt" >= ${since}
      GROUP BY 1
      ORDER BY 1 ASC
    `,
    db.shortLinkClick.findFirst({
      where: { shortLinkId: id },
      orderBy: { createdAt: 'desc' },
      select: { createdAt: true },
    }),
    db.shortLinkLead.findFirst({
      where: { shortLinkId: id },
      orderBy: { createdAt: 'desc' },
      select: { createdAt: true },
    }),
  ]);

  const byDayMap = new Map(
    dayRows.map((r) => [r.day.toISOString().slice(0, 10), Number(r.count)]),
  );
  const clicksByDay: Array<{ date: string; count: number }> = [];
  for (let i = 0; i < 30; i++) {
    const d = new Date(since);
    d.setUTCDate(since.getUTCDate() + i);
    const key = d.toISOString().slice(0, 10);
    clicksByDay.push({ date: key, count: byDayMap.get(key) ?? 0 });
  }

  const enrichedClicks = clicks.map((c) => {
    const ua = parseUserAgent(c.userAgent);
    return {
      id: c.id,
      createdAt: c.createdAt,
      referrer: c.referrer,
      referrerHost: referrerHost(c.referrer),
      userAgent: c.userAgent,
      browser: ua.browser,
      os: ua.os,
      device: ua.device,
    };
  });

  const activity = [
    ...leads.map((l) => ({
      id: `lead-${l.id}`,
      kind: 'email' as const,
      createdAt: l.createdAt,
      email: l.email,
      summary: l.email,
    })),
    ...enrichedClicks.map((c) => ({
      id: `click-${c.id}`,
      kind: 'click' as const,
      createdAt: c.createdAt,
      email: null as string | null,
      summary: c.referrerHost
        ? `Click from ${c.referrerHost}`
        : `Click - ${c.browser} - ${c.device}`,
      browser: c.browser,
      device: c.device,
      referrerHost: c.referrerHost,
    })),
  ]
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, 100);

  return {
    ...adminLinkView(link),
    analytics: {
      clicksByDay,
      clicks: enrichedClicks,
      leads,
      activity,
      lastClickAt: lastClick?.createdAt ?? null,
      lastLeadAt: lastLead?.createdAt ?? null,
      clicksReturned: enrichedClicks.length,
      leadsReturned: leads.length,
    },
  };
}

export async function createShortLink(input: {
  slug: string;
  destinationUrl: string;
  title?: string | null;
  collectEmail?: boolean;
  password?: string | null;
}) {
  const db = getDatabaseClient();
  const slug = normalizeSlug(input.slug);
  assertSlug(slug);
  assertHttpsUrl(input.destinationUrl.trim());

  const existing = await db.shortLink.findUnique({ where: { slug } });
  if (existing) throw new ConflictError(`Slug "${slug}" is already taken`);

  const passwordPlain = typeof input.password === 'string' ? input.password.trim() : '';
  const passwordHash = passwordPlain ? await hashPassword(passwordPlain) : null;

  const link = await db.shortLink.create({
    data: {
      slug,
      destinationUrl: input.destinationUrl.trim(),
      title: input.title?.trim() || null,
      collectEmail: Boolean(input.collectEmail),
      passwordHash,
      status: ShortLinkStatus.ACTIVE,
    },
  });
  return adminLinkView(link);
}

export async function updateShortLink(
  id: string,
  input: {
    destinationUrl?: string;
    title?: string | null;
    collectEmail?: boolean;
    status?: 'ACTIVE' | 'DISABLED';
    /** Set a new password. Empty string with clearPassword also clears. */
    password?: string | null;
    /** Remove password gate. */
    clearPassword?: boolean;
  },
) {
  const db = getDatabaseClient();
  const existing = await db.shortLink.findUnique({ where: { id } });
  if (!existing) throw new NotFoundError('Short link not found');

  if (input.destinationUrl != null) assertHttpsUrl(input.destinationUrl.trim());
  if (input.status != null && input.status !== 'ACTIVE' && input.status !== 'DISABLED') {
    throw new ValidationError('status must be ACTIVE or DISABLED');
  }

  let passwordHash: string | null | undefined;
  if (input.clearPassword) {
    passwordHash = null;
  } else if (typeof input.password === 'string' && input.password.trim()) {
    passwordHash = await hashPassword(input.password);
  }

  const link = await db.shortLink.update({
    where: { id },
    data: {
      ...(input.destinationUrl != null ? { destinationUrl: input.destinationUrl.trim() } : {}),
      ...(input.title !== undefined ? { title: input.title?.trim() || null } : {}),
      ...(input.collectEmail !== undefined ? { collectEmail: Boolean(input.collectEmail) } : {}),
      ...(input.status != null ? { status: input.status as ShortLinkStatus } : {}),
      ...(passwordHash !== undefined ? { passwordHash } : {}),
    },
  });
  return adminLinkView(link);
}

export async function deleteShortLink(id: string) {
  const db = getDatabaseClient();
  const existing = await db.shortLink.findUnique({ where: { id } });
  if (!existing) throw new NotFoundError('Short link not found');
  await db.shortLink.delete({ where: { id } });
}

/** Public resolve - ACTIVE only. */
export async function resolvePublicShortLink(slugRaw: string) {
  const db = getDatabaseClient();
  const slug = normalizeSlug(slugRaw);
  const link = await db.shortLink.findUnique({ where: { slug } });
  if (!link || link.status !== ShortLinkStatus.ACTIVE) {
    throw new NotFoundError('Link not found');
  }
  return publicLinkView(link);
}

async function recordClickRow(linkId: string, meta: ClickMeta) {
  const db = getDatabaseClient();
  await db.$transaction([
    db.shortLinkClick.create({
      data: {
        shortLinkId: linkId,
        referrer: meta.referrer?.slice(0, 500) || null,
        userAgent: meta.userAgent?.slice(0, 500) || null,
        ipHash: hashIp(meta.ip),
      },
    }),
    db.shortLink.update({
      where: { id: linkId },
      data: { clickCount: { increment: 1 } },
    }),
  ]);
}

export async function recordPublicClick(slugRaw: string, meta: ClickMeta) {
  const db = getDatabaseClient();
  const slug = normalizeSlug(slugRaw);
  const link = await db.shortLink.findUnique({ where: { slug } });
  if (!link || link.status !== ShortLinkStatus.ACTIVE) {
    throw new NotFoundError('Link not found');
  }
  if (link.collectEmail || hasPassword(link)) {
    throw new ValidationError('This link requires a gate before redirect');
  }
  await recordClickRow(link.id, meta);
  return { redirectTo: link.destinationUrl };
}

export async function recordPublicLead(
  slugRaw: string,
  emailRaw: string,
  meta: ClickMeta,
  password?: string,
) {
  return accessPublicShortLink(slugRaw, { email: emailRaw, password }, meta);
}

/** Unified gate: email and/or password as configured, then redirect. */
export async function accessPublicShortLink(
  slugRaw: string,
  input: { email?: string; password?: string },
  meta: ClickMeta,
) {
  const db = getDatabaseClient();
  const slug = normalizeSlug(slugRaw);
  const link = await db.shortLink.findUnique({ where: { slug } });
  if (!link || link.status !== ShortLinkStatus.ACTIVE) {
    throw new NotFoundError('Link not found');
  }

  const needsEmail = link.collectEmail;
  const needsPassword = hasPassword(link);

  if (!needsEmail && !needsPassword) {
    await recordClickRow(link.id, meta);
    return { redirectTo: link.destinationUrl };
  }

  let email: string | null = null;
  if (needsEmail) {
    email = (input.email ?? '').trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) {
      throw new ValidationError('Valid email is required');
    }
  }

  if (needsPassword) {
    const password = (input.password ?? '').trim();
    if (!password) throw new ValidationError('Password is required');
    const ok = await bcrypt.compare(password, link.passwordHash!);
    if (!ok) throw new ValidationError('Incorrect password');
  }

  const existingLead =
    email != null
      ? await db.shortLinkLead.findUnique({
          where: { shortLinkId_email: { shortLinkId: link.id, email } },
        })
      : null;

  await db.$transaction(async (tx) => {
    if (email && !existingLead) {
      await tx.shortLinkLead.create({
        data: { shortLinkId: link.id, email },
      });
    }
    await tx.shortLinkClick.create({
      data: {
        shortLinkId: link.id,
        referrer: meta.referrer?.slice(0, 500) || null,
        userAgent: meta.userAgent?.slice(0, 500) || null,
        ipHash: hashIp(meta.ip),
      },
    });
    await tx.shortLink.update({
      where: { id: link.id },
      data: {
        clickCount: { increment: 1 },
        ...(email && !existingLead ? { leadCount: { increment: 1 } } : {}),
      },
    });
  });

  return { redirectTo: link.destinationUrl };
}

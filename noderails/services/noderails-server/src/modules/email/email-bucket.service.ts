import { getDatabaseClient } from '@noderails/database';
import { ConflictError, NotFoundError, ValidationError } from '@noderails/common';
import { emailLog } from './email-log.js';

export interface EmailBucketSummary {
  id: string;
  name: string;
  slug: string;
  memberCount: number;
  createdAt: Date;
  updatedAt: Date;
}

export function normalizeBucketName(raw: string): { name: string; slug: string } {
  const name = raw.trim().replace(/\s+/g, ' ');
  if (!name) throw new ValidationError('Bucket name is required');
  if (name.length > 80) throw new ValidationError('Bucket name must be 80 characters or fewer');
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
  if (!slug) throw new ValidationError('Bucket name must include letters or numbers');
  return { name, slug };
}

export function normalizeMemberEmail(email: string): string {
  return email.trim().toLowerCase();
}

export async function listBuckets(): Promise<EmailBucketSummary[]> {
  const db = getDatabaseClient();
  const buckets = await db.emailBucket.findMany({
    orderBy: { name: 'asc' },
    include: { _count: { select: { members: true } } },
  });
  return buckets.map((bucket) => ({
    id: bucket.id,
    name: bucket.name,
    slug: bucket.slug,
    memberCount: bucket._count.members,
    createdAt: bucket.createdAt,
    updatedAt: bucket.updatedAt,
  }));
}

export async function createBucket(input: {
  name: string;
  adminEmail: string;
}): Promise<EmailBucketSummary> {
  const { name, slug } = normalizeBucketName(input.name);
  const db = getDatabaseClient();
  try {
    const created = await db.emailBucket.create({
      data: {
        name,
        slug,
        createdByAdminEmail: input.adminEmail,
      },
    });
    emailLog.info('Email bucket created', { bucketId: created.id, slug });
    return { ...created, memberCount: 0 };
  } catch (err) {
    if ((err as { code?: string }).code === 'P2002') {
      throw new ConflictError('A bucket with that name already exists');
    }
    throw err;
  }
}

export async function renameBucket(id: string, name: string): Promise<EmailBucketSummary> {
  const db = getDatabaseClient();
  const existing = await db.emailBucket.findUnique({
    where: { id },
    include: { _count: { select: { members: true } } },
  });
  if (!existing) throw new NotFoundError('EmailBucket', id);
  const next = normalizeBucketName(name);
  try {
    const updated = await db.emailBucket.update({
      where: { id },
      data: { name: next.name, slug: next.slug },
    });
    emailLog.info('Email bucket renamed', { bucketId: id, slug: next.slug });
    return { ...updated, memberCount: existing._count.members };
  } catch (err) {
    if ((err as { code?: string }).code === 'P2002') {
      throw new ConflictError('A bucket with that name already exists');
    }
    throw err;
  }
}

export async function deleteBucket(id: string): Promise<void> {
  const db = getDatabaseClient();
  const existing = await db.emailBucket.findUnique({ where: { id } });
  if (!existing) throw new NotFoundError('EmailBucket', id);
  await db.emailBucket.delete({ where: { id } });
  emailLog.info('Email bucket deleted', { bucketId: id, slug: existing.slug });
}

export async function assertBucketsExist(bucketIds: string[]): Promise<void> {
  if (!bucketIds.length) return;
  const db = getDatabaseClient();
  const unique = [...new Set(bucketIds)];
  const count = await db.emailBucket.count({ where: { id: { in: unique } } });
  if (count !== unique.length) {
    throw new ValidationError('One or more buckets were not found');
  }
}

export async function addMembers(bucketId: string, emails: string[]): Promise<{ added: number }> {
  const db = getDatabaseClient();
  const bucket = await db.emailBucket.findUnique({ where: { id: bucketId } });
  if (!bucket) throw new NotFoundError('EmailBucket', bucketId);
  const unique = [...new Set(emails.map(normalizeMemberEmail).filter(Boolean))];
  if (!unique.length) return { added: 0 };
  const result = await db.emailBucketMember.createMany({
    data: unique.map((email) => ({ bucketId, email })),
    skipDuplicates: true,
  });
  emailLog.info('Email bucket members added', { bucketId, added: result.count });
  return { added: result.count };
}

export async function removeMembers(bucketId: string, emails: string[]): Promise<{ removed: number }> {
  const db = getDatabaseClient();
  const bucket = await db.emailBucket.findUnique({ where: { id: bucketId } });
  if (!bucket) throw new NotFoundError('EmailBucket', bucketId);
  const unique = [...new Set(emails.map(normalizeMemberEmail).filter(Boolean))];
  if (!unique.length) return { removed: 0 };
  const result = await db.emailBucketMember.deleteMany({
    where: { bucketId, email: { in: unique } },
  });
  emailLog.info('Email bucket members removed', { bucketId, removed: result.count });
  return { removed: result.count };
}

export async function setPersonBuckets(email: string, bucketIds: string[]): Promise<{ buckets: Array<{ id: string; name: string }> }> {
  const normalized = normalizeMemberEmail(email);
  if (!normalized) throw new ValidationError('Email is required');
  const unique = [...new Set(bucketIds)];
  await assertBucketsExist(unique);
  const db = getDatabaseClient();
  await db.$transaction([
    db.emailBucketMember.deleteMany({ where: { email: normalized } }),
    ...unique.map((bucketId) =>
      db.emailBucketMember.create({
        data: { bucketId, email: normalized },
      }),
    ),
  ]);
  const members = await db.emailBucketMember.findMany({
    where: { email: normalized },
    include: { bucket: { select: { id: true, name: true } } },
    orderBy: { bucket: { name: 'asc' } },
  });
  emailLog.info('Email person buckets replaced', { email: normalized, buckets: unique.length });
  return { buckets: members.map((row) => row.bucket) };
}

export async function getBucketMemberEmails(bucketIds: string[]): Promise<string[]> {
  if (!bucketIds.length) return [];
  const db = getDatabaseClient();
  const members = await db.emailBucketMember.findMany({
    where: { bucketId: { in: [...new Set(bucketIds)] } },
    select: { email: true },
  });
  return [...new Set(members.map((row) => row.email.toLowerCase()))];
}

export async function addEmailsToBuckets(emails: string[], bucketIds: string[]): Promise<void> {
  if (!emails.length || !bucketIds.length) return;
  await assertBucketsExist(bucketIds);
  for (const bucketId of bucketIds) {
    await addMembers(bucketId, emails);
  }
}

import { getDatabaseClient } from '@noderails/database';
import {
  DEFAULT_PAGE_SIZE,
  MAX_PAGE_SIZE,
  NotFoundError,
  ValidationError,
  resolveMerchantDisplayName,
} from '@noderails/common';
import { emailLog } from './email-log.js';
import { parsePeopleCsv } from './email-people-csv.js';
import { assertEmailCanReceiveMail, emailCanReceiveMail } from '../../lib/email-mx.js';
import { addEmailsToBuckets, getBucketMemberEmails } from './email-bucket.service.js';

export type PeopleFilter = 'all' | 'registered' | 'added';

export interface EmailPersonBucket {
  id: string;
  name: string;
}

export interface EmailPerson {
  key: string;
  email: string;
  name: string | null;
  source: 'REGISTERED' | 'ADDED';
  merchantId?: string;
  listContactId?: string;
  buckets?: EmailPersonBucket[];
}

function merchantName(merchant: {
  orgName: string | null;
  businessName: string | null;
  individualName: string | null;
  merchantType: string;
}): string | null {
  return resolveMerchantDisplayName(merchant);
}

async function attachBuckets(people: EmailPerson[]): Promise<EmailPerson[]> {
  if (!people.length) return people;
  const db = getDatabaseClient();
  const emails = people.map((person) => person.email);
  const members = await db.emailBucketMember.findMany({
    where: { email: { in: emails } },
    include: { bucket: { select: { id: true, name: true } } },
    orderBy: { bucket: { name: 'asc' } },
  });
  const byEmail = new Map<string, EmailPersonBucket[]>();
  for (const row of members) {
    const list = byEmail.get(row.email) ?? [];
    list.push(row.bucket);
    byEmail.set(row.email, list);
  }
  return people.map((person) => ({
    ...person,
    buckets: byEmail.get(person.email) ?? [],
  }));
}

export async function emailsFromPersonKeys(personKeys: string[]): Promise<string[]> {
  if (!personKeys.length) return [];
  const db = getDatabaseClient();
  const merchantIds: string[] = [];
  const contactIds: string[] = [];
  for (const key of personKeys) {
    if (key.startsWith('registered:')) merchantIds.push(key.slice('registered:'.length));
    else if (key.startsWith('added:')) contactIds.push(key.slice('added:'.length));
  }
  const [merchants, contacts] = await Promise.all([
    merchantIds.length
      ? db.merchant.findMany({ where: { id: { in: merchantIds } }, select: { email: true } })
      : [],
    contactIds.length
      ? db.emailListContact.findMany({ where: { id: { in: contactIds } }, select: { email: true } })
      : [],
  ]);
  return [...new Set([
    ...merchants.map((row) => row.email.toLowerCase()),
    ...contacts.map((row) => row.email.toLowerCase()),
  ])];
}

export async function listEmailPeople(input: {
  filter?: PeopleFilter;
  search?: string;
  page?: number;
  pageSize?: number;
  bucketId?: string;
}): Promise<{ people: EmailPerson[]; total: number; page: number; pageSize: number }> {
  const db = getDatabaseClient();
  const page = input.page ?? 1;
  const unlimited = (input.pageSize ?? 0) > MAX_PAGE_SIZE;
  const pageSize = unlimited ? input.pageSize! : Math.min(input.pageSize ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE);
  const search = input.search?.trim().toLowerCase() ?? '';
  const filter = input.filter ?? 'all';

  const [merchants, contacts] = await Promise.all([
    filter === 'added'
      ? []
      : db.merchant.findMany({
          where: {
            isSuspended: false,
            ...(search
              ? {
                  OR: [
                    { email: { contains: search, mode: 'insensitive' } },
                    { orgName: { contains: search, mode: 'insensitive' } },
                    { businessName: { contains: search, mode: 'insensitive' } },
                    { individualName: { contains: search, mode: 'insensitive' } },
                  ],
                }
              : {}),
          },
          select: {
            id: true,
            email: true,
            orgName: true,
            businessName: true,
            individualName: true,
            merchantType: true,
          },
          orderBy: { email: 'asc' },
        }),
    filter === 'registered'
      ? []
      : db.emailListContact.findMany({
          where: search
            ? {
                OR: [
                  { email: { contains: search, mode: 'insensitive' } },
                  { name: { contains: search, mode: 'insensitive' } },
                ],
              }
            : undefined,
          orderBy: { email: 'asc' },
        }),
  ]);

  const merchantEmailRows = filter === 'registered'
    ? merchants
    : await db.merchant.findMany({
        where: { isSuspended: false },
        select: { email: true },
      });
  const registeredEmails = new Set(merchantEmailRows.map((m) => m.email.toLowerCase()));
  const people: EmailPerson[] = [
    ...merchants.map((m) => ({
      key: `registered:${m.id}`,
      email: m.email.toLowerCase(),
      name: merchantName(m),
      source: 'REGISTERED' as const,
      merchantId: m.id,
    })),
    ...contacts
      .filter((c) => !registeredEmails.has(c.email.toLowerCase()))
      .map((c) => ({
        key: `added:${c.id}`,
        email: c.email.toLowerCase(),
        name: c.name,
        source: 'ADDED' as const,
        listContactId: c.id,
      })),
  ].sort((a, b) => a.email.localeCompare(b.email));

  let filtered = people;
  if (input.bucketId) {
    const bucketEmails = new Set(await getBucketMemberEmails([input.bucketId]));
    filtered = people.filter((person) => bucketEmails.has(person.email));
  }

  const total = filtered.length;
  const start = (page - 1) * pageSize;
  const pageRows = await attachBuckets(filtered.slice(start, start + pageSize));
  return { people: pageRows, total, page, pageSize };
}

export async function getPeopleDirectoryCounts(): Promise<{
  total: number;
  registered: number;
  added: number;
}> {
  const db = getDatabaseClient();
  const [merchants, contacts] = await Promise.all([
    db.merchant.findMany({
      where: { isSuspended: false },
      select: { email: true },
    }),
    db.emailListContact.findMany({
      select: { email: true },
    }),
  ]);
  const registeredEmails = new Set(merchants.map((m) => m.email.toLowerCase()));
  const registered = registeredEmails.size;
  const added = contacts.filter((c) => !registeredEmails.has(c.email.toLowerCase())).length;
  return { total: registered + added, registered, added };
}

export async function addEmailPerson(input: {
  email: string;
  name?: string;
  adminEmail: string;
  bucketIds?: string[];
}): Promise<EmailPerson & { alreadyOnList: boolean }> {
  await assertEmailCanReceiveMail(input.email);
  const email = input.email.trim().toLowerCase();
  const db = getDatabaseClient();

  const merchant = await db.merchant.findFirst({
    where: { email: { equals: email, mode: 'insensitive' } },
    select: {
      id: true,
      email: true,
      orgName: true,
      businessName: true,
      individualName: true,
      merchantType: true,
    },
  });
  if (merchant) {
    if (input.bucketIds?.length) {
      await addEmailsToBuckets([email], input.bucketIds);
    }
    const tagged = await attachBuckets([{
      key: `registered:${merchant.id}`,
      email: merchant.email.toLowerCase(),
      name: merchantName(merchant),
      source: 'REGISTERED',
      merchantId: merchant.id,
    }]);
    return { ...tagged[0]!, alreadyOnList: true };
  }

  const existing = await db.emailListContact.findUnique({ where: { email } });
  if (existing) {
    if (input.bucketIds?.length) {
      await addEmailsToBuckets([existing.email], input.bucketIds);
    }
    const tagged = await attachBuckets([{
      key: `added:${existing.id}`,
      email: existing.email,
      name: existing.name,
      source: 'ADDED',
      listContactId: existing.id,
    }]);
    return { ...tagged[0]!, alreadyOnList: true };
  }

  const created = await db.emailListContact.create({
    data: {
      email,
      name: input.name?.trim() || null,
      source: 'TYPED',
      createdByAdminEmail: input.adminEmail,
    },
  });

  if (input.bucketIds?.length) {
    await addEmailsToBuckets([created.email], input.bucketIds);
  }

  emailLog.info('Email list contact added', { email: created.email });
  const tagged = await attachBuckets([{
    key: `added:${created.id}`,
    email: created.email,
    name: created.name,
    source: 'ADDED',
    listContactId: created.id,
  }]);
  return { ...tagged[0]!, alreadyOnList: false };
}

export async function importEmailPeople(input: {
  csv: string;
  adminEmail: string;
  bucketIds?: string[];
}): Promise<{ added: number; skipped: number; errors: Array<{ row: number; message: string }> }> {
  const parsed = parsePeopleCsv(input.csv);
  const db = getDatabaseClient();
  let added = 0;
  let skipped = 0;
  const errors = [...parsed.errors];
  const taggedEmails: string[] = [];

  const emails = parsed.lines.map((line) => line.email);
  const [merchants, contacts] = emails.length
    ? await Promise.all([
      db.merchant.findMany({
        where: {
          OR: emails.map((email) => ({ email: { equals: email, mode: 'insensitive' as const } })),
        },
        select: { email: true },
      }),
      db.emailListContact.findMany({
        where: { email: { in: emails } },
        select: { email: true },
      }),
    ])
    : [[], []];
  const alreadyOnList = new Set([
    ...merchants.map((row) => row.email.toLowerCase()),
    ...contacts.map((row) => row.email.toLowerCase()),
  ]);

  for (const line of parsed.lines) {
    if (alreadyOnList.has(line.email)) {
      skipped += 1;
      taggedEmails.push(line.email);
      continue;
    }
    if (!(await emailCanReceiveMail(line.email))) {
      errors.push({ row: line.row, message: 'email is not valid' });
      continue;
    }
    try {
      const created = await db.emailListContact.create({
        data: {
          email: line.email,
          name: line.name ?? null,
          source: 'CSV',
          createdByAdminEmail: input.adminEmail,
        },
      });
      alreadyOnList.add(created.email);
      added += 1;
      taggedEmails.push(created.email);
    } catch (err) {
      const code = (err as { code?: string }).code;
      if (code === 'P2002') {
        skipped += 1;
        taggedEmails.push(line.email);
        continue;
      }
      errors.push({ row: line.row, message: err instanceof Error ? err.message : String(err) });
    }
  }

  if (input.bucketIds?.length && taggedEmails.length) {
    await addEmailsToBuckets([...new Set(taggedEmails)], input.bucketIds);
  }

  emailLog.info('Email list CSV imported', {
    added,
    skipped,
    errors: errors.length,
  });
  return { added, skipped, errors };
}

export async function deleteEmailPerson(listContactId: string): Promise<void> {
  const db = getDatabaseClient();
  const existing = await db.emailListContact.findUnique({ where: { id: listContactId } });
  if (!existing) throw new NotFoundError('EmailListContact', listContactId);
  await db.emailListContact.delete({ where: { id: listContactId } });
}

async function peopleFromEmails(emails: string[]): Promise<EmailPerson[]> {
  if (!emails.length) return [];
  const wanted = new Set(emails.map((email) => email.toLowerCase()));
  const all = await listEmailPeople({ filter: 'all', page: 1, pageSize: 50_000 });
  const found = all.people.filter((person) => wanted.has(person.email));
  const foundEmails = new Set(found.map((person) => person.email));
  const leftover = [...wanted]
    .filter((email) => !foundEmails.has(email))
    .map((email) => ({
      key: `email:${email}`,
      email,
      name: null,
      source: 'ADDED' as const,
      buckets: [],
    }));
  return [...found, ...leftover].sort((a, b) => a.email.localeCompare(b.email));
}

export async function resolveAudiencePeople(input: {
  audience: 'EVERYONE' | 'REGISTERED_ACCOUNTS' | 'ADDED_CONTACTS' | 'SELECTED_PEOPLE' | 'BUCKETS';
  personKeys?: string[];
  bucketIds?: string[];
}): Promise<EmailPerson[]> {
  if (input.audience === 'BUCKETS') {
    const bucketIds = input.bucketIds ?? [];
    if (bucketIds.length === 0) throw new ValidationError('Select at least one bucket');
    return peopleFromEmails(await getBucketMemberEmails(bucketIds));
  }
  if (input.audience === 'SELECTED_PEOPLE') {
    const keys = input.personKeys ?? [];
    if (keys.length === 0) throw new ValidationError('Select at least one person');
    const all = await listEmailPeople({ filter: 'all', page: 1, pageSize: 50_000 });
    const wanted = new Set(keys);
    return all.people.filter((p) => wanted.has(p.key));
  }
  const filter: PeopleFilter =
    input.audience === 'REGISTERED_ACCOUNTS'
      ? 'registered'
      : input.audience === 'ADDED_CONTACTS'
        ? 'added'
        : 'all';
  const all = await listEmailPeople({ filter, page: 1, pageSize: 50_000 });
  return all.people;
}

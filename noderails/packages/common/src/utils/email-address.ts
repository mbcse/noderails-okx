import { z } from 'zod';
import { ValidationError } from '../errors/index.js';
import { DISPOSABLE_EMAIL_BLOCKLIST_RAW } from './disposable-email-blocklist.js';

export const VALID_EMAIL_MESSAGE = 'Please enter a valid email address.';
export const PERMANENT_EMAIL_MESSAGE = VALID_EMAIL_MESSAGE;
export const RESERVED_EMAIL_MESSAGE = VALID_EMAIL_MESSAGE;
export const UNDELIVERABLE_EMAIL_MESSAGE = VALID_EMAIL_MESSAGE;

const RESERVED_TLDS = new Set(['invalid', 'example', 'test', 'localhost']);
const RESERVED_DOMAINS = new Set([
  'invalid',
  'localhost',
  'example.com',
  'example.net',
  'example.org',
]);

let disposableDomains = new Set<string>(parseDisposableBlocklist(DISPOSABLE_EMAIL_BLOCKLIST_RAW));

export function parseDisposableBlocklist(text: string): string[] {
  const domains: string[] = [];
  for (const line of text.split(/\r?\n/)) {
    const normalized = line.trim().toLowerCase();
    if (!normalized || normalized.startsWith('#')) continue;
    domains.push(normalized);
  }
  return domains;
}

export function replaceDisposableEmailDomains(domains: Iterable<string>): void {
  const next = new Set<string>();
  for (const domain of domains) {
    const normalized = domain.trim().toLowerCase();
    if (!normalized || normalized.startsWith('#')) continue;
    next.add(normalized);
  }
  if (next.size === 0) return;
  disposableDomains = next;
}

export function disposableEmailDomainCount(): number {
  return disposableDomains.size;
}

export function emailHostname(email: string): string | null {
  const trimmed = email.trim();
  const at = trimmed.lastIndexOf('@');
  if (at <= 0 || at === trimmed.length - 1) return null;
  return trimmed.slice(at + 1).toLowerCase();
}

function hostSuffixes(host: string): string[] {
  const labels = host.split('.').filter(Boolean);
  if (labels.length < 2) return [host];
  const suffixes: string[] = [];
  for (let i = 0; i < labels.length - 1; i++) {
    suffixes.push(labels.slice(i).join('.'));
  }
  return suffixes;
}

export function isReservedEmailDomain(email: string): boolean {
  const host = emailHostname(email);
  if (!host) return false;
  if (RESERVED_DOMAINS.has(host)) return true;
  const labels = host.split('.').filter(Boolean);
  const tld = labels[labels.length - 1];
  if (tld && RESERVED_TLDS.has(tld)) return true;
  for (const suffix of hostSuffixes(host)) {
    if (RESERVED_DOMAINS.has(suffix)) return true;
  }
  return false;
}

export function isDisposableEmail(email: string): boolean {
  const host = emailHostname(email);
  if (!host) return false;
  for (const suffix of hostSuffixes(host)) {
    if (disposableDomains.has(suffix)) return true;
  }
  return false;
}

function addPermanentEmailIssues(email: string, ctx: z.RefinementCtx): void {
  if (isReservedEmailDomain(email) || isDisposableEmail(email)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: VALID_EMAIL_MESSAGE });
  }
}

export function permanentEmail(constraints?: { max?: number }) {
  const base =
    constraints?.max !== undefined
      ? z.string().email(VALID_EMAIL_MESSAGE).max(constraints.max)
      : z.string().email(VALID_EMAIL_MESSAGE);
  return base.superRefine(addPermanentEmailIssues);
}

/** Empty string becomes undefined so optional form fields can stay blank. */
export function optionalPermanentEmail(constraints?: { max?: number }) {
  return z.preprocess(
    (value) => (typeof value === 'string' && value.trim() === '' ? undefined : value),
    permanentEmail(constraints).optional(),
  );
}

export function assertPermanentEmail(email: string): void {
  const parsed = permanentEmail().safeParse(email);
  if (parsed.success) return;
  throw new ValidationError(
    parsed.error.issues[0]?.message ?? VALID_EMAIL_MESSAGE,
  );
}

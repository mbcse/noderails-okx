import { promises as dns } from 'node:dns';
import {
  UNDELIVERABLE_EMAIL_MESSAGE,
  ValidationError,
  assertPermanentEmail,
  domainHasMxRecords,
  emailHostname,
  isDisposableEmail,
  isReservedEmailDomain,
  permanentEmail,
} from '@noderails/common';
import { z } from 'zod';

export type EmailDeliverabilityCode =
  | 'invalid_format'
  | 'reserved_domain'
  | 'disposable'
  | 'no_mx'
  | 'dns_error';

export interface EmailDeliverabilityResult {
  ok: boolean;
  code?: EmailDeliverabilityCode;
  detail?: string;
}

export const DELIVERABILITY_LABELS: Record<string, string> = {
  unsubscribed: 'Unsubscribed from campaign emails',
  bounced: 'Permanent bounce',
  complaint: 'Spam complaint',
  suppressed: 'Suppressed after a bounce or complaint',
  invalid_format: 'Invalid email address format',
  reserved_domain: 'Reserved or example domain',
  disposable: 'Disposable or blocked email domain',
  no_mx: 'Domain has no mail server (MX records missing)',
  dns_error: 'DNS lookup failed for the domain',
  undeliverable: 'Email could not be delivered',
};

export function describeDeliveryIssue(code: string | null | undefined): string | null {
  if (!code) return null;
  return DELIVERABILITY_LABELS[code] ?? code;
}

export async function emailDomainHasMx(email: string): Promise<boolean> {
  const host = emailHostname(email);
  if (!host) return false;
  return domainHasMxRecords(host, (hostname) => dns.resolveMx(hostname));
}

export async function checkEmailDeliverability(email: string): Promise<EmailDeliverabilityResult> {
  const trimmed = email.trim();
  if (!z.string().email().safeParse(trimmed).success) {
    return { ok: false, code: 'invalid_format', detail: 'Email address format is invalid' };
  }
  if (isReservedEmailDomain(trimmed)) {
    return { ok: false, code: 'reserved_domain', detail: 'Domain is reserved or not deliverable' };
  }
  if (isDisposableEmail(trimmed)) {
    return { ok: false, code: 'disposable', detail: 'Disposable email addresses are not allowed' };
  }
  if (!permanentEmail().safeParse(trimmed).success) {
    return { ok: false, code: 'invalid_format', detail: 'Email address is not allowed' };
  }
  try {
    const hasMx = await emailDomainHasMx(trimmed);
    if (!hasMx) {
      return { ok: false, code: 'no_mx', detail: 'Domain has no MX records' };
    }
  } catch (err) {
    return {
      ok: false,
      code: 'dns_error',
      detail: err instanceof Error ? err.message : 'DNS lookup failed',
    };
  }
  return { ok: true };
}

export async function assertEmailDomainHasMx(email: string): Promise<void> {
  const ok = await emailDomainHasMx(email);
  if (!ok) {
    throw new ValidationError(UNDELIVERABLE_EMAIL_MESSAGE);
  }
}

/** Same gate as signup / OTP / invite: not disposable/reserved, and the domain has MX. */
export async function emailCanReceiveMail(email: string): Promise<boolean> {
  const result = await checkEmailDeliverability(email);
  return result.ok;
}

export async function assertEmailCanReceiveMail(email: string): Promise<void> {
  assertPermanentEmail(email);
  await assertEmailDomainHasMx(email);
}

export async function assertOptionalEmailsCanReceiveMail(
  emails: Array<string | null | undefined>,
): Promise<void> {
  const unique = new Set<string>();
  for (const value of emails) {
    const email = value?.trim().toLowerCase();
    if (email) unique.add(email);
  }
  for (const email of unique) {
    await assertEmailCanReceiveMail(email);
  }
}

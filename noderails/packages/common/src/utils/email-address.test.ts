import { afterEach, describe, expect, it } from 'vitest';
import {
  DISPOSABLE_EMAIL_BLOCKLIST_RAW,
} from './disposable-email-blocklist.js';
import {
  VALID_EMAIL_MESSAGE,
  assertPermanentEmail,
  disposableEmailDomainCount,
  isDisposableEmail,
  isReservedEmailDomain,
  parseDisposableBlocklist,
  permanentEmail,
  replaceDisposableEmailDomains,
} from './email-address.js';

const snapshot = parseDisposableBlocklist(DISPOSABLE_EMAIL_BLOCKLIST_RAW);

afterEach(() => {
  replaceDisposableEmailDomains(snapshot);
});

describe('parseDisposableBlocklist', () => {
  it('skips blanks and comments', () => {
    expect(parseDisposableBlocklist('# comment\n\nMailinator.com\n')).toEqual(['mailinator.com']);
  });
});

describe('isDisposableEmail', () => {
  it('blocks mailinator.com', () => {
    expect(isDisposableEmail('user@mailinator.com')).toBe(true);
  });

  it('blocks a suffix host', () => {
    expect(isDisposableEmail('foo@sub.mailinator.com')).toBe(true);
  });

  it('allows gmail.com', () => {
    expect(isDisposableEmail('user@gmail.com')).toBe(false);
  });

  it('does not treat a missing @ as disposable', () => {
    expect(isDisposableEmail('not-an-email')).toBe(false);
  });

  it('uses the replaced in-memory set', () => {
    replaceDisposableEmailDomains(['blocked.test']);
    expect(isDisposableEmail('a@blocked.test')).toBe(true);
    expect(isDisposableEmail('a@mailinator.com')).toBe(false);
  });

  it('does not replace the set with an empty list', () => {
    const before = disposableEmailDomainCount();
    replaceDisposableEmailDomains([]);
    expect(disposableEmailDomainCount()).toBe(before);
  });
});

describe('isReservedEmailDomain', () => {
  it('blocks reserved TLDs and example.com', () => {
    expect(isReservedEmailDomain('user@foo.test')).toBe(true);
    expect(isReservedEmailDomain('user@localhost')).toBe(true);
    expect(isReservedEmailDomain('user@name.invalid')).toBe(true);
    expect(isReservedEmailDomain('user@example.com')).toBe(true);
    expect(isReservedEmailDomain('user@mail.example.org')).toBe(true);
    expect(isReservedEmailDomain('user@bar.localhost')).toBe(true);
  });

  it('allows a normal domain', () => {
    expect(isReservedEmailDomain('user@gmail.com')).toBe(false);
  });
});

describe('permanentEmail', () => {
  it('rejects reserved hosts with the valid-email message', () => {
    const result = permanentEmail().safeParse('user@foo.test');
    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error.issues[0]?.message).toBe(VALID_EMAIL_MESSAGE);
  });

  it('rejects disposable hosts with the valid-email message', () => {
    const result = permanentEmail().safeParse('user@mailinator.com');
    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error.issues[0]?.message).toBe(VALID_EMAIL_MESSAGE);
  });

  it('rejects a malformed address with the valid-email message', () => {
    const result = permanentEmail().safeParse('not-an-email');
    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error.issues[0]?.message).toBe(VALID_EMAIL_MESSAGE);
  });

  it('accepts a normal email', () => {
    expect(permanentEmail().safeParse('user@gmail.com').success).toBe(true);
  });

  it('assertPermanentEmail throws ValidationError', () => {
    expect(() => assertPermanentEmail('user@mailinator.com')).toThrow(VALID_EMAIL_MESSAGE);
  });
});

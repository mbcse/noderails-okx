import crypto from 'crypto';
import { timingSafeEqual } from '@noderails/common';
import { env } from '../../config.js';

function trackingSecret(): string {
  return env.EMAIL_TRACKING_SECRET;
}

function b64url(value: string): string {
  return Buffer.from(value, 'utf8').toString('base64url');
}

function hmac(payload: string): string {
  return crypto.createHmac('sha256', trackingSecret()).update(payload).digest('base64url');
}

function clickHmac(recipientId: string, destUrl: string, ctaId?: string): string {
  return hmac(`click\n${recipientId}\n${destUrl}\n${ctaId ?? ''}`);
}

export function newOpenToken(): string {
  return crypto.randomBytes(24).toString('base64url');
}

export function signClickToken(recipientId: string, destUrl: string, ctaId?: string): string {
  const payload: { r: string; u: string; c?: string } = { r: recipientId, u: destUrl };
  if (ctaId) payload.c = ctaId;
  const body = b64url(JSON.stringify(payload));
  return `${body}.${clickHmac(recipientId, destUrl, ctaId)}`;
}

export function verifyClickToken(token: string): { recipientId: string; destUrl: string; ctaId?: string } | null {
  const dot = token.lastIndexOf('.');
  if (dot < 1) return null;
  const body = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  let parsed: { r?: unknown; u?: unknown; c?: unknown };
  try {
    parsed = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as {
      r?: unknown;
      u?: unknown;
      c?: unknown;
    };
  } catch {
    return null;
  }
  if (typeof parsed.r !== 'string' || typeof parsed.u !== 'string') return null;
  const ctaId = typeof parsed.c === 'string' && parsed.c ? parsed.c : undefined;

  // Prefer HMAC that includes ctaId (new tokens). Fall back to legacy HMAC without ctaId.
  const expected = clickHmac(parsed.r, parsed.u, ctaId);
  const legacyExpected = hmac(`click\n${parsed.r}\n${parsed.u}`);
  if (!timingSafeEqual(sig, expected) && !timingSafeEqual(sig, legacyExpected)) return null;
  return { recipientId: parsed.r, destUrl: parsed.u, ctaId };
}

export function signUnsubscribeToken(email: string): string {
  const normalized = email.trim().toLowerCase();
  const body = b64url(JSON.stringify({ e: normalized, p: 'campaign' }));
  return `${body}.${hmac(`unsub\n${normalized}`)}`;
}

export function verifyUnsubscribeToken(token: string): string | null {
  const dot = token.lastIndexOf('.');
  if (dot < 1) return null;
  const body = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  let parsed: { e?: unknown; p?: unknown };
  try {
    parsed = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as { e?: unknown; p?: unknown };
  } catch {
    return null;
  }
  if (typeof parsed.e !== 'string' || parsed.p !== 'campaign') return null;
  const expected = hmac(`unsub\n${parsed.e}`);
  if (!timingSafeEqual(sig, expected)) return null;
  return parsed.e;
}

export function publicEmailUrl(path: string): string {
  return `${env.API_PUBLIC_URL}${path.startsWith('/') ? path : `/${path}`}`;
}

export function isPublicTrackingBase(url = env.API_PUBLIC_URL): boolean {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'https:') return false;
    const host = parsed.hostname.toLowerCase();
    return host !== 'localhost' && host !== '127.0.0.1' && host !== '::1';
  } catch {
    return false;
  }
}

/** 1x1 transparent GIF */
export const TRACKING_PIXEL_GIF = Buffer.from(
  'R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7',
  'base64',
);

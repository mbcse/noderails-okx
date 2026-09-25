import { getDatabaseClient, Prisma, type Environment } from '@noderails/database';
import { ValidationError } from '@noderails/common';
import { env } from '../../../config.js';
import { getIdentityProvider } from '../factory.js';
import { getOrCreateProfile } from '../profile.service.js';

function mapDiditStatus(status: string): 'pending' | 'approved' | 'rejected' | 'review' {
  const lower = status.toLowerCase();
  if (lower.includes('approved') || lower === 'approved') return 'approved';
  if (lower.includes('declin') || lower.includes('reject')) return 'rejected';
  if (lower.includes('review')) return 'review';
  return 'pending';
}

export async function startIdentity(merchantId: string, environment: Environment) {
  const profile = await getOrCreateProfile(merchantId, environment);
  const kind = profile.accountType === 'BUSINESS' ? 'KYB' : 'KYC';
  const provider = getIdentityProvider(environment);
  const started = await provider.startSession({
    kind,
    vendorData: merchantId,
    // HTTPS only: an HTTP dashboard callback inside a https://verification.didit.me
    // iframe is mixed-content blocked ("connection is blocked"). We poll status instead.
    callback: env.DASHBOARD_URL.startsWith('https://')
      ? `${env.DASHBOARD_URL.replace(/\/$/, '')}/identity-callback`
      : undefined,
  });
  if (!started.externalId) {
    throw new ValidationError('Identity provider did not return a session');
  }
  const db = getDatabaseClient();
  const session = await db.fiatIdentitySession.create({
    data: {
      profileId: profile.id,
      provider: provider.name,
      kind,
      environment,
      externalId: started.externalId,
      status: started.status,
      vendorData: merchantId,
      sessionUrl: started.url,
    },
  });
  await db.fiatProfile.update({
    where: { id: profile.id },
    data: {
      identityProvider: provider.name,
      ownAccountStatus: profile.ownAccountStatus === 'NONE' ? 'PENDING_IDENTITY' : profile.ownAccountStatus,
    },
  });
  return session;
}

export function identityApproved(status: string): boolean {
  return mapDiditStatus(status) === 'approved';
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

export function mergeProviderPayload(
  existing: unknown,
  incoming: Record<string, unknown>,
): Record<string, unknown> {
  const previous = asRecord(existing);
  const nested = asRecord(incoming.session ?? incoming.data ?? incoming.result);
  return {
    ...previous,
    ...incoming,
    ...nested,
    receivedAt: new Date().toISOString(),
  };
}

export async function applyDiditWebhook(
  environment: Environment,
  payload: Record<string, unknown>,
) {
  const sessionId = String(payload.session_id ?? payload.sessionId ?? '');
  const eventId = typeof payload.event_id === 'string' ? payload.event_id : `${sessionId}:${payload.status ?? ''}`;
  if (!sessionId) return false;
  const db = getDatabaseClient();
  const session = await db.fiatIdentitySession.findUnique({
    where: { provider_externalId: { provider: 'didit', externalId: sessionId } },
    include: { profile: true },
  });
  if (!session || session.environment !== environment) return false;
  if (session.lastEventId === eventId) return true;
  const status = String(payload.status ?? session.status);
  await db.fiatIdentitySession.update({
    where: { id: session.id },
    data: {
      status,
      lastEventId: eventId,
      providerPayload: mergeProviderPayload(session.providerPayload, payload) as Prisma.InputJsonValue,
    },
  });
  const mapped = mapDiditStatus(status);
  if (mapped === 'approved' && session.profile.ownAccountStatus === 'PENDING_IDENTITY') {
    await db.fiatProfile.update({
      where: { id: session.profileId },
      data: { ownAccountStatus: 'PENDING_IDENTITY' },
    });
  }
  return true;
}

export async function latestIdentitySession(profileId: string) {
  const db = getDatabaseClient();
  return db.fiatIdentitySession.findFirst({
    where: { profileId },
    orderBy: { createdAt: 'desc' },
  });
}

export async function syncIdentityStatus(merchantId: string, environment: Environment) {
  const profile = await getOrCreateProfile(merchantId, environment);
  const session = await latestIdentitySession(profile.id);
  if (!session) return null;
  const provider = getIdentityProvider(environment);
  let status = session.status;
  try {
    const remote = await provider.getSession(session.externalId);
    if (remote.status) status = String(remote.status);
    const db = getDatabaseClient();
    await db.fiatIdentitySession.update({
      where: { id: session.id },
      data: {
        status,
        providerPayload: mergeProviderPayload(session.providerPayload, remote) as Prisma.InputJsonValue,
      },
    });
  } catch {
    // Keep the last stored status and webhook payload if Didit is unreachable.
  }
  return {
    id: session.id,
    status,
    sessionUrl: session.sessionUrl,
    kind: session.kind,
  };
}

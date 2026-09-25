import { recoverMessageAddress } from 'viem';
import { getDatabaseClient, Prisma, type Environment } from '@noderails/database';
import { NotFoundError, ValidationError, isValidAddress } from '@noderails/common';
import { env } from '../../../config.js';
import { getVaProvider } from '../factory.js';
import { getOrCreateProfile } from '../profile.service.js';
import { railMeta } from '../rails.js';
import { persistActivityEvents } from './activity.service.js';

function destinationMessage(input: {
  merchantId: string;
  environment: string;
  rail: string;
  address: string;
}) {
  return [
    'NodeRails: bind global bank destination',
    `merchant:${input.merchantId}`,
    `env:${input.environment}`,
    `rail:${input.rail}`,
    `address:${input.address}`,
  ].join('\n');
}

async function assertOwnedDestination(input: {
  merchantId: string;
  environment: Environment;
  address: string;
  signature: string;
  rail: string;
}) {
  if (!isValidAddress(input.address)) {
    throw new ValidationError('Destination must be an EVM address');
  }
  let recovered: string | null = null;
  try {
    recovered = await recoverMessageAddress({
      message: destinationMessage(input),
      signature: input.signature as `0x${string}`,
    });
  } catch {
    recovered = null;
  }
  if (recovered && recovered.toLowerCase() === input.address.toLowerCase()) return;
  const db = getDatabaseClient();
  const owned = await db.app.findFirst({
    where: {
      merchantId: input.merchantId,
      OR: [
        { receivingWallet: { equals: input.address, mode: 'insensitive' } },
        { payoutWallet: { equals: input.address, mode: 'insensitive' } },
      ],
    },
  });
  if (!owned) {
    throw new ValidationError('Sign with the destination wallet to prove ownership');
  }
}

function refs(profile: { vaExternalRefs: unknown }) {
  return (profile.vaExternalRefs && typeof profile.vaExternalRefs === 'object')
    ? profile.vaExternalRefs as Record<string, unknown>
    : {};
}

function refString(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}

function bridgeExternalRefs(
  profile: { vaExternalRefs: unknown },
  patch: { customerId: string | null; kycLink?: string | null; tosLink?: string | null },
): Prisma.InputJsonValue {
  const current = refs(profile);
  return {
    ...current,
    customerId: patch.customerId,
    kycLink: patch.kycLink ?? refString(current.kycLink),
    tosLink: patch.tosLink ?? refString(current.tosLink),
  } as Prisma.InputJsonValue;
}

async function requirePaidCountry(profileId: string) {
  const db = getDatabaseClient();
  const paid = await db.fiatOnboardingFee.findFirst({
    where: {
      profileId,
      status: 'CONFIRMED',
      periodEnd: { gt: new Date() },
    },
    select: { id: true },
  });
  if (!paid) {
    throw new ValidationError('Pay for a country first, then complete identity');
  }
}

function kycDbStatus(status: string) {
  const lower = status.toLowerCase();
  if (lower.includes('reject')) return 'REJECTED' as const;
  if (lower.includes('approved')) return 'APPROVED' as const;
  return 'PENDING' as const;
}

function mergeKycStatus(current: string, live: string) {
  const next = kycDbStatus(live);
  if (current === 'APPROVED' && next === 'PENDING') return 'APPROVED' as const;
  return next;
}

function kycReady(liveStatus: string, dbStatus: string) {
  return kycDbStatus(liveStatus) === 'APPROVED' || dbStatus === 'APPROVED';
}

export async function startBridgeCustomer(merchantId: string, environment: Environment) {
  const profile = await getOrCreateProfile(merchantId, environment);
  await requirePaidCountry(profile.id);
  const db = getDatabaseClient();
  const merchant = await db.merchant.findUnique({
    where: { id: merchantId },
    select: { email: true, orgName: true, businessName: true, individualName: true },
  });
  if (!merchant) throw new NotFoundError('Merchant', merchantId);
  const existingId = typeof refs(profile).customerId === 'string' ? String(refs(profile).customerId) : null;
  const provider = getVaProvider(environment);
  if (existingId) {
    const customer = await provider.getCustomer(existingId);
    const status = mergeKycStatus(profile.vaKycStatus, customer.kycStatus);
    await db.fiatProfile.update({
      where: { id: profile.id },
      data: {
        vaProvider: provider.name,
        vaKycStatus: status,
        vaExternalRefs: bridgeExternalRefs(profile, {
          customerId: customer.externalCustomerId ?? existingId,
          kycLink: customer.kycLink,
          tosLink: customer.tosLink,
        }),
      },
    });
    return status === 'APPROVED' ? { ...customer, kycStatus: 'approved' } : customer;
  }
  const fullName = profile.accountType === 'BUSINESS'
    ? (merchant.businessName || merchant.orgName || merchant.email)
    : (merchant.individualName || merchant.orgName || merchant.email);
  const started = await provider.startCustomerKyc({
    type: profile.accountType === 'BUSINESS' ? 'business' : 'individual',
    fullName,
    email: merchant.email,
    redirectUri: `${env.DASHBOARD_URL}/dashboard/bank?bridge=done`,
  });
  await db.fiatProfile.update({
    where: { id: profile.id },
    data: {
      vaProvider: provider.name,
      vaKycStatus: kycDbStatus(started.kycStatus),
      vaExternalRefs: bridgeExternalRefs(profile, {
        customerId: started.externalCustomerId,
        kycLink: started.kycLink,
        tosLink: started.tosLink,
      }),
    },
  });
  return started;
}

export async function simulateBridgeKyc(merchantId: string, environment: Environment) {
  if (environment !== 'TEST') {
    throw new ValidationError('KYC simulation is only available in TEST');
  }
  const profile = await getOrCreateProfile(merchantId, environment);
  await requirePaidCountry(profile.id);
  const customerId = typeof refs(profile).customerId === 'string' ? String(refs(profile).customerId) : null;
  if (!customerId) throw new ValidationError('Start identity after you pay for a country');
  const provider = getVaProvider('TEST');
  const customer = await provider.simulateKycApproval(customerId);
  const db = getDatabaseClient();
  await db.fiatProfile.update({
    where: { id: profile.id },
    data: { vaKycStatus: kycDbStatus(customer.kycStatus) },
  });
  return customer;
}

export async function refreshBridgeCustomer(merchantId: string, environment: Environment) {
  const profile = await getOrCreateProfile(merchantId, environment);
  const customerId = typeof refs(profile).customerId === 'string' ? String(refs(profile).customerId) : null;
  if (!customerId) return null;
  const provider = getVaProvider(environment);
  const customer = await provider.getCustomer(customerId);
  const db = getDatabaseClient();
  const status = mergeKycStatus(profile.vaKycStatus, customer.kycStatus);
  await db.fiatProfile.update({
    where: { id: profile.id },
    data: { vaKycStatus: status },
  });
  return status === 'APPROVED' ? { ...customer, kycStatus: 'approved' } : customer;
}

function endorsementApproved(endorsements: Array<{ name: string; status: string }>, rail: string) {
  const needed = railMeta(rail)?.endorsement;
  if (!needed) return false;
  const row = endorsements.find((item) => item.name === needed);
  return row?.status === 'approved';
}

export async function openCountryAccount(input: {
  merchantId: string;
  environment: Environment;
  rail: string;
  destinationAddress: string;
  destinationChainId: number;
  destinationTokenKey: string;
  destinationSignature: string;
}) {
  const profile = await getOrCreateProfile(input.merchantId, input.environment);
  const db = getDatabaseClient();
  const existing = await db.fiatVirtualAccount.findUnique({
    where: { profileId_rail: { profileId: profile.id, rail: input.rail } },
  });
  if (existing) return existing;
  const fee = await db.fiatOnboardingFee.findFirst({
    where: {
      profileId: profile.id,
      rail: input.rail,
      status: 'CONFIRMED',
      periodEnd: { gt: new Date() },
    },
    orderBy: { periodEnd: 'desc' },
  });
  if (!fee) throw new ValidationError('Pay the yearly fee for this country first');
  const customerId = typeof refs(profile).customerId === 'string' ? String(refs(profile).customerId) : null;
  if (!customerId) throw new ValidationError('Complete global bank account KYC first');
  const provider = getVaProvider(input.environment);
  const customer = await provider.getCustomer(customerId);
  if (!kycReady(customer.kycStatus, profile.vaKycStatus)) {
    throw new ValidationError('Complete identity before opening this country');
  }
  if (!endorsementApproved(customer.endorsements, input.rail) && input.environment === 'PRODUCTION') {
    throw new ValidationError('This country is not endorsed on the Bridge customer yet');
  }
  const token = await db.supportedToken.findFirst({
    where: {
      tokenKey: input.destinationTokenKey,
      isEnabled: true,
      chainId: input.destinationChainId,
    },
  });
  if (!token) throw new ValidationError('Destination token is not enabled');
  await assertOwnedDestination({
    merchantId: input.merchantId,
    environment: input.environment,
    address: input.destinationAddress,
    signature: input.destinationSignature,
    rail: input.rail,
  });
  const created = await provider.createAccount({
    externalCustomerId: customerId,
    rail: input.rail,
    destinationAddress: input.destinationAddress,
    destinationChainId: input.destinationChainId,
    destinationToken: token.symbol,
  });
  const account = await db.fiatVirtualAccount.create({
    data: {
      profileId: profile.id,
      feeId: fee.id,
      provider: provider.name,
      environment: input.environment,
      rail: input.rail,
      externalCustomerId: created.externalCustomerId,
      externalAccountId: created.externalAccountId,
      depositInstructions: created.depositInstructions as Prisma.InputJsonValue,
      destinationAddress: input.destinationAddress,
      destinationChainId: input.destinationChainId,
      destinationTokenKey: input.destinationTokenKey,
      destinationSignature: input.destinationSignature,
      status: created.status,
    },
  });
  if (created.externalCustomerId && created.externalAccountId) {
    try {
      const events = await provider.listActivity(created.externalCustomerId, created.externalAccountId);
      await persistActivityEvents(account.id, events);
    } catch {
      // history backfill is best-effort
    }
  }
  return account;
}

export async function applyBridgeCustomerWebhook(payload: Record<string, unknown>) {
  const customerId = String(
    (payload.event_object as { id?: string } | undefined)?.id
    ?? payload.customer_id
    ?? '',
  );
  if (!customerId) return false;
  const db = getDatabaseClient();
  const profiles = await db.fiatProfile.findMany();
  const profile = profiles.find((row) => refs(row).customerId === customerId);
  if (!profile) return false;
  const provider = getVaProvider(profile.environment);
  const customer = await provider.getCustomer(customerId);
  await db.fiatProfile.update({
    where: { id: profile.id },
    data: {
      vaKycStatus: mergeKycStatus(profile.vaKycStatus, customer.kycStatus),
    },
  });
  return true;
}

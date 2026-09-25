import { getDatabaseClient, Prisma, type Environment } from '@noderails/database';
import { NodeRailsError, NotFoundError, ValidationError } from '@noderails/common';
import {
  S3_BUCKETS,
  S3_FOLDERS,
  STORAGE_LIMITS,
  buildS3Key,
  getPresignedDownloadUrl,
  uploadToS3,
} from '@noderails/storage';
import { getOrCreateProfile } from '../profile.service.js';
import { identityApproved, latestIdentitySession } from '../identity/identity.service.js';
import { getIdentityProvider, getOfframpProvider } from '../factory.js';

function isPdf(buffer: Buffer): boolean {
  return buffer.subarray(0, 4).toString('utf8') === '%PDF';
}

function emptyJson(): Prisma.InputJsonValue {
  return {} as Prisma.InputJsonValue;
}

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}

function corridorComplete(value: unknown): boolean {
  const corridor = asRecord(value);
  const country = String(corridor.country ?? '').trim();
  const name = String(corridor.name ?? '').trim();
  const account = String(corridor.accountNumber ?? corridor.account_number ?? '').trim();
  const iban = String(corridor.iban ?? '').trim();
  return Boolean(country && name && (account || iban));
}

function hasPendingOverlay(value: unknown): boolean {
  return Object.keys(asRecord(value)).length > 0;
}

function isLiveVerified(status: string): boolean {
  return status === 'VERIFIED';
}

async function createBeneficiary(
  corridor: Record<string, unknown>,
  environment: Environment,
  fallbackId: string,
): Promise<string> {
  try {
    const created = await getOfframpProvider().create(corridor);
    return created.id;
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Could not create bank beneficiary';
    if (environment === 'PRODUCTION') {
      throw new ValidationError(message);
    }
    return fallbackId;
  }
}

export async function saveOwnAccountDetails(
  merchantId: string,
  environment: Environment,
  corridor: Record<string, unknown>,
) {
  const profile = await getOrCreateProfile(merchantId, environment);
  const db = getDatabaseClient();
  if (isLiveVerified(profile.ownAccountStatus)) {
    return db.fiatOwnAccount.upsert({
      where: { profileId: profile.id },
      create: {
        profileId: profile.id,
        corridor: emptyJson(),
        pendingCorridor: corridor as Prisma.InputJsonValue,
      },
      update: {
        pendingCorridor: corridor as Prisma.InputJsonValue,
      },
    });
  }
  return db.fiatOwnAccount.upsert({
    where: { profileId: profile.id },
    create: { profileId: profile.id, corridor: corridor as Prisma.InputJsonValue },
    update: {
      corridor: corridor as Prisma.InputJsonValue,
      rejectionReason: profile.ownAccountStatus === 'REJECTED' ? null : undefined,
    },
  });
}

export async function uploadStatement(
  merchantId: string,
  environment: Environment,
  file: { buffer: Buffer; originalname: string; mimetype: string; size: number },
) {
  if (file.mimetype !== 'application/pdf' || !isPdf(file.buffer)) {
    throw new ValidationError('Only PDF bank statements are accepted');
  }
  if (file.size > STORAGE_LIMITS.MAX_PROOF_BYTES) {
    throw new ValidationError('Statement is too large');
  }
  const profile = await getOrCreateProfile(merchantId, environment);
  const folder = isLiveVerified(profile.ownAccountStatus)
    ? `${merchantId}/${environment}/pending`
    : `${merchantId}/${environment}`;
  const key = buildS3Key(S3_FOLDERS.BANK_STATEMENT, folder, file.originalname);
  try {
    await uploadToS3(S3_BUCKETS.BANK_STATEMENTS, key, file.buffer, 'application/pdf');
  } catch (err) {
    const message = err instanceof Error ? err.message : '';
    if (message.includes('does not exist') || message.includes('NoSuchBucket')) {
      throw new NodeRailsError(
        'Statement storage is not configured. Create the bank-statements bucket and set S3_BANK_STATEMENTS_BUCKET.',
        'STORAGE_NOT_CONFIGURED',
        503,
      );
    }
    throw err;
  }
  const db = getDatabaseClient();
  if (isLiveVerified(profile.ownAccountStatus)) {
    return db.fiatOwnAccount.upsert({
      where: { profileId: profile.id },
      create: { profileId: profile.id, pendingStatementS3Key: key },
      update: { pendingStatementS3Key: key },
    });
  }
  return db.fiatOwnAccount.upsert({
    where: { profileId: profile.id },
    create: { profileId: profile.id, statementS3Key: key },
    update: { statementS3Key: key },
  });
}

export async function submitOwnAccount(merchantId: string, environment: Environment) {
  const profile = await getOrCreateProfile(merchantId, environment);
  const db = getDatabaseClient();
  const own = await db.fiatOwnAccount.findUnique({ where: { profileId: profile.id } });

  if (isLiveVerified(profile.ownAccountStatus)) {
    if (!own?.pendingStatementS3Key) {
      throw new ValidationError('Upload a new bank statement PDF');
    }
    if (!corridorComplete(own.pendingCorridor)) {
      throw new ValidationError('New bank details are incomplete');
    }
    await db.fiatOwnAccount.update({
      where: { id: own.id },
      data: {
        changeStatus: 'PENDING_REVIEW',
        pendingSubmittedAt: new Date(),
        changeRejectionReason: null,
      },
    });
    return db.fiatProfile.findUniqueOrThrow({
      where: { id: profile.id },
      include: { ownAccount: true },
    });
  }

  const session = await latestIdentitySession(profile.id);
  if (!session || !identityApproved(session.status)) {
    throw new ValidationError('Complete identity verification before submitting');
  }
  if (!own?.statementS3Key) {
    throw new ValidationError('Upload a bank statement PDF');
  }
  if (!corridorComplete(own.corridor)) {
    throw new ValidationError('Bank details are incomplete');
  }
  await db.fiatOwnAccount.update({
    where: { id: own.id },
    data: { submittedAt: new Date(), rejectionReason: null },
  });
  return db.fiatProfile.update({
    where: { id: profile.id },
    data: { ownAccountStatus: 'PENDING_REVIEW' },
    include: { ownAccount: true },
  });
}

const ADMIN_OWN_ACCOUNT_STATUSES = ['PENDING_REVIEW', 'VERIFIED', 'REJECTED'] as const;

function adminListWhere(status?: string): Prisma.FiatOwnAccountWhereInput {
  if (status === 'PENDING_REVIEW') {
    return {
      OR: [
        { profile: { ownAccountStatus: 'PENDING_REVIEW' } },
        { changeStatus: 'PENDING_REVIEW' },
      ],
    };
  }
  if (status === 'VERIFIED') {
    return {
      profile: { ownAccountStatus: 'VERIFIED' },
      changeStatus: { not: 'PENDING_REVIEW' },
    };
  }
  if (status === 'REJECTED') {
    return { profile: { ownAccountStatus: 'REJECTED' } };
  }
  return {
    profile: { ownAccountStatus: { in: [...ADMIN_OWN_ACCOUNT_STATUSES] } },
  };
}

export async function listOwnAccountsForAdmin(status?: string) {
  const db = getDatabaseClient();
  return db.fiatOwnAccount.findMany({
    where: adminListWhere(status),
    include: {
      profile: {
        include: {
          merchant: { select: { id: true, email: true, orgName: true, businessName: true, individualName: true } },
          identitySessions: { orderBy: { createdAt: 'desc' }, take: 1 },
        },
      },
    },
    orderBy: { updatedAt: 'desc' },
  });
}

function pickNested(value: unknown, path: string): unknown {
  let current: unknown = value;
  for (const part of path.split('.')) {
    if (!current || typeof current !== 'object' || Array.isArray(current)) return undefined;
    current = (current as Record<string, unknown>)[part];
  }
  return current;
}

function pickText(value: unknown, paths: string[]): string | null {
  for (const path of paths) {
    const found = pickNested(value, path);
    if (typeof found === 'string' && found.trim()) return found;
    if (typeof found === 'number' && Number.isFinite(found)) return String(found);
  }
  return null;
}

function identitySummary(session: Record<string, unknown> | null) {
  if (!session) return [];
  const rows: Array<{ label: string; value: string }> = [];
  const add = (label: string, paths: string[]) => {
    const value = pickText(session, paths);
    if (value) rows.push({ label, value });
  };
  add('Status', ['status', 'decision', 'session_status']);
  add('Workflow', ['workflow_id', 'workflowId']);
  add('Full name', [
    'id_verification.full_name',
    'id_verification.fullName',
    'id_verifications.0.full_name',
    'kyc.full_name',
  ]);
  add('First name', ['id_verification.first_name', 'id_verification.firstName', 'id_verifications.0.first_name']);
  add('Last name', ['id_verification.last_name', 'id_verification.lastName', 'id_verifications.0.last_name']);
  add('Date of birth', ['id_verification.date_of_birth', 'id_verification.dateOfBirth', 'id_verifications.0.date_of_birth']);
  add('Nationality', ['id_verification.nationality', 'id_verifications.0.nationality']);
  add('Document type', ['id_verification.document_type', 'id_verification.documentType', 'id_verifications.0.document_type']);
  add('Document number', ['id_verification.document_number', 'id_verification.documentNumber', 'id_verifications.0.document_number']);
  add('Issuing country', ['id_verification.issuing_state', 'id_verification.issuing_country', 'id_verifications.0.issuing_state']);
  add('Address', ['address.full_address', 'address.formatted_address', 'id_verification.address', 'id_verifications.0.address']);
  add('Company', [
    'kyb.company_name',
    'company.name',
    'business.company_name',
    'company_name',
    'business_name',
  ]);
  add('Vendor data', ['vendor_data', 'vendorData']);
  add('Webhook type', ['webhook_type', 'event', 'event_type']);
  return rows;
}

function storedProviderPayload(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  return Object.keys(record).length > 0 ? record : null;
}

export function listStatusForAdmin(row: {
  changeStatus: string;
  corridor: unknown;
  pendingCorridor: unknown;
  profile: { ownAccountStatus: string };
}) {
  const live = asRecord(row.corridor);
  const pending = asRecord(row.pendingCorridor);
  const reviewingChange = row.changeStatus === 'PENDING_REVIEW';
  const display = reviewingChange && hasPendingOverlay(pending) ? pending : live;
  return {
    status: reviewingChange
      ? 'CHANGE_PENDING'
      : row.changeStatus === 'REJECTED' && row.profile.ownAccountStatus === 'VERIFIED'
        ? 'CHANGE_REJECTED'
        : row.profile.ownAccountStatus,
    changeStatus: row.changeStatus,
    country: typeof display.country === 'string' ? display.country : null,
    name: typeof display.name === 'string' ? display.name : null,
  };
}

export async function getOwnAccountForAdmin(ownAccountId: string) {
  const db = getDatabaseClient();
  const own = await db.fiatOwnAccount.findUnique({
    where: { id: ownAccountId },
    include: {
      profile: {
        include: {
          merchant: {
            select: {
              id: true,
              email: true,
              orgName: true,
              businessName: true,
              individualName: true,
              merchantType: true,
            },
          },
          identitySessions: { orderBy: { createdAt: 'desc' }, take: 1 },
        },
      },
    },
  });
  if (!own) throw new NotFoundError('OwnAccount', ownAccountId);
  const session = own.profile.identitySessions[0] ?? null;
  let didit = storedProviderPayload(session?.providerPayload);
  let diditSource: 'stored' | 'live' | null = didit ? 'stored' : null;
  let diditError: string | null = null;
  if (session?.externalId) {
    try {
      const live = await getIdentityProvider(own.profile.environment).getSession(session.externalId);
      if (live && Object.keys(live).length > 0) {
        didit = { ...(didit ?? {}), ...live };
        diditSource = 'live';
      }
    } catch (err) {
      if (!didit) {
        diditError = err instanceof Error
          ? `${err.message}. Didit no longer returns this session, and no webhook payload was stored.`
          : 'Could not load identity session';
      }
    }
  }
  const corridor = asRecord(own.corridor);
  const pendingCorridor = asRecord(own.pendingCorridor);
  return {
    id: own.id,
    environment: own.profile.environment,
    accountType: own.profile.accountType,
    status: own.profile.ownAccountStatus,
    changeStatus: own.changeStatus,
    corridor,
    pendingCorridor,
    hasStatement: Boolean(own.statementS3Key),
    hasPendingStatement: Boolean(own.pendingStatementS3Key),
    statementKey: own.statementS3Key,
    offrampBeneficiaryId: own.offrampBeneficiaryId,
    reviewNote: own.reviewNote,
    rejectionReason: own.rejectionReason,
    changeRejectionReason: own.changeRejectionReason,
    submittedAt: own.submittedAt,
    pendingSubmittedAt: own.pendingSubmittedAt,
    reviewedAt: own.reviewedAt,
    createdAt: own.createdAt,
    merchant: own.profile.merchant,
    identity: session
      ? {
          id: session.id,
          provider: session.provider,
          kind: session.kind,
          status: session.status,
          externalId: session.externalId,
          createdAt: session.createdAt,
          updatedAt: session.updatedAt,
        }
      : null,
    didit,
    diditSource,
    diditSummary: identitySummary(didit),
    diditError,
  };
}

export async function statementDownloadUrl(ownAccountId: string, kind: 'live' | 'pending' = 'live') {
  const db = getDatabaseClient();
  const own = await db.fiatOwnAccount.findUnique({ where: { id: ownAccountId } });
  const key = kind === 'pending' ? own?.pendingStatementS3Key : own?.statementS3Key;
  if (!own || !key) throw new NotFoundError('Statement', ownAccountId);
  return getPresignedDownloadUrl(
    S3_BUCKETS.BANK_STATEMENTS,
    key,
    STORAGE_LIMITS.PROOF_URL_EXPIRY_SECONDS,
  );
}

export async function approveOwnAccount(ownAccountId: string, note?: string) {
  const db = getDatabaseClient();
  const own = await db.fiatOwnAccount.findUnique({
    where: { id: ownAccountId },
    include: { profile: true },
  });
  if (!own) throw new NotFoundError('OwnAccount', ownAccountId);

  if (own.changeStatus === 'PENDING_REVIEW') {
    if (!corridorComplete(own.pendingCorridor) || !own.pendingStatementS3Key) {
      throw new ValidationError('Pending bank change is incomplete');
    }
    const beneficiaryId = await createBeneficiary(
      asRecord(own.pendingCorridor),
      own.profile.environment,
      `test-pending:change:${own.id}`,
    );
    await db.fiatOwnAccount.update({
      where: { id: own.id },
      data: {
        corridor: own.pendingCorridor as Prisma.InputJsonValue,
        statementS3Key: own.pendingStatementS3Key,
        offrampBeneficiaryId: beneficiaryId,
        pendingCorridor: emptyJson(),
        pendingStatementS3Key: null,
        pendingSubmittedAt: null,
        changeStatus: 'NONE',
        changeRejectionReason: null,
        reviewNote: note ?? null,
        rejectionReason: null,
        reviewedAt: new Date(),
      },
    });
    return db.fiatProfile.findUniqueOrThrow({ where: { id: own.profileId } });
  }

  if (own.profile.ownAccountStatus !== 'PENDING_REVIEW') {
    throw new ValidationError('This account is not waiting for review');
  }
  let beneficiaryId = own.offrampBeneficiaryId;
  if (!beneficiaryId) {
    beneficiaryId = await createBeneficiary(
      asRecord(own.corridor),
      own.profile.environment,
      `test-pending:${own.id}`,
    );
  }
  await db.fiatOwnAccount.update({
    where: { id: own.id },
    data: {
      offrampBeneficiaryId: beneficiaryId,
      reviewNote: note ?? null,
      rejectionReason: null,
      reviewedAt: new Date(),
    },
  });
  return db.fiatProfile.update({
    where: { id: own.profileId },
    data: { ownAccountStatus: 'VERIFIED' },
  });
}

export async function rejectOwnAccount(ownAccountId: string, reason: string) {
  const db = getDatabaseClient();
  const own = await db.fiatOwnAccount.findUnique({
    where: { id: ownAccountId },
    include: { profile: true },
  });
  if (!own) throw new NotFoundError('OwnAccount', ownAccountId);

  if (own.changeStatus === 'PENDING_REVIEW') {
    await db.fiatOwnAccount.update({
      where: { id: own.id },
      data: {
        changeStatus: 'REJECTED',
        changeRejectionReason: reason,
        reviewedAt: new Date(),
      },
    });
    return db.fiatProfile.findUniqueOrThrow({ where: { id: own.profileId } });
  }

  if (own.profile.ownAccountStatus !== 'PENDING_REVIEW') {
    throw new ValidationError('This account is not waiting for review');
  }
  await db.fiatOwnAccount.update({
    where: { id: own.id },
    data: { rejectionReason: reason, reviewedAt: new Date() },
  });
  return db.fiatProfile.update({
    where: { id: own.profileId },
    data: { ownAccountStatus: 'REJECTED' },
  });
}

export async function merchantHasVerifiedOwnAccount(merchantId: string, environment: Environment) {
  const db = getDatabaseClient();
  const profile = await db.fiatProfile.findUnique({
    where: { merchantId_environment: { merchantId, environment } },
    select: { ownAccountStatus: true, ownAccount: { select: { offrampBeneficiaryId: true } } },
  });
  return profile?.ownAccountStatus === 'VERIFIED';
}

export async function verifiedOwnBeneficiaryId(merchantId: string, environment: Environment) {
  const db = getDatabaseClient();
  const profile = await db.fiatProfile.findUnique({
    where: { merchantId_environment: { merchantId, environment } },
    include: { ownAccount: true },
  });
  if (profile?.ownAccountStatus !== 'VERIFIED') return null;
  return profile.ownAccount?.offrampBeneficiaryId ?? null;
}

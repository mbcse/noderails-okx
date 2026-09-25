import {
  type Environment,
  type FiatAccountType,
  getDatabaseClient,
} from '@noderails/database';

export async function getOrCreateProfile(merchantId: string, environment: Environment) {
  const db = getDatabaseClient();
  const merchant = await db.merchant.findUnique({
    where: { id: merchantId },
    select: { merchantType: true },
  });
  const accountType: FiatAccountType = merchant?.merchantType === 'BUSINESS' ? 'BUSINESS' : 'INDIVIDUAL';
  return db.fiatProfile.upsert({
    where: { merchantId_environment: { merchantId, environment } },
    create: { merchantId, environment, accountType },
    update: { accountType },
    include: {
      ownAccount: true,
      identitySessions: { orderBy: { createdAt: 'desc' }, take: 5 },
      onboardingFees: { orderBy: { createdAt: 'desc' } },
      virtualAccounts: { include: { events: { orderBy: { createdAt: 'desc' }, take: 1 } } },
    },
  });
}

export async function setAccountType(merchantId: string, environment: Environment) {
  return getOrCreateProfile(merchantId, environment);
}

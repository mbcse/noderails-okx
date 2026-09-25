import { getDatabaseClient, type Environment } from '@noderails/database';
import { getOrCreateProfile } from './profile.service.js';
import { latestIdentitySession } from './identity/identity.service.js';
import { getPlatformBankConfig, publishedRateCard } from './platform-bank-config.js';
import { GLOBAL_BANK_RAILS } from './rails.js';
import { refreshBridgeCustomer } from './virtual-accounts/va.service.js';
import { syncPendingOpeningFees } from './onboarding-fee/fee.service.js';

export function destinationMessage(input: {
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

export async function getBankHub(merchantId: string, environment: Environment) {
  await syncPendingOpeningFees(merchantId, environment);
  const profile = await getOrCreateProfile(merchantId, environment);
  const identity = await latestIdentitySession(profile.id);
  const config = await getPlatformBankConfig();
  let bridgeCustomer = null;
  try {
    bridgeCustomer = await refreshBridgeCustomer(merchantId, environment);
  } catch {
    bridgeCustomer = null;
  }
  const now = Date.now();
  const rails = GLOBAL_BANK_RAILS.map((rail) => {
    const account = profile.virtualAccounts.find((row) => row.rail === rail.rail);
    const fees = profile.onboardingFees.filter((row) => row.rail === rail.rail);
    const activeFee = fees.find((row) => row.status === 'CONFIRMED' && row.periodEnd && row.periodEnd.getTime() > now);
    const pendingFee = fees.find((row) => row.status === 'PENDING');
    let state: 'locked' | 'pay' | 'renew' | 'open' | 'live' = 'pay';
    if (account && activeFee) state = 'live';
    else if (account && !activeFee) state = 'renew';
    else if (activeFee) state = 'open';
    return {
      ...rail,
      state,
      account: account
        ? {
            id: account.id,
            status: account.status,
            depositInstructions: account.depositInstructions,
            destinationAddress: account.destinationAddress,
            destinationChainId: account.destinationChainId,
            destinationTokenKey: account.destinationTokenKey,
          }
        : null,
      fee: activeFee
        ? {
            id: activeFee.id,
            status: activeFee.status,
            amountUsd: activeFee.amountUsd.toString(),
            periodStart: activeFee.periodStart,
            periodEnd: activeFee.periodEnd,
            checkoutUrl: activeFee.checkoutUrl,
          }
        : pendingFee
          ? {
              id: pendingFee.id,
              status: pendingFee.status,
              amountUsd: pendingFee.amountUsd.toString(),
              periodStart: pendingFee.periodStart,
              periodEnd: pendingFee.periodEnd,
              checkoutUrl: pendingFee.checkoutUrl,
            }
          : null,
    };
  });
  return {
    environment,
    accountType: profile.accountType,
    ownAccountStatus: profile.ownAccountStatus,
    vaKycStatus: profile.vaKycStatus,
    ownAccount: profile.ownAccount
      ? {
          corridor: profile.ownAccount.corridor,
          hasStatement: Boolean(profile.ownAccount.statementS3Key),
          rejectionReason: profile.ownAccount.rejectionReason,
          changeStatus: profile.ownAccount.changeStatus,
          changeRejectionReason: profile.ownAccount.changeRejectionReason,
          pendingCorridor: profile.ownAccount.pendingCorridor,
          hasPendingStatement: Boolean(profile.ownAccount.pendingStatementS3Key),
          pendingSubmittedAt: profile.ownAccount.pendingSubmittedAt,
        }
      : null,
    identity: identity
      ? {
          id: identity.id,
          status: identity.status,
          sessionUrl: identity.sessionUrl,
          kind: identity.kind,
        }
      : null,
    bridge: {
      kycLink: typeof (profile.vaExternalRefs as { kycLink?: string }).kycLink === 'string'
        ? (profile.vaExternalRefs as { kycLink: string }).kycLink
        : bridgeCustomer?.kycLink ?? null,
      tosLink: typeof (profile.vaExternalRefs as { tosLink?: string }).tosLink === 'string'
        ? (profile.vaExternalRefs as { tosLink: string }).tosLink
        : bridgeCustomer?.tosLink ?? null,
      kycStatus: bridgeCustomer?.kycStatus ?? profile.vaKycStatus,
      tosStatus: bridgeCustomer?.tosStatus ?? null,
      endorsements: bridgeCustomer?.endorsements ?? [],
    },
    openingFeeUsd: profile.accountType === 'BUSINESS'
      ? config.bankFeeBusinessUsd.toString()
      : config.bankFeeIndividualUsd.toString(),
    rateCard: publishedRateCard(config),
    rails,
  };
}

export async function getAccountDetail(merchantId: string, accountId: string) {
  const db = getDatabaseClient();
  const account = await db.fiatVirtualAccount.findFirst({
    where: { id: accountId, profile: { merchantId } },
    include: { profile: true },
  });
  if (!account) return null;
  return account;
}

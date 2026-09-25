import { getDatabaseClient } from '@noderails/database';
import { NotFoundError, ValidationError, isValidAddress, isNativeToken } from '@noderails/common';
import {
  merchantHasVerifiedOwnAccount,
  verifiedOwnBeneficiaryId,
} from '../fiat/own-accounts/own-account.service.js';

export interface UpsertSettlementConfigInput {
  conversionEnabled?: boolean;
  targetTokenKey?: string | null;
  singleChainSettlementEnabled?: boolean;
  settlementChainId?: number | null;
  settlementTokenKey?: string | null;
  settlementWalletAddress?: string | null;
  bankSettlementEnabled?: boolean;
  bankPayoutCurrency?: string | null;
  /** Internal only — set after creating a BloxFi beneficiary, not from merchant PUT. */
  bloxfiBeneficiaryId?: string | null;
  bloxfiCountry?: string | null;
  bloxfiDestinationType?: string | null;
  bloxfiBeneficiaryType?: string | null;
}

export async function getSettlementConfig(appId: string) {
  const db = getDatabaseClient();
  const existing = await db.settlementConfig.findUnique({ where: { appId } });
  if (existing) return existing;
  return db.settlementConfig.create({
    data: { appId },
  });
}

export async function upsertSettlementConfig(appId: string, input: UpsertSettlementConfigInput) {
  const db = getDatabaseClient();
  const app = await db.app.findUnique({
    where: { id: appId },
    select: { merchantId: true, environment: true, receivingWallet: true },
  });
  if (!app) throw new NotFoundError('App', appId);
  const current = await getSettlementConfig(appId);

  const next = {
    conversionEnabled: input.conversionEnabled ?? current.conversionEnabled,
    targetTokenKey:
      input.targetTokenKey === undefined
        ? current.targetTokenKey
        : input.targetTokenKey,
    singleChainSettlementEnabled:
      input.singleChainSettlementEnabled ?? current.singleChainSettlementEnabled,
    settlementChainId:
      input.settlementChainId === undefined ? current.settlementChainId : input.settlementChainId,
    settlementTokenKey:
      input.settlementTokenKey === undefined ? current.settlementTokenKey : input.settlementTokenKey,
    settlementWalletAddress:
      input.settlementWalletAddress === undefined
        ? current.settlementWalletAddress
        : input.settlementWalletAddress,
    bankSettlementEnabled: input.bankSettlementEnabled ?? current.bankSettlementEnabled,
    bankPayoutCurrency:
      input.bankPayoutCurrency === undefined ? current.bankPayoutCurrency : input.bankPayoutCurrency,
    bloxfiBeneficiaryId:
      input.bloxfiBeneficiaryId === undefined ? current.bloxfiBeneficiaryId : input.bloxfiBeneficiaryId,
    bloxfiCountry: input.bloxfiCountry === undefined ? current.bloxfiCountry : input.bloxfiCountry,
    bloxfiDestinationType:
      input.bloxfiDestinationType === undefined
        ? current.bloxfiDestinationType
        : input.bloxfiDestinationType,
    bloxfiBeneficiaryType:
      input.bloxfiBeneficiaryType === undefined
        ? current.bloxfiBeneficiaryType
        : input.bloxfiBeneficiaryType,
  };

  if (next.singleChainSettlementEnabled && !next.conversionEnabled) {
    throw new ValidationError('Single-chain settlement requires conversion');
  }
  if (next.bankSettlementEnabled && !(next.conversionEnabled && next.singleChainSettlementEnabled)) {
    throw new ValidationError('Bank settlement requires conversion and single-chain settlement');
  }
  if (next.conversionEnabled && !next.targetTokenKey) {
    throw new ValidationError('Select a target token before enabling conversion');
  }
  if (next.singleChainSettlementEnabled && !next.settlementChainId) {
    throw new ValidationError('Select a settlement chain before enabling single-chain settlement');
  }
  if (next.singleChainSettlementEnabled && !next.settlementTokenKey) {
    throw new ValidationError('Select a settlement token before enabling single-chain settlement');
  }
  if (
    next.singleChainSettlementEnabled
    && !next.bankSettlementEnabled
    && !next.settlementWalletAddress
  ) {
    if (app.receivingWallet && isValidAddress(app.receivingWallet)) {
      next.settlementWalletAddress = app.receivingWallet;
    } else {
      throw new ValidationError('Set a settlement-chain wallet or enable bank settlement');
    }
  }
  if (next.settlementWalletAddress && !isValidAddress(next.settlementWalletAddress)) {
    throw new ValidationError('Settlement wallet must be an EVM address');
  }
  if (next.bankSettlementEnabled && !next.bankPayoutCurrency) {
    throw new ValidationError('Select a bank payout currency');
  }
  if (next.bankSettlementEnabled) {
    const verified = await merchantHasVerifiedOwnAccount(app.merchantId, app.environment);
    if (!verified) {
      throw new ValidationError('Connect and verify your own bank account before enabling bank payouts');
    }
    const beneficiaryId = await verifiedOwnBeneficiaryId(app.merchantId, app.environment);
    if (beneficiaryId) {
      next.bloxfiBeneficiaryId = beneficiaryId;
    }
  }
  if (next.targetTokenKey) {
    const token = await db.supportedToken.findFirst({
      where: { tokenKey: next.targetTokenKey, isEnabled: true },
    });
    if (!token) {
      throw new ValidationError(`Unknown target token ${next.targetTokenKey}`);
    }
    if (isNativeToken(token.contractAddress)) {
      throw new ValidationError('Convert target must be an ERC-20, not native ETH');
    }
  }
  if (next.settlementTokenKey) {
    const token = await db.supportedToken.findFirst({
      where: {
        tokenKey: next.settlementTokenKey,
        isEnabled: true,
        ...(next.settlementChainId ? { chainId: next.settlementChainId } : {}),
      },
    });
    if (!token) {
      throw new ValidationError(`Unknown settlement token ${next.settlementTokenKey}`);
    }
    if (isNativeToken(token.contractAddress)) {
      throw new ValidationError('Settlement token must be an ERC-20, not native ETH');
    }
  }

  return db.settlementConfig.upsert({
    where: { appId },
    create: { appId, ...next, isEnabled: next.conversionEnabled },
    update: { ...next, isEnabled: next.conversionEnabled },
  });
}

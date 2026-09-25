import { getDatabaseClient } from '@noderails/database';
import { ValidationError } from '@noderails/common';

export interface SettlementSnapshot {
  conversionEnabled: boolean;
  targetTokenKey: string | null;
  singleChainSettlementEnabled: boolean;
  bankSettlementEnabled: boolean;
  settlementChainId: number | null;
  settlementTokenKey: string | null;
  settlementWalletAddress: string | null;
  captureMerchantAddress: string | null;
}

export function emptySettlementSnapshot(): SettlementSnapshot {
  return {
    conversionEnabled: false,
    targetTokenKey: null,
    singleChainSettlementEnabled: false,
    bankSettlementEnabled: false,
    settlementChainId: null,
    settlementTokenKey: null,
    settlementWalletAddress: null,
    captureMerchantAddress: null,
  };
}

export function toIntentSnapshotFields(snapshot: SettlementSnapshot) {
  return {
    conversionEnabled: snapshot.conversionEnabled,
    targetTokenKey: snapshot.targetTokenKey,
    singleChainSettlementEnabled: snapshot.singleChainSettlementEnabled,
    bankSettlementEnabled: snapshot.bankSettlementEnabled,
    settlementChainId: snapshot.settlementChainId,
    settlementTokenKey: snapshot.settlementTokenKey,
    settlementWalletAddress: snapshot.settlementWalletAddress,
    captureMerchantAddress: snapshot.captureMerchantAddress,
  };
}

/**
 * Live SettlementConfig for a new authorization. Downstream flags without
 * conversion are forced off so a bad row cannot leak into a payment snapshot.
 */
export async function loadSettlementSnapshot(
  appId: string,
  captureMerchantAddress: string | null,
): Promise<SettlementSnapshot> {
  const db = getDatabaseClient();
  const [config, platform] = await Promise.all([
    db.settlementConfig.findUnique({ where: { appId } }),
    db.platformConfig.findUnique({ where: { id: 'singleton' } }),
  ]);

  if (!config || !config.conversionEnabled) {
    return {
      ...emptySettlementSnapshot(),
      captureMerchantAddress,
    };
  }

  const targetTokenKey =
    config.targetTokenKey
    ?? platform?.defaultTargetTokenKey
    ?? null;
  if (!targetTokenKey) {
    throw new ValidationError(
      'Conversion is enabled but no target token is configured',
    );
  }

  let singleChain = config.singleChainSettlementEnabled;
  let bank = config.bankSettlementEnabled;
  if (singleChain && !config.conversionEnabled) singleChain = false;
  if (bank && !(config.conversionEnabled && singleChain)) bank = false;

  const settlementChainId =
    config.settlementChainId
    ?? platform?.defaultSettlementChainId
    ?? null;
  const settlementTokenKey = config.settlementTokenKey ?? targetTokenKey;

  if (singleChain && !settlementChainId) {
    throw new ValidationError(
      'Single-chain settlement is enabled but no settlement chain is configured',
    );
  }
  if (singleChain && !bank && !config.settlementWalletAddress) {
    throw new ValidationError(
      'Single-chain settlement requires a settlement-chain wallet when bank settlement is off',
    );
  }

  return {
    conversionEnabled: true,
    targetTokenKey,
    singleChainSettlementEnabled: singleChain,
    bankSettlementEnabled: bank,
    settlementChainId,
    settlementTokenKey: singleChain ? settlementTokenKey : null,
    settlementWalletAddress: singleChain ? (config.settlementWalletAddress ?? null) : null,
    captureMerchantAddress,
  };
}

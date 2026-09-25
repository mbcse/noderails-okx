export type SettlementPath =
  | 'source_wallet'
  | 'settlement_wallet_same_chain'
  | 'settlement_wallet_bridge'
  | 'merchant_balance_same_chain'
  | 'merchant_balance_bridge';

export interface SettlementSnapshotFields {
  conversionEnabled: boolean;
  singleChainSettlementEnabled: boolean;
  bankSettlementEnabled: boolean;
  settlementChainId: number | null;
  settlementTokenKey: string | null;
  settlementWalletAddress: string | null;
}

export function resolveSettlementPath(
  snapshot: SettlementSnapshotFields,
  sourceChainId: number,
): SettlementPath {
  if (!snapshot.conversionEnabled || !snapshot.singleChainSettlementEnabled) {
    return 'source_wallet';
  }
  const sameChain = snapshot.settlementChainId === sourceChainId;
  if (snapshot.bankSettlementEnabled) {
    return sameChain ? 'merchant_balance_same_chain' : 'merchant_balance_bridge';
  }
  return sameChain ? 'settlement_wallet_same_chain' : 'settlement_wallet_bridge';
}

export function splitMerchantAmount(amount: bigint, feeBps: number): { merchantAmount: bigint; fee: bigint } {
  const fee = (amount * BigInt(feeBps)) / 10_000n;
  return { merchantAmount: amount - fee, fee };
}

export function escrowAmount(intent: {
  settleAmount?: string | null;
  convertedAmount?: string | null;
  cryptoAmount?: string | null;
}): bigint {
  return BigInt(intent.settleAmount ?? intent.convertedAmount ?? intent.cryptoAmount ?? '0');
}

export function promisedFromIntent(intent: {
  promisedSettlementAmount?: string | null;
  settleAmount?: string | null;
  convertedAmount?: string | null;
  cryptoAmount?: string | null;
  platformFeeBps?: number | null;
  vasFeeBps?: number | null;
}): bigint {
  if (intent.promisedSettlementAmount) {
    return BigInt(intent.promisedSettlementAmount);
  }
  const amount = escrowAmount(intent);
  const platform = (amount * BigInt(intent.platformFeeBps ?? 0)) / 10_000n;
  const vas = (amount * BigInt(intent.vasFeeBps ?? 0)) / 10_000n;
  return amount - platform - vas;
}

export function resolveCreditDestination(intent: {
  bankSettlementEnabled: boolean;
  captureMerchantAddress?: string | null;
  settlementWalletAddress?: string | null;
}): `0x${string}` {
  if (intent.bankSettlementEnabled) {
    return '0x0000000000000000000000000000000000000000';
  }
  return (intent.captureMerchantAddress ?? '0x0000000000000000000000000000000000000000') as `0x${string}`;
}

/**
 * EIP-712 typed-data helpers for backend signing.
 *
 * The Escrow and MerchantManager contracts verify EIP-712
 * signatures. These helpers build the typed-data structs
 * that a viem `WalletClient` or `privateKeyToAccount` can sign.
 */

import type { Hex, Address } from 'viem';
import { concat, encodePacked, keccak256, padHex } from 'viem';
import { EIP712_DOMAINS } from '@noderails/common';

export const PAYOUT_AUTH_PURPOSE = 'I authorize NodeRails to execute payouts from this wallet';

export const PAYOUT_AUTH_DOMAIN = {
  name: 'NodeRailsPayouts',
  version: '1',
  chainId: 0,
  verifyingContract: '0x0000000000000000000000000000000000000000' as Address,
} as const;

export const BANK_AUTH_PURPOSE =
  'I authorize NodeRails to execute bank settlements and withdrawals from this wallet';

export const BANK_AUTH_DOMAIN = {
  name: 'NodeRailsBank',
  version: '1',
  chainId: 0,
  verifyingContract: '0x0000000000000000000000000000000000000000' as Address,
} as const;

function escrowDomain(chainId: number, verifyingContract: Address) {
  return {
    name: EIP712_DOMAINS.ESCROW.name,
    version: EIP712_DOMAINS.ESCROW.version,
    chainId,
    verifyingContract,
  };
}

// ── Escrow: CaptureNativePayment ──

export interface CaptureNativeTypedData {
  paymentIntentId: Hex;
  merchant: Address;
  amount: bigint;
  feeBps: number;
  timelocks: bigint;
  nonce: Hex;
}

export function buildCaptureNativeTypedData(
  params: CaptureNativeTypedData,
  chainId: number,
  verifyingContract: Address,
) {
  return {
    domain: {
      name: EIP712_DOMAINS.ESCROW.name,
      version: EIP712_DOMAINS.ESCROW.version,
      chainId,
      verifyingContract,
    },
    types: {
      CaptureNativePayment: [
        { name: 'paymentIntentId', type: 'bytes32' },
        { name: 'merchant', type: 'address' },
        { name: 'amount', type: 'uint256' },
        { name: 'feeBps', type: 'uint16' },
        { name: 'timelocks', type: 'uint256' },
        { name: 'nonce', type: 'uint256' },
      ],
    },
    primaryType: 'CaptureNativePayment' as const,
    message: {
      paymentIntentId: params.paymentIntentId,
      merchant: params.merchant,
      amount: params.amount,
      feeBps: params.feeBps,
      timelocks: params.timelocks,
      nonce: params.nonce,
    },
  };
}

// ── Escrow: CaptureERC20Payment ──

export interface CaptureERC20TypedData {
  paymentIntentId: Hex;
  merchant: Address;
  token: Address;
  amount: bigint;
  payer: Address;
  feeBps: number;
  timelocks: bigint;
  nonce: Hex;
}

export function buildCaptureERC20TypedData(
  params: CaptureERC20TypedData,
  chainId: number,
  verifyingContract: Address,
) {
  return {
    domain: {
      name: EIP712_DOMAINS.ESCROW.name,
      version: EIP712_DOMAINS.ESCROW.version,
      chainId,
      verifyingContract,
    },
    types: {
      CaptureERC20Payment: [
        { name: 'paymentIntentId', type: 'bytes32' },
        { name: 'merchant', type: 'address' },
        { name: 'token', type: 'address' },
        { name: 'amount', type: 'uint256' },
        { name: 'payer', type: 'address' },
        { name: 'feeBps', type: 'uint16' },
        { name: 'timelocks', type: 'uint256' },
        { name: 'nonce', type: 'uint256' },
      ],
    },
    primaryType: 'CaptureERC20Payment' as const,
    message: {
      paymentIntentId: params.paymentIntentId,
      merchant: params.merchant,
      token: params.token,
      amount: params.amount,
      payer: params.payer,
      feeBps: params.feeBps,
      timelocks: params.timelocks,
      nonce: params.nonce,
    },
  };
}

// ── MerchantManager: Payout ──

export interface PayoutTypedData {
  payoutIntentId: Hex;
  merchantWallet: Address;
  recipient: Address;
  token: Address;
  amount: bigint;
  feeBps: number;
}

export function buildPayoutTypedData(
  params: PayoutTypedData,
  chainId: number,
  verifyingContract: Address,
) {
  return {
    domain: {
      name: EIP712_DOMAINS.MERCHANT_MANAGER.name,
      version: EIP712_DOMAINS.MERCHANT_MANAGER.version,
      chainId,
      verifyingContract,
    },
    types: {
      Payout: [
        { name: 'payoutIntentId', type: 'bytes32' },
        { name: 'merchantWallet', type: 'address' },
        { name: 'recipient', type: 'address' },
        { name: 'token', type: 'address' },
        { name: 'amount', type: 'uint256' },
        { name: 'feeBps', type: 'uint16' },
      ],
    },
    primaryType: 'Payout' as const,
    message: {
      payoutIntentId: params.payoutIntentId,
      merchantWallet: params.merchantWallet,
      recipient: params.recipient,
      token: params.token,
      amount: params.amount,
      feeBps: params.feeBps,
    },
  };
}

// ── MerchantManager: NativePayout ──

export interface NativePayoutTypedData {
  payoutIntentId: Hex;
  merchantWallet: Address;
  recipient: Address;
  amount: bigint;
  feeBps: number;
}

export function buildNativePayoutTypedData(
  params: NativePayoutTypedData,
  chainId: number,
  verifyingContract: Address,
) {
  return {
    domain: {
      name: EIP712_DOMAINS.MERCHANT_MANAGER.name,
      version: EIP712_DOMAINS.MERCHANT_MANAGER.version,
      chainId,
      verifyingContract,
    },
    types: {
      NativePayout: [
        { name: 'payoutIntentId', type: 'bytes32' },
        { name: 'merchantWallet', type: 'address' },
        { name: 'recipient', type: 'address' },
        { name: 'amount', type: 'uint256' },
        { name: 'feeBps', type: 'uint16' },
      ],
    },
    primaryType: 'NativePayout' as const,
    message: {
      payoutIntentId: params.payoutIntentId,
      merchantWallet: params.merchantWallet,
      recipient: params.recipient,
      amount: params.amount,
      feeBps: params.feeBps,
    },
  };
}

export function hashPayoutAddressArray(addresses: Address[]): Hex {
  // Solidity `abi.encodePacked(address[])` left-pads each address to 32 bytes.
  // viem `encodePacked(['address'], …)` is 20 bytes and will not verify on-chain.
  return keccak256(concat(addresses.map((addr) => padHex(addr, { size: 32 }))));
}

export function hashPayoutAmountArray(amounts: bigint[]): Hex {
  return keccak256(encodePacked(amounts.map(() => 'uint256' as const), amounts));
}

export interface BulkPayoutTypedData {
  payoutIntentId: Hex;
  merchantWallet: Address;
  token: Address;
  recipients: Address[];
  amounts: bigint[];
  feeBps: number;
}

export function buildBulkPayoutTypedData(
  params: BulkPayoutTypedData,
  chainId: number,
  verifyingContract: Address,
) {
  return {
    domain: {
      name: EIP712_DOMAINS.MERCHANT_MANAGER.name,
      version: EIP712_DOMAINS.MERCHANT_MANAGER.version,
      chainId,
      verifyingContract,
    },
    types: {
      BulkPayout: [
        { name: 'payoutIntentId', type: 'bytes32' },
        { name: 'merchantWallet', type: 'address' },
        { name: 'token', type: 'address' },
        { name: 'recipientsHash', type: 'bytes32' },
        { name: 'amountsHash', type: 'bytes32' },
        { name: 'feeBps', type: 'uint16' },
      ],
    },
    primaryType: 'BulkPayout' as const,
    message: {
      payoutIntentId: params.payoutIntentId,
      merchantWallet: params.merchantWallet,
      token: params.token,
      recipientsHash: hashPayoutAddressArray(params.recipients),
      amountsHash: hashPayoutAmountArray(params.amounts),
      feeBps: params.feeBps,
    },
  };
}

export interface BulkNativePayoutTypedData {
  payoutIntentId: Hex;
  merchantWallet: Address;
  recipients: Address[];
  amounts: bigint[];
  feeBps: number;
}

export function buildBulkNativePayoutTypedData(
  params: BulkNativePayoutTypedData,
  chainId: number,
  verifyingContract: Address,
) {
  return {
    domain: {
      name: EIP712_DOMAINS.MERCHANT_MANAGER.name,
      version: EIP712_DOMAINS.MERCHANT_MANAGER.version,
      chainId,
      verifyingContract,
    },
    types: {
      BulkNativePayout: [
        { name: 'payoutIntentId', type: 'bytes32' },
        { name: 'merchantWallet', type: 'address' },
        { name: 'recipientsHash', type: 'bytes32' },
        { name: 'amountsHash', type: 'bytes32' },
        { name: 'feeBps', type: 'uint16' },
      ],
    },
    primaryType: 'BulkNativePayout' as const,
    message: {
      payoutIntentId: params.payoutIntentId,
      merchantWallet: params.merchantWallet,
      recipientsHash: hashPayoutAddressArray(params.recipients),
      amountsHash: hashPayoutAmountArray(params.amounts),
      feeBps: params.feeBps,
    },
  };
}

// ── MerchantManager: payout authorization (chain-agnostic EIP-712) ──

export interface AuthorizePayoutsTypedData {
  merchantWallet: Address;
  validUntil: bigint;
}

/** Merchant signs this in-wallet: purpose + wallet + validUntil. Same signature works on every chain. */
export function buildAuthorizePayoutsTypedData(params: AuthorizePayoutsTypedData) {
  return {
    domain: PAYOUT_AUTH_DOMAIN,
    types: {
      NodeRailsAuthorizePayouts: [
        { name: 'merchantWallet', type: 'address' },
        { name: 'purpose', type: 'string' },
        { name: 'validUntil', type: 'uint256' },
      ],
    },
    primaryType: 'NodeRailsAuthorizePayouts' as const,
    message: {
      merchantWallet: params.merchantWallet,
      purpose: PAYOUT_AUTH_PURPOSE,
      validUntil: params.validUntil,
    },
  };
}

// ── Escrow: CaptureAndConvert ──

export interface CaptureAndConvertTypedData {
  paymentIntentId: Hex;
  merchant: Address;
  sourceToken: Address;
  amountIn: bigint;
  settlementToken: Address;
  minAmountOut: bigint;
  router: Address;
  swapCalldataHash: Hex;
  feeBps: number;
  timelocks: bigint;
  nonce: Hex;
}

export function buildCaptureAndConvertTypedData(
  params: CaptureAndConvertTypedData,
  chainId: number,
  verifyingContract: Address,
) {
  return {
    domain: escrowDomain(chainId, verifyingContract),
    types: {
      CaptureAndConvert: [
        { name: 'paymentIntentId', type: 'bytes32' },
        { name: 'merchant', type: 'address' },
        { name: 'sourceToken', type: 'address' },
        { name: 'amountIn', type: 'uint256' },
        { name: 'settlementToken', type: 'address' },
        { name: 'minAmountOut', type: 'uint256' },
        { name: 'router', type: 'address' },
        { name: 'swapCalldataHash', type: 'bytes32' },
        { name: 'feeBps', type: 'uint16' },
        { name: 'timelocks', type: 'uint256' },
        { name: 'nonce', type: 'uint256' },
      ],
    },
    primaryType: 'CaptureAndConvert' as const,
    message: {
      paymentIntentId: params.paymentIntentId,
      merchant: params.merchant,
      sourceToken: params.sourceToken,
      amountIn: params.amountIn,
      settlementToken: params.settlementToken,
      minAmountOut: params.minAmountOut,
      router: params.router,
      swapCalldataHash: params.swapCalldataHash,
      feeBps: params.feeBps,
      timelocks: params.timelocks,
      nonce: params.nonce,
    },
  };
}

// ── Escrow: SettleToMerchantBalance ──

export interface SettleToMerchantBalanceTypedData {
  paymentIntentId: Hex;
  merchantAmount: bigint;
  token: Address;
  settlementChainId: bigint;
  settlementEscrow: Address;
  router: Address;
  bridgeCalldataHash: Hex;
  minDestinationAmount: bigint;
  destination: Address;
}

export function buildSettleToMerchantBalanceTypedData(
  params: SettleToMerchantBalanceTypedData,
  chainId: number,
  verifyingContract: Address,
) {
  return {
    domain: escrowDomain(chainId, verifyingContract),
    types: {
      SettleToMerchantBalance: [
        { name: 'paymentIntentId', type: 'bytes32' },
        { name: 'merchantAmount', type: 'uint256' },
        { name: 'token', type: 'address' },
        { name: 'settlementChainId', type: 'uint256' },
        { name: 'settlementEscrow', type: 'address' },
        { name: 'router', type: 'address' },
        { name: 'bridgeCalldataHash', type: 'bytes32' },
        { name: 'minDestinationAmount', type: 'uint256' },
        { name: 'destination', type: 'address' },
      ],
    },
    primaryType: 'SettleToMerchantBalance' as const,
    message: {
      paymentIntentId: params.paymentIntentId,
      merchantAmount: params.merchantAmount,
      token: params.token,
      settlementChainId: params.settlementChainId,
      settlementEscrow: params.settlementEscrow,
      router: params.router,
      bridgeCalldataHash: params.bridgeCalldataHash,
      minDestinationAmount: params.minDestinationAmount,
      destination: params.destination,
    },
  };
}

export interface RetrySettleToMerchantBalanceTypedData extends SettleToMerchantBalanceTypedData {
  retryNonce: bigint;
}

export function buildRetrySettleToMerchantBalanceTypedData(
  params: RetrySettleToMerchantBalanceTypedData,
  chainId: number,
  verifyingContract: Address,
) {
  return {
    domain: escrowDomain(chainId, verifyingContract),
    types: {
      RetrySettleToMerchantBalance: [
        { name: 'paymentIntentId', type: 'bytes32' },
        { name: 'merchantAmount', type: 'uint256' },
        { name: 'token', type: 'address' },
        { name: 'settlementChainId', type: 'uint256' },
        { name: 'settlementEscrow', type: 'address' },
        { name: 'router', type: 'address' },
        { name: 'bridgeCalldataHash', type: 'bytes32' },
        { name: 'minDestinationAmount', type: 'uint256' },
        { name: 'destination', type: 'address' },
        { name: 'retryNonce', type: 'uint256' },
      ],
    },
    primaryType: 'RetrySettleToMerchantBalance' as const,
    message: {
      paymentIntentId: params.paymentIntentId,
      merchantAmount: params.merchantAmount,
      token: params.token,
      settlementChainId: params.settlementChainId,
      settlementEscrow: params.settlementEscrow,
      router: params.router,
      bridgeCalldataHash: params.bridgeCalldataHash,
      minDestinationAmount: params.minDestinationAmount,
      destination: params.destination,
      retryNonce: params.retryNonce,
    },
  };
}

// ── Escrow: CreditMerchantBalance ──

export interface CreditMerchantBalanceTypedData {
  paymentIntentId: Hex;
  merchant: Address;
  token: Address;
  minAmount: bigint;
  destination: Address;
}

export function buildCreditMerchantBalanceTypedData(
  params: CreditMerchantBalanceTypedData,
  chainId: number,
  verifyingContract: Address,
) {
  return {
    domain: escrowDomain(chainId, verifyingContract),
    types: {
      CreditMerchantBalance: [
        { name: 'paymentIntentId', type: 'bytes32' },
        { name: 'merchant', type: 'address' },
        { name: 'token', type: 'address' },
        { name: 'minAmount', type: 'uint256' },
        { name: 'destination', type: 'address' },
      ],
    },
    primaryType: 'CreditMerchantBalance' as const,
    message: {
      paymentIntentId: params.paymentIntentId,
      merchant: params.merchant,
      token: params.token,
      minAmount: params.minAmount,
      destination: params.destination,
    },
  };
}

// ── Escrow: SettleToBank ──

export interface SettleToBankTypedData {
  paymentIntentId: Hex;
  merchant: Address;
  token: Address;
  amount: bigint;
  depositAddress: Address;
  bankSettlementId: Hex;
}

export function buildSettleToBankTypedData(
  params: SettleToBankTypedData,
  chainId: number,
  verifyingContract: Address,
) {
  return {
    domain: escrowDomain(chainId, verifyingContract),
    types: {
      SettleToBank: [
        { name: 'paymentIntentId', type: 'bytes32' },
        { name: 'merchant', type: 'address' },
        { name: 'token', type: 'address' },
        { name: 'amount', type: 'uint256' },
        { name: 'depositAddress', type: 'address' },
        { name: 'bankSettlementId', type: 'bytes32' },
      ],
    },
    primaryType: 'SettleToBank' as const,
    message: {
      paymentIntentId: params.paymentIntentId,
      merchant: params.merchant,
      token: params.token,
      amount: params.amount,
      depositAddress: params.depositAddress,
      bankSettlementId: params.bankSettlementId,
    },
  };
}

// ── Escrow: WithdrawSettlementBalance ──

export interface WithdrawSettlementBalanceTypedData {
  merchant: Address;
  token: Address;
  amount: bigint;
  destination: Address;
  withdrawId: Hex;
}

export function buildWithdrawSettlementBalanceTypedData(
  params: WithdrawSettlementBalanceTypedData,
  chainId: number,
  verifyingContract: Address,
) {
  return {
    domain: escrowDomain(chainId, verifyingContract),
    types: {
      WithdrawSettlementBalance: [
        { name: 'merchant', type: 'address' },
        { name: 'token', type: 'address' },
        { name: 'amount', type: 'uint256' },
        { name: 'destination', type: 'address' },
        { name: 'withdrawId', type: 'bytes32' },
      ],
    },
    primaryType: 'WithdrawSettlementBalance' as const,
    message: {
      merchant: params.merchant,
      token: params.token,
      amount: params.amount,
      destination: params.destination,
      withdrawId: params.withdrawId,
    },
  };
}

export const WAR_ROOM_DOMAIN = {
  name: 'NodeRailsWarRoom',
  version: '1',
  chainId: 0,
  verifyingContract: '0x0000000000000000000000000000000000000000' as Address,
} as const;

export const WAR_ROOM_TYPES = {
  ChainTarget: [
    { name: 'chainId', type: 'uint256' },
    { name: 'contract', type: 'address' },
  ],
  SuperAdminAction: [
    { name: 'action', type: 'bytes32' },
    { name: 'argsHash', type: 'bytes32' },
    { name: 'nonce', type: 'uint256' },
    { name: 'deadline', type: 'uint256' },
    { name: 'targets', type: 'ChainTarget[]' },
  ],
} as const;

export interface WarRoomChainTarget {
  chainId: bigint;
  contract: Address;
}

export interface SuperAdminActionTypedData {
  action: Hex;
  argsHash: Hex;
  nonce: bigint;
  deadline: bigint;
  targets: WarRoomChainTarget[];
}

/** War Room EIP-712 payload. Field name `contract` matches the on-chain typehash. */
export function buildSuperAdminActionTypedData(message: SuperAdminActionTypedData) {
  return {
    domain: WAR_ROOM_DOMAIN,
    types: WAR_ROOM_TYPES,
    primaryType: 'SuperAdminAction' as const,
    message,
  };
}

export interface AuthorizeBankSettlementTypedData {
  merchantWallet: Address;
  validUntil: bigint;
}

/** Merchant signs this in-wallet: purpose + wallet + validUntil. Same signature works on every chain. */
export function buildAuthorizeBankSettlementTypedData(params: AuthorizeBankSettlementTypedData) {
  return {
    domain: BANK_AUTH_DOMAIN,
    types: {
      NodeRailsAuthorizeBankSettlement: [
        { name: 'merchantWallet', type: 'address' },
        { name: 'purpose', type: 'string' },
        { name: 'validUntil', type: 'uint256' },
      ],
    },
    primaryType: 'NodeRailsAuthorizeBankSettlement' as const,
    message: {
      merchantWallet: params.merchantWallet,
      purpose: BANK_AUTH_PURPOSE,
      validUntil: params.validUntil,
    },
  };
}

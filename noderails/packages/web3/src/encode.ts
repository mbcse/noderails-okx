/**
 * Calldata builders for NodeRails smart contracts.
 *
 * These pure functions ABI-encode contract call data that you pass
 * to MTXM via `sendTransaction({ data: ... })`.
 */

import { encodeFunctionData, type Hex, type Address } from 'viem';
import { nodeRailsEscrowAbi, merchantManagerAbi } from './abis.js';

// ─────────── Escrow: Capture ───────────

export interface CaptureNativeParams {
  paymentIntentId: Hex;
  merchant: Address;
  feeBps: number;
  timelocks: bigint;
  noderailsSignature: Hex;
}

export function encodeCaptureNative(params: CaptureNativeParams): Hex {
  return encodeFunctionData({
    abi: nodeRailsEscrowAbi,
    functionName: 'captureNativePayment',
    args: [
      params.paymentIntentId,
      params.merchant,
      params.feeBps,
      params.timelocks,
      params.noderailsSignature,
    ],
  });
}

export interface PermitData {
  amount: bigint;
  deadline: bigint;
  v: number;
  r: Hex;
  s: Hex;
}

export interface CaptureERC20Params {
  paymentIntentId: Hex;
  merchant: Address;
  token: Address;
  amount: bigint;
  payer: Address;
  feeBps: number;
  timelocks: bigint;
  permitData: PermitData;
  noderailsSignature: Hex;
}

export function encodeCaptureERC20(params: CaptureERC20Params): Hex {
  return encodeFunctionData({
    abi: nodeRailsEscrowAbi,
    functionName: 'captureERC20Payment',
    args: [
      params.paymentIntentId,
      params.merchant,
      params.token,
      params.amount,
      params.payer,
      params.feeBps,
      params.timelocks,
      params.permitData,
      params.noderailsSignature,
    ],
  });
}

// ─────────── Escrow: Settle ───────────

export function encodeSettle(paymentIntentId: Hex): Hex {
  return encodeFunctionData({
    abi: nodeRailsEscrowAbi,
    functionName: 'settlePayment',
    args: [paymentIntentId],
  });
}

// ─────────── Escrow: Refund ───────────

export function encodeRefundPayment(paymentIntentId: Hex): Hex {
  return encodeFunctionData({
    abi: nodeRailsEscrowAbi,
    functionName: 'refundPayment',
    args: [paymentIntentId],
  });
}

export function encodeRefundPaymentAmount(paymentIntentId: Hex, amt: bigint): Hex {
  return encodeFunctionData({
    abi: nodeRailsEscrowAbi,
    functionName: 'refundPaymentAmount',
    args: [paymentIntentId, amt],
  });
}

// ─────────── Escrow: Dispute ───────────

export function encodeInitiateDispute(paymentIntentId: Hex): Hex {
  return encodeFunctionData({
    abi: nodeRailsEscrowAbi,
    functionName: 'initiateDispute',
    args: [paymentIntentId],
  });
}

export function encodeResolveDispute(paymentIntentId: Hex, winner: Address): Hex {
  return encodeFunctionData({
    abi: nodeRailsEscrowAbi,
    functionName: 'resolveDispute',
    args: [paymentIntentId, winner],
  });
}

export interface CaptureAndConvertParams {
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
  permitData: PermitData;
  payer: Address;
  swapCalldata: Hex;
  noderailsSignature: Hex;
}

export function encodeCaptureAndConvert(params: CaptureAndConvertParams): Hex {
  return encodeFunctionData({
    abi: nodeRailsEscrowAbi,
    functionName: 'captureAndConvert',
    args: [
      params.paymentIntentId,
      params.merchant,
      params.sourceToken,
      params.amountIn,
      params.settlementToken,
      params.minAmountOut,
      params.router,
      params.swapCalldataHash,
      params.feeBps,
      params.timelocks,
      params.permitData,
      params.payer,
      params.swapCalldata,
      params.noderailsSignature,
    ],
  });
}

export interface CaptureNativeAndConvertParams {
  paymentIntentId: Hex;
  merchant: Address;
  settlementToken: Address;
  minAmountOut: bigint;
  router: Address;
  swapCalldataHash: Hex;
  feeBps: number;
  timelocks: bigint;
  swapCalldata: Hex;
  noderailsSignature: Hex;
}

export function encodeCaptureNativeAndConvert(params: CaptureNativeAndConvertParams): Hex {
  return encodeFunctionData({
    abi: nodeRailsEscrowAbi,
    functionName: 'captureNativeAndConvert',
    args: [
      params.paymentIntentId,
      params.merchant,
      params.settlementToken,
      params.minAmountOut,
      params.router,
      params.swapCalldataHash,
      params.feeBps,
      params.timelocks,
      params.swapCalldata,
      params.noderailsSignature,
    ],
  });
}

export interface SettleToMerchantBalanceParams {
  paymentIntentId: Hex;
  token: Address;
  settlementChainId: bigint;
  settlementEscrow: Address;
  router: Address;
  bridgeCalldataHash: Hex;
  minDestinationAmount: bigint;
  destination: Address;
  bridgeCalldata: Hex;
  noderailsSignature: Hex;
}

export function encodeSettleToMerchantBalance(params: SettleToMerchantBalanceParams): Hex {
  return encodeFunctionData({
    abi: nodeRailsEscrowAbi,
    functionName: 'settleToMerchantBalance',
    args: [
      params.paymentIntentId,
      params.token,
      params.settlementChainId,
      params.settlementEscrow,
      params.router,
      params.bridgeCalldataHash,
      params.minDestinationAmount,
      params.destination,
      params.bridgeCalldata,
      params.noderailsSignature,
    ],
  });
}

export function encodeRetrySettleToMerchantBalance(params: SettleToMerchantBalanceParams): Hex {
  return encodeFunctionData({
    abi: nodeRailsEscrowAbi,
    functionName: 'retrySettleToMerchantBalance',
    args: [
      params.paymentIntentId,
      params.token,
      params.settlementChainId,
      params.settlementEscrow,
      params.router,
      params.bridgeCalldataHash,
      params.minDestinationAmount,
      params.destination,
      params.bridgeCalldata,
      params.noderailsSignature,
    ],
  });
}

export interface CreditMerchantBalanceParams {
  paymentIntentId: Hex;
  merchant: Address;
  token: Address;
  minAmount: bigint;
  destination: Address;
  noderailsSignature: Hex;
}

export function encodeCreditMerchantBalance(params: CreditMerchantBalanceParams): Hex {
  return encodeFunctionData({
    abi: nodeRailsEscrowAbi,
    functionName: 'creditMerchantBalance',
    args: [
      params.paymentIntentId,
      params.merchant,
      params.token,
      params.minAmount,
      params.destination,
      params.noderailsSignature,
    ],
  });
}

export function encodeSettleStuckMerchantBalance(params: CreditMerchantBalanceParams): Hex {
  return encodeFunctionData({
    abi: nodeRailsEscrowAbi,
    functionName: 'settleStuckMerchantBalance',
    args: [
      params.paymentIntentId,
      params.merchant,
      params.token,
      params.minAmount,
      params.destination,
      params.noderailsSignature,
    ],
  });
}

export interface SettleToBankParams {
  paymentIntentId: Hex;
  merchant: Address;
  token: Address;
  amount: bigint;
  depositAddress: Address;
  bankSettlementId: Hex;
  authValidUntil: bigint;
  merchantSignature: Hex;
  noderailsSignature: Hex;
}

export function encodeSettleToBank(params: SettleToBankParams): Hex {
  return encodeFunctionData({
    abi: nodeRailsEscrowAbi,
    functionName: 'settleToBank',
    args: [
      params.paymentIntentId,
      params.merchant,
      params.token,
      params.amount,
      params.depositAddress,
      params.bankSettlementId,
      params.authValidUntil,
      params.merchantSignature,
      params.noderailsSignature,
    ],
  });
}

export interface WithdrawSettlementBalanceParams {
  merchant: Address;
  token: Address;
  amount: bigint;
  destination: Address;
  withdrawId: Hex;
  authValidUntil: bigint;
  merchantSignature: Hex;
  noderailsSignature: Hex;
}

export function encodeWithdrawSettlementBalance(params: WithdrawSettlementBalanceParams): Hex {
  return encodeFunctionData({
    abi: nodeRailsEscrowAbi,
    functionName: 'withdrawSettlementBalance',
    args: [
      params.merchant,
      params.token,
      params.amount,
      params.destination,
      params.withdrawId,
      params.authValidUntil,
      params.merchantSignature,
      params.noderailsSignature,
    ],
  });
}

// ─────────── Merchant Manager: Payout ───────────

export const EMPTY_MERCHANT_MANAGER_PERMIT: PermitData = {
  amount: 0n,
  deadline: 0n,
  v: 0,
  r: '0x0000000000000000000000000000000000000000000000000000000000000000',
  s: '0x0000000000000000000000000000000000000000000000000000000000000000',
};

export interface ExecutePayoutParams {
  payoutIntentId: Hex;
  merchantWallet: Address;
  recipient: Address;
  token: Address;
  amount: bigint;
  feeBps: number;
  sessionExpiry: bigint;
  permitData?: PermitData;
  merchantSignature: Hex;
  noderailsSignature: Hex;
}

export function encodeExecutePayout(params: ExecutePayoutParams): Hex {
  return encodeFunctionData({
    abi: merchantManagerAbi,
    functionName: 'executePayout',
    args: [
      params.payoutIntentId,
      params.merchantWallet,
      params.recipient,
      params.token,
      params.amount,
      params.feeBps,
      params.sessionExpiry,
      params.permitData ?? EMPTY_MERCHANT_MANAGER_PERMIT,
      params.merchantSignature,
      params.noderailsSignature,
    ],
  });
}

export interface ExecuteNativePayoutParams {
  payoutIntentId: Hex;
  merchantWallet: Address;
  recipient: Address;
  amount: bigint;
  feeBps: number;
  sessionExpiry: bigint;
  merchantSignature: Hex;
  noderailsSignature: Hex;
}

export function encodeExecuteNativePayout(params: ExecuteNativePayoutParams): Hex {
  return encodeFunctionData({
    abi: merchantManagerAbi,
    functionName: 'executeNativePayout',
    args: [
      params.payoutIntentId,
      params.merchantWallet,
      params.recipient,
      params.amount,
      params.feeBps,
      params.sessionExpiry,
      params.merchantSignature,
      params.noderailsSignature,
    ],
  });
}

export interface ExecuteBulkPayoutParams {
  payoutIntentId: Hex;
  merchantWallet: Address;
  token: Address;
  recipients: Address[];
  amounts: bigint[];
  feeBps: number;
  sessionExpiry: bigint;
  permitData?: PermitData;
  merchantSignature: Hex;
  noderailsSignature: Hex;
}

export function encodeExecuteBulkPayout(params: ExecuteBulkPayoutParams): Hex {
  return encodeFunctionData({
    abi: merchantManagerAbi,
    functionName: 'executeBulkPayout',
    args: [
      params.payoutIntentId,
      params.merchantWallet,
      params.token,
      params.recipients,
      params.amounts,
      params.feeBps,
      params.sessionExpiry,
      params.permitData ?? EMPTY_MERCHANT_MANAGER_PERMIT,
      params.merchantSignature,
      params.noderailsSignature,
    ],
  });
}

export interface ExecuteBulkNativePayoutParams {
  payoutIntentId: Hex;
  merchantWallet: Address;
  recipients: Address[];
  amounts: bigint[];
  feeBps: number;
  sessionExpiry: bigint;
  merchantSignature: Hex;
  noderailsSignature: Hex;
}

export function encodeExecuteBulkNativePayout(params: ExecuteBulkNativePayoutParams): Hex {
  return encodeFunctionData({
    abi: merchantManagerAbi,
    functionName: 'executeBulkNativePayout',
    args: [
      params.payoutIntentId,
      params.merchantWallet,
      params.recipients,
      params.amounts,
      params.feeBps,
      params.sessionExpiry,
      params.merchantSignature,
      params.noderailsSignature,
    ],
  });
}

export function encodeDepositETH(merchantWallet: Address): Hex {
  return encodeFunctionData({
    abi: merchantManagerAbi,
    functionName: 'depositETH',
    args: [merchantWallet],
  });
}

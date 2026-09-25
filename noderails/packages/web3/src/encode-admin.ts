import { encodeFunctionData, keccak256, toBytes, type Address, type Hex } from 'viem';
import { nodeRailsEscrowAbi } from './abis.js';

export type SuperAdminProof = {
  nonce: bigint;
  deadline: bigint;
  targets: { chainId: bigint; contractAddress: Address }[];
  signatures: Hex;
};

export const WAR_ROOM_ACTIONS = {
  setSwapRouter: keccak256(toBytes('setSwapRouter')),
  setBridgeRouter: keccak256(toBytes('setBridgeRouter')),
  setFeeRecipient: keccak256(toBytes('setFeeRecipient')),
  setKeyRole: keccak256(toBytes('setKeyRole')),
  unpause: keccak256(toBytes('unpause')),
  liftFullStop: keccak256(toBytes('liftFullStop')),
  rotateSuperAdmin: keccak256(toBytes('rotateSuperAdmin')),
  initiateEmergencyWithdraw: keccak256(toBytes('initiateEmergencyWithdraw')),
  executeEmergencyWithdrawAll: keccak256(toBytes('executeEmergencyWithdrawAll')),
  cancelEmergencyWithdraw: keccak256(toBytes('cancelEmergencyWithdraw')),
} as const;

export function encodeSetSwapRouter(router: Address, allowed: boolean, proof: SuperAdminProof): Hex {
  return encodeFunctionData({
    abi: nodeRailsEscrowAbi,
    functionName: 'setSwapRouter',
    args: [router, allowed, proof],
  });
}

export function encodeSetBridgeRouter(router: Address, allowed: boolean, proof: SuperAdminProof): Hex {
  return encodeFunctionData({
    abi: nodeRailsEscrowAbi,
    functionName: 'setBridgeRouter',
    args: [router, allowed, proof],
  });
}

export function encodeSetAllowedSettlementToken(token: Address, allowed: boolean): Hex {
  return encodeFunctionData({
    abi: nodeRailsEscrowAbi,
    functionName: 'setAllowedSettlementToken',
    args: [token, allowed],
  });
}

export function encodeSetFeeOnTransferEnabled(enabled: boolean): Hex {
  return encodeFunctionData({
    abi: nodeRailsEscrowAbi,
    functionName: 'setFeeOnTransferEnabled',
    args: [enabled],
  });
}

export function encodeSetFeeRecipient(feeRecipient: Address, proof: SuperAdminProof): Hex {
  return encodeFunctionData({
    abi: nodeRailsEscrowAbi,
    functionName: 'setFeeRecipient',
    args: [feeRecipient, proof],
  });
}

export function encodeRevokeKeyRole(key: Address): Hex {
  return encodeFunctionData({
    abi: nodeRailsEscrowAbi,
    functionName: 'setKeyRole',
    args: [key, 0],
  });
}

export function encodeInitiateEmergencyWithdraw(
  tokens: Address[],
  to: Address,
  proof: SuperAdminProof,
): Hex {
  return encodeFunctionData({
    abi: nodeRailsEscrowAbi,
    functionName: 'initiateEmergencyWithdraw',
    args: [tokens, to, proof],
  });
}

export function encodeExecuteEmergencyWithdrawAll(proof: SuperAdminProof): Hex {
  return encodeFunctionData({
    abi: nodeRailsEscrowAbi,
    functionName: 'executeEmergencyWithdrawAll',
    args: [proof],
  });
}

export function encodeCancelEmergencyWithdraw(proof: SuperAdminProof): Hex {
  return encodeFunctionData({
    abi: nodeRailsEscrowAbi,
    functionName: 'cancelEmergencyWithdraw',
    args: [proof],
  });
}

/** On-chain KeyRole enum labels for admin UI. SuperAdmin is never assigned to an EOA. */
export const ESCROW_KEY_ROLE_LABELS = [
  'None',
  'TransactionKey',
  'Admin',
  'SuperAdmin',
] as const;

import { blockExplorerTxUrl, chainDisplayName, formatCryptoAmount, parseTokenKey } from '@noderails/common';

export interface BridgeApp {
  id?: string;
  name?: string;
  merchant?: { id?: string; orgName?: string | null; email?: string | null };
}

export interface BridgeTx {
  id: string;
  type: string;
  status: string;
  txHash: string | null;
  mtxmTxId: string | null;
  chain: string;
  blockNumber: number | null;
  error: string | null;
  createdAt: string;
  confirmedAt: string | null;
}

export interface BridgeLiveChain {
  chainId: number;
  displayName: string;
  explorerUrl: string | null;
  escrowAddress: string;
}

export interface BridgeLive {
  fetchedAt: string;
  sourceTxHash: string | null;
  hashSource: string | null;
  mtxmTxId: string | null;
  lifi: Record<string, unknown> | null;
  lifiError: string | null;
  destCreditConsumedOnChain: boolean | null;
  destOnChainError: string | null;
  destEscrowAddress: string | null;
  destEscrowTokenBalance: string | null;
  destTokenDecimals: number | null;
  destTokenSymbol: string | null;
  destTokenKey: string | null;
  sourceChain: BridgeLiveChain | null;
  destChain: BridgeLiveChain | null;
}

export interface BridgeRow {
  id: string;
  status: string;
  amount: string;
  currency: string;
  authorizationChainId: number | null;
  settlementChainId: number | null;
  authorizationTokenKey: string | null;
  settlementTokenKey: string | null;
  cryptoTokenKey: string | null;
  cryptoTokenDecimals: number | null;
  settleAmount: string | null;
  promisedSettlementAmount: string | null;
  captureTxHash: string | null;
  authorizationTxHash: string | null;
  settlementWalletAddress: string | null;
  captureMerchantAddress: string | null;
  settlementCreditTxHash: string | null;
  settlementCreditedAt: string | null;
  bridgeTransferId: string | null;
  bridgeStatus: string | null;
  bridgeLiFiStatus: string | null;
  bridgeLiFiSubstatus: string | null;
  settleBridgeRetryCount: number;
  bridgeRetryAvailableAt: string | null;
  settlementCreditConsumed: boolean;
  bridgeLastError: string | null;
  bridgeLastStatusPayload: unknown;
  bridgeRetryMtxmTxId: string | null;
  capturedAt: string | null;
  settledAt: string | null;
  createdAt: string;
  updatedAt: string;
  app?: BridgeApp;
  transactions?: BridgeTx[];
  live?: BridgeLive;
}

export type BadgeVariant = 'default' | 'success' | 'warning' | 'destructive' | 'outline';

export function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

export function readString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value : null;
}

export function readNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

export function tokenSymbol(tokenKey: string | null | undefined): string {
  return parseTokenKey(tokenKey)?.symbol ?? tokenKey ?? 'token';
}

export function formatToken(raw: string | null | undefined, decimals: number | null | undefined): string {
  if (raw == null || raw === '') return '—';
  return formatCryptoAmount(raw, decimals ?? 6);
}

export function shortHash(value: string | null | undefined): string {
  if (!value) return '—';
  if (value.length <= 14) return value;
  return `${value.slice(0, 6)}…${value.slice(-4)}`;
}

export function timeAgo(iso: string | null | undefined): string {
  if (!iso) return '—';
  const ms = Date.now() - new Date(iso).getTime();
  if (Number.isNaN(ms)) return '—';
  if (ms < 8_000) return 'just now';
  if (ms < 60_000) return `${Math.floor(ms / 1000)}s ago`;
  if (ms < 3_600_000) return `${Math.floor(ms / 60_000)}m ago`;
  if (ms < 86_400_000) return `${Math.floor(ms / 3_600_000)}h ago`;
  return new Date(iso).toLocaleString();
}

export function explorerTx(chainId: number | null | undefined, hash: string | null | undefined): string | null {
  if (chainId == null || !hash) return null;
  return blockExplorerTxUrl(chainId, hash);
}

export function chainLabel(chainId: number | null | undefined, liveName?: string | null): string {
  if (chainId == null) return '—';
  return liveName || chainDisplayName(chainId);
}

export function bridgeBadge(status: string | null | undefined): BadgeVariant {
  const value = (status ?? '').toUpperCase();
  if (['DONE', 'COMPLETED', 'SUCCESS', 'STUCK_SETTLED'].includes(value)) return 'success';
  if (['FAILED', 'REFUNDED', 'REFUND', 'STUCK'].includes(value)) return 'destructive';
  if (['PENDING', 'PENDING_RECEIVING', 'RETRYING', 'STUCK_SETTLING', 'PARTIAL', 'NOT_FOUND'].includes(value)) {
    return 'warning';
  }
  return 'outline';
}

export function paymentBadge(status: string | null | undefined): BadgeVariant {
  const value = (status ?? '').toUpperCase();
  if (value === 'SETTLED') return 'success';
  if (['CAPTURED', 'PARTIALLY_REFUNDED', 'AUTHORIZED'].includes(value)) return 'warning';
  if (['REFUNDED', 'FAILED', 'CAPTURE_FAILED', 'CANCELLED', 'EXPIRED'].includes(value)) return 'destructive';
  return 'outline';
}

export interface LiFiLeg {
  txHash: string | null;
  chainId: number | null;
  amount: string | null;
  tokenSymbol: string | null;
  decimals: number | null;
  txLink: string | null;
}

export interface ParsedLiFi {
  status: string | null;
  substatus: string | null;
  substatusMessage: string | null;
  tool: string | null;
  explorerLink: string | null;
  sending: LiFiLeg;
  receiving: LiFiLeg;
}

function parseLeg(value: unknown): LiFiLeg {
  const row = asRecord(value);
  const token = asRecord(row?.token);
  return {
    txHash: readString(row?.txHash),
    chainId: readNumber(row?.chainId),
    amount: readString(row?.amount) ?? (row?.amount != null ? String(row.amount) : null),
    tokenSymbol: readString(token?.symbol) ?? readString(row?.tokenSymbol),
    decimals: readNumber(token?.decimals),
    txLink: readString(row?.txLink),
  };
}

export function parseLiFi(value: unknown): ParsedLiFi | null {
  const row = asRecord(value);
  if (!row) return null;
  return {
    status: readString(row.status),
    substatus: readString(row.substatus),
    substatusMessage: readString(row.substatusMessage) ?? readString(row.message),
    tool: readString(row.tool) ?? readString(row.bridge),
    explorerLink: readString(row.lifiExplorerLink) ?? readString(row.explorerLink),
    sending: parseLeg(row.sending),
    receiving: parseLeg(row.receiving),
  };
}

export type PipelineState = 'done' | 'active' | 'failed' | 'idle';

export interface PipelineStep {
  key: string;
  label: string;
  state: PipelineState;
  detail: string;
}

export function pipelineSteps(row: BridgeRow): PipelineStep[] {
  const live = row.live;
  const lifi = parseLiFi(live?.lifi) ?? parseLiFi(row.bridgeLastStatusPayload);
  const lifiStatus = (live?.lifi ? lifi?.status : row.bridgeLiFiStatus) ?? lifi?.status;
  const lifiBucket = (lifiStatus ?? '').toUpperCase();
  const destOnChain = live?.destCreditConsumedOnChain;
  const destDone = destOnChain === true || (destOnChain == null && row.settlementCreditConsumed);
  const settleTx = row.transactions?.find((tx) => tx.type === 'SETTLE');
  const sourceHash = live?.sourceTxHash ?? row.bridgeTransferId ?? settleTx?.txHash;
  const lifiFailed = ['FAILED', 'REFUNDED', 'REFUND'].includes(lifiBucket)
    || ['failed', 'refunded'].includes(row.bridgeStatus ?? '');
  const lifiDone = ['DONE', 'COMPLETED', 'SUCCESS'].includes(lifiBucket);

  return [
    {
      key: 'capture',
      label: 'Capture',
      state: row.captureTxHash || row.capturedAt ? 'done' : 'idle',
      detail: row.capturedAt ? timeAgo(row.capturedAt) : 'Waiting for capture',
    },
    {
      key: 'source',
      label: 'Source settle',
      state: sourceHash
        ? (settleTx?.status === 'FAILED' ? 'failed' : 'done')
        : (row.status === 'SETTLED' || row.settledAt ? 'active' : 'idle'),
      detail: sourceHash ? shortHash(sourceHash) : 'No source hash yet',
    },
    {
      key: 'lifi',
      label: 'LI.FI',
      state: lifiFailed ? 'failed' : (lifiDone ? 'done' : (sourceHash ? 'active' : 'idle')),
      detail: [lifiStatus ?? row.bridgeLiFiStatus ?? row.bridgeStatus ?? 'waiting', lifi?.substatus ?? row.bridgeLiFiSubstatus]
        .filter(Boolean)
        .join(' · '),
    },
    {
      key: 'dest',
      label: 'Dest credit',
      state: destDone ? 'done' : (lifiDone || row.bridgeStatus === 'stuck_settling' ? 'active' : 'idle'),
      detail: destDone
        ? (row.settlementCreditTxHash ? shortHash(row.settlementCreditTxHash) : 'Consumed on-chain')
        : (live?.destEscrowTokenBalance && live.destEscrowTokenBalance !== '0'
          ? 'Tokens on dest escrow'
          : 'Not consumed'),
    },
  ];
}

export function destMismatch(row: BridgeRow): boolean {
  const onChain = row.live?.destCreditConsumedOnChain;
  return onChain != null && onChain !== row.settlementCreditConsumed;
}

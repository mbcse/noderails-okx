'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  useAccount,
  usePublicClient,
  useSwitchChain,
  useWriteContract,
} from 'wagmi';
import { type Address, isAddress } from 'viem';
import { nodeRailsEscrowAbi, ESCROW_KEY_ROLE_LABELS } from '@noderails/web3';
import { isValidAddress } from '@noderails/common';
import { uuidToBytes32 } from '@/lib/uuid-bytes32';
import { useAdminAuth } from '@/lib/auth';
import * as api from '@/lib/api';
import { AdminWalletProvider } from '@/components/admin-wallet-provider';
import { AdminSatelliteConnect } from '@/components/admin-satellite-connect';
import {
  addEscrowTrackedAddress,
  loadEscrowTrackedAddresses,
  loadRecentEscrowTxs,
  pushRecentEscrowTx,
  removeEscrowTrackedAddress,
  type EscrowTrackedAddresses,
  type EscrowTrackedKind,
  type EscrowTxRecord,
} from '@/lib/escrow-config-storage';
import { Badge, Button, Card, Input, Spinner } from '@/components/ui';
import { Alert, PageHeader } from '@/components/page';
import { RefreshCw, ExternalLink } from 'lucide-react';

interface AdminChain {
  chainId: number;
  chainType?: string;
  displayName: string;
  escrowAddress: string;
  explorerUrl?: string | null;
  nativeCurrencySymbol: string;
  isTestnet: boolean;
}

const TRACKED_LABELS: Record<EscrowTrackedKind, string> = {
  swapRouters: 'Swap routers (1inch)',
  bridgeRouters: 'Bridge routers (LI.FI)',
  settlementTokens: 'Settlement tokens',
};

const ALLOW_FN: Record<EscrowTrackedKind, 'allowedSwapRouters' | 'allowedBridgeRouters' | 'allowedSettlementTokens'> = {
  swapRouters: 'allowedSwapRouters',
  bridgeRouters: 'allowedBridgeRouters',
  settlementTokens: 'allowedSettlementTokens',
};

function explorerTxUrl(explorerUrl: string | null | undefined, hash: string) {
  if (!explorerUrl) return `https://etherscan.io/tx/${hash}`;
  const base = explorerUrl.replace(/\/$/, '');
  return `${base}/tx/${hash}`;
}

function EscrowConfigInner({ chains }: { chains: AdminChain[] }) {
  const { address, isConnected, chainId: walletChainId } = useAccount();
  const { switchChainAsync } = useSwitchChain();
  const publicClient = usePublicClient();
  const { writeContractAsync } = useWriteContract();

  const [selectedChainId, setSelectedChainId] = useState<number | null>(
    chains[0]?.chainId ?? null,
  );
  const [tracked, setTracked] = useState<EscrowTrackedAddresses | null>(null);
  const [allowedMap, setAllowedMap] = useState<Record<string, boolean>>({});
  const [feeRecipient, setFeeRecipient] = useState<string>('');
  const [maxBridgeRetries, setMaxBridgeRetries] = useState<string>('—');
  const [fullStopped, setFullStopped] = useState<boolean | null>(null);
  const [paused, setPaused] = useState<boolean | null>(null);
  const [feeOnTransferEnabled, setFeeOnTransferEnabled] = useState<boolean | null>(null);
  const [walletRole, setWalletRole] = useState<string>('—');
  const [roleKey, setRoleKey] = useState('');
  const [newAddress, setNewAddress] = useState('');
  const [newAddressKind, setNewAddressKind] = useState<EscrowTrackedKind>('swapRouters');
  const [lookupPaymentId, setLookupPaymentId] = useState('');
  const [lookupRetryCount, setLookupRetryCount] = useState<string | null>(null);
  const [recentTxs, setRecentTxs] = useState<EscrowTxRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState('');

  const selectedChain = useMemo(
    () => chains.find((c) => c.chainId === selectedChainId) ?? null,
    [chains, selectedChainId],
  );

  const escrowAddress = selectedChain?.escrowAddress as Address | undefined;

  const refreshOnChain = useCallback(async () => {
    if (!publicClient || !escrowAddress || !selectedChainId) return;
    setLoading(true);
    setError('');
    try {
      const [recipient, maxRetries, stopped, isPaused, fotEnabled, role] = await Promise.all([
        publicClient.readContract({
          address: escrowAddress,
          abi: nodeRailsEscrowAbi,
          functionName: 'feeRecipient',
        }),
        publicClient.readContract({
          address: escrowAddress,
          abi: nodeRailsEscrowAbi,
          functionName: 'MAX_SETTLE_BRIDGE_RETRIES',
        }),
        publicClient.readContract({
          address: escrowAddress,
          abi: nodeRailsEscrowAbi,
          functionName: 'fullStopped',
        }),
        publicClient.readContract({
          address: escrowAddress,
          abi: nodeRailsEscrowAbi,
          functionName: 'paused',
        }),
        publicClient.readContract({
          address: escrowAddress,
          abi: nodeRailsEscrowAbi,
          functionName: 'feeOnTransferEnabled',
        }),
        address
          ? publicClient.readContract({
              address: escrowAddress,
              abi: nodeRailsEscrowAbi,
              functionName: 'getKeyRole',
              args: [address],
            })
          : Promise.resolve(null),
      ]);

      setFeeRecipient(recipient);
      setMaxBridgeRetries(String(maxRetries));
      setFullStopped(stopped);
      setPaused(isPaused);
      setFeeOnTransferEnabled(fotEnabled);
      if (role !== null) {
        setWalletRole(ESCROW_KEY_ROLE_LABELS[Number(role)] ?? `Role ${role}`);
      } else {
        setWalletRole('—');
      }

      const stored = loadEscrowTrackedAddresses(selectedChainId);
      setTracked(stored);

      const nextAllowed: Record<string, boolean> = {};
      for (const kind of Object.keys(TRACKED_LABELS) as EscrowTrackedKind[]) {
        for (const addr of stored[kind]) {
          if (!isAddress(addr)) continue;
          const key = `${kind}:${addr.toLowerCase()}`;
          const allowed = await publicClient.readContract({
            address: escrowAddress,
            abi: nodeRailsEscrowAbi,
            functionName: ALLOW_FN[kind],
            args: [addr as Address],
          });
          nextAllowed[key] = allowed;
        }
      }
      setAllowedMap(nextAllowed);
      setRecentTxs(loadRecentEscrowTxs());
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to read escrow');
    } finally {
      setLoading(false);
    }
  }, [publicClient, escrowAddress, selectedChainId, address]);

  useEffect(() => {
    refreshOnChain();
  }, [refreshOnChain]);

  const ensureWalletChain = async () => {
    if (!selectedChainId) throw new Error('Select a chain');
    if (walletChainId !== selectedChainId) {
      await switchChainAsync({ chainId: selectedChainId });
    }
  };

  const submitTx = async (label: string, fn: () => Promise<`0x${string}`>) => {
    if (!escrowAddress || !selectedChain) throw new Error('Escrow not configured for this chain');
    if (!isConnected || !address) throw new Error('Connect your admin wallet first');
    setPending(label);
    setError('');
    try {
      await ensureWalletChain();
      const hash = await fn();
      const receipt = await publicClient!.waitForTransactionReceipt({ hash });
      if (receipt.status === 'reverted') {
        throw new Error('Transaction reverted on-chain');
      }
      const record: EscrowTxRecord = {
        hash,
        label,
        chainId: selectedChain.chainId,
        at: new Date().toISOString(),
      };
      setRecentTxs(pushRecentEscrowTx(record) ?? []);
      await refreshOnChain();
    } finally {
      setPending(null);
    }
  };

  const warRoomUrl = process.env.NEXT_PUBLIC_WAR_ROOM_URL || 'http://localhost:4070';

  const addTracked = () => {
    if (!selectedChainId || !isValidAddress(newAddress)) {
      setError('Enter a valid address to track');
      return;
    }
    setTracked(addEscrowTrackedAddress(selectedChainId, newAddressKind, newAddress));
    setNewAddress('');
    void refreshOnChain();
  };

  const lookupBridgeRetries = async () => {
    if (!publicClient || !escrowAddress || !lookupPaymentId.trim()) return;
    setLookupRetryCount(null);
    try {
      const bytes32 = lookupPaymentId.startsWith('0x') && lookupPaymentId.length === 66
        ? (lookupPaymentId as `0x${string}`)
        : uuidToBytes32(lookupPaymentId.trim());
      const count = await publicClient.readContract({
        address: escrowAddress,
        abi: nodeRailsEscrowAbi,
        functionName: 'settleBridgeRetryCount',
        args: [bytes32],
      });
      setLookupRetryCount(String(count));
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Lookup failed');
    }
  };

  if (chains.length === 0) {
    return (
      <Card>
        <p className="text-sm text-[#697386]">
          No EVM chains with an escrow address. Add one on the Chains page first.
        </p>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Network"
        title="Escrow config"
        description="Connect an admin wallet to pause, full-stop, revoke a transaction key, and allow settlement tokens. Swap/bridge routers, fee, unpause, lift, and emergency withdraw stay SuperAdmin 3-of-5 in War Room."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            {isConnected && (
              <Badge variant={walletRole === 'Admin' || walletRole === 'SuperAdmin' ? 'success' : 'warning'}>
                {walletRole}
              </Badge>
            )}
            <AdminSatelliteConnect chainId={selectedChainId} />
            <Button variant="secondary" disabled={loading} onClick={() => refreshOnChain()}>
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            </Button>
          </div>
        }
      />

      {error && <Alert onDismiss={() => setError('')}>{error}</Alert>}
      {pending && <Alert tone="info">Submitting {pending}… wait for the on-chain receipt.</Alert>}

      <Card className="space-y-4">
        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <label className="text-xs font-medium text-[#697386]">Chain</label>
            <select
              className="mt-1 w-full rounded-lg border border-[#e3e8ee] px-3 py-2 text-sm"
              value={selectedChainId ?? ''}
              onChange={(e) => setSelectedChainId(Number(e.target.value))}
            >
              {chains.map((c) => (
                <option key={c.chainId} value={c.chainId}>
                  {c.displayName} ({c.chainId})
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-xs font-medium text-[#697386]">Escrow contract</label>
            <p className="mt-1 text-xs font-mono break-all text-[#0a2540]">{escrowAddress ?? '—'}</p>
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-4">
          <div>
            <p className="text-xs text-[#697386]">Fee recipient (on-chain)</p>
            <p className="text-sm font-mono break-all">{feeRecipient || '—'}</p>
          </div>
          <div>
            <p className="text-xs text-[#697386]">Max bridge retries (constant)</p>
            <p className="text-sm font-semibold">{maxBridgeRetries}</p>
          </div>
          <div>
            <p className="text-xs text-[#697386]">Paused</p>
            <Badge variant={paused ? 'warning' : 'success'}>
              {paused === null ? '—' : paused ? 'Paused' : 'Unpaused'}
            </Badge>
          </div>
          <div>
            <p className="text-xs text-[#697386]">Full stop</p>
            <Badge variant={fullStopped ? 'destructive' : 'success'}>
              {fullStopped === null ? '—' : fullStopped ? 'Stopped' : 'Active'}
            </Badge>
          </div>
          <div>
            <p className="text-xs text-[#697386]">Fee-on-transfer (contract-wide)</p>
            <Badge variant={feeOnTransferEnabled ? 'warning' : 'success'}>
              {feeOnTransferEnabled === null ? '—' : feeOnTransferEnabled ? 'On (store received)' : 'Off (exact match)'}
            </Badge>
          </div>
        </div>

        <p className="text-xs text-[#697386] border-t border-[#e3e8ee] pt-4">
          Settlement tokens: Allow/Revoke below with this Admin wallet. Swap/bridge routers and
          fee recipient are War Room 3-of-5.{' '}
          <a className="text-[#635bff] hover:underline" href={warRoomUrl} target="_blank" rel="noreferrer">
            Open NodeRails War Room
          </a>
        </p>
      </Card>

      <Card className="space-y-4">
        <h2 className="text-sm font-semibold text-[#0a2540]">Immediate halt</h2>
        <p className="text-xs text-[#697386]">
          Any Admin or any one SuperAdmin signer can pause or full-stop in one transaction. Unpause,
          lift, and emergency withdraw stay in War Room (3-of-5).
        </p>
        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            variant="secondary"
            disabled={!isConnected || !!pending}
            onClick={() => submitTx('Pause', () => writeContractAsync({
              address: escrowAddress!,
              abi: nodeRailsEscrowAbi,
              functionName: 'pause',
              chainId: selectedChainId!,
            }))}
          >
            Pause
          </Button>
          <Button
            size="sm"
            variant="destructive"
            disabled={!isConnected || !!pending}
            onClick={() => submitTx('Full stop', () => writeContractAsync({
              address: escrowAddress!,
              abi: nodeRailsEscrowAbi,
              functionName: 'fullStop',
              chainId: selectedChainId!,
            }))}
          >
            Full stop
          </Button>
          <Button
            size="sm"
            variant="secondary"
            disabled={!isConnected || !!pending}
            onClick={() => submitTx('Enable fee-on-transfer', () => writeContractAsync({
              address: escrowAddress!,
              abi: nodeRailsEscrowAbi,
              functionName: 'setFeeOnTransferEnabled',
              args: [true],
              chainId: selectedChainId!,
            }))}
          >
            Enable fee-on-transfer
          </Button>
          <Button
            size="sm"
            variant="secondary"
            disabled={!isConnected || !!pending}
            onClick={() => submitTx('Disable fee-on-transfer', () => writeContractAsync({
              address: escrowAddress!,
              abi: nodeRailsEscrowAbi,
              functionName: 'setFeeOnTransferEnabled',
              args: [false],
              chainId: selectedChainId!,
            }))}
          >
            Exact match (off)
          </Button>
          <Button
            size="sm"
            variant="secondary"
            onClick={() => window.open(warRoomUrl, '_blank', 'noreferrer')}
          >
            War Room
          </Button>
        </div>

        <div className="flex flex-wrap gap-2 items-end border-t border-[#e3e8ee] pt-4">
          <div className="flex-1 min-w-[220px]">
            <label className="text-xs text-[#697386]">Transaction key to revoke</label>
            <Input value={roleKey} placeholder="0x…" onChange={(e) => setRoleKey(e.target.value)} />
          </div>
          <Button
            disabled={!isConnected || !!pending}
            onClick={() => {
              if (!isValidAddress(roleKey)) {
                setError('Enter a valid key address');
                return;
              }
              void submitTx('Revoke TX key', () => writeContractAsync({
                address: escrowAddress!,
                abi: nodeRailsEscrowAbi,
                functionName: 'setKeyRole',
                args: [roleKey as Address, 0],
                chainId: selectedChainId!,
              }));
            }}
          >
            Revoke TX key
          </Button>
        </div>
      </Card>

      <Card className="space-y-3">
        <h2 className="text-sm font-semibold text-[#0a2540]">Bridge retry lookup</h2>
        <p className="text-xs text-[#697386]">Payment intent UUID or bytes32 — reads `settleBridgeRetryCount` on-chain.</p>
        <div className="flex flex-wrap gap-2">
          <Input
            className="flex-1 min-w-[240px]"
            value={lookupPaymentId}
            placeholder="payment intent id"
            onChange={(e) => setLookupPaymentId(e.target.value)}
          />
          <Button variant="secondary" onClick={lookupBridgeRetries}>Lookup</Button>
          {lookupRetryCount !== null && (
            <Badge variant="outline">{lookupRetryCount} / {maxBridgeRetries}</Badge>
          )}
        </div>
      </Card>

      <Card className="space-y-3">
        <h2 className="text-sm font-semibold text-[#0a2540]">Track address</h2>
        <div className="flex flex-wrap gap-2 items-end">
          <select
            className="rounded-lg border border-[#e3e8ee] px-3 py-2 text-sm"
            value={newAddressKind}
            onChange={(e) => setNewAddressKind(e.target.value as EscrowTrackedKind)}
          >
            {(Object.keys(TRACKED_LABELS) as EscrowTrackedKind[]).map((k) => (
              <option key={k} value={k}>{TRACKED_LABELS[k]}</option>
            ))}
          </select>
          <Input
            className="flex-1 min-w-[240px]"
            value={newAddress}
            placeholder="0x router or token"
            onChange={(e) => setNewAddress(e.target.value)}
          />
          <Button variant="secondary" onClick={addTracked}>Add to list</Button>
        </div>
      </Card>

      {(Object.keys(TRACKED_LABELS) as EscrowTrackedKind[]).map((kind) => (
        <Card key={kind} className="space-y-3">
          <h2 className="text-sm font-semibold text-[#0a2540]">{TRACKED_LABELS[kind]}</h2>
          {!tracked || tracked[kind].length === 0 ? (
            <p className="text-xs text-[#697386]">No addresses tracked yet. Add one above.</p>
          ) : (
            <div className="space-y-2">
              {tracked[kind].map((addr) => {
                const key = `${kind}:${addr.toLowerCase()}`;
                const allowed = allowedMap[key];
                return (
                  <div
                    key={key}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-[#e3e8ee] px-3 py-2"
                  >
                    <span className="text-xs font-mono break-all">{addr}</span>
                    <div className="flex items-center gap-2">
                      <Badge variant={allowed ? 'success' : 'outline'}>
                        {allowed === undefined ? '…' : allowed ? 'Allowed' : 'Not allowed'}
                      </Badge>
                      {kind === 'settlementTokens' ? (
                        <>
                          <Button
                            size="sm"
                            disabled={!isConnected || !!pending}
                            onClick={() => submitTx('Allow settlement token', () => writeContractAsync({
                              address: escrowAddress!,
                              abi: nodeRailsEscrowAbi,
                              functionName: 'setAllowedSettlementToken',
                              args: [addr as Address, true],
                              chainId: selectedChainId!,
                            }))}
                          >
                            Allow
                          </Button>
                          <Button
                            size="sm"
                            variant="secondary"
                            disabled={!isConnected || !!pending}
                            onClick={() => submitTx('Revoke settlement token', () => writeContractAsync({
                              address: escrowAddress!,
                              abi: nodeRailsEscrowAbi,
                              functionName: 'setAllowedSettlementToken',
                              args: [addr as Address, false],
                              chainId: selectedChainId!,
                            }))}
                          >
                            Revoke
                          </Button>
                        </>
                      ) : (
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={() => window.open(warRoomUrl, '_blank', 'noreferrer')}
                        >
                          Change in War Room
                        </Button>
                      )}
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => {
                          if (!selectedChainId) return;
                          setTracked(removeEscrowTrackedAddress(selectedChainId, kind, addr));
                        }}
                      >
                        Untrack
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </Card>
      ))}

      <Card className="space-y-3">
        <h2 className="text-sm font-semibold text-[#0a2540]">Recent transactions (this browser)</h2>
        {recentTxs.length === 0 ? (
          <p className="text-xs text-[#697386]">No transactions yet from this page.</p>
        ) : (
          <div className="space-y-2">
            {recentTxs.map((tx) => {
              const chain = chains.find((c) => c.chainId === tx.chainId);
              return (
                <div key={tx.hash} className="flex flex-wrap items-center justify-between gap-2 text-xs">
                  <span className="text-[#697386]">{tx.label}</span>
                  <a
                    className="font-mono text-[#635bff] inline-flex items-center gap-1 hover:underline"
                    href={explorerTxUrl(chain?.explorerUrl, tx.hash)}
                    target="_blank"
                    rel="noreferrer"
                  >
                    {tx.hash.slice(0, 10)}…
                    <ExternalLink className="h-3 w-3" />
                  </a>
                </div>
              );
            })}
          </div>
        )}
      </Card>
    </div>
  );
}

export default function EscrowConfigPage() {
  const { token } = useAdminAuth();
  const [chains, setChains] = useState<AdminChain[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!token) return;
    api.getChains(token).then((rows) => {
      const evm = (rows ?? []).filter(
        (c: AdminChain) =>
          (c.chainType === 'EVM' || !c.chainType)
          && c.escrowAddress
          && c.escrowAddress.length > 0,
      );
      setChains(evm);
    }).finally(() => setLoading(false));
  }, [token]);

  const wagmiChains = useMemo(
    () =>
      chains.map((c) => ({
        chainId: c.chainId,
        name: c.displayName,
        displayName: c.displayName,
        nativeCurrencySymbol: c.nativeCurrencySymbol || 'ETH',
        isTestnet: c.isTestnet,
      })),
    [chains],
  );

  if (loading) return <Spinner />;

  return (
    <AdminWalletProvider chainInputs={wagmiChains}>
      <EscrowConfigInner chains={chains} />
    </AdminWalletProvider>
  );
}

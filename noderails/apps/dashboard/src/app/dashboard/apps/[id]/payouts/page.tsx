'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { erc20Abi, formatUnits, parseUnits } from 'viem';
import { useAccount, usePublicClient, useSwitchChain, useWriteContract } from 'wagmi';
import { AlertTriangle } from 'lucide-react';
import { Select } from '@/components/ui';
import { Badge } from '@/components/ui/badge';
import { Spinner } from '@/components/ui/loading';
import { useAuth } from '@/lib/auth';
import * as api from '@/lib/api';
import { NATIVE_TOKEN_ADDRESS, isNativeToken } from '@noderails/common';
import { isEvmChainType } from '@/lib/merchant-wallet-networks';
import { PayoutActivityPanel } from './payout-activity-panel';
import { PayoutFundingBar } from './payout-funding-bar';
import { PayoutRecipientsPanel } from './payout-recipients-panel';
import { PayoutSendPanel } from './payout-send-panel';
import { payoutWalletReady } from './payout-wallet-session';
import { sameEvmAddress, type Family, type PayoutContact, type PayoutRow, type SendMode, type WorkspaceTab } from './payouts-types';

const DEPOSIT_ETH_ABI = [
  {
    type: 'function',
    name: 'depositETH',
    stateMutability: 'payable',
    inputs: [{ name: 'merchantWallet', type: 'address' }],
    outputs: [],
  },
] as const;

function familyOf(chainType?: string): Family {
  if (chainType === 'SOLANA') return 'SOLANA';
  if (chainType === 'SUI') return 'SUI';
  return 'EVM';
}

function feeOn(amount: bigint, feeBps: number): bigint {
  return (amount * BigInt(feeBps)) / 10000n;
}

function listItems(value: unknown): any[] {
  if (Array.isArray(value)) return value;
  if (value && typeof value === 'object') {
    const row = value as Record<string, unknown>;
    for (const key of ['items', 'payouts', 'schedules', 'data']) {
      if (Array.isArray(row[key])) return row[key] as any[];
    }
  }
  return [];
}

function formatRaw(raw: string | null | undefined, decimals: number): string {
  if (raw == null || raw === '') return '-';
  try {
    const formatted = formatUnits(BigInt(raw), decimals);
    const num = Number(formatted);
    if (!Number.isFinite(num)) return formatted;
    return num.toLocaleString(undefined, { maximumFractionDigits: Math.min(decimals, 6) });
  } catch {
    return '-';
  }
}

export default function AppPayoutsPage() {
  const { id } = useParams<{ id: string }>();
  const { token } = useAuth();
  const publicClient = usePublicClient();
  const { address: connectedAddress, isConnected, chainId: connectedChainId } = useAccount();
  const { switchChainAsync } = useSwitchChain();
  const { writeContractAsync, isPending: writePending } = useWriteContract();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [tab, setTab] = useState<WorkspaceTab>('send');
  const [app, setApp] = useState<any>(null);
  const [appChains, setAppChains] = useState<any[]>([]);
  const [appTokens, setAppTokens] = useState<any[]>([]);
  const [payouts, setPayouts] = useState<any[]>([]);
  const [schedules, setSchedules] = useState<any[]>([]);
  const [contacts, setContacts] = useState<PayoutContact[]>([]);
  const [funding, setFunding] = useState<any>(null);
  const [chainId, setChainId] = useState('');
  const [tokenKey, setTokenKey] = useState('native');
  const [rows, setRows] = useState<PayoutRow[]>([{ recipient: '', amount: '', email: '' }]);
  const [bookEmail, setBookEmail] = useState('');
  const [sendMode, setSendMode] = useState<SendMode>('now');
  const [onceLocal, setOnceLocal] = useState('');
  const [intervalDays, setIntervalDays] = useState('30');
  const [startLocal, setStartLocal] = useState('');
  const [bookLabel, setBookLabel] = useState('');
  const [bookWallet, setBookWallet] = useState('');
  const [csvText, setCsvText] = useState('');
  const [csvPreview, setCsvPreview] = useState<any>(null);
  const [editingContactId, setEditingContactId] = useState<string | null>(null);
  const [editLabel, setEditLabel] = useState('');

  const load = useCallback(async () => {
    if (!token || !id) return;
    setLoading(true);
    try {
      const [nextApp, chains, tokens, list, scheduleList, contactList] = await Promise.all([
        api.getApp(token, id),
        api.getAppChains(token, id),
        api.getAppTokens(token, id),
        api.getPayouts(token, { appId: id, pageSize: '50' }),
        api.getPayoutSchedules(token, { appId: id, pageSize: '50' }),
        api.getPayoutContacts(token, id, { pageSize: '100' }),
      ]);
      setApp(nextApp);
      const enabled = (Array.isArray(chains) ? chains : []).filter((c: any) => {
        const type = (c.chain ?? c)?.chainType;
        return c.isEnabled && isEvmChainType(type);
      });
      setAppChains(enabled);
      setAppTokens(Array.isArray(tokens) ? tokens : []);
      setPayouts(listItems(list));
      setSchedules(listItems(scheduleList));
      setContacts(listItems(contactList));
      setChainId((prev) => {
        const ids = new Set(
          enabled.map((c: any) => String(c.chainId ?? c.chain?.chainId)).filter(Boolean),
        );
        if (prev && ids.has(prev)) return prev;
        const first = enabled[0];
        const nextId = first?.chainId ?? first?.chain?.chainId;
        return nextId ? String(nextId) : '';
      });
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load payouts');
    } finally {
      setLoading(false);
    }
  }, [token, id]);

  useEffect(() => { void load(); }, [load]);

  const refreshPayouts = useCallback(async () => {
    if (!token || !id) return;
    try {
      const list = await api.getPayouts(token, { appId: id, pageSize: '50' });
      setPayouts(listItems(list));
    } catch {
      /* keep the last list */
    }
  }, [token, id]);

  const selectedChain = appChains.find((c) => String(c.chainId ?? c.chain?.chainId) === chainId);
  const chainMeta = selectedChain?.chain ?? selectedChain;
  const family = familyOf(chainMeta?.chainType);
  const feeBps = Number(app?.payoutFeeBps ?? 200);
  const merchantManager = chainMeta?.merchantManagerAddress as string | undefined;

  const familyWallet =
    family === 'EVM'
      ? app?.payoutWallet
      : family === 'SOLANA'
        ? app?.payoutWalletSolana ?? app?.payoutWallet
        : app?.payoutWalletSui ?? app?.payoutWallet;

  const familyAuthActive =
    family === 'EVM'
      ? Boolean(app?.payoutAuthActive)
      : family === 'SOLANA'
        ? Boolean(app?.payoutAuthSolanaActive)
        : Boolean(app?.payoutAuthSuiActive);

  const chainTokens = appTokens.filter((t: any) => {
    const tok = t.supportedToken ?? t;
    return String(tok.chainId) === chainId;
  });

  const selectedToken = tokenKey === 'native'
    ? null
    : chainTokens.find((t: any) => (t.supportedToken?.id ?? t.id) === tokenKey);

  const decimals = selectedToken
    ? Number((selectedToken.supportedToken ?? selectedToken).decimals ?? 18)
    : family === 'SOLANA' || family === 'SUI'
      ? 9
      : 18;

  const tokenAddress = selectedToken
    ? String((selectedToken.supportedToken ?? selectedToken).contractAddress)
    : family === 'SOLANA'
      ? '11111111111111111111111111111111'
      : family === 'SUI'
        ? '0x2::sui::SUI'
        : NATIVE_TOKEN_ADDRESS;

  const tokenSymbol = selectedToken
    ? String((selectedToken.supportedToken ?? selectedToken).symbol ?? 'Token')
    : (funding?.walletNative?.symbol ?? 'ETH');

  const nativeSymbol = funding?.walletNative?.symbol ?? 'ETH';

  const refreshFunding = useCallback(async () => {
    if (!token || !id || !chainId) return;
    try {
      setFunding(await api.getPayoutFunding(token, id, chainId));
    } catch {
      setFunding(null);
    }
  }, [token, id, chainId]);

  useEffect(() => { void refreshFunding(); }, [refreshFunding, familyWallet]);

  useEffect(() => {
    if (family !== 'EVM') {
      setRows((prev) => (prev.length > 1 ? [prev[0]!] : prev));
      setTokenKey('native');
    }
    if (family === 'SUI') setSendMode('now');
  }, [family]);

  const familyContacts = contacts.filter((c) => String(c.family) === family);

  const atomicTotal = useMemo(() => {
    try {
      return rows.reduce((sum, row) => {
        if (!row.amount.trim()) return sum;
        return sum + parseUnits(row.amount.trim(), decimals);
      }, 0n);
    } catch {
      return 0n;
    }
  }, [rows, decimals]);

  const feeAmount = feeOn(atomicTotal, feeBps);
  const merchantPays = atomicTotal + feeAmount;

  const selectedFundingToken = funding?.tokens?.find((t: any) =>
    String(t.contractAddress).toLowerCase() === tokenAddress.toLowerCase(),
  );

  const allowanceOk = isNativeToken(tokenAddress)
    ? true
    : selectedFundingToken?.allowanceRaw
      ? BigInt(selectedFundingToken.allowanceRaw) >= merchantPays
      : false;

  const nativeCovered = isNativeToken(tokenAddress)
    ? (funding?.merchantManagerEth ? BigInt(funding.merchantManagerEth) >= merchantPays : false)
    : true;

  const covered = isNativeToken(tokenAddress) ? nativeCovered : allowanceOk;
  const onContractRaw = funding?.merchantManagerEth ? BigInt(funding.merchantManagerEth) : 0n;
  const coverageNeeded = isNativeToken(tokenAddress)
    ? formatUnits(merchantPays > onContractRaw ? merchantPays - onContractRaw : merchantPays, 18)
    : formatUnits(merchantPays, decimals);

  const needLine = atomicTotal > 0n
    ? [
        `This payout needs ${formatUnits(merchantPays, decimals)} ${tokenSymbol} (${formatUnits(atomicTotal, decimals)} + ${formatUnits(feeAmount, decimals)} fee).`,
        isNativeToken(tokenAddress)
          ? (nativeCovered ? 'On-contract balance covers it.' : `Add more ${nativeSymbol} to the contract.`)
          : (allowanceOk ? 'Approved amount covers it.' : 'Increase approval first.'),
      ].join(' ')
    : null;

  const writeErrorMessage = (err: unknown, fallback: string): string => {
    const raw =
      err && typeof err === 'object' && 'shortMessage' in err
        ? String((err as { shortMessage?: string }).shortMessage ?? '')
        : err instanceof Error
          ? err.message
          : '';
    if (raw.includes('Connector not connected')) {
      return 'Connect the payout wallet to approve or deposit.';
    }
    return raw || fallback;
  };

  const requireConnectedPayoutWallet = () => {
    if (!familyWallet) {
      throw new Error('Save a payout wallet in Settings → Wallets first.');
    }
    if (!isConnected || !connectedAddress) {
      throw new Error('Connect the payout wallet to approve or deposit.');
    }
    if (!sameEvmAddress(connectedAddress, familyWallet)) {
      throw new Error(
        `Switch to the payout wallet ${familyWallet} in your wallet, then try again.`,
      );
    }
  };

  const ensureEvmChain = async () => {
    requireConnectedPayoutWallet();
    const numeric = Number(chainId);
    if (!Number.isFinite(numeric)) {
      throw new Error('Select a chain first');
    }
    if (connectedChainId !== numeric) {
      await switchChainAsync({ chainId: numeric });
    }
  };

  const waitAndRefreshFunding = async (hash: `0x${string}`) => {
    if (publicClient) {
      await publicClient.waitForTransactionReceipt({ hash });
    }
    await refreshFunding();
  };

  const depositNative = async (amount: string) => {
    try {
      if (!merchantManager || !familyWallet) {
        throw new Error('Save a payout wallet in Settings → Wallets first.');
      }
      setError('');
      await ensureEvmChain();
      const value = parseUnits(amount, 18);
      if (value <= 0n) throw new Error('Enter an amount greater than zero');
      const hash = await writeContractAsync({
        address: merchantManager as `0x${string}`,
        abi: DEPOSIT_ETH_ABI,
        functionName: 'depositETH',
        args: [familyWallet as `0x${string}`],
        value,
      });
      await waitAndRefreshFunding(hash);
    } catch (err: unknown) {
      const message = writeErrorMessage(err, 'Deposit failed');
      setError(message);
      throw new Error(message);
    }
  };

  const approveToken = async (amount: string) => {
    try {
      if (!merchantManager || !selectedToken) throw new Error('Select a token first');
      setError('');
      await ensureEvmChain();
      const parsed = parseUnits(amount, decimals);
      if (parsed <= 0n) throw new Error('Enter an amount greater than zero');
      const tokenAddr = (selectedToken.supportedToken ?? selectedToken).contractAddress as `0x${string}`;
      const hash = await writeContractAsync({
        address: tokenAddr,
        abi: erc20Abi,
        functionName: 'approve',
        args: [merchantManager as `0x${string}`, parsed],
      });
      await waitAndRefreshFunding(hash);
    } catch (err: unknown) {
      const message = writeErrorMessage(err, 'Approve failed');
      setError(message);
      throw new Error(message);
    }
  };

  const validLines = rows.filter((r) => r.recipient.trim() && r.amount.trim());

  const send = async () => {
    if (!token || !id) return;
    setSaving(true);
    setError('');
    try {
      const lines = validLines.map((r) => ({
        recipient: r.recipient.trim(),
        amount: r.amount.trim(),
        ...(r.email?.trim() ? { email: r.email.trim() } : {}),
      }));
      if (!lines.length) throw new Error('Add at least one recipient');
      if (sendMode === 'now' && family === 'EVM' && !covered) {
        throw new Error(
          isNativeToken(tokenAddress)
            ? `Add more ${nativeSymbol} to the contract before sending.`
            : `Approve at least ${formatUnits(merchantPays, decimals)} ${tokenSymbol} before sending.`,
        );
      }
      let created: { status?: string; error?: string } | null = null;
      if (sendMode === 'recurring') {
        const days = Number(intervalDays);
        await api.createPayoutSchedule(token, {
          appId: id,
          chain: chainId,
          tokenAddress,
          lines,
          intervalDays: days,
          ...(startLocal ? { startAt: new Date(startLocal).toISOString() } : {}),
        });
      } else {
        created = await api.createPayout(token, {
          appId: id,
          chain: chainId,
          tokenAddress,
          amountUsd: '0',
          lines,
          executeNow: sendMode === 'now',
          ...(sendMode === 'once' && onceLocal
            ? { scheduledAt: new Date(onceLocal).toISOString() }
            : {}),
        });
      }
      setTab('activity');
      setRows([{ recipient: '', amount: '', email: '' }]);
      await load();
      if (created?.status === 'FAILED') {
        throw new Error(created.error || 'Payout failed on-chain');
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Send failed');
    } finally {
      setSaving(false);
    }
  };

  const addContact = async () => {
    if (!token || !id) return;
    setError('');
    try {
      await api.createPayoutContact(token, id, {
        label: bookLabel,
        wallet: bookWallet,
        family,
        ...(bookEmail.trim() ? { email: bookEmail.trim() } : {}),
      });
      setBookLabel('');
      setBookWallet('');
      setBookEmail('');
      const list = await api.getPayoutContacts(token, id, { pageSize: '100' });
      setContacts(listItems(list));
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Could not save contact');
    }
  };

  const removeContact = async (contactId: string) => {
    if (!token || !id) return;
    try {
      await api.deletePayoutContact(token, id, contactId);
      setContacts((prev) => prev.filter((c) => c.id !== contactId));
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Could not delete contact');
    }
  };

  const renameContact = async (contactId: string) => {
    if (!token || !id) return;
    setError('');
    try {
      const updated = await api.updatePayoutContact(token, id, contactId, { label: editLabel });
      setContacts((prev) => prev.map((c) => (c.id === contactId ? updated : c)));
      setEditingContactId(null);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Could not rename contact');
    }
  };

  const runExecute = async (payoutId: string) => {
    if (!token) return;
    setSaving(true);
    setError('');
    try {
      await api.executePayout(token, payoutId);
      await load();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Execute failed');
    } finally {
      setSaving(false);
    }
  };

  const familyForPayout = (p: any): Family => {
    const row = appChains.find((c) => String(c.chainId ?? c.chain?.chainId) === String(p.chain));
    if (row) return familyOf((row.chain ?? row)?.chainType);
    if (String(p.tokenAddress ?? '').includes('::sui::')) return 'SUI';
    return 'EVM';
  };

  const decimalsForPayout = (p: any): number => {
    const fam = familyForPayout(p);
    if (isNativeToken(p.tokenAddress)) return fam === 'EVM' ? 18 : 9;
    const tok = appTokens.find((t: any) => {
      const st = t.supportedToken ?? t;
      return String(st.chainId ?? t.chainId) === String(p.chain)
        && String(st.contractAddress).toLowerCase() === String(p.tokenAddress).toLowerCase();
    });
    return Number((tok?.supportedToken ?? tok)?.decimals ?? (fam === 'EVM' ? 18 : 9));
  };

  const tokenLabelForPayout = (p: any): string => {
    if (isNativeToken(p.tokenAddress)) {
      const row = appChains.find((c) => String(c.chainId ?? c.chain?.chainId) === String(p.chain));
      const meta = row?.chain ?? row;
      return String(meta?.nativeCurrencySymbol ?? meta?.nativeCurrency?.symbol ?? 'ETH');
    }
    const tok = appTokens.find((t: any) => {
      const st = t.supportedToken ?? t;
      return String(st.chainId ?? t.chainId) === String(p.chain)
        && String(st.contractAddress).toLowerCase() === String(p.tokenAddress).toLowerCase();
    });
    return String((tok?.supportedToken ?? tok)?.symbol ?? 'token');
  };

  const formatAtomic = (amount: string, dec: number): string => {
    try {
      return formatUnits(BigInt(amount), dec);
    } catch {
      return amount;
    }
  };

  const previewCsv = async () => {
    if (!token || !id) return;
    setError('');
    try {
      const result = await api.importPayoutCsv(token, id, {
        csv: csvText,
        family,
        saveToAddressBook: false,
      });
      setCsvPreview(result);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'CSV parse failed');
    }
  };

  const applyCsv = async (saveBook: boolean) => {
    if (!token || !id) return;
    setError('');
    try {
      const result = await api.importPayoutCsv(token, id, {
        csv: csvText,
        family,
        saveToAddressBook: saveBook,
      });
      setCsvPreview(result);
      const withAmount = (result.lines ?? []).filter((l: any) => l.amount);
      if (withAmount.length) {
        if (family !== 'EVM' && withAmount.length > 1) {
          setError('Solana and Sui support one recipient per payout. Using the first CSV row.');
          setRows([{ recipient: withAmount[0].wallet, amount: withAmount[0].amount, email: withAmount[0].email ?? '' }]);
        } else {
          setRows(withAmount.map((l: any) => ({ recipient: l.wallet, amount: l.amount, email: l.email ?? '' })));
        }
        if (!saveBook) setTab('send');
      }
      if (saveBook) {
        const list = await api.getPayoutContacts(token, id, { pageSize: '100' });
        setContacts(listItems(list));
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'CSV import failed');
    }
  };

  if (loading) return <Spinner />;

  const tabs: Array<{ id: WorkspaceTab; label: string }> = [
    { id: 'send', label: 'Send' },
    { id: 'recipients', label: 'Recipients' },
    { id: 'activity', label: 'Activity' },
  ];

  const walletTokenHuman = selectedFundingToken?.balanceFormatted
    ?? (selectedFundingToken?.balanceRaw
      ? formatUnits(BigInt(selectedFundingToken.balanceRaw), decimals)
      : '');

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">Payouts</h1>
          <p className="mt-1 text-xs text-muted-foreground">
            Approve once, then send or schedule. {feeBps / 100}% platform fee is added on top.
          </p>
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <div className="w-[168px]">
            <Select
              label="Chain"
              className="!py-2 !text-xs"
              value={chainId}
              onChange={(e) => { setChainId(e.target.value); setTokenKey('native'); }}
              options={[
                { value: '', label: 'Select chain' },
                ...appChains.map((row: any) => {
                  const c = row.chain ?? row;
                  return { value: String(c.chainId), label: String(c.name ?? c.chainId) };
                }),
              ]}
            />
          </div>
          <div className="w-[128px]">
            <Select
              label="Token"
              className="!py-2 !text-xs"
              value={tokenKey}
              onChange={(e) => setTokenKey(e.target.value)}
              options={[
                { value: 'native', label: nativeSymbol },
                ...(family === 'EVM'
                  ? chainTokens.map((t: any) => {
                      const tok = t.supportedToken ?? t;
                      return { value: tok.id, label: tok.symbol };
                    })
                  : []),
              ]}
            />
          </div>
        </div>
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      {!familyAuthActive && (
        <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-600" />
          <p className="text-xs text-amber-950">
            Authorize the payout wallet in{' '}
            <Link className="font-medium underline underline-offset-2" href={`/dashboard/apps/${id}/settings?tab=wallets`}>
              Settings → Wallets
            </Link>{' '}
            before sending. Token approval is separate.
          </p>
        </div>
      )}

      {family === 'EVM' && (
        <PayoutFundingBar
          isNative={isNativeToken(tokenAddress)}
          tokenSymbol={tokenSymbol}
          nativeSymbol={nativeSymbol}
          approvedFormatted={formatRaw(selectedFundingToken?.allowanceRaw, decimals)}
          walletTokenFormatted={
            selectedFundingToken?.balanceFormatted
              ?? formatRaw(selectedFundingToken?.balanceRaw, decimals)
          }
          walletNativeFormatted={
            funding?.walletNative?.balanceFormatted
              ?? formatRaw(funding?.walletNative?.balanceRaw, funding?.walletNative?.decimals ?? 18)
          }
          onContractFormatted={formatRaw(funding?.merchantManagerEth, 18)}
          walletTokenHuman={walletTokenHuman}
          writePending={writePending}
          canWrite={Boolean(merchantManager && familyWallet)}
          walletReady={payoutWalletReady(connectedAddress, familyWallet)}
          appEnv={app?.environment === 'PRODUCTION' ? 'PRODUCTION' : 'TEST'}
          payoutWallet={familyWallet}
          onRefresh={() => void refreshFunding()}
          onApprove={approveToken}
          onDeposit={depositNative}
        />
      )}

      {familyWallet && (
        <p className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          Paying from{' '}
          <span className="max-w-[16rem] truncate font-mono text-foreground/80" title={familyWallet}>
            {familyWallet}
          </span>
          {familyAuthActive && <Badge variant="success">Authorized</Badge>}
        </p>
      )}

      <div className="rounded-xl border border-border bg-card shadow-sm">
        <div className="flex gap-1 border-b border-border px-4 pt-1.5">
          {tabs.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setTab(item.id)}
              className={`relative px-3 py-2.5 text-[13px] font-medium transition-colors ${
                tab === item.id
                  ? 'text-foreground'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {item.label}
              {tab === item.id && (
                <span className="absolute inset-x-2 bottom-0 h-0.5 rounded-full bg-primary" />
              )}
            </button>
          ))}
        </div>
        <div className="px-5 py-4">
          {tab === 'send' && (
            <PayoutSendPanel
              family={family}
              rows={rows}
              onRowsChange={setRows}
              contacts={familyContacts}
              sendMode={sendMode}
              onSendModeChange={setSendMode}
              onceLocal={onceLocal}
              onOnceLocalChange={setOnceLocal}
              intervalDays={intervalDays}
              onIntervalDaysChange={setIntervalDays}
              startLocal={startLocal}
              onStartLocalChange={setStartLocal}
              tokenSymbol={tokenSymbol}
              nativeSymbol={nativeSymbol}
              isNative={isNativeToken(tokenAddress)}
              recipientsTotal={atomicTotal > 0n ? formatUnits(atomicTotal, decimals) : ''}
              feeTotal={atomicTotal > 0n ? formatUnits(feeAmount, decimals) : ''}
              merchantPaysTotal={atomicTotal > 0n ? formatUnits(merchantPays, decimals) : ''}
              availableFormatted={
                isNativeToken(tokenAddress)
                  ? formatRaw(funding?.merchantManagerEth, 18)
                  : formatRaw(selectedFundingToken?.allowanceRaw, decimals)
              }
              coverageNeeded={coverageNeeded}
              needLine={needLine}
              covered={covered}
              saving={saving}
              writePending={writePending}
              walletReady={payoutWalletReady(connectedAddress, familyWallet)}
              appEnv={app?.environment === 'PRODUCTION' ? 'PRODUCTION' : 'TEST'}
              payoutWallet={familyWallet}
              canSend={Boolean(familyAuthActive && familyWallet && chainId && validLines.length)}
              onSend={() => void send()}
              onApprove={approveToken}
              onDeposit={depositNative}
              csvText={csvText}
              onCsvTextChange={setCsvText}
              csvPreview={csvPreview}
              onPreviewCsv={() => void previewCsv()}
              onApplyCsv={(saveBook) => void applyCsv(saveBook)}
            />
          )}
          {tab === 'recipients' && (
            <PayoutRecipientsPanel
              contacts={familyContacts}
              bookLabel={bookLabel}
              bookWallet={bookWallet}
              bookEmail={bookEmail}
              onBookLabelChange={setBookLabel}
              onBookWalletChange={setBookWallet}
              onBookEmailChange={setBookEmail}
              onAdd={() => void addContact()}
              onRemove={(contactId) => void removeContact(contactId)}
              editingId={editingContactId}
              editLabel={editLabel}
              onStartEdit={(contactId, label) => { setEditingContactId(contactId); setEditLabel(label); }}
              onEditLabelChange={setEditLabel}
              onSaveEdit={(contactId) => void renameContact(contactId)}
              csvText={csvText}
              onCsvTextChange={setCsvText}
              csvPreview={csvPreview}
              onPreviewCsv={() => void previewCsv()}
              onImportToBook={() => void applyCsv(true)}
            />
          )}
          {tab === 'activity' && (
            <PayoutActivityPanel
              schedules={schedules}
              payouts={payouts}
              contacts={contacts}
              saving={saving}
              formatAtomic={formatAtomic}
              familyForPayout={familyForPayout}
              decimalsForPayout={decimalsForPayout}
              tokenLabelForPayout={tokenLabelForPayout}
              onPause={(scheduleId) => { void api.pausePayoutSchedule(token!, scheduleId).then(load); }}
              onResume={(scheduleId) => { void api.resumePayoutSchedule(token!, scheduleId).then(load); }}
              onCancelSchedule={(scheduleId) => { void api.cancelPayoutSchedule(token!, scheduleId).then(load); }}
              onExecute={(payoutId) => runExecute(payoutId)}
              onCancelPayout={async (payoutId) => {
                if (!token) return;
                await api.cancelPayout(token, payoutId);
                await load();
              }}
              onRefreshPayouts={refreshPayouts}
            />
          )}
        </div>
      </div>
    </div>
  );
}

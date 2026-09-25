'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAccount, useSignTypedData } from 'wagmi';
import * as api from '@/lib/api';
import { Input, Select, Toggle } from '@/components/ui';
import { Badge } from '@/components/ui/badge';
import { StatusBadge as SharedStatusBadge } from '@/components/status-badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Spinner } from '@/components/ui/loading';
import { MerchantWalletConnect } from '@/components/merchant-wallet-connect';
import { isValidAddress, isNativeToken } from '@noderails/common';
import Link from 'next/link';
import { HelpTip, TipWrap } from './settings-help';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

type SetupDialog = 'conversion' | 'singleChain' | 'bank' | 'bankAuth' | null;

type TokenRow = {
  tokenKey?: string;
  symbol?: string;
  contractAddress?: string;
  chainId?: number;
  chain?: { chainType?: string; name?: string };
};

function isErc20Token(t: TokenRow) {
  return !isNativeToken(t.contractAddress);
}

function convertAssetOptions(tokens: TokenRow[]) {
  const bySymbol = new Map<string, TokenRow>();
  for (const t of tokens) {
    if (!isErc20Token(t)) continue;
    const symbol = (t.symbol ?? t.tokenKey ?? '').trim();
    if (!symbol) continue;
    const key = symbol.toUpperCase();
    const existing = bySymbol.get(key);
    if (!existing || (t.chainId ?? 999999) < (existing.chainId ?? 999999)) {
      bySymbol.set(key, t);
    }
  }
  return [...bySymbol.values()].sort((a, b) =>
    (a.symbol ?? '').localeCompare(b.symbol ?? ''),
  );
}

function convertDraftTokenKey(
  targetTokenKey: string | undefined,
  assets: TokenRow[],
  all: TokenRow[],
) {
  const current = all.find((t) => t.tokenKey === targetTokenKey);
  const symbol = current?.symbol;
  if (!symbol) return targetTokenKey ?? '';
  const match = assets.find((t) => t.symbol?.toUpperCase() === symbol.toUpperCase());
  return match?.tokenKey ?? targetTokenKey ?? '';
}

function tokenOptionLabel(t: { symbol?: string; tokenKey?: string; chain?: { name?: string } }) {
  const chain = t.chain?.name;
  return chain ? `${t.symbol} · ${chain}` : `${t.symbol ?? t.tokenKey}`;
}

function evmWallet(value: unknown): string {
  return typeof value === 'string' && isValidAddress(value) ? value : '';
}

function currentSettleWallet(config: any): string {
  return evmWallet(config?.settlementWalletAddress) || evmWallet(config?.receivingWallet);
}

function shortWallet(address: string) {
  if (address.length <= 12) return address;
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

function FeatureRow({
  title,
  description,
  checked,
  disabled,
  disabledHint,
  saving,
  summary,
  onEdit,
  onCheckedChange,
}: {
  title: string;
  description: string;
  checked: boolean;
  disabled?: boolean;
  disabledHint?: string;
  saving: boolean;
  summary?: string | null;
  onEdit?: () => void;
  onCheckedChange: (on: boolean) => void;
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 pr-2">
          <h3 className="text-[13px] font-semibold text-foreground">{title}</h3>
          <p className="mt-0.5 text-[12px] leading-snug text-foreground/75">{description}</p>
          {checked && summary ? (
            <p className="mt-2 text-[13px] font-medium text-foreground">{summary}</p>
          ) : null}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {checked && onEdit ? (
            <Button type="button" size="sm" variant="ghost" className="h-7 px-2 text-[11px]" onClick={onEdit}>
              Change
            </Button>
          ) : null}
          <TipWrap
            disabled={!!disabled}
            content={disabledHint ?? ''}
          >
            <Toggle
              checked={checked}
              disabled={saving || disabled}
              onChange={onCheckedChange}
            />
          </TipWrap>
        </div>
      </div>
    </div>
  );
}

export function SettlementSection({
  appId,
  token,
  environment,
  appName,
}: {
  appId: string;
  token: string | null;
  environment: 'TEST' | 'PRODUCTION';
  appName: string;
}) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [config, setConfig] = useState<any>(null);
  const [chains, setChains] = useState<any[]>([]);
  const [tokens, setTokens] = useState<any[]>([]);
  const [balance, setBalance] = useState<any>(null);
  const [bankRows, setBankRows] = useState<any[]>([]);
  const [authPrepare, setAuthPrepare] = useState<any>(null);
  const [withdrawDest, setWithdrawDest] = useState('');
  const [beneficiary, setBeneficiary] = useState({
    country: '',
    destinationType: 'bank_account',
    beneficiaryType: 'business',
    name: '',
  });
  const [dialog, setDialog] = useState<SetupDialog>(null);
  const [dialogError, setDialogError] = useState('');
  const [draftTarget, setDraftTarget] = useState('');
  const [draftChainId, setDraftChainId] = useState('');
  const [draftSettleToken, setDraftSettleToken] = useState('');
  const [draftSettleWallet, setDraftSettleWallet] = useState('');
  const [changingWallet, setChangingWallet] = useState(false);
  const [authorizedWallet, setAuthorizedWallet] = useState('');
  const { signTypedDataAsync } = useSignTypedData();
  const { address: connectedWallet } = useAccount();

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const [cfg, availableChains, availableTokens, held, rows] = await Promise.all([
        api.getSettlementConfig(token, appId),
        api.getAvailableChains(token, environment),
        api.getAvailableTokens(token, environment),
        api.getSettlementBalance(token, appId).catch(() => null),
        api.listBankSettlements(token, appId).catch(() => []),
      ]);
      setConfig(cfg);
      setChains((availableChains ?? []).filter((c: any) => c.chainType === 'EVM'));
      setTokens(availableTokens ?? []);
      setBalance(held);
      setBankRows(Array.isArray(rows) ? rows : []);
      if (cfg?.bloxfiCountry) {
        setBeneficiary((b) => ({ ...b, country: cfg.bloxfiCountry ?? b.country }));
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load settlement settings');
    } finally {
      setLoading(false);
    }
  }, [token, appId, environment]);

  useEffect(() => { load(); }, [load]);

  const save = async (patch: Record<string, unknown>) => {
    if (!token) return null;
    setSaving(true);
    setError('');
    setDialogError('');
    try {
      const next = await api.updateSettlementConfig(token, appId, patch);
      setConfig((prev: any) => ({
        ...next,
        ownAccountVerified: next.ownAccountVerified ?? prev?.ownAccountVerified,
        receivingWallet: next.receivingWallet ?? prev?.receivingWallet,
      }));
      return next;
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to save settlement settings';
      if (dialog) setDialogError(message);
      else setError(message);
      return null;
    } finally {
      setSaving(false);
    }
  };

  const evmErc20 = useMemo(
    () =>
      tokens.filter((t: TokenRow) => {
        const chain = chains.find((c) => c.chainId === t.chainId);
        const isEvm = chain?.chainType === 'EVM' || t.chain?.chainType === 'EVM';
        return isEvm && isErc20Token(t);
      }),
    [tokens, chains],
  );
  const convertAssets = useMemo(() => convertAssetOptions(evmErc20), [evmErc20]);

  const draftSettleTokens = useMemo(() => {
    if (!draftChainId) return evmErc20;
    return evmErc20.filter((t: TokenRow) => String(t.chainId) === draftChainId);
  }, [draftChainId, evmErc20]);

  const closeDialog = () => {
    setDialog(null);
    setDialogError('');
    setAuthPrepare(null);
    setChangingWallet(false);
    setAuthorizedWallet('');
  };

  const openConversion = () => {
    setDraftTarget(convertDraftTokenKey(config?.targetTokenKey, convertAssets, evmErc20));
    setDialogError('');
    setDialog('conversion');
  };

  const openSingleChain = () => {
    const current = currentSettleWallet(config);
    setDraftChainId(config?.settlementChainId ? String(config.settlementChainId) : '');
    setDraftSettleToken(
      evmErc20.some((t) => t.tokenKey === config?.settlementTokenKey)
        ? (config?.settlementTokenKey ?? '')
        : '',
    );
    setDraftSettleWallet(current);
    setChangingWallet(!current && !config?.bankSettlementEnabled);
    setAuthorizedWallet('');
    setDialogError('');
    setDialog('singleChain');
  };

  const openBank = () => {
    setDialogError('');
    setDialog('bank');
  };

  const confirmConversion = async () => {
    if (!draftTarget) {
      setDialogError('Choose the token you want to receive.');
      return;
    }
    const next = await save({ conversionEnabled: true, targetTokenKey: draftTarget });
    if (next) closeDialog();
  };

  const confirmSingleChain = async () => {
    if (!draftChainId || !draftSettleToken) {
      setDialogError('Choose a settlement chain and token.');
      return;
    }
    const current = currentSettleWallet(config);
    if (changingWallet && !authorizedWallet) {
      setDialogError('Connect and authorize the new wallet, or keep the current one.');
      return;
    }
    const wallet = changingWallet ? authorizedWallet : current;
    if (!config?.bankSettlementEnabled && !wallet) {
      setDialogError('Connect and authorize a wallet on that chain.');
      return;
    }
    const next = await save({
      singleChainSettlementEnabled: true,
      settlementChainId: Number(draftChainId),
      settlementTokenKey: draftSettleToken,
      settlementWalletAddress: wallet || null,
    });
    if (next) closeDialog();
  };

  const confirmBank = async () => {
    const currency = (config?.bankPayoutCurrency ?? '').trim().toUpperCase();
    if (!currency) {
      setDialogError('Enter a payout currency (for example USD).');
      return;
    }
    if (!config?.ownAccountVerified) {
      setDialogError('Connect and verify your own bank account first.');
      return;
    }
    const next = await save({
      bankSettlementEnabled: true,
      bankPayoutCurrency: currency,
    });
    if (next) closeDialog();
  };

  const startBankSettlement = async () => {
    if (!token) return;
    setSaving(true);
    setError('');
    try {
      await api.createBankSettlement(token, appId);
      await load();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to create bank settlement');
    } finally {
      setSaving(false);
    }
  };

  const openBankAuth = async () => {
    if (!token) return;
    setSaving(true);
    setError('');
    setDialogError('');
    try {
      const prepared = await api.prepareBankSettlementAuth(token, appId);
      setAuthPrepare(prepared);
      setDialog('bankAuth');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to prepare bank authorization');
    } finally {
      setSaving(false);
    }
  };

  const expectedBankWallet = String(authPrepare?.merchant ?? balance?.merchant ?? '');
  const bankWalletMatches = Boolean(
    connectedWallet
    && expectedBankWallet
    && connectedWallet.toLowerCase() === expectedBankWallet.toLowerCase(),
  );

  const submitBankAuth = async () => {
    if (!token || !authPrepare?.typedData) return;
    if (!bankWalletMatches) {
      setDialogError('Connect the merchant wallet shown here, then sign.');
      return;
    }
    setSaving(true);
    setDialogError('');
    try {
      const td = authPrepare.typedData;
      const signature = await signTypedDataAsync({
        domain: td.domain,
        types: td.types,
        primaryType: td.primaryType,
        message: {
          ...td.message,
          validUntil: BigInt(td.message.validUntil),
        },
      });
      await api.attachBankSettlementAuth(token, appId, signature, authPrepare.validUntil);
      closeDialog();
      await load();
    } catch (err: unknown) {
      setDialogError(err instanceof Error ? err.message : 'Bank authorization failed');
    } finally {
      setSaving(false);
    }
  };

  const withdraw = async () => {
    if (!token || !isValidAddress(withdrawDest)) {
      setError('Enter a valid EVM destination address');
      return;
    }
    setSaving(true);
    setError('');
    try {
      await api.executeSettlementWithdraw(token, appId, { destination: withdrawDest });
      await load();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Withdraw failed');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <Spinner />;
  if (!config) return <p className="text-[13px] text-foreground/80">Unable to load settlement settings.</p>;

  const conversionOn = !!config.conversionEnabled;
  const singleOn = !!config.singleChainSettlementEnabled;
  const bankOn = !!config.bankSettlementEnabled;

  const targetTok = evmErc20.find((t: TokenRow) => t.tokenKey === config.targetTokenKey);
  const settleTok = evmErc20.find((t: TokenRow) => t.tokenKey === config.settlementTokenKey);
  const settleChain = chains.find((c: any) => c.chainId === config.settlementChainId);
  const conversionSummary = conversionOn
    ? (targetTok?.symbol ?? config.targetTokenKey)
    : null;
  const liveWallet = currentSettleWallet(config);
  const singleSummary = singleOn
    ? [
        settleChain?.displayName ?? settleChain?.name,
        settleTok?.symbol ?? config.settlementTokenKey,
        liveWallet ? shortWallet(liveWallet) : null,
      ].filter(Boolean).join(' · ')
    : null;
  const bankSummary = bankOn
    ? [config.bankPayoutCurrency, beneficiary.country, beneficiary.name].filter(Boolean).join(' · ')
    : null;

  const conversionChecked = conversionOn || dialog === 'conversion';
  const singleChecked = singleOn || dialog === 'singleChain';
  const bankChecked = bankOn || dialog === 'bank';

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[13px] font-semibold text-foreground">How funds settle</p>
          <p className="mt-0.5 text-[13px] text-foreground/80">
            Payments settle in the token and chain the customer paid, unless you enable conversion, one chain, or bank.
          </p>
        </div>
        <HelpTip content="Enable convert first, then one chain, then bank. Convert target is an ERC-20, not native ETH." />
      </div>
      {error && (
        <p className="text-sm text-destructive">{error}</p>
      )}

      <FeatureRow
        title="Convert to one token"
        description="Swap whatever the customer pays into one ERC-20 or Stablecoins at capture"
        checked={conversionChecked}
        saving={saving}
        summary={conversionSummary}
        onEdit={conversionOn ? openConversion : undefined}
        onCheckedChange={(on) => {
          if (on) openConversion();
          else {
            closeDialog();
            void save({
              conversionEnabled: false,
              singleChainSettlementEnabled: false,
              bankSettlementEnabled: false,
            });
          }
        }}
      />

      <FeatureRow
        title="Settle on one chain"
        description="After conversion, bridge/settle everything onto one network of your choice"
        checked={singleChecked}
        disabled={!conversionOn}
        disabledHint="Turn on Convert to one token first, and choose the target token in the window that opens."
        saving={saving}
        summary={singleSummary}
        onEdit={singleOn ? openSingleChain : undefined}
        onCheckedChange={(on) => {
          if (on) openSingleChain();
          else {
            closeDialog();
            void save({
              singleChainSettlementEnabled: false,
              bankSettlementEnabled: false,
            });
          }
        }}
      />

      <FeatureRow
        title="Pay out to bank"
        description="Settle to bank account"
        checked={bankChecked}
        disabled={!conversionOn || !singleOn || !config.ownAccountVerified}
        disabledHint={
          !config.ownAccountVerified
            ? 'Verify a bank account on the Bank page first.'
            : 'Enable convert and one chain first.'
        }
        saving={saving}
        summary={bankSummary}
        onEdit={bankOn ? openBank : undefined}
        onCheckedChange={(on) => {
          if (on) openBank();
          else {
            closeDialog();
            void save({ bankSettlementEnabled: false });
          }
        }}
      />
      {!config.ownAccountVerified && (
        <p className="text-[12px] text-foreground/70">
          Bank payouts need a verified own account.{' '}
          <Link href="/dashboard/bank" className="font-medium text-primary underline-offset-2 hover:underline">
            Open Bank
          </Link>
        </p>
      )}

      <Card className="p-4 space-y-3">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <h3 className="text-[13px] font-semibold text-foreground">Escrow balance</h3>
            <p className="mt-0.5 text-[13px] font-medium text-foreground">
              {balance?.balance ?? '0'} {balance?.tokenKey ?? ''}
            </p>
            {balance?.merchant && (
              <p className="mt-0.5 break-all text-[12px] text-foreground/70">Merchant {balance.merchant}</p>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            {balance?.bankAuthActive ? (
              <span className="text-[11px] font-medium text-emerald-800">
                Authorized until {balance.bankAuthValidUntil ? new Date(balance.bankAuthValidUntil).toLocaleDateString() : '-'}
              </span>
            ) : (
              <TipWrap
                disabled={!bankOn}
                content="Turn on Pay out to bank first, then authorize so NodeRails can send this balance (valid 1 year)."
              >
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  className="h-7 px-2.5 text-[11px]"
                  disabled={saving || !bankOn}
                  onClick={() => void openBankAuth()}
                >
                  Authorize
                </Button>
              </TipWrap>
            )}
            <TipWrap
              disabled={!balance?.bankAuthActive || BigInt(balance?.balance ?? '0') <= 0n}
              content={
                !balance?.bankAuthActive
                  ? 'Authorize first (one signature per year), then send to bank.'
                  : 'No escrow balance to send yet.'
              }
            >
              <Button
                type="button"
                size="sm"
                className="h-7 px-2.5 text-[11px]"
                disabled={saving || !balance?.bankAuthActive || BigInt(balance?.balance ?? '0') <= 0n}
                onClick={startBankSettlement}
              >
                Settle to bank
              </Button>
            </TipWrap>
          </div>
        </div>
        <div className="space-y-1.5">
          <label className="text-[12px] font-medium text-foreground/80">Withdraw leftover to a wallet</label>
          <div className="flex gap-2">
            <Input
              value={withdrawDest}
              placeholder="0x destination"
              onChange={(e) => setWithdrawDest(e.target.value)}
            />
            <Button type="button" size="sm" disabled={saving} onClick={withdraw}>Withdraw</Button>
          </div>
        </div>
        {bankRows.length > 0 && (
          <div className="space-y-1">
            {bankRows.slice(0, 5).map((row: any) => (
              <div key={row.id} className="flex items-center justify-between text-[12px]">
                <span className="text-foreground/70">{row.id.slice(0, 8)}</span>
                <SharedStatusBadge status={row.status} />
              </div>
            ))}
          </div>
        )}
      </Card>

      <Dialog open={dialog === 'conversion'} onOpenChange={(open) => { if (!open) closeDialog(); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Choose target token</DialogTitle>
            <DialogDescription className="text-foreground/75">
              New payments swap into this asset on the chain the customer paid. Native ETH is not listed.
            </DialogDescription>
          </DialogHeader>
          <Select
            value={draftTarget}
            onChange={(e) => setDraftTarget(e.target.value)}
            disabled={saving}
            options={[
              { value: '', label: 'Select token' },
              ...convertAssets.map((t: TokenRow) => ({
                value: t.tokenKey ?? '',
                label: t.symbol ?? t.tokenKey ?? '',
              })),
            ]}
          />
          {convertAssets.length === 0 && (
            <p className="text-[12px] text-foreground/70">
              Enable an ERC-20 such as USDC on a chain first. Native ETH cannot be the convert target.
            </p>
          )}
          {dialogError && <p className="text-sm text-destructive">{dialogError}</p>}
          <DialogFooter>
            <Button type="button" size="sm" variant="secondary" onClick={closeDialog}>Cancel</Button>
            <Button type="button" size="sm" disabled={saving} onClick={() => void confirmConversion()}>
              {saving ? 'Saving…' : 'Save'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={dialog === 'singleChain'} onOpenChange={(open) => { if (!open) closeDialog(); }}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Choose settlement chain</DialogTitle>
            <DialogDescription className="text-foreground/75">
              After conversion, funds move to this chain as an ERC-20. Native ETH is not a dest token. The current wallet stays unless you authorize a different one.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <label className="text-[12px] font-medium text-foreground/80">Chain</label>
              <Select
                value={draftChainId}
                onChange={(e) => {
                  setDraftChainId(e.target.value);
                  setDraftSettleToken('');
                }}
                disabled={saving}
                options={[
                  { value: '', label: 'Select chain' },
                  ...chains.map((c: any) => ({
                    value: String(c.chainId),
                    label: c.displayName ?? c.name,
                  })),
                ]}
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-[12px] font-medium text-foreground/80">Token on that chain</label>
              <Select
                value={draftSettleToken}
                onChange={(e) => setDraftSettleToken(e.target.value)}
                disabled={saving || !draftChainId}
                options={[
                  { value: '', label: 'Select token' },
                  ...draftSettleTokens.map((t: any) => ({
                    value: t.tokenKey,
                    label: tokenOptionLabel(t),
                  })),
                ]}
              />
              {draftChainId && draftSettleTokens.length === 0 && (
                <p className="text-[12px] text-foreground/70">
                  No ERC-20 on this chain. Native ETH cannot be the dest token.
                </p>
              )}
            </div>
            <div className="space-y-2">
              <label className="text-[12px] font-medium text-foreground/80">Wallet on that chain</label>
              {liveWallet && !changingWallet ? (
                <div className="space-y-2">
                  <div className="rounded-lg border border-border bg-muted/40 px-3 py-2">
                    <p className="text-[11px] text-foreground/65">Current wallet</p>
                    <p className="mt-0.5 break-all font-mono text-[13px] text-foreground">{liveWallet}</p>
                  </div>
                  <p className="text-[12px] text-foreground/70">
                    Keep this wallet, or connect a different one and sign to authorize it.
                  </p>
                  <button
                    type="button"
                    className="text-[12px] font-medium text-primary underline-offset-2 hover:underline"
                    onClick={() => {
                      setChangingWallet(true);
                      setAuthorizedWallet('');
                      setDialogError('');
                    }}
                  >
                    Use a different wallet
                  </button>
                </div>
              ) : (
                <div className="space-y-2">
                  {liveWallet && (
                    <button
                      type="button"
                      className="text-[12px] font-medium text-primary underline-offset-2 hover:underline"
                      onClick={() => {
                        setChangingWallet(false);
                        setAuthorizedWallet('');
                        setDialogError('');
                      }}
                    >
                      Keep current wallet
                    </button>
                  )}
                  <p className="text-[12px] text-foreground/70">
                    Connect the new wallet and sign. Until you do, the current wallet stays.
                  </p>
                  <MerchantWalletConnect
                    key={`settle-wallet-${changingWallet}`}
                    appName={appName}
                    appEnv={environment}
                    walletType="settlement"
                    initialFamily="EVM"
                    onVerified={(_family, address) => {
                      setAuthorizedWallet(address);
                      setDraftSettleWallet(address);
                      setDialogError('');
                    }}
                  />
                </div>
              )}
            </div>
          </div>
          {dialogError && <p className="text-sm text-destructive">{dialogError}</p>}
          <DialogFooter>
            <Button type="button" size="sm" variant="secondary" onClick={closeDialog}>Cancel</Button>
            <Button type="button" size="sm" disabled={saving} onClick={() => void confirmSingleChain()}>
              {saving ? 'Saving…' : 'Save'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={dialog === 'bank'} onOpenChange={(open) => { if (!open) closeDialog(); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Bank payout details</DialogTitle>
            <DialogDescription className="text-foreground/75">
              Payouts use the bank details from your verified own account on the Bank page.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <label className="text-[12px] font-medium text-foreground/80">Currency</label>
              <Input
                value={config.bankPayoutCurrency ?? ''}
                placeholder="USD"
                disabled={saving}
                onChange={(e) => setConfig({ ...config, bankPayoutCurrency: e.target.value })}
              />
            </div>
          </div>
          {dialogError && <p className="text-sm text-destructive">{dialogError}</p>}
          <DialogFooter>
            <Button type="button" size="sm" variant="secondary" onClick={closeDialog}>Cancel</Button>
            <Button type="button" size="sm" disabled={saving} onClick={() => void confirmBank()}>
              {saving ? 'Saving…' : 'Save'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={dialog === 'bankAuth'} onOpenChange={(open) => { if (!open) closeDialog(); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Authorize bank settlement</DialogTitle>
            <DialogDescription className="text-foreground/75">
              Sign once from the merchant wallet so NodeRails can send escrow to your bank or withdraw leftover (valid 1 year).
            </DialogDescription>
          </DialogHeader>
          <p className="break-all text-[12px] text-foreground/80">
            Wallet: {expectedBankWallet || '-'}
          </p>
          {!bankWalletMatches && (
            <div className="space-y-2">
              <p className="text-[12px] font-medium text-amber-950">
                Connect that wallet, then sign. The connected address must match.
              </p>
              <MerchantWalletConnect
                appName={appName}
                appEnv={environment}
                walletType="receiving"
                initialFamily="EVM"
                onVerified={async () => undefined}
              />
            </div>
          )}
          {dialogError && <p className="text-sm text-destructive">{dialogError}</p>}
          <DialogFooter>
            <Button type="button" size="sm" variant="secondary" onClick={closeDialog}>Cancel</Button>
            <Button type="button" size="sm" disabled={saving || !bankWalletMatches} onClick={() => void submitBankAuth()}>
              {saving ? 'Signing…' : 'Sign'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useAccount, useSignMessage } from 'wagmi';
import {
  Building2,
  Check,
  ChevronRight,
  Landmark,
  Loader2,
  Plus,
  ShieldCheck,
} from 'lucide-react';
import { Input, Select } from '@/components/ui';
import { Spinner } from '@/components/ui/loading';
import { Button } from '@/components/ui/button';
import { MerchantWalletConnect } from '@/components/merchant-wallet-connect';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useAuth, usePermission } from '@/lib/auth';
import * as api from '@/lib/api';
import {
  daysLeft,
  formatUsd,
  GLOBAL_RAIL_TAGS,
  identityApproved,
  identityPassed,
  identityRejected,
  prettyStatus,
  railDisplay,
} from './bank-meta';
import {
  CurrencyFlag,
  DepositInstructionCard,
  OpenedAccountCard,
  OwnAccountDetailsCard,
  SegmentedControl,
  StatusChip,
  WorkspaceTabs,
} from './bank-ui';
import { StatusBadge as SharedStatusBadge } from '@/components/status-badge';

type Environment = 'TEST' | 'PRODUCTION';
type BankPath = 'own' | 'countries';
type Focus =
  | { type: 'live'; rail: string }
  | { type: 'catalog' };

function bankIdentityError(key: string, raw: string) {
  if (key !== 'kyc' && key !== 'simkyc' && key !== 'identity') return raw;
  if (/pay for a country first|only available in TEST|start identity after you pay/i.test(raw)) {
    return raw;
  }
  if (/please sign in again/i.test(raw)) return raw;
  return 'Down for maintenance. Check back later.';
}

function railChipTone(state: string): 'muted' | 'live' | 'open' | 'renew' | 'warn' {
  if (state === 'live') return 'live';
  if (state === 'open') return 'open';
  if (state === 'renew') return 'renew';
  if (state === 'pending') return 'warn';
  return 'muted';
}

function railChipLabel(rail: any, kycReady: boolean) {
  if (rail.fee?.status === 'PENDING') return 'Checkout pending';
  if (rail.state === 'live') {
    const left = daysLeft(rail.fee?.periodEnd);
    return left !== null ? `${left} days left` : 'Live';
  }
  if (rail.state === 'open') return kycReady ? 'Paid · ready to open' : 'Paid · verify identity';
  if (rail.state === 'renew') return 'Expired';
  if (rail.state === 'pay') return 'Not opened';
  return prettyStatus(rail.state);
}

function detailsComplete(corridor: Record<string, string>) {
  const country = corridor.country.trim();
  const name = corridor.name.trim();
  return Boolean(country && name && (corridor.accountNumber.trim() || corridor.iban.trim()));
}

function corridorFromSaved(saved: Record<string, unknown> | null | undefined) {
  const source = saved ?? {};
  return detailsComplete({
    country: String(source.country ?? ''),
    name: String(source.name ?? ''),
    currency: '',
    destinationType: '',
    beneficiaryType: '',
    accountNumber: String(source.accountNumber ?? source.account_number ?? ''),
    routingNumber: '',
    iban: String(source.iban ?? ''),
    bankName: '',
  });
}

function savedDetailsComplete(hub: any) {
  return corridorFromSaved(hub?.ownAccount?.corridor);
}

function pendingDetailsComplete(hub: any) {
  return corridorFromSaved(hub?.ownAccount?.pendingCorridor);
}

function applyCorridor(
  saved: Record<string, unknown>,
  accountType?: string,
  prev?: Record<string, string>,
) {
  return {
    country: String(saved.country ?? prev?.country ?? ''),
    name: String(saved.name ?? prev?.name ?? ''),
    currency: String(saved.currency ?? prev?.currency ?? ''),
    destinationType: String(saved.destinationType ?? prev?.destinationType ?? 'bank_account'),
    beneficiaryType: accountType === 'BUSINESS'
      ? 'business'
      : String(saved.beneficiaryType ?? prev?.beneficiaryType ?? 'individual'),
    accountNumber: String(saved.accountNumber ?? saved.account_number ?? prev?.accountNumber ?? ''),
    routingNumber: String(saved.routingNumber ?? saved.routing_number ?? prev?.routingNumber ?? ''),
    iban: String(saved.iban ?? prev?.iban ?? ''),
    bankName: String(saved.bankName ?? saved.bank_name ?? prev?.bankName ?? ''),
  };
}

export default function BankPage() {
  const { token } = useAuth();
  const hasPermission = usePermission();
  const [notice, setNotice] = useState('');
  const [bankPath, setBankPath] = useState<BankPath>('countries');
  const [focus, setFocus] = useState<Focus>({ type: 'catalog' });
  const isProdDashboard = process.env.NODE_ENV === 'production';
  const [environment, setEnvironment] = useState<Environment>(
    isProdDashboard ? 'PRODUCTION' : 'TEST',
  );
  const [hub, setHub] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [ownStep, setOwnStep] = useState(1);
  const [changingOwn, setChangingOwn] = useState(false);
  const [identityConfirming, setIdentityConfirming] = useState(false);
  const [uploadingName, setUploadingName] = useState('');
  const [corridor, setCorridor] = useState<Record<string, string>>({
    country: '',
    name: '',
    currency: '',
    destinationType: 'bank_account',
    beneficiaryType: 'individual',
    accountNumber: '',
    routingNumber: '',
    iban: '',
    bankName: '',
  });
  const [openRail, setOpenRail] = useState<string | null>(null);
  const [destAddress, setDestAddress] = useState('');
  const [destChainId, setDestChainId] = useState('');
  const [destToken, setDestToken] = useState('');
  const [chains, setChains] = useState<any[]>([]);
  const [tokens, setTokens] = useState<any[]>([]);
  const { address: connected } = useAccount();
  const { signMessageAsync } = useSignMessage();
  const identityFrameRef = useRef<HTMLIFrameElement>(null);
  const alertRef = useRef<HTMLDivElement>(null);
  const identityPanelRef = useRef<HTMLDivElement>(null);

  const canManage = hasPermission('BANK_MANAGE');

  const load = useCallback(async () => {
    if (!token || !canManage) return;
    setLoading(true);
    setError('');
    try {
      const [next, availableChains, availableTokens] = await Promise.all([
        api.getBankHub(token, environment),
        api.getAvailableChains(token, environment),
        api.getAvailableTokens(token, environment),
      ]);
      setHub(next);
      const live = (next.rails ?? []).filter((rail: any) => rail.state === 'live' && rail.account);
      setFocus((prev) => {
        if (prev.type === 'live' && live.some((rail: any) => rail.rail === prev.rail)) return prev;
        if (live[0]) return { type: 'live', rail: live[0].rail };
        return { type: 'catalog' };
      });
      setChains((availableChains ?? []).filter((c: any) => c.chainType === 'EVM'));
      setTokens(availableTokens ?? []);
      const pending = next.ownAccount?.pendingCorridor;
      const usePending = pending && typeof pending === 'object' && Object.keys(pending).length > 0;
      const saved = (usePending ? pending : next.ownAccount?.corridor) ?? {};
      setCorridor((prev) => applyCorridor(saved as Record<string, unknown>, next.accountType, prev));
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load Bank');
    } finally {
      setLoading(false);
    }
  }, [token, environment, canManage]);

  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const fee = new URLSearchParams(window.location.search).get('fee');
    if (!fee || !token) return;
    let ticks = 0;
    const timer = window.setInterval(() => {
      ticks += 1;
      void load();
      if (ticks >= 15) window.clearInterval(timer);
    }, 2000);
    return () => window.clearInterval(timer);
  }, [load, token]);

  const pullIdentity = useCallback(async () => {
    if (!token || !canManage) return null;
    const identity = await api.refreshBankIdentity(token, environment);
    if (identity) {
      setHub((prev: any) => (prev ? { ...prev, identity } : prev));
    }
    return identity;
  }, [token, canManage, environment]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('cancelled')) setNotice('Checkout cancelled.');
    else if (params.get('fee')) {
      setNotice('Payment received. Confirming the country fee.');
    }
    if (params.get('identity')) {
      setBankPath('own');
      setIdentityConfirming(true);
      void pullIdentity();
    }
    if (params.get('fee') || params.get('bridge')) {
      setBankPath('countries');
    }
    if (params.get('fee') || params.get('identity') || params.get('bridge')) {
      void load();
    }
  }, [load, pullIdentity]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('identity')) setBankPath('own');
    if (params.get('fee') || params.get('bridge')) setBankPath('countries');
  }, []);

  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      if (event.origin === window.location.origin && event.data?.source === 'noderails-identity') {
        setBankPath('own');
        setIdentityConfirming(true);
        void pullIdentity();
        return;
      }
      try {
        const host = new URL(event.origin).hostname;
        if (!host.endsWith('didit.me')) return;
        const status = String(event.data?.status ?? event.data?.type ?? '');
        if (!/approved|review|declin|reject|complete|finished|done/i.test(status)) return;
        setBankPath('own');
        setIdentityConfirming(true);
        void pullIdentity();
      } catch {
        /* ignore */
      }
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [pullIdentity]);

  useEffect(() => {
    if (!hub?.identity?.id || ownStep !== 1) return;
    if (identityPassed(hub.identity.status) || identityRejected(hub.identity.status)) return;
    let cancelled = false;
    const tick = async () => {
      try {
        await pullIdentity();
      } catch {
        /* keep last status */
      }
    };
    const timer = window.setInterval(() => { void tick(); }, 2500);
    void tick();
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [hub?.identity?.id, hub?.identity?.status, ownStep, pullIdentity]);

  const applyBridgeCustomer = (customer: any) => {
    if (!customer) return;
    setHub((prev: any) => {
      if (!prev) return prev;
      return {
        ...prev,
        vaKycStatus: identityApproved(customer.kycStatus)
          ? 'APPROVED'
          : (customer.externalCustomerId ? 'PENDING' : prev.vaKycStatus),
        bridge: {
          ...prev.bridge,
          kycLink: customer.kycLink ?? prev.bridge?.kycLink ?? null,
          tosLink: customer.tosLink ?? prev.bridge?.tosLink ?? null,
          kycStatus: customer.kycStatus ?? prev.bridge?.kycStatus,
          tosStatus: customer.tosStatus ?? prev.bridge?.tosStatus,
          endorsements: customer.endorsements ?? prev.bridge?.endorsements ?? [],
        },
      };
    });
  };

  const run = async (key: string, fn: () => Promise<void>) => {
    setBusy(key);
    setError('');
    try {
      await fn();
      await load();
    } catch (err: unknown) {
      const raw = err instanceof Error ? err.message : 'Request failed';
      setError(bankIdentityError(key, raw));
    } finally {
      setBusy('');
    }
  };

  const evmTokens = useMemo(() => {
    return tokens.filter((t: any) => {
      if (!destChainId) return t.chain?.chainType === 'EVM' || t.chainType === 'EVM';
      return String(t.chainId) === destChainId;
    });
  }, [tokens, destChainId]);

  const identityDone = identityPassed(hub?.identity?.status)
    || ['PENDING_REVIEW', 'VERIFIED'].includes(hub?.ownAccountStatus);
  const identityFailed = identityRejected(hub?.identity?.status);
  const reviewStatus = hub?.ownAccountStatus;
  const changeStatus = hub?.ownAccount?.changeStatus ?? 'NONE';
  const isVerifiedOwn = reviewStatus === 'VERIFIED';
  const changeDialogOpen = isVerifiedOwn && changingOwn;
  const bankDone = isVerifiedOwn ? pendingDetailsComplete(hub) : detailsComplete(corridor);
  const statementDone = isVerifiedOwn
    ? Boolean(hub?.ownAccount?.hasPendingStatement)
    : Boolean(hub?.ownAccount?.hasStatement);
  const reviewDone = isVerifiedOwn
    ? changeStatus === 'PENDING_REVIEW'
    : reviewStatus === 'PENDING_REVIEW';
  const suggestedOwnStep = isVerifiedOwn
    ? (!bankDone ? 2 : !statementDone ? 3 : 4)
    : (!identityDone ? 1 : !bankDone ? 2 : !statementDone ? 3 : 4);
  const showIdentityFrame = Boolean(hub?.identity?.sessionUrl)
    && !identityDone
    && !identityFailed
    && !identityConfirming;

  useEffect(() => {
    if (identityDone || identityFailed) setIdentityConfirming(false);
  }, [identityDone, identityFailed]);

  useEffect(() => {
    if (!notice && !error) return;
    alertRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, [notice, error]);

  useEffect(() => {
    if (!hub) return;
    const verified = hub.ownAccountStatus === 'VERIFIED';
    const nextChange = hub.ownAccount?.changeStatus ?? 'NONE';
    if (verified && nextChange === 'NONE' && !changingOwn) return;
    if (verified) {
      const details = pendingDetailsComplete(hub);
      const statement = Boolean(hub.ownAccount?.hasPendingStatement);
      if (!details) setOwnStep(2);
      else if (!statement) setOwnStep(3);
      else setOwnStep(4);
      return;
    }
    if (hub.ownAccountStatus === 'REJECTED') {
      setOwnStep(2);
      return;
    }
    const idDone = identityPassed(hub.identity?.status)
      || ['PENDING_REVIEW', 'VERIFIED'].includes(hub.ownAccountStatus);
    const details = savedDetailsComplete(hub);
    const statement = Boolean(hub.ownAccount?.hasStatement);
    if (!idDone) setOwnStep(1);
    else if (!details) setOwnStep(2);
    else if (!statement) setOwnStep(3);
    else setOwnStep(4);
  }, [environment, hub, changingOwn]);

  if (!canManage) {
    return (
      <div className="rounded-xl border border-border bg-card p-8 text-sm text-foreground/80">
        You need the Manage Bank permission to open this page.
      </div>
    );
  }

  if (loading && !hub) return <Spinner />;

  const price = formatUsd(hub?.openingFeeUsd ?? '30');
  const kycReady = identityApproved(hub?.bridge?.kycStatus) || identityApproved(hub?.vaKycStatus);
  const hasPaidCountry = (hub?.rails ?? []).some((rail: any) => ['open', 'live', 'renew'].includes(rail.state));
  const identityStarted = kycReady
    || ['PENDING', 'APPROVED', 'REJECTED'].includes(String(hub?.vaKycStatus ?? ''))
    || Boolean(hub?.bridge?.kycLink)
    || Boolean(hub?.bridge?.tosLink);
  const liveRails = (hub?.rails ?? []).filter((rail: any) => rail.state === 'live' && rail.account);
  const catalogRails = (hub?.rails ?? []).filter((rail: any) => !(rail.state === 'live' && rail.account));
  const selectedLive = focus.type === 'live'
    ? liveRails.find((rail: any) => rail.rail === focus.rail) ?? liveRails[0] ?? null
    : null;

  const focusIdentity = () => {
    identityPanelRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  };

  const payRail = async (rail: any) => {
    if (!token) return;
    const fee = await api.createGlobalBankFee(token, environment, rail.rail);
    if (fee.checkoutUrl) window.location.href = fee.checkoutUrl;
  };

  const ownStepCopy: Record<number, { title: string; body: string }> = {
    1: {
      title: 'Step 1 of 4: Identity',
      body: 'Photo ID and selfie. Bank details unlock after approval.',
    },
    2: {
      title: 'Step 2 of 4: Bank details',
      body: 'Account that will receive payouts.',
    },
    3: {
      title: 'Step 3 of 4: Statement',
      body: 'Recent PDF statement for this account.',
    },
    4: {
      title: 'Step 4 of 4: Submit',
      body: 'Submit for review. We email you with the result.',
    },
  };

  const ownAccountPanel = (
    <div className="space-y-6">
                <div>
                  <p className="text-sm font-semibold">{ownStepCopy[ownStep]?.title}</p>
                  <p className="mt-1 text-xs text-muted-foreground">{ownStepCopy[ownStep]?.body}</p>
                </div>
                <ol className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  {[
                    { n: 1, label: 'Identity', done: identityDone },
                    { n: 2, label: 'Bank details', done: bankDone },
                    { n: 3, label: 'Statement', done: statementDone },
                    { n: 4, label: 'Review', done: reviewDone },
                  ].map((step) => (
                    <li key={step.n}>
                      <button
                        type="button"
                        disabled={step.n > suggestedOwnStep}
                        onClick={() => setOwnStep(step.n)}
                        className={`flex w-full items-center gap-2 rounded-lg border px-3 py-2 text-left text-xs font-medium transition-colors ${
                          ownStep === step.n
                            ? 'border-primary/40 bg-primary/5 text-foreground'
                            : 'border-border bg-card text-muted-foreground hover:text-foreground disabled:opacity-50'
                        }`}
                      >
                        <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] ${
                          step.done ? 'bg-emerald-600 text-white' : ownStep === step.n ? 'bg-primary text-primary-foreground' : 'bg-muted'
                        }`}>
                          {step.done ? <Check className="h-3 w-3" /> : step.n}
                        </span>
                        {step.label}
                      </button>
                    </li>
                  ))}
                </ol>

                {ownStep === 1 && (
                  <div className="space-y-3">
                    {identityDone ? (
                      <div className="rounded-xl border border-emerald-200 bg-emerald-50/70 px-4 py-6 text-center">
                        <p className="text-sm font-semibold text-emerald-800">Identity verified</p>
                        <p className="mt-1 text-xs text-emerald-900/80">Next: bank details.</p>
                      </div>
                    ) : identityFailed ? (
                      <div className="space-y-3">
                        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-4 text-sm text-destructive">
                          Identity was not approved. Start a new session to try again.
                        </div>
                        <Button
                          size="sm"
                          disabled={busy !== ''}
                          onClick={() => void run('identity', async () => {
                            if (!token) return;
                            setIdentityConfirming(false);
                            await api.startBankIdentity(token, environment);
                          })}
                        >
                          {busy === 'identity' ? 'Starting…' : 'Start a new session'}
                        </Button>
                      </div>
                    ) : identityConfirming ? (
                      <div className="rounded-xl border border-border bg-muted/30 px-4 py-10 text-center">
                        <p className="text-sm font-semibold">Confirming verification…</p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          Checking verification status.
                        </p>
                      </div>
                    ) : showIdentityFrame ? (
                      <div className="space-y-3">
                        <div className="-mx-5 overflow-hidden border-y border-border bg-muted/20 sm:-mx-6">
                          <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-2.5">
                            <p className="text-sm font-medium">Verify your identity</p>
                            <p className="text-xs text-muted-foreground">Your camera may be requested</p>
                          </div>
                          <iframe
                            ref={identityFrameRef}
                            key={hub.identity.sessionUrl}
                            title="Identity verification"
                            src={hub.identity.sessionUrl}
                            allow="camera; microphone; geolocation; clipboard-write"
                            className="block h-[calc(100dvh-8rem)] min-h-[780px] w-full bg-card"
                            onLoad={() => {
                              try {
                                const href = identityFrameRef.current?.contentWindow?.location.href ?? '';
                                if (
                                  href.includes('identity-callback')
                                  || href.includes('identity=done')
                                  || href.includes('/dashboard/bank')
                                ) {
                                  setIdentityConfirming(true);
                                  void pullIdentity();
                                }
                              } catch {
                                /* still on Didit */
                              }
                            }}
                          />
                        </div>
                        <p className="text-xs text-muted-foreground">
                          Bank details unlock when verification completes.
                        </p>
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={busy !== ''}
                          onClick={() => void run('identity', async () => {
                            if (!token) return;
                            setIdentityConfirming(false);
                            await api.startBankIdentity(token, environment);
                          })}
                        >
                          {busy === 'identity' ? 'Starting…' : 'Start a new session'}
                        </Button>
                      </div>
                    ) : (
                      <div className="space-y-3">
                        <p className="text-sm text-muted-foreground">
                          Photo ID and selfie. Camera access may be required.
                        </p>
                        <Button
                          size="sm"
                          disabled={busy !== ''}
                          onClick={() => void run('identity', async () => {
                            if (!token) return;
                            setBankPath('own');
                            setOwnStep(1);
                            setIdentityConfirming(false);
                            await api.startBankIdentity(token, environment);
                          })}
                        >
                          {busy === 'identity' ? 'Starting…' : 'Start identity'}
                        </Button>
                      </div>
                    )}
                  </div>
                )}

                {ownStep === 2 && (
                  <div className="space-y-4">
                    <div className="grid gap-3 sm:grid-cols-2">
                      <Input label="Country" value={corridor.country} onChange={(e) => setCorridor({ ...corridor, country: e.target.value })} />
                      <Input label="Account name" value={corridor.name} onChange={(e) => setCorridor({ ...corridor, name: e.target.value })} />
                      <Input label="Currency" value={corridor.currency} onChange={(e) => setCorridor({ ...corridor, currency: e.target.value })} />
                      <Input label="Bank name" value={corridor.bankName} onChange={(e) => setCorridor({ ...corridor, bankName: e.target.value })} />
                      <Input label="Account number" value={corridor.accountNumber} onChange={(e) => setCorridor({ ...corridor, accountNumber: e.target.value })} />
                      <Input label="Routing number" value={corridor.routingNumber} onChange={(e) => setCorridor({ ...corridor, routingNumber: e.target.value })} />
                      <div className="sm:col-span-2">
                        <Input label="IBAN" value={corridor.iban} onChange={(e) => setCorridor({ ...corridor, iban: e.target.value })} />
                      </div>
                    </div>
                    <Button
                      size="sm"
                      disabled={busy !== ''}
                      onClick={() => void run('details', async () => {
                        if (!token) return;
                        await api.saveOwnAccountDetails(token, environment, corridor);
                      })}
                    >
                      Save bank details
                    </Button>
                  </div>
                )}

                {ownStep === 3 && (
                  <div className="space-y-3">
                    <label
                      aria-busy={busy === 'pdf'}
                      className={`flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed px-4 py-10 text-center ${
                        busy === 'pdf'
                          ? 'pointer-events-none cursor-wait border-primary/30 bg-primary/5'
                          : 'cursor-pointer border-border bg-muted/20'
                      }`}
                    >
                      {busy === 'pdf' ? (
                        <Loader2 className="h-6 w-6 animate-spin text-primary" />
                      ) : (
                        <Building2 className="h-6 w-6 text-muted-foreground" />
                      )}
                      <span className="text-sm font-medium">
                        {busy === 'pdf'
                          ? `Uploading ${uploadingName || 'statement'}…`
                          : hub?.ownAccount?.hasStatement
                            ? 'Replace statement PDF'
                            : 'Upload a recent bank statement (PDF)'}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {busy === 'pdf' ? 'Uploading…' : 'PDF only'}
                      </span>
                      <input
                        type="file"
                        accept="application/pdf"
                        className="hidden"
                        disabled={busy !== ''}
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          e.target.value = '';
                          if (!file || !token || busy !== '') return;
                          setUploadingName(file.name);
                          void run('pdf', async () => {
                            try {
                              await api.uploadOwnAccountStatement(token, environment, file);
                            } finally {
                              setUploadingName('');
                            }
                          });
                        }}
                      />
                    </label>
                  </div>
                )}

                {ownStep === 4 && (
                  <div className="space-y-3">
                    {reviewDone ? (
                      <p className="text-sm text-muted-foreground">
                        Submitted. We will email you when review is complete.
                      </p>
                    ) : (
                      <>
                        <p className="text-sm text-muted-foreground">
                          Ready to submit.
                        </p>
                        <Button
                          size="sm"
                          disabled={busy !== ''}
                          onClick={() => void run('submit', async () => {
                            if (!token) return;
                            await api.submitOwnAccount(token, environment);
                          })}
                        >
                          Submit for review
                        </Button>
                      </>
                    )}
                  </div>
                )}
    </div>
  );

  const ownSection = (
    <section className="space-y-4">
      <div>
        <h2 className="text-base font-semibold">Connect your own account</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          {isVerifiedOwn
            ? 'Payouts settle to this account.'
            : 'Link a bank account for payouts. We email you when review is complete.'}
        </p>
      </div>
      <OwnAccountDetailsCard
        corridor={hub?.ownAccount?.corridor}
        status={reviewStatus}
        rejectionReason={isVerifiedOwn ? null : hub?.ownAccount?.rejectionReason}
        changeStatus={changeStatus}
        changeRejectionReason={hub?.ownAccount?.changeRejectionReason}
        onChangeClick={isVerifiedOwn ? () => {
          setError('');
          setChangingOwn(true);
          setOwnStep(!pendingDetailsComplete(hub) ? 2 : !hub?.ownAccount?.hasPendingStatement ? 3 : 4);
        } : undefined}
      />
      {reviewStatus !== 'VERIFIED' && (
        <div className="rounded-xl border border-border bg-card p-5 shadow-sm sm:p-6">
          {ownAccountPanel}
        </div>
      )}
    </section>
  );

  const countriesSection = (
    <div className="space-y-6">
      {liveRails.length > 0 && (
        <section className="space-y-4">
          <div>
            <h2 className="text-base font-semibold">Open accounts</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Select an account for deposit details.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {liveRails.map((rail: any) => (
              <OpenedAccountCard
                key={rail.rail}
                meta={railDisplay(rail.rail)}
                account={rail.account}
                environmentLabel={environment === 'TEST' ? 'Test' : 'Live'}
                selected={focus.type === 'live' && focus.rail === rail.rail}
                onSelect={() => setFocus({ type: 'live', rail: rail.rail })}
              />
            ))}
          </div>
          {selectedLive && (
            <DepositInstructionCard
              meta={railDisplay(selectedLive.rail)}
              account={selectedLive.account}
              environmentLabel={environment === 'TEST' ? 'Test' : 'Production'}
              footer={(
                <Link
                  href={`/dashboard/bank/${selectedLive.account.id}`}
                  className="inline-flex items-center gap-1 text-xs font-medium text-primary underline-offset-2 hover:underline"
                >
                  Activity and fees
                  <ChevronRight className="h-3.5 w-3.5" />
                </Link>
              )}
            />
          )}
        </section>
      )}

      {catalogRails.length > 0 && (
        <div className="rounded-xl border border-border bg-card shadow-sm">
            <div className="space-y-6 p-5 sm:p-6">
              <div>
                <div className="flex items-start gap-3">
                  {liveRails.length > 0 && (
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10">
                      <Plus className="h-5 w-5 text-primary" />
                    </div>
                  )}
                  <div>
                    <h2 className="text-base font-semibold">
                      {liveRails.length > 0 ? 'Open more accounts' : 'Open global bank accounts'}
                    </h2>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {price} per country per year. Pay, verify identity once, then open.
                    </p>
                  </div>
                </div>
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {GLOBAL_RAIL_TAGS.map((tag) => (
                    <span
                      key={tag}
                      className="rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-0.5 text-[10px] font-semibold text-emerald-800"
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              </div>

              {hasPaidCountry && (
                <div
                  ref={identityPanelRef}
                  className="flex flex-col gap-3 rounded-xl border border-border bg-muted/30 p-4 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="flex min-w-0 items-start gap-3">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10">
                      <ShieldCheck className="h-5 w-5 text-primary" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold">Identity</p>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {kycReady
                          ? 'Verified. Open a paid country.'
                          : identityStarted
                            ? environment === 'TEST' && !hub?.bridge?.kycLink
                              ? 'Started. In Test, use Simulate KYC.'
                              : `KYC ${prettyStatus(hub?.bridge?.kycStatus)} · TOS ${prettyStatus(hub?.bridge?.tosStatus)}`
                            : 'Required after you pay for a country.'}
                      </p>
                    </div>
                  </div>
                  {!kycReady && (
                    <div className="flex w-full shrink-0 flex-col gap-2 sm:w-auto sm:flex-row">
                      {hub?.bridge?.kycLink && (
                        <Button variant="outline" size="sm" className="w-full sm:w-auto" asChild>
                          <a href={hub.bridge.kycLink} target="_blank" rel="noreferrer">Complete KYC</a>
                        </Button>
                      )}
                      {hub?.bridge?.tosLink && (
                        <Button variant="outline" size="sm" className="w-full sm:w-auto" asChild>
                          <a href={hub.bridge.tosLink} target="_blank" rel="noreferrer">Complete TOS</a>
                        </Button>
                      )}
                      <Button
                        size="sm"
                        className="w-full sm:w-auto"
                        disabled={busy !== ''}
                        onClick={() => void run('kyc', async () => {
                          if (!token) return;
                          const customer = await api.startGlobalBankKyc(token, environment);
                          applyBridgeCustomer(customer);
                          if (identityApproved(customer.kycStatus)) {
                            setNotice('Identity approved. Open a paid country.');
                          } else if (environment === 'TEST' && !customer.kycLink) {
                            setNotice('Identity started. In Test, click Simulate KYC to approve.');
                          } else {
                            setNotice('Identity started. Complete KYC and TOS.');
                          }
                        })}
                      >
                        {busy === 'kyc' ? 'Starting…' : identityStarted ? 'Refresh identity' : 'Start identity'}
                      </Button>
                      {environment === 'TEST' && (
                        <Button
                          variant="outline"
                          size="sm"
                          className="w-full sm:w-auto"
                          disabled={busy !== '' || !identityStarted}
                          onClick={() => void run('simkyc', async () => {
                            if (!token) return;
                            const customer = await api.simulateGlobalBankKyc(token, environment);
                            applyBridgeCustomer(customer);
                            if (identityApproved(customer.kycStatus)) {
                              setNotice('Identity approved. Open a paid country.');
                            } else {
                              setNotice(`Identity status: ${prettyStatus(customer.kycStatus)}.`);
                            }
                          })}
                        >
                          {busy === 'simkyc' ? 'Approving…' : 'Simulate KYC'}
                        </Button>
                      )}
                    </div>
                  )}
                  {kycReady && (
                    <SharedStatusBadge status="APPROVED" />
                  )}
                </div>
              )}

              <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
                {catalogRails.map((rail: any) => {
                  const meta = railDisplay(rail.rail);
                  const pending = rail.fee?.status === 'PENDING';
                  const needsIdentity = rail.state === 'open' && !kycReady;
                  const actionLabel = pending
                    ? 'Continue checkout'
                    : rail.state === 'renew'
                      ? `Renew ${price}/yr`
                      : needsIdentity
                        ? 'Verify identity'
                        : rail.state === 'open'
                          ? 'Open'
                          : `Pay ${price}/yr`;

                  return (
                    <li key={rail.rail}>
                      <div className="flex h-full flex-col items-center rounded-xl border border-border bg-card px-3 pb-3 pt-4 text-center shadow-sm">
                        <CurrencyFlag iso={meta.flag} code={meta.code} size={56} />
                        <p className="mt-3 text-base font-black tracking-tight">{meta.code}</p>
                        <p className="mt-0.5 text-[11px] font-medium text-muted-foreground">{meta.label}</p>
                        <p className="mt-1 text-[10px] leading-snug text-muted-foreground/80">{meta.hint}</p>
                        <div className="mt-2">
                          <StatusChip tone={pending ? 'warn' : railChipTone(rail.state)}>
                            {railChipLabel(rail, kycReady)}
                          </StatusChip>
                        </div>
                        <Button
                          size="sm"
                          variant={rail.state === 'open' ? 'default' : 'outline'}
                          className="mt-3 h-8 w-full min-w-0 px-2 text-xs"
                          disabled={busy !== ''}
                          onClick={() => {
                            if (needsIdentity) {
                              focusIdentity();
                              if (!identityStarted && token) {
                                void run('kyc', async () => {
                                  const customer = await api.startGlobalBankKyc(token, environment);
                                  applyBridgeCustomer(customer);
                                  if (identityApproved(customer.kycStatus)) {
                                    setNotice('Identity approved. Open a paid country.');
                                  } else if (environment === 'TEST' && !customer.kycLink) {
                                    setNotice('Identity started. In Test, click Simulate KYC to approve.');
                                  } else {
                                    setNotice('Identity started. Complete KYC and TOS.');
                                  }
                                });
                              }
                              return;
                            }
                            if (rail.state === 'open') {
                              setOpenRail(rail.rail);
                              setDestAddress(connected ?? '');
                              return;
                            }
                            void run(`pay-${rail.rail}`, async () => { await payRail(rail); });
                          }}
                        >
                          <span className="truncate">{actionLabel}</span>
                        </Button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </div>
          </div>
      )}
    </div>
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold tracking-tight">Bank</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {bankPath === 'own'
              ? 'Payout destination for settle-to-bank.'
              : 'Local deposit accounts by country.'}
          </p>
        </div>
        {!isProdDashboard && (
          <SegmentedControl
            value={environment}
            onChange={setEnvironment}
            options={[
              { value: 'TEST', label: 'Test' },
              { value: 'PRODUCTION', label: 'Production' },
            ]}
          />
        )}
      </div>

      <WorkspaceTabs
        value={bankPath}
        onChange={setBankPath}
        tabs={[
          { id: 'countries', label: 'Country accounts' },
          { id: 'own', label: 'Own account' },
        ]}
      />

      {(notice || error) && (
        <div ref={alertRef} className="space-y-2">
          {notice && (
            <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
              {notice}
            </div>
          )}
          {error && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-destructive">
              {error}
            </div>
          )}
        </div>
      )}

      {bankPath === 'own' && ownSection}
      {bankPath === 'countries' && countriesSection}

      <Dialog open={changeDialogOpen} onOpenChange={(open) => {
        if (!open) setChangingOwn(false);
      }}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>
              {changeStatus === 'PENDING_REVIEW' ? 'Change in review' : 'Change bank details'}
            </DialogTitle>
            <DialogDescription>
              Your current account stays active until we approve the new one. Identity does not change.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-5">
            {error && (
              <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-destructive">{error}</p>
            )}
            <ol className="grid grid-cols-3 gap-2">
              {[
                { n: 2, label: 'Bank details', done: pendingDetailsComplete(hub) },
                { n: 3, label: 'Statement', done: Boolean(hub?.ownAccount?.hasPendingStatement) },
                { n: 4, label: 'Review', done: changeStatus === 'PENDING_REVIEW' },
              ].map((step) => (
                <li key={step.n}>
                  <button
                    type="button"
                    disabled={step.n > suggestedOwnStep}
                    onClick={() => setOwnStep(step.n)}
                    className={`flex w-full items-center gap-2 rounded-lg border px-3 py-2 text-left text-xs font-medium transition-colors ${
                      ownStep === step.n
                        ? 'border-primary/40 bg-primary/5 text-foreground'
                        : 'border-border bg-card text-muted-foreground hover:text-foreground disabled:opacity-50'
                    }`}
                  >
                    <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] ${
                      step.done ? 'bg-emerald-600 text-white' : ownStep === step.n ? 'bg-primary text-primary-foreground' : 'bg-muted'
                    }`}>
                      {step.done ? <Check className="h-3 w-3" /> : step.n - 1}
                    </span>
                    {step.label}
                  </button>
                </li>
              ))}
            </ol>

            {ownStep === 2 && (
              <div className="space-y-4">
                <div className="grid gap-3 sm:grid-cols-2">
                  <Input label="Country" value={corridor.country} onChange={(e) => setCorridor({ ...corridor, country: e.target.value })} />
                  <Input label="Account name" value={corridor.name} onChange={(e) => setCorridor({ ...corridor, name: e.target.value })} />
                  <Input label="Currency" value={corridor.currency} onChange={(e) => setCorridor({ ...corridor, currency: e.target.value })} />
                  <Input label="Bank name" value={corridor.bankName} onChange={(e) => setCorridor({ ...corridor, bankName: e.target.value })} />
                  <Input label="Account number" value={corridor.accountNumber} onChange={(e) => setCorridor({ ...corridor, accountNumber: e.target.value })} />
                  <Input label="Routing number" value={corridor.routingNumber} onChange={(e) => setCorridor({ ...corridor, routingNumber: e.target.value })} />
                  <div className="sm:col-span-2">
                    <Input label="IBAN" value={corridor.iban} onChange={(e) => setCorridor({ ...corridor, iban: e.target.value })} />
                  </div>
                </div>
                <Button
                  size="sm"
                  disabled={busy !== ''}
                  onClick={() => void run('details', async () => {
                    if (!token) return;
                    await api.saveOwnAccountDetails(token, environment, corridor);
                  })}
                >
                  Save new details
                </Button>
              </div>
            )}

            {ownStep === 3 && (
              <label
                aria-busy={busy === 'pdf'}
                className={`flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed px-4 py-10 text-center ${
                  busy === 'pdf'
                    ? 'pointer-events-none cursor-wait border-primary/30 bg-primary/5'
                    : 'cursor-pointer border-border bg-muted/20'
                }`}
              >
                {busy === 'pdf' ? (
                  <Loader2 className="h-6 w-6 animate-spin text-primary" />
                ) : (
                  <Building2 className="h-6 w-6 text-muted-foreground" />
                )}
                <span className="text-sm font-medium">
                  {busy === 'pdf'
                    ? `Uploading ${uploadingName || 'statement'}…`
                    : hub?.ownAccount?.hasPendingStatement
                      ? 'Replace statement PDF'
                      : 'Upload a recent bank statement (PDF)'}
                </span>
                <span className="text-xs text-muted-foreground">
                  {busy === 'pdf' ? 'Uploading…' : 'PDF only'}
                </span>
                <input
                  type="file"
                  accept="application/pdf"
                  className="hidden"
                  disabled={busy !== ''}
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    e.target.value = '';
                    if (!file || !token || busy !== '') return;
                    setUploadingName(file.name);
                    void run('pdf', async () => {
                      try {
                        await api.uploadOwnAccountStatement(token, environment, file);
                      } finally {
                        setUploadingName('');
                      }
                    });
                  }}
                />
              </label>
            )}

            {ownStep === 4 && (
              <div className="space-y-3">
                {changeStatus === 'PENDING_REVIEW' ? (
                  <p className="text-sm text-muted-foreground">
                    New details are in review. Your current account stays active.
                  </p>
                ) : (
                  <>
                    <p className="text-sm text-muted-foreground">
                      Submit the new account for review. The current account stays active until we approve.
                    </p>
                    <Button
                      size="sm"
                      disabled={busy !== ''}
                      onClick={() => void run('submit', async () => {
                        if (!token) return;
                        await api.submitOwnAccount(token, environment);
                        setChangingOwn(false);
                        setNotice('New bank details submitted. Your current account stays active.');
                      })}
                    >
                      Submit for review
                    </Button>
                  </>
                )}
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setChangingOwn(false)}>
              {changeStatus === 'PENDING_REVIEW' ? 'Close' : 'Cancel'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={openRail !== null} onOpenChange={(open) => { if (!open) setOpenRail(null); }}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>
              Destination wallet{openRail ? ` for ${railDisplay(openRail).code}` : ''}
            </DialogTitle>
            <DialogDescription>
              Crypto from this account is sent here. Sign to confirm ownership. Locked after the account opens.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <MerchantWalletConnect
              appName="Bank"
              appEnv={environment}
              walletType="receiving"
              initialFamily="EVM"
              onVerified={async (_family, address) => setDestAddress(address)}
            />
            <Input label="Destination address" value={destAddress} onChange={(e) => setDestAddress(e.target.value)} />
            <Select
              label="Chain"
              value={destChainId}
              onChange={(e) => { setDestChainId(e.target.value); setDestToken(''); }}
              options={[{ value: '', label: 'Select chain' }, ...chains.map((c: any) => ({ value: String(c.chainId), label: c.displayName ?? c.name }))]}
            />
            <Select
              label="Token"
              value={destToken}
              onChange={(e) => setDestToken(e.target.value)}
              options={[{ value: '', label: 'Select token' }, ...evmTokens.map((t: any) => ({ value: t.tokenKey, label: t.symbol ?? t.tokenKey }))]}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpenRail(null)}>Cancel</Button>
            <Button
              disabled={busy !== ''}
              onClick={() => void run('open', async () => {
                if (!token || !openRail || !destAddress || !destChainId || !destToken) {
                  throw new Error('Destination address, chain, and token are required');
                }
                const { message } = await api.getGlobalBankDestinationMessage(token, environment, openRail, destAddress);
                const signature = await signMessageAsync({ message });
                await api.openGlobalBankAccount(token, {
                  environment,
                  rail: openRail,
                  destinationAddress: destAddress,
                  destinationChainId: Number(destChainId),
                  destinationTokenKey: destToken,
                  destinationSignature: signature,
                });
                setOpenRail(null);
                setFocus({ type: 'live', rail: openRail });
                setNotice(`${railDisplay(openRail).code} is open. Deposit details are above.`);
              })}
            >
              {busy === 'open' ? 'Opening…' : 'Sign and open'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

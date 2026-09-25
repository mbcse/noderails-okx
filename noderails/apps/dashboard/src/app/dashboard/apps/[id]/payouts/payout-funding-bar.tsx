'use client';

import { useEffect, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { Input } from '@/components/ui';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { PayoutWalletSession } from './payout-wallet-session';

function Metric({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div className="min-w-0">
      <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-1 truncate text-xl font-semibold leading-none tracking-tight text-foreground">
        {value}
      </p>
      {hint && <p className="mt-1.5 text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

export function PayoutFundingBar({
  isNative,
  tokenSymbol,
  nativeSymbol,
  approvedFormatted,
  walletTokenFormatted,
  walletNativeFormatted,
  onContractFormatted,
  walletTokenHuman,
  writePending,
  canWrite,
  walletReady,
  appEnv,
  payoutWallet,
  onRefresh,
  onApprove,
  onDeposit,
}: {
  isNative: boolean;
  tokenSymbol: string;
  nativeSymbol: string;
  approvedFormatted: string;
  walletTokenFormatted: string;
  walletNativeFormatted: string;
  onContractFormatted: string;
  walletTokenHuman: string;
  writePending: boolean;
  canWrite: boolean;
  walletReady: boolean;
  appEnv: 'TEST' | 'PRODUCTION';
  payoutWallet?: string | null;
  onRefresh: () => void;
  onApprove: (amount: string) => Promise<void>;
  onDeposit: (amount: string) => Promise<void>;
}) {
  const [approveOpen, setApproveOpen] = useState(false);
  const [depositOpen, setDepositOpen] = useState(false);
  const [connectOpen, setConnectOpen] = useState(false);
  const [approveAmount, setApproveAmount] = useState('');
  const [depositAmount, setDepositAmount] = useState('');
  const [dialogError, setDialogError] = useState('');

  useEffect(() => {
    if (walletReady && connectOpen) setConnectOpen(false);
  }, [walletReady, connectOpen]);

  const openWrite = (kind: 'approve' | 'deposit') => {
    setDialogError('');
    if (!walletReady) {
      setConnectOpen(true);
      return;
    }
    if (kind === 'approve') setApproveOpen(true);
    else setDepositOpen(true);
  };

  const tokenPresets = [
    ...(walletTokenHuman ? [{ label: 'Wallet', value: walletTokenHuman }] : []),
    { label: '1,000', value: '1000' },
    { label: '10,000', value: '10000' },
  ];
  const ethPresets = [
    { label: '0.1', value: '0.1' },
    { label: '1', value: '1' },
    ...(walletNativeFormatted !== '-' ? [{ label: 'Wallet', value: walletNativeFormatted.replace(/,/g, '') }] : []),
  ];

  const submitApprove = async () => {
    setDialogError('');
    if (!approveAmount.trim()) {
      setDialogError('Enter the amount to approve.');
      return;
    }
    try {
      await onApprove(approveAmount.trim());
      setApproveOpen(false);
      setApproveAmount('');
    } catch (err: unknown) {
      setDialogError(err instanceof Error ? err.message : 'Approve failed');
    }
  };

  const submitDeposit = async () => {
    setDialogError('');
    if (!depositAmount.trim()) {
      setDialogError(`Enter how much ${nativeSymbol} to add.`);
      return;
    }
    try {
      await onDeposit(depositAmount.trim());
      setDepositOpen(false);
      setDepositAmount('');
    } catch (err: unknown) {
      setDialogError(err instanceof Error ? err.message : 'Deposit failed');
    }
  };

  return (
    <>
      <div className="rounded-xl border border-border bg-card px-5 py-4 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="grid min-w-0 flex-1 gap-6 sm:grid-cols-2">
            {isNative ? (
              <>
                <Metric
                  label="On contract"
                  value={`${onContractFormatted} ${nativeSymbol}`}
                  hint="Available for native payouts"
                />
                <Metric
                  label="In wallet"
                  value={`${walletNativeFormatted} ${nativeSymbol}`}
                  hint="Move some on-contract to send"
                />
              </>
            ) : (
              <>
                <Metric
                  label="Approved"
                  value={`${approvedFormatted} ${tokenSymbol}`}
                  hint="One-time allowance NodeRails can pull"
                />
                <Metric
                  label="In wallet"
                  value={`${walletTokenFormatted} ${tokenSymbol}`}
                  hint={`${walletNativeFormatted} ${nativeSymbol} for gas`}
                />
              </>
            )}
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <Button type="button" variant="ghost" size="sm" onClick={onRefresh} disabled={writePending}>
              <RefreshCw className="h-3.5 w-3.5" />
              Refresh
            </Button>
            {isNative ? (
              <Button
                type="button"
                size="sm"
                disabled={!canWrite || writePending}
                onClick={() => openWrite('deposit')}
              >
                {walletReady ? `Add ${nativeSymbol}` : 'Connect wallet'}
              </Button>
            ) : (
              <Button
                type="button"
                size="sm"
                disabled={!canWrite || writePending}
                onClick={() => openWrite('approve')}
              >
                {walletReady ? 'Set approval' : 'Connect wallet'}
              </Button>
            )}
          </div>
        </div>
        {walletReady && payoutWallet ? (
          <p className="mt-3 text-xs text-muted-foreground">
            Connected as the payout wallet. Approve and deposit will use this session.
          </p>
        ) : payoutWallet ? (
          <p className="mt-3 text-xs text-muted-foreground">
            Connect the payout wallet before approving or depositing.
          </p>
        ) : null}
      </div>

      <Dialog open={connectOpen} onOpenChange={(open) => { if (!open) setConnectOpen(false); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Connect payout wallet</DialogTitle>
            <DialogDescription className="text-foreground/75">
              Approve and deposit use this connected wallet. Yearly authorize stays in Settings.
            </DialogDescription>
          </DialogHeader>
          <PayoutWalletSession appEnv={appEnv} payoutWallet={payoutWallet} />
          <DialogFooter>
            <Button
              type="button"
              size="sm"
              variant="secondary"
              onClick={() => setConnectOpen(false)}
            >
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={approveOpen} onOpenChange={(open) => { if (!open) setApproveOpen(false); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Set approval</DialogTitle>
            <DialogDescription className="text-foreground/75">
              Approve a standing {tokenSymbol} amount. Later payouts use this until it runs out, not one approval per send.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-wrap gap-2">
            {tokenPresets.map((preset) => (
              <Button
                key={preset.label}
                type="button"
                size="sm"
                variant={approveAmount === preset.value ? 'default' : 'secondary'}
                onClick={() => setApproveAmount(preset.value)}
              >
                {preset.label}
              </Button>
            ))}
          </div>
          <Input
            label={`Amount (${tokenSymbol})`}
            value={approveAmount}
            onChange={(e) => setApproveAmount(e.target.value)}
            placeholder="50000"
            inputMode="decimal"
          />
          {dialogError && <p className="text-sm text-destructive">{dialogError}</p>}
          <DialogFooter>
            <Button type="button" size="sm" variant="secondary" onClick={() => setApproveOpen(false)}>
              Cancel
            </Button>
            <Button type="button" size="sm" disabled={writePending} onClick={() => void submitApprove()}>
              {writePending ? 'Confirm in wallet…' : 'Approve'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={depositOpen} onOpenChange={(open) => { if (!open) setDepositOpen(false); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Add {nativeSymbol}</DialogTitle>
            <DialogDescription className="text-foreground/75">
              Deposit {nativeSymbol} into the payout contract. Native sends pull from this balance.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-wrap gap-2">
            {ethPresets.map((preset) => (
              <Button
                key={preset.label}
                type="button"
                size="sm"
                variant={depositAmount === preset.value ? 'default' : 'secondary'}
                onClick={() => setDepositAmount(preset.value)}
              >
                {preset.label}
              </Button>
            ))}
          </div>
          <Input
            label={`Amount (${nativeSymbol})`}
            value={depositAmount}
            onChange={(e) => setDepositAmount(e.target.value)}
            placeholder="1.0"
            inputMode="decimal"
          />
          {dialogError && <p className="text-sm text-destructive">{dialogError}</p>}
          <DialogFooter>
            <Button type="button" size="sm" variant="secondary" onClick={() => setDepositOpen(false)}>
              Cancel
            </Button>
            <Button type="button" size="sm" disabled={writePending} onClick={() => void submitDeposit()}>
              {writePending ? 'Confirm in wallet…' : `Add ${nativeSymbol}`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

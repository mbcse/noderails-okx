'use client';

import { useEffect, useState } from 'react';
import { Plus, Trash2, Upload } from 'lucide-react';
import { Input, Select, Textarea } from '@/components/ui';
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
import type { Family, PayoutContact, PayoutRow, SendMode } from './payouts-types';

export function PayoutSendPanel({
  family,
  rows,
  onRowsChange,
  contacts,
  sendMode,
  onSendModeChange,
  onceLocal,
  onOnceLocalChange,
  intervalDays,
  onIntervalDaysChange,
  startLocal,
  onStartLocalChange,
  tokenSymbol,
  nativeSymbol,
  isNative,
  recipientsTotal,
  feeTotal,
  merchantPaysTotal,
  availableFormatted,
  coverageNeeded,
  needLine,
  covered,
  saving,
  writePending,
  walletReady,
  appEnv,
  payoutWallet,
  canSend,
  onSend,
  onApprove,
  onDeposit,
  csvText,
  onCsvTextChange,
  csvPreview,
  onPreviewCsv,
  onApplyCsv,
}: {
  family: Family;
  rows: PayoutRow[];
  onRowsChange: (rows: PayoutRow[]) => void;
  contacts: PayoutContact[];
  sendMode: SendMode;
  onSendModeChange: (mode: SendMode) => void;
  onceLocal: string;
  onOnceLocalChange: (value: string) => void;
  intervalDays: string;
  onIntervalDaysChange: (value: string) => void;
  startLocal: string;
  onStartLocalChange: (value: string) => void;
  tokenSymbol: string;
  nativeSymbol: string;
  isNative: boolean;
  recipientsTotal: string;
  feeTotal: string;
  merchantPaysTotal: string;
  availableFormatted: string;
  coverageNeeded: string;
  needLine: string | null;
  covered: boolean;
  saving: boolean;
  writePending: boolean;
  walletReady: boolean;
  appEnv: 'TEST' | 'PRODUCTION';
  payoutWallet?: string | null;
  canSend: boolean;
  onSend: () => void;
  onApprove: (amount: string) => Promise<void>;
  onDeposit: (amount: string) => Promise<void>;
  csvText: string;
  onCsvTextChange: (value: string) => void;
  csvPreview: { lines?: unknown[]; errors?: Array<{ row?: number; message: string }> } | null;
  onPreviewCsv: () => void;
  onApplyCsv: (saveBook: boolean) => void;
}) {
  const [importOpen, setImportOpen] = useState(false);
  const [coverageOpen, setCoverageOpen] = useState(false);
  const [coverageAmount, setCoverageAmount] = useState('');
  const [coverageError, setCoverageError] = useState('');
  const modes: SendMode[] = family === 'SUI' ? ['now'] : ['now', 'once', 'recurring'];
  const filledRows = rows.filter((row) => row.recipient.trim() && row.amount.trim()).length;

  useEffect(() => {
    if (coverageOpen) setCoverageAmount(coverageNeeded);
  }, [coverageOpen, coverageNeeded]);

  const setRow = (index: number, patch: Partial<PayoutRow>) => {
    onRowsChange(rows.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  };

  const addFromContact = (contactId: string) => {
    const contact = contacts.find((c) => c.id === contactId);
    if (!contact) return;
    if (family !== 'EVM') {
      onRowsChange([{ recipient: contact.wallet, amount: rows[0]?.amount ?? '', email: contact.email ?? '' }]);
      return;
    }
    onRowsChange([...rows.filter((r) => r.recipient || r.amount), { recipient: contact.wallet, amount: '', email: contact.email ?? '' }]);
  };

  const handleSend = () => {
    if (sendMode === 'now' && family === 'EVM' && !covered && recipientsTotal) {
      setCoverageError('');
      setCoverageAmount(coverageNeeded);
      setCoverageOpen(true);
      return;
    }
    onSend();
  };

  const submitCoverage = async () => {
    setCoverageError('');
    if (!coverageAmount.trim()) {
      setCoverageError(isNative ? `Enter how much ${nativeSymbol} to add.` : 'Enter the amount to approve.');
      return;
    }
    try {
      if (isNative) await onDeposit(coverageAmount.trim());
      else await onApprove(coverageAmount.trim());
      setCoverageOpen(false);
    } catch (err: unknown) {
      setCoverageError(err instanceof Error ? err.message : isNative ? 'Deposit failed' : 'Approve failed');
    }
  };

  return (
    <div className="space-y-5">
      <div className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold text-foreground">Recipients</h2>
            <p className="mt-0.5 text-xs text-muted-foreground">Who gets paid in this payout.</p>
          </div>
          <Button type="button" size="sm" variant="secondary" onClick={() => setImportOpen(true)}>
            <Upload className="h-3.5 w-3.5" />
            Import CSV
          </Button>
        </div>

        <div className="space-y-2">
          <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_7.5rem_2rem] items-center gap-2">
            <p className="text-[11px] font-medium text-muted-foreground">Wallet</p>
            <p className="text-[11px] font-medium text-muted-foreground">Email (optional)</p>
            <p className="text-[11px] font-medium text-muted-foreground">Amount</p>
            <span />
          </div>
          {rows.map((row, i) => (
            <div key={i} className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_7.5rem_2rem] items-center gap-2">
              <Input
                value={row.recipient}
                onChange={(e) => setRow(i, { recipient: e.target.value })}
                placeholder="0x…"
                className="!py-2"
              />
              <Input
                value={row.email ?? ''}
                onChange={(e) => setRow(i, { email: e.target.value })}
                placeholder="payee@email.com"
                className="!py-2"
              />
              <Input
                value={row.amount}
                onChange={(e) => setRow(i, { amount: e.target.value })}
                placeholder="100.50"
                className="!py-2"
              />
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-9 w-8 px-0"
                disabled={rows.length === 1}
                onClick={() => onRowsChange(rows.filter((_, j) => j !== i))}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
          ))}
          {recipientsTotal && (
            <div className="space-y-1 border-t border-border pt-2">
            <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_7.5rem_2rem] items-center gap-2">
              <p className="text-xs text-muted-foreground">
                Recipients{filledRows > 1 ? ` (${filledRows})` : ''}
              </p>
              <span />
                <p className="text-right font-mono text-[13px] text-foreground">{recipientsTotal}</p>
                <span />
              </div>
              {feeTotal && (
                <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_7.5rem_2rem] items-center gap-2">
                  <p className="text-xs text-muted-foreground">Fee</p>
                  <span />
                  <p className="text-right font-mono text-[13px] text-muted-foreground">+{feeTotal}</p>
                  <span />
                </div>
              )}
              <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_7.5rem_2rem] items-center gap-2">
                <p className="text-xs font-medium text-foreground">You pay</p>
                <span />
                <p className="text-right font-mono text-[13px] font-medium text-foreground">
                  {merchantPaysTotal} {tokenSymbol}
                </p>
                <span />
              </div>
            </div>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {family === 'EVM' && (
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => onRowsChange([...rows, { recipient: '', amount: '', email: '' }])}
            >
              <Plus className="h-3 w-3" />
              Add recipient
            </Button>
          )}
          {family !== 'EVM' && (
            <p className="text-xs text-muted-foreground">One recipient per payout on {family}.</p>
          )}
          {contacts.length > 0 && (
            <div className="w-52 shrink-0">
              <Select
                value=""
                className="!py-1.5 !text-xs"
                onChange={(e) => addFromContact(e.target.value)}
                options={[
                  { value: '', label: 'From recipients' },
                  ...contacts.map((c) => ({ value: c.id, label: `${c.label} · ${c.wallet}` })),
                ]}
              />
            </div>
          )}
        </div>
      </div>

      <div className="space-y-3 border-t border-border pt-4">
        <p className="text-sm font-semibold text-foreground">When</p>
        <div className="flex flex-wrap gap-1.5">
          {modes.map((mode) => (
            <Button
              key={mode}
              type="button"
              size="sm"
              variant={sendMode === mode ? 'default' : 'secondary'}
              onClick={() => onSendModeChange(mode)}
            >
              {mode === 'now' ? 'Now' : mode === 'once' ? 'Later' : 'Recurring'}
            </Button>
          ))}
        </div>
        {family === 'SUI' && (
          <p className="text-xs text-muted-foreground">
            Sui payouts can be created now. Scheduling and on-chain execute are not enabled yet.
          </p>
        )}
        {sendMode === 'once' && (
          <div className="max-w-[16rem]">
            <Input
              type="datetime-local"
              label="Send at"
              value={onceLocal}
              onChange={(e) => onOnceLocalChange(e.target.value)}
              className="!py-2"
            />
          </div>
        )}
        {sendMode === 'recurring' && (
          <div className="grid gap-2 sm:grid-cols-3">
            <Select
              label="Preset"
              value={['7', '14', '30', '90'].includes(intervalDays) ? intervalDays : ''}
              onChange={(e) => { if (e.target.value) onIntervalDaysChange(e.target.value); }}
              options={[
                { value: '', label: 'Custom' },
                { value: '7', label: 'Every 7 days' },
                { value: '14', label: 'Every 14 days' },
                { value: '30', label: 'Every 30 days' },
                { value: '90', label: 'Every 90 days' },
              ]}
            />
            <Input
              label="Days (1-365)"
              type="number"
              min={1}
              max={365}
              value={intervalDays}
              onChange={(e) => onIntervalDaysChange(e.target.value)}
              className="!py-2"
            />
            <Input
              type="datetime-local"
              label="First run"
              value={startLocal}
              onChange={(e) => onStartLocalChange(e.target.value)}
              className="!py-2"
            />
          </div>
        )}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
        <div className="min-w-0 space-y-1">
          {needLine && (
            <p className={`text-xs ${covered ? 'text-muted-foreground' : 'text-amber-800'}`}>
              {needLine}
            </p>
          )}
          {family === 'SOLANA' && (
            <p className="text-xs text-muted-foreground">Native SOL only, one recipient per send.</p>
          )}
        </div>
        <Button type="button" size="sm" disabled={saving || !canSend} onClick={handleSend}>
          {saving ? 'Working…' : sendMode === 'now' ? 'Send payout' : sendMode === 'once' ? 'Schedule payout' : 'Create schedule'}
        </Button>
      </div>

      <Dialog open={coverageOpen} onOpenChange={(open) => { if (!open) setCoverageOpen(false); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{isNative ? `Add more ${nativeSymbol}` : 'Approve more'}</DialogTitle>
            <DialogDescription className="text-foreground/75">
              {isNative
                ? `On-contract balance is ${availableFormatted} ${nativeSymbol}. This send needs ${merchantPaysTotal} ${nativeSymbol}. Add the shortfall before sending.`
                : `Approved amount is ${availableFormatted} ${tokenSymbol}. This send needs ${merchantPaysTotal} ${tokenSymbol}. Approve at least that much. ERC-20 approve replaces the current allowance.`}
            </DialogDescription>
          </DialogHeader>
          {!walletReady && (
            <PayoutWalletSession appEnv={appEnv} payoutWallet={payoutWallet} />
          )}
          <Input
            label={isNative ? `Add (${nativeSymbol})` : `Approve (${tokenSymbol})`}
            value={coverageAmount}
            onChange={(e) => setCoverageAmount(e.target.value)}
            inputMode="decimal"
          />
          {coverageError && <p className="text-sm text-destructive">{coverageError}</p>}
          <DialogFooter>
            <Button type="button" size="sm" variant="secondary" onClick={() => setCoverageOpen(false)}>
              Cancel
            </Button>
            <Button
              type="button"
              size="sm"
              disabled={writePending || !walletReady}
              onClick={() => void submitCoverage()}
            >
              {writePending
                ? 'Confirm in wallet…'
                : isNative
                  ? `Add ${nativeSymbol}`
                  : 'Approve'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={importOpen} onOpenChange={(open) => { if (!open) setImportOpen(false); }}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Import CSV</DialogTitle>
            <DialogDescription className="text-foreground/75">
              Header must be <code>label,wallet,email,amount</code>. Email and amount are optional.
            </DialogDescription>
          </DialogHeader>
          <Textarea
            className="min-h-32 font-mono text-xs"
            value={csvText}
            onChange={(e) => onCsvTextChange(e.target.value)}
            placeholder={'label,wallet,email,amount\nAlice,0x…,alice@email.com,100.50'}
          />
          {csvPreview && (
            <div className="space-y-1 text-xs">
              <p>
                {(csvPreview.lines ?? []).length} valid rows. {(csvPreview.errors ?? []).length} errors.
              </p>
              {(csvPreview.errors ?? []).slice(0, 8).map((e, i) => (
                <p key={i} className="text-destructive">Row {e.row ?? '?'}: {e.message}</p>
              ))}
            </div>
          )}
          <DialogFooter>
            <Button type="button" size="sm" variant="secondary" onClick={() => void onPreviewCsv()}>
              Preview
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={() => {
                void onApplyCsv(false);
                setImportOpen(false);
              }}
            >
              Add to this send
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

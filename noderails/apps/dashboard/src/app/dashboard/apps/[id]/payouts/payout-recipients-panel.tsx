'use client';

import { useState } from 'react';
import { BookUser, Pencil, Trash2, Upload } from 'lucide-react';
import { Input, Table, Textarea } from '@/components/ui';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import type { PayoutContact } from './payouts-types';
import { shortWallet } from './payouts-types';

export function PayoutRecipientsPanel({
  contacts,
  bookLabel,
  bookWallet,
  bookEmail,
  onBookLabelChange,
  onBookWalletChange,
  onBookEmailChange,
  onAdd,
  onRemove,
  editingId,
  editLabel,
  onStartEdit,
  onEditLabelChange,
  onSaveEdit,
  csvText,
  onCsvTextChange,
  csvPreview,
  onPreviewCsv,
  onImportToBook,
}: {
  contacts: PayoutContact[];
  bookLabel: string;
  bookWallet: string;
  bookEmail: string;
  onBookLabelChange: (value: string) => void;
  onBookWalletChange: (value: string) => void;
  onBookEmailChange: (value: string) => void;
  onAdd: () => void;
  onRemove: (id: string) => void;
  editingId: string | null;
  editLabel: string;
  onStartEdit: (id: string, label: string) => void;
  onEditLabelChange: (value: string) => void;
  onSaveEdit: (id: string) => void;
  csvText: string;
  onCsvTextChange: (value: string) => void;
  csvPreview: { lines?: unknown[]; errors?: Array<{ row?: number; message: string }> } | null;
  onPreviewCsv: () => void;
  onImportToBook: () => void;
}) {
  const [importOpen, setImportOpen] = useState(false);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-foreground">Recipients</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">Address book</p>
        </div>
        <Button type="button" size="sm" variant="secondary" onClick={() => setImportOpen(true)}>
          <Upload className="h-3.5 w-3.5" />
          Import CSV
        </Button>
      </div>

      <div className="grid items-end gap-2 sm:grid-cols-[1fr_1fr_1fr_auto]">
        <Input label="Name" value={bookLabel} onChange={(e) => onBookLabelChange(e.target.value)} placeholder="Alice" className="!py-2" />
        <Input label="Wallet" value={bookWallet} onChange={(e) => onBookWalletChange(e.target.value)} placeholder="0x…" className="!py-2" />
        <Input label="Email" value={bookEmail} onChange={(e) => onBookEmailChange(e.target.value)} placeholder="optional" className="!py-2" />
        <Button type="button" size="sm" className="h-[38px]" onClick={onAdd} disabled={!bookLabel.trim() || !bookWallet.trim()}>
          Add
        </Button>
      </div>

      {contacts.length === 0 ? (
        <EmptyState
          icon={BookUser}
          title="No recipients yet"
          description="Add a name, wallet, and optional email, or import a CSV with label,wallet,email,amount."
        />
      ) : (
        <Table headers={['Name', 'Wallet', 'Email', '']}>
          {contacts.map((c) => (
            <tr key={c.id}>
              <td className="px-4 py-3 text-sm">
                {editingId === c.id ? (
                  <Input value={editLabel} onChange={(e) => onEditLabelChange(e.target.value)} />
                ) : (
                  <span className="font-medium text-foreground">{c.label}</span>
                )}
              </td>
              <td className="px-4 py-3 font-mono text-[13px] text-muted-foreground" title={c.wallet}>
                {shortWallet(c.wallet)}
              </td>
              <td className="px-4 py-3 text-[13px] text-muted-foreground">
                {c.email ?? '—'}
              </td>
              <td className="px-4 py-3 text-right">
                {editingId === c.id ? (
                  <Button type="button" variant="secondary" size="sm" onClick={() => onSaveEdit(c.id)}>
                    Save
                  </Button>
                ) : (
                  <div className="inline-flex gap-1">
                    <Button type="button" variant="ghost" size="sm" onClick={() => onStartEdit(c.id, c.label)}>
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button type="button" variant="ghost" size="sm" onClick={() => onRemove(c.id)}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                )}
              </td>
            </tr>
          ))}
        </Table>
      )}

      <Dialog open={importOpen} onOpenChange={(open) => { if (!open) setImportOpen(false); }}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Import recipients</DialogTitle>
            <DialogDescription className="text-foreground/75">
              Header must be <code>label,wallet,email,amount</code>. Email and amount are optional.
            </DialogDescription>
          </DialogHeader>
          <Textarea
            className="min-h-32 font-mono text-xs"
            value={csvText}
            onChange={(e) => onCsvTextChange(e.target.value)}
            placeholder={'label,wallet,email,amount\nAlice,0x…,alice@email.com,'}
          />
          {csvPreview && (
            <div className="space-y-1 text-[13px]">
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
                void onImportToBook();
                setImportOpen(false);
              }}
            >
              Save to recipients
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

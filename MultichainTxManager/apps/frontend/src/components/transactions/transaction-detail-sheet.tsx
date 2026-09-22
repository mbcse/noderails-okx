"use client";

import type { ReactNode } from "react";
import { format } from "date-fns";
import { Copy } from "lucide-react";
import { toast } from "sonner";

import { useTransaction } from "@/hooks/use-transactions";
import { copyToClipboard } from "@/lib/utils";
import { humanizeTxError } from "@/lib/humanize-tx-error";
import { Button } from "@/components/ui/button";
import { ExplorerLink } from "@/components/ui/explorer-link";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { TransactionStatusBadge } from "./transaction-status-badge";
import type { Transaction } from "@mtxm/shared";

function DetailRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-[7rem_1fr] items-start gap-3 text-sm">
      <span className="text-muted-foreground pt-0.5">{label}</span>
      <div className="min-w-0 break-all">{children}</div>
    </div>
  );
}

function snippet(value: unknown, max = 2000): string {
  try {
    const raw = JSON.stringify(value, null, 2);
    if (!raw) return "";
    return raw.length > max ? `${raw.slice(0, max)}\n…` : raw;
  } catch {
    return String(value);
  }
}

interface TransactionDetailSheetProps {
  projectId: string;
  transactionId: string | null;
  /** List-row seed so the sheet can render before / without the detail fetch. */
  transaction?: Transaction | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function TransactionDetailSheet({
  projectId,
  transactionId,
  transaction,
  open,
  onOpenChange,
}: TransactionDetailSheetProps) {
  const { data: resp, isLoading } = useTransaction(projectId, transactionId ?? "");
  const tx = resp?.data ?? transaction ?? null;

  async function handleCopyError() {
    if (!tx?.errorMessage) return;
    const ok = await copyToClipboard(tx.errorMessage);
    if (ok) toast.success("Error log copied");
  }

  const showFailure = tx && (tx.status === "FAILED" || tx.status === "STUCK" || tx.errorMessage);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="flex flex-col sm:max-w-xl">
        {isLoading || !tx ? (
          <div className="space-y-4 pt-8">
            <Skeleton className="h-6 w-48" />
            <Skeleton className="h-4 w-64" />
            <div className="space-y-2 pt-4">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-10 w-full rounded-lg" />
              ))}
            </div>
          </div>
        ) : (
          <>
            <SheetHeader>
              <SheetTitle className="flex items-center gap-2">
                Transaction
                <TransactionStatusBadge status={tx.status} />
              </SheetTitle>
              <SheetDescription>
                {tx.chain?.name ?? "Unknown chain"}
                {showFailure ? ` · ${humanizeTxError(tx.errorMessage)}` : null}
              </SheetDescription>
            </SheetHeader>

            <div className="flex-1 overflow-y-auto -mx-6 px-6 pb-6 space-y-4 pt-4">
              <div className="space-y-3">
                <DetailRow label="Chain">{tx.chain?.name ?? "—"}</DetailRow>
                <DetailRow label="From">
                  <ExplorerLink
                    value={tx.from}
                    explorerUrl={tx.chain?.explorerUrl}
                    type="address"
                    startChars={10}
                    endChars={8}
                  />
                </DetailRow>
                <DetailRow label="To">
                  <ExplorerLink
                    value={tx.to}
                    explorerUrl={tx.chain?.explorerUrl}
                    type="address"
                    startChars={10}
                    endChars={8}
                  />
                </DetailRow>
                <DetailRow label="Hash">
                  {tx.hash ? (
                    <ExplorerLink
                      value={tx.hash}
                      explorerUrl={tx.chain?.explorerUrl}
                      type="tx"
                      startChars={10}
                      endChars={8}
                    />
                  ) : (
                    "—"
                  )}
                </DetailRow>
                <DetailRow label="Nonce">
                  <span className="font-mono text-xs">{tx.nonce ?? "—"}</span>
                </DetailRow>
                <DetailRow label="Attempts">
                  <span className="font-mono text-xs">{tx.attempts}</span>
                </DetailRow>
                <DetailRow label="Created">
                  {format(new Date(tx.createdAt), "PPpp")}
                </DetailRow>
                <DetailRow label="Updated">
                  {format(new Date(tx.updatedAt), "PPpp")}
                </DetailRow>
                {tx.confirmedAt && (
                  <DetailRow label="Confirmed">
                    {format(new Date(tx.confirmedAt), "PPpp")}
                  </DetailRow>
                )}
              </div>

              {showFailure && (
                <>
                  <Separator />
                  <div className="space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <h4 className="text-sm font-semibold">Failure</h4>
                      {tx.errorMessage && (
                        <Button variant="outline" size="sm" className="h-7 text-xs" onClick={handleCopyError}>
                          <Copy className="mr-1 h-3 w-3" />
                          Copy
                        </Button>
                      )}
                    </div>
                    <p className="text-sm">{humanizeTxError(tx.errorMessage)}</p>
                    {tx.errorMessage && (
                      <pre className="whitespace-pre-wrap break-all rounded-md border bg-muted/50 p-3 font-mono text-[11px] leading-relaxed">
                        {tx.errorMessage}
                      </pre>
                    )}
                  </div>
                </>
              )}

              {tx.receipt != null && (
                <>
                  <Separator />
                  <div className="space-y-2">
                    <h4 className="text-sm font-semibold">Receipt</h4>
                    <pre className="max-h-48 overflow-auto whitespace-pre-wrap break-all rounded-md border bg-muted/50 p-3 font-mono text-[11px] leading-relaxed">
                      {snippet(tx.receipt)}
                    </pre>
                  </div>
                </>
              )}

              {tx.metadata && Object.keys(tx.metadata).length > 0 && (
                <>
                  <Separator />
                  <div className="space-y-2">
                    <h4 className="text-sm font-semibold">Metadata</h4>
                    <pre className="max-h-48 overflow-auto whitespace-pre-wrap break-all rounded-md border bg-muted/50 p-3 font-mono text-[11px] leading-relaxed">
                      {snippet(tx.metadata)}
                    </pre>
                  </div>
                </>
              )}
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}

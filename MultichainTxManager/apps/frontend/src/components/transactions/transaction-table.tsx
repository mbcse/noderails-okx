"use client";

import { formatDistanceToNow } from "date-fns";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ExplorerLink } from "@/components/ui/explorer-link";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { TransactionStatusBadge } from "./transaction-status-badge";
import { humanizeTxError } from "@/lib/humanize-tx-error";
import type { Transaction } from "@mtxm/shared";

interface TransactionTableProps {
  transactions: Transaction[];
  page: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  onRowClick?: (tx: Transaction) => void;
  emptyLabel?: string;
}

export function TransactionTable({
  transactions,
  page,
  totalPages,
  onPageChange,
  onRowClick,
  emptyLabel = "No transactions yet. Send a transaction to get started.",
}: TransactionTableProps) {
  if (transactions.length === 0) {
    return (
      <div className="rounded-lg border p-12 text-center text-muted-foreground">
        {emptyLabel}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Hash</TableHead>
              <TableHead>From</TableHead>
              <TableHead>To</TableHead>
              <TableHead>Chain</TableHead>
              <TableHead>Nonce</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Time</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {transactions.map((tx) => {
              const showReason =
                (tx.status === "FAILED" || tx.status === "STUCK") && tx.errorMessage;
              return (
                <TableRow
                  key={tx.id}
                  className={onRowClick ? "cursor-pointer" : undefined}
                  tabIndex={onRowClick ? 0 : undefined}
                  onClick={() => onRowClick?.(tx)}
                  onKeyDown={(e) => {
                    if (!onRowClick) return;
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      onRowClick(tx);
                    }
                  }}
                >
                  <TableCell className="font-mono text-xs" onClick={(e) => e.stopPropagation()}>
                    {tx.hash ? (
                      <ExplorerLink
                        value={tx.hash}
                        explorerUrl={tx.chain?.explorerUrl}
                        type="tx"
                        startChars={8}
                        endChars={6}
                      />
                    ) : "—"}
                  </TableCell>
                  <TableCell className="font-mono text-xs" onClick={(e) => e.stopPropagation()}>
                    <ExplorerLink
                      value={tx.from}
                      explorerUrl={tx.chain?.explorerUrl}
                      type="address"
                    />
                  </TableCell>
                  <TableCell className="font-mono text-xs" onClick={(e) => e.stopPropagation()}>
                    <ExplorerLink
                      value={tx.to}
                      explorerUrl={tx.chain?.explorerUrl}
                      type="address"
                    />
                  </TableCell>
                  <TableCell>{tx.chain?.name ?? "—"}</TableCell>
                  <TableCell className="font-mono text-xs">
                    {tx.nonce ?? "—"}
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-col gap-0.5">
                      <TransactionStatusBadge status={tx.status} />
                      {showReason && (
                        <span className="max-w-[14rem] truncate text-[11px] text-muted-foreground" title={tx.errorMessage ?? undefined}>
                          {humanizeTxError(tx.errorMessage)}
                        </span>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {formatDistanceToNow(new Date(tx.createdAt), { addSuffix: true })}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-end gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={page <= 1}
            onClick={() => onPageChange(page - 1)}
          >
            <ChevronLeft className="mr-1 h-4 w-4" />
            Previous
          </Button>
          <span className="text-sm text-muted-foreground">
            Page {page} of {totalPages}
          </span>
          <Button
            variant="outline"
            size="sm"
            disabled={page >= totalPages}
            onClick={() => onPageChange(page + 1)}
          >
            Next
            <ChevronRight className="mr-1 h-4 w-4" />
          </Button>
        </div>
      )}
    </div>
  );
}

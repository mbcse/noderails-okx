"use client";

import { use, useState } from "react";
import { Plus } from "lucide-react";
import { useTransactions } from "@/hooks/use-transactions";
import { useChains } from "@/hooks/use-chains";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { TransactionTable } from "@/components/transactions/transaction-table";
import { TransactionDetailSheet } from "@/components/transactions/transaction-detail-sheet";
import { SendTransactionDialog } from "@/components/transactions/send-transaction-dialog";
import type { Transaction, TransactionFilters, TransactionStatus } from "@mtxm/shared";

interface TransactionsPageProps {
  params: Promise<{ projectId: string }>;
}

const STATUS_FILTERS: { label: string; value?: TransactionStatus }[] = [
  { label: "All" },
  { label: "Failed", value: "FAILED" },
  { label: "Stuck", value: "STUCK" },
  { label: "Confirmed", value: "CONFIRMED" },
];

export default function TransactionsPage({ params }: TransactionsPageProps) {
  const { projectId } = use(params);
  const [filters, setFilters] = useState<TransactionFilters>({ page: 1, limit: 20 });
  const { data: txResponse, isLoading } = useTransactions(projectId, filters);
  const { data: chainsResponse } = useChains(projectId);
  const [isSendOpen, setIsSendOpen] = useState(false);
  const [selectedTx, setSelectedTx] = useState<Transaction | null>(null);

  const transactions = txResponse?.data?.data ?? [];
  const totalPages = txResponse?.data?.totalPages ?? 1;
  const chains = chainsResponse?.data ?? [];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Transactions</h2>
          <p className="text-muted-foreground">View and manage signed transactions</p>
        </div>
        <Button onClick={() => setIsSendOpen(true)}>
          <Plus className="mr-2 h-4 w-4" />
          Send Transaction
        </Button>
      </div>

      <div className="flex flex-wrap gap-2">
        {STATUS_FILTERS.map((filter) => {
          const active = filters.status === filter.value;
          return (
            <Button
              key={filter.label}
              variant={active ? "default" : "outline"}
              size="sm"
              onClick={() =>
                setFilters((prev) => ({
                  ...prev,
                  page: 1,
                  status: filter.value,
                }))
              }
            >
              {filter.label}
            </Button>
          );
        })}
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-14 w-full rounded-lg" />
          ))}
        </div>
      ) : (
        <TransactionTable
          transactions={transactions}
          page={filters.page ?? 1}
          totalPages={totalPages}
          onPageChange={(page) => setFilters((prev) => ({ ...prev, page }))}
          onRowClick={(tx) => setSelectedTx(tx)}
          emptyLabel={
            filters.status
              ? `No ${filters.status.toLowerCase()} transactions.`
              : "No transactions yet. Send a transaction to get started."
          }
        />
      )}

      <TransactionDetailSheet
        projectId={projectId}
        transactionId={selectedTx?.id ?? null}
        transaction={selectedTx}
        open={!!selectedTx}
        onOpenChange={(open) => {
          if (!open) setSelectedTx(null);
        }}
      />

      <SendTransactionDialog
        projectId={projectId}
        chains={chains}
        open={isSendOpen}
        onOpenChange={setIsSendOpen}
      />
    </div>
  );
}

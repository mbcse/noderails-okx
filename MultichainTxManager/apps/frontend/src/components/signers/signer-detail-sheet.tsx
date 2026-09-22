"use client";

import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Copy, RefreshCw, Crown, Wallet, ArrowUpRight, Eraser } from "lucide-react";
import { toast } from "sonner";

import { useSignerDetail } from "@/hooks/use-signers";
import { apiClient } from "@/lib/api-client";
import { copyToClipboard } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ExplorerLink } from "@/components/ui/explorer-link";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import type { SignerChainBalance, SignerTransaction, FundingLog } from "@mtxm/shared";
import { TRANSACTION_STATUS_CONFIG } from "@mtxm/shared";

// ────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────

function formatBalance(bal: string): string {
  const n = parseFloat(bal);
  if (n === 0) return "0";
  if (n < 0.0001) return "<0.0001";
  return n.toFixed(4);
}

function statusBadge(status: string) {
  const cfg = TRANSACTION_STATUS_CONFIG[status as keyof typeof TRANSACTION_STATUS_CONFIG];
  if (!cfg) return <Badge variant="outline">{status}</Badge>;
  return (
    <Badge variant={cfg.variant} className="gap-1 text-[10px]">
      <span className={`inline-block h-1.5 w-1.5 rounded-full ${cfg.dotColor}`} />
      {cfg.label}
    </Badge>
  );
}

function timeAgo(dateStr: string): string {
  const seconds = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

// ────────────────────────────────────────────────────────────
// Balance card
// ────────────────────────────────────────────────────────────

function BalanceCard({
  balance,
  onFund,
  isFunding,
  onTransfer,
  onResetNonce,
  isResettingNonce,
}: {
  balance: SignerChainBalance;
  onFund?: () => void;
  isFunding?: boolean;
  onTransfer?: () => void;
  onResetNonce?: () => void;
  isResettingNonce?: boolean;
}) {
  return (
    <div className="rounded-lg border px-3 py-2">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-sm font-medium truncate">{balance.chainName}</span>
          {balance.isTestnet && (
            <Badge variant="outline" className="text-[10px] px-1 py-0 shrink-0">
              testnet
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {balance.error ? (
            <span className="text-xs text-red-500">{balance.error}</span>
          ) : (
            <span className="font-mono text-sm font-medium whitespace-nowrap">
              {formatBalance(balance.balanceFormatted)}{" "}
              <span className="text-muted-foreground text-xs">
                {balance.nativeCurrency}
              </span>
            </span>
          )}
          {onTransfer && (
            <Button
              variant="outline"
              size="sm"
              className="h-6 px-2 text-[10px] shrink-0"
              onClick={onTransfer}
            >
              <ArrowUpRight className="h-3 w-3 mr-1" />
              Transfer
            </Button>
          )}
          {onFund && (
            <Button
              variant="outline"
              size="sm"
              className="h-6 px-2 text-[10px] shrink-0"
              onClick={onFund}
              disabled={isFunding}
            >
              {isFunding ? (
                <RefreshCw className="h-3 w-3 animate-spin" />
              ) : (
                <Wallet className="h-3 w-3 mr-1" />
              )}
              {isFunding ? "Funding…" : "Fund"}
            </Button>
          )}
          {onResetNonce && (
            <Button
              variant="outline"
              size="sm"
              className="h-6 px-2 text-[10px] shrink-0"
              onClick={onResetNonce}
              disabled={isResettingNonce}
            >
              {isResettingNonce ? (
                <RefreshCw className="h-3 w-3 animate-spin" />
              ) : (
                <Eraser className="h-3 w-3 mr-1" />
              )}
              {isResettingNonce ? "Resetting…" : "Reset Nonce"}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

// ────────────────────────────────────────────────────────────
// Transaction row
// ────────────────────────────────────────────────────────────

function TxRow({ tx }: { tx: SignerTransaction }) {
  return (
    <TableRow className="text-xs">
      <TableCell className="py-1.5">
        {tx.hash ? (
          <ExplorerLink
            value={tx.hash}
            explorerUrl={tx.explorerUrl}
            type="tx"
            startChars={8}
            endChars={6}
          />
        ) : (
          <span className="text-muted-foreground">pending…</span>
        )}
      </TableCell>
      <TableCell className="py-1.5">
        <span className="text-muted-foreground">{tx.chainName}</span>
      </TableCell>
      <TableCell className="py-1.5">
        <ExplorerLink
          value={tx.to}
          explorerUrl={tx.explorerUrl}
          type="address"
        />
      </TableCell>
      <TableCell className="py-1.5">{statusBadge(tx.status)}</TableCell>
      <TableCell className="py-1.5 text-muted-foreground">
        {timeAgo(tx.createdAt)}
      </TableCell>
    </TableRow>
  );
}

// ────────────────────────────────────────────────────────────
// Funding log row
// ────────────────────────────────────────────────────────────

function fundingStatusBadge(status: string) {
  switch (status) {
    case "CONFIRMED":
      return <Badge variant="default" className="text-[10px] bg-emerald-600">Confirmed</Badge>;
    case "FAILED":
      return <Badge variant="destructive" className="text-[10px]">Failed</Badge>;
    default:
      return <Badge variant="outline" className="text-[10px]">Pending</Badge>;
  }
}

function FundingLogRow({ log }: { log: FundingLog }) {
  return (
    <div className="flex items-center justify-between rounded-lg border px-3 py-2 text-xs">
      <div className="flex flex-col gap-0.5">
        <div className="flex items-center gap-1.5">
          {fundingStatusBadge(log.status)}
          <span className="text-muted-foreground">{log.chainName}</span>
          <span className="text-muted-foreground">·</span>
          <span className="text-muted-foreground">{timeAgo(log.createdAt)}</span>
        </div>
        {log.txHash && (
          <ExplorerLink
            value={log.txHash}
            explorerUrl={log.explorerUrl}
            type="tx"
            startChars={10}
            endChars={8}
            copyLabel="Funding tx hash"
          />
        )}
      </div>
      <span className="font-mono text-sm font-medium">
        +{formatBalance(log.amountFormatted)}{" "}
        <span className="text-muted-foreground text-xs">{log.nativeCurrency}</span>
      </span>
    </div>
  );
}

// ────────────────────────────────────────────────────────────
// Main component
// ────────────────────────────────────────────────────────────

interface SignerDetailSheetProps {
  projectId: string;
  signerId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function SignerDetailSheet({
  projectId,
  signerId,
  open,
  onOpenChange,
}: SignerDetailSheetProps) {
  const { data: resp, isLoading, isFetching, refetch } = useSignerDetail(projectId, signerId);
  const detail = resp?.data;
  const [fundingChainId, setFundingChainId] = useState<string | null>(null);
  const [transferChain, setTransferChain] = useState<SignerChainBalance | null>(null);
  const [transferTo, setTransferTo] = useState("");
  const [transferAmount, setTransferAmount] = useState("");
  const [drainAll, setDrainAll] = useState(true);
  const [forceNonce, setForceNonce] = useState("");
  const [resettingChainId, setResettingChainId] = useState<string | null>(null);

  const fundMutation = useMutation({
    mutationFn: (chainDbId: string) =>
      apiClient.signers.fund(projectId, signerId!, chainDbId),
    onMutate: (chainDbId) => setFundingChainId(chainDbId),
    onSuccess: (res) => {
      toast.success(`Funded successfully — tx: ${res.data?.txHash?.slice(0, 14)}…`);
      refetch();
    },
    onError: (err: Error) => {
      toast.error(`Funding failed: ${err.message}`);
    },
    onSettled: () => setFundingChainId(null),
  });

  const transferMutation = useMutation({
    mutationFn: (data: { chainId: string; toAddress: string; amountWei: string; forceNonce?: number }) =>
      apiClient.signers.emergencyTransfer(projectId, signerId!, data),
    onSuccess: (res) => {
      toast.success(`Transfer broadcast — tx: ${res.data?.txHash?.slice(0, 14)}…`);
      setTransferChain(null);
      setTransferTo("");
      setTransferAmount("");
      setForceNonce("");
      setDrainAll(true);
      refetch();
    },
    onError: (err: Error) => {
      toast.error(`Transfer failed: ${err.message}`);
    },
  });

  const resetNonceMutation = useMutation({
    mutationFn: (chainDbId: string) =>
      apiClient.signers.resetNonce(projectId, signerId!, chainDbId),
    onMutate: (chainDbId) => setResettingChainId(chainDbId),
    onSuccess: (res) => {
      toast.success(
        `Nonce reset on ${res.data?.chainName}: ${res.data?.previousNonce ?? "unset"} → ${res.data?.syncedNonce}`,
      );
      refetch();
    },
    onError: (err: Error) => {
      toast.error(`Failed to reset nonce: ${err.message}`);
    },
    onSettled: () => setResettingChainId(null),
  });

  function handleTransferSubmit() {
    if (!transferChain || !transferTo) return;

    const toTrimmed = transferTo.trim();
    if (transferChain.chainType === "SOLANA") {
      if (!/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(toTrimmed)) {
        toast.error("Invalid Solana address");
        return;
      }
    } else if (transferChain.chainType === "SUI") {
      if (!/^0x[a-fA-F0-9]{64}$/.test(toTrimmed)) {
        toast.error("Invalid Sui address");
        return;
      }
    } else {
      if (!/^0x[a-fA-F0-9]{40}$/.test(toTrimmed)) {
        toast.error("Invalid EVM address");
        return;
      }
    }

    let amountWei = "0"; // drain all
    if (!drainAll && transferAmount) {
      if (transferChain.chainType === "SOLANA" || transferChain.chainType === "SUI") {
        const raw = transferAmount.trim();
        if (!/^\d+(\.\d+)?$/.test(raw)) {
          toast.error("Amount must be a number");
          return;
        }
        amountWei = raw; // backend parses SOL/SUI → lamports/MIST
      } else {
        // Convert native units (ETH-like) → wei
        const parts = transferAmount.split(".");
        const whole = parts[0] || "0";
        const frac = (parts[1] || "").padEnd(18, "0").slice(0, 18);
        amountWei = (BigInt(whole) * 10n ** 18n + BigInt(frac)).toString();
      }
    }

    const parsedForcedNonce = transferChain.chainType === "EVM"
      ? (forceNonce.trim() === "" ? undefined : Number(forceNonce.trim()))
      : undefined;

    if (parsedForcedNonce !== undefined && (!Number.isInteger(parsedForcedNonce) || parsedForcedNonce < 0)) {
      toast.error("Force nonce must be a non-negative integer");
      return;
    }

    transferMutation.mutate({
      chainId: transferChain.chainDbId,
      toAddress: toTrimmed,
      amountWei,
      forceNonce: parsedForcedNonce,
    });
  }

  async function handleCopyAddress() {
    if (!detail?.signer.address) return;
    const ok = await copyToClipboard(detail.signer.address);
    if (ok) toast.success("Address copied");
  }

  async function handleCopyPublicKey() {
    if (!detail?.signer.publicBase64Key) return;
    const ok = await copyToClipboard(detail.signer.publicBase64Key);
    if (ok) toast.success("Public key copied");
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="flex flex-col sm:max-w-xl">
        {isLoading || !detail ? (
          <div className="space-y-4 pt-8">
            <Skeleton className="h-6 w-48" />
            <Skeleton className="h-4 w-64" />
            <div className="space-y-2 pt-4">
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-12 w-full rounded-lg" />
              ))}
            </div>
          </div>
        ) : (
          <>
            <SheetHeader>
              <SheetTitle className="flex items-center gap-2">
                {detail.signer.label}
                <Badge
                  variant={detail.signer.isActive ? "default" : "secondary"}
                  className="text-[10px]"
                >
                  {detail.signer.isActive ? "Active" : "Inactive"}
                </Badge>
                {detail.signer.isMaster && (
                  <Badge variant="default" className="gap-1 bg-amber-600 text-[10px]">
                    <Crown className="h-3 w-3" />
                    Master
                  </Badge>
                )}
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 ml-auto"
                      onClick={() => refetch()}
                      disabled={isFetching}
                    >
                      <RefreshCw className={`h-3.5 w-3.5 ${isFetching ? "animate-spin" : ""}`} />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Refresh balances & transactions</TooltipContent>
                </Tooltip>
              </SheetTitle>
              <SheetDescription className="space-y-2">
                <span className="flex items-center gap-1.5">
                  <button
                    className="inline-flex items-center gap-1 font-mono text-xs hover:text-foreground"
                    onClick={handleCopyAddress}
                  >
                    {detail.signer.address}
                    <Copy className="h-3 w-3 opacity-50" />
                  </button>
                </span>
                {detail.signer.chainType === "SUI" && detail.signer.publicBase64Key && (
                  <span className="flex flex-col gap-1">
                    <span className="text-[11px] text-muted-foreground">Public key (base64)</span>
                    <button
                      className="inline-flex items-start gap-1 font-mono text-xs hover:text-foreground text-left break-all"
                      onClick={handleCopyPublicKey}
                    >
                      {detail.signer.publicBase64Key}
                      <Copy className="h-3 w-3 opacity-50 shrink-0 mt-0.5" />
                    </button>
                  </span>
                )}
              </SheetDescription>
            </SheetHeader>

            <div className="flex-1 overflow-y-auto -mx-6 px-6 pb-6">
              {/* ── Balances ─────────────────────────────── */}
              <div className="pt-4">
                <h4 className="text-sm font-semibold mb-2">
                  Native Balances
                  <span className="ml-1.5 text-muted-foreground font-normal">
                    ({detail.balances.length} chain{detail.balances.length !== 1 ? "s" : ""})
                  </span>
                </h4>
                {detail.balances.length === 0 ? (
                  <p className="text-xs text-muted-foreground">
                    No chains configured for this project yet.
                  </p>
                ) : (
                  <div className="space-y-1.5">
                    {detail.balances.map((b) => (
                      <BalanceCard
                        key={b.chainDbId}
                        balance={b}
                        onFund={
                          !detail.signer.isMaster
                            ? () => fundMutation.mutate(b.chainDbId)
                            : undefined
                        }
                        isFunding={fundingChainId === b.chainDbId}
                        onTransfer={() => {
                          setTransferChain(b);
                          setTransferTo("");
                          setTransferAmount("");
                          setForceNonce("");
                          setDrainAll(true);
                        }}
                        onResetNonce={
                          b.chainType === "EVM"
                            ? () => resetNonceMutation.mutate(b.chainDbId)
                            : undefined
                        }
                        isResettingNonce={resetNonceMutation.isPending && resettingChainId === b.chainDbId}
                      />
                    ))}
                  </div>
                )}
              </div>

              <Separator className="my-4" />

              {/* ── Funding History ───────────────────────── */}
              {detail.fundingLogs && detail.fundingLogs.length > 0 && (
                <>
                  <div className="pb-2">
                    <h4 className="text-sm font-semibold mb-2 flex items-center gap-1.5">
                      <Wallet className="h-3.5 w-3.5" />
                      Funding History
                      <span className="text-muted-foreground font-normal">
                        ({detail.fundingLogs.length})
                      </span>
                    </h4>
                    <div className="space-y-1.5">
                      {detail.fundingLogs.map((fl: FundingLog) => (
                        <FundingLogRow key={fl.id} log={fl} />
                      ))}
                    </div>
                  </div>
                  <Separator className="my-4" />
                </>
              )}

              {/* ── Transactions ──────────────────────────── */}
              <div className="pb-6">
                <h4 className="text-sm font-semibold mb-2">
                  Transactions
                  <span className="ml-1.5 text-muted-foreground font-normal">
                    ({detail.txCount} total)
                  </span>
                </h4>
                {detail.recentTransactions.length === 0 ? (
                  <p className="text-xs text-muted-foreground">
                    No transactions sent from this signer yet.
                  </p>
                ) : (
                  <div className="rounded-lg border">
                    <Table>
                      <TableHeader>
                        <TableRow className="text-[11px]">
                          <TableHead className="py-1.5">Tx Hash</TableHead>
                          <TableHead className="py-1.5">Chain</TableHead>
                          <TableHead className="py-1.5">To</TableHead>
                          <TableHead className="py-1.5">Status</TableHead>
                          <TableHead className="py-1.5">When</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {detail.recentTransactions.map((tx) => (
                          <TxRow key={tx.id} tx={tx} />
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </div>
            </div>
          </>
        )}
      </SheetContent>

      {/* Emergency Transfer Dialog */}
      <Dialog open={!!transferChain} onOpenChange={(open) => { if (!open) setTransferChain(null); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ArrowUpRight className="h-4 w-4" />
              Emergency Transfer
            </DialogTitle>
            <DialogDescription>
              Transfer native tokens from this signer
              {transferChain ? ` on ${transferChain.chainName}` : ""}.
              {transferChain && !transferChain.error && (
                <span className="block mt-1 font-mono text-xs">
                  Available: {formatBalance(transferChain.balanceFormatted)} {transferChain.nativeCurrency}
                </span>
              )}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="transfer-to">Recipient Address</Label>
              <Input
                id="transfer-to"
                placeholder={
                  transferChain?.chainType === "SOLANA"
                    ? "Base58..."
                    : transferChain?.chainType === "SUI"
                      ? "0x... (64 hex)"
                      : "0x..."
                }
                value={transferTo}
                onChange={(e) => setTransferTo(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Label htmlFor="transfer-amount">Amount</Label>
                <label className="flex items-center gap-1.5 text-xs text-muted-foreground ml-auto cursor-pointer">
                  <input
                    type="checkbox"
                    checked={drainAll}
                    onChange={(e) => setDrainAll(e.target.checked)}
                    className="rounded"
                  />
                  Drain entire balance
                </label>
              </div>
              {!drainAll && (
                <Input
                  id="transfer-amount"
                  placeholder="0.0"
                  type="text"
                  value={transferAmount}
                  onChange={(e) => setTransferAmount(e.target.value)}
                />
              )}
            </div>
            {transferChain?.chainType === "EVM" && (
              <div className="space-y-2">
                <Label htmlFor="transfer-force-nonce">Force Nonce (optional)</Label>
                <Input
                  id="transfer-force-nonce"
                  placeholder="e.g. 18"
                  type="number"
                  min={0}
                  value={forceNonce}
                  onChange={(e) => setForceNonce(e.target.value)}
                />
                <p className="text-[11px] text-muted-foreground">
                  Leave empty to use automatic nonce manager. Set this only for recovery operations.
                </p>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setTransferChain(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={!transferTo || (!drainAll && !transferAmount) || transferMutation.isPending}
              onClick={handleTransferSubmit}
            >
              {transferMutation.isPending ? (
                <RefreshCw className="h-4 w-4 animate-spin mr-2" />
              ) : (
                <ArrowUpRight className="h-4 w-4 mr-2" />
              )}
              {transferMutation.isPending ? "Sending…" : "Send Transfer"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Sheet>
  );
}

"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

import { useSendTransaction } from "@/hooks/use-transactions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  FormDescription,
} from "@/components/ui/form";
import type { Chain } from "@mtxm/shared";

const sendTxSchema = z.object({
  chainId: z.string().min(1, "Select a chain"),
  to: z.string().min(1, "Recipient address is required"),
  value: z.string().optional(),
  data: z.string().optional(),
  gasLimit: z.string().optional(),
  metadata: z.string().optional(),
});

type FormValues = z.infer<typeof sendTxSchema>;

/**
 * Convert an ETH-denominated string (e.g. "0.01") to a wei string.
 * Pure JS — no ethers dependency needed.
 */
function ethToWei(eth: string): string {
  if (!eth || eth === "0") return "0";
  const [whole = "0", fraction = ""] = eth.split(".");
  const padded = fraction.padEnd(18, "0").slice(0, 18);
  const wei = BigInt(whole) * 10n ** 18n + BigInt(padded);
  return wei.toString();
}

function isEvmAddress(addr: string): boolean {
  return /^0x[a-fA-F0-9]{40}$/.test(addr);
}

function isSolanaAddress(addr: string): boolean {
  // Basic base58 character set + length guard (PublicKey will be validated server-side too)
  return /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(addr);
}

function isSuiAddress(addr: string): boolean {
  return /^0x[a-fA-F0-9]{64}$/.test(addr);
}

function isNumericAmount(v: string): boolean {
  return /^\d+(\.\d+)?$/.test(v);
}

interface SendTransactionDialogProps {
  projectId: string;
  chains: Chain[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function SendTransactionDialog({
  projectId,
  chains,
  open,
  onOpenChange,
}: SendTransactionDialogProps) {
  const sendTx = useSendTransaction(projectId);

  const form = useForm<FormValues>({
    resolver: zodResolver(sendTxSchema),
    defaultValues: { chainId: "", to: "", value: "0", data: "", gasLimit: "", metadata: "" },
  });

  const selectedChainDbId = form.watch("chainId");
  const selectedChain = chains.find((c) => c.id === selectedChainDbId);
  const chainType = selectedChain?.chainType ?? "EVM";
  const isNonEvm = chainType === "SOLANA" || chainType === "SUI";
  const isSolana = chainType === "SOLANA";
  const isSui = chainType === "SUI";

  async function onSubmit(values: FormValues) {
    try {
      if (!selectedChain) {
        toast.error("Select a chain");
        return;
      }

      const toTrimmed = values.to.trim();
      if (isSolana) {
        if (!isSolanaAddress(toTrimmed)) {
          form.setError("to", { message: "Invalid Solana address" });
          return;
        }
        if (values.data?.trim()) {
          form.setError("data", { message: "Data is not supported for SOLANA transfers" });
          return;
        }
        if (values.gasLimit?.trim()) {
          form.setError("gasLimit", { message: "Gas limit is not applicable on SOLANA" });
          return;
        }
      } else if (isSui) {
        if (!isSuiAddress(toTrimmed)) {
          form.setError("to", { message: "Invalid Sui address" });
          return;
        }
        if (values.data?.trim()) {
          form.setError("data", { message: "Data is not supported for SUI transfers" });
          return;
        }
        if (values.gasLimit?.trim()) {
          form.setError("gasLimit", { message: "Gas limit is not applicable on SUI" });
          return;
        }
      } else {
        if (!isEvmAddress(toTrimmed)) {
          form.setError("to", { message: "Invalid EVM address" });
          return;
        }
      }

      const rawValue = (values.value ?? "0").trim();
      if (rawValue !== "" && !isNumericAmount(rawValue)) {
        form.setError("value", { message: "Value must be a number" });
        return;
      }

      // Keep existing EVM UX: user types native units (e.g. ETH) and we convert to wei.
      // For SOLANA/SUI: send the raw native amount (decimals allowed) and let backend parse.
      const sendValue = isNonEvm
        ? (rawValue === "" ? "0" : rawValue)
        : ethToWei(rawValue === "" ? "0" : rawValue);

      // Parse metadata JSON if provided
      let parsedMetadata: Record<string, unknown> | undefined;
      if (values.metadata?.trim()) {
        try {
          parsedMetadata = JSON.parse(values.metadata);
        } catch {
          toast.error("Metadata must be valid JSON");
          return;
        }
      }

      await sendTx.mutateAsync({
        chainId: selectedChain.chainId,
        to: toTrimmed,
        value: sendValue,
        data: isNonEvm ? undefined : (values.data?.trim() ? values.data.trim() : undefined),
        gasLimit: isNonEvm ? undefined : (values.gasLimit?.trim() ? values.gasLimit.trim() : undefined),
        metadata: parsedMetadata,
      });
      toast.success("Transaction queued for signing");
      form.reset();
      onOpenChange(false);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to queue transaction");
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Send Transaction</DialogTitle>
          <DialogDescription>
            Queue a new transaction for signing and broadcasting.
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="chainId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Chain</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Select chain" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {chains.map((chain) => (
                        <SelectItem key={chain.id} value={chain.id}>
                          {chain.name} ({chain.chainId})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="to"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>To Address</FormLabel>
                  <FormControl>
                    <Input
                      placeholder={isSolana ? "Base58…" : isSui ? "0x… (64 hex)" : "0x…"}
                      className="font-mono"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="value"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>
                      Value ({selectedChain?.nativeCurrency ?? "ETH"})
                    </FormLabel>
                    <FormControl>
                      <Input placeholder="0.0" className="font-mono" {...field} />
                    </FormControl>
                    <FormDescription>Native token amount (e.g. 0.01)</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
              {!isNonEvm && (
                <FormField
                  control={form.control}
                  name="gasLimit"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Gas Limit (optional)</FormLabel>
                      <FormControl>
                        <Input placeholder="Auto" className="font-mono" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              )}
            </div>

            {!isNonEvm && (
              <FormField
                control={form.control}
                name="data"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Data (optional)</FormLabel>
                    <FormControl>
                      <Textarea
                        placeholder="0x…"
                        className="min-h-[80px] font-mono text-xs"
                        {...field}
                      />
                    </FormControl>
                    <FormDescription>Calldata hex string for contract interactions</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}

            <FormField
              control={form.control}
              name="metadata"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Metadata (optional)</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder={'{ "orderId": "abc123" }'}
                      className="min-h-[60px] font-mono text-xs"
                      {...field}
                    />
                  </FormControl>
                  <FormDescription>Arbitrary JSON passed through to webhooks</FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={sendTx.isPending}>
                {sendTx.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Send
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

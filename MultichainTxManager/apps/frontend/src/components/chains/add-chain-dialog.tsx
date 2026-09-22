"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

import { useCreateChain } from "@/hooks/use-chains";
import { COMMON_CHAINS, SOLANA_DEFAULT_CHAINS, SUI_DEFAULT_CHAINS } from "@mtxm/shared";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { ChainlistRpcPicker } from "./chainlist-rpc-picker";
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

const addChainSchema = z.object({
  chainType: z.enum(["EVM", "SOLANA", "SUI"]),
  name: z.string().min(1, "Name is required"),
  chainId: z.coerce.number().int().positive("Must be a positive integer"),
  rpcUrls: z.string().min(1, "At least one RPC URL is required"),
  explorerUrl: z.string().url().optional().or(z.literal("")),
  nativeCurrency: z.string().min(1, "Currency symbol is required"),
  isTestnet: z.boolean(),
});

type FormValues = z.infer<typeof addChainSchema>;

interface AddChainDialogProps {
  projectId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function AddChainDialog({ projectId, open, onOpenChange }: AddChainDialogProps) {
  const createChain = useCreateChain(projectId);

  const form = useForm<FormValues>({
    resolver: zodResolver(addChainSchema),
    defaultValues: {
      chainType: "EVM",
      name: "",
      chainId: 0,
      rpcUrls: "",
      explorerUrl: "",
      nativeCurrency: "",
      isTestnet: false,
    },
  });

  const chainType = form.watch("chainType");

  function handlePresetSelect(preset: string) {
    const chain = COMMON_CHAINS.find((c) => String(c.chainId) === preset);
    if (chain) {
      form.setValue("chainType", "EVM");
      form.setValue("name", chain.name);
      form.setValue("chainId", chain.chainId);
      form.setValue("nativeCurrency", chain.nativeCurrency);
      form.setValue("isTestnet", chain.isTestnet);
    }
  }

  function handleSolanaPresetSelect(presetKey: string) {
    const preset = SOLANA_DEFAULT_CHAINS.find((c) => c.key === presetKey);
    if (!preset) return;

    form.setValue("chainType", "SOLANA");
    form.setValue("name", preset.name, { shouldValidate: true });
    form.setValue("chainId", preset.chainId, { shouldValidate: true });
    form.setValue("rpcUrls", preset.rpcUrl, { shouldValidate: true });
    form.setValue("explorerUrl", preset.explorerUrl, { shouldValidate: true });
    form.setValue("nativeCurrency", preset.nativeCurrency, { shouldValidate: true });
    form.setValue("isTestnet", preset.isTestnet, { shouldValidate: true });
  }

  function handleSuiPresetSelect(presetKey: string) {
    const preset = SUI_DEFAULT_CHAINS.find((c) => c.key === presetKey);
    if (!preset) return;

    form.setValue("chainType", "SUI");
    form.setValue("name", preset.name, { shouldValidate: true });
    form.setValue("chainId", preset.chainId, { shouldValidate: true });
    form.setValue("rpcUrls", preset.rpcUrl, { shouldValidate: true });
    form.setValue("explorerUrl", preset.explorerUrl, { shouldValidate: true });
    form.setValue("nativeCurrency", preset.nativeCurrency, { shouldValidate: true });
    form.setValue("isTestnet", preset.isTestnet, { shouldValidate: true });
  }

  async function onSubmit(values: FormValues) {
    const rpcUrls = values.rpcUrls
      .split("\n")
      .map((url) => url.trim())
      .filter(Boolean);

    try {
      await createChain.mutateAsync({
        ...values,
        rpcUrls,
        explorerUrl: values.explorerUrl || undefined,
      });
      toast.success("Chain added");
      form.reset();
      onOpenChange(false);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to add chain");
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Add Chain</DialogTitle>
          <DialogDescription>Add a new blockchain network to this project.</DialogDescription>
        </DialogHeader>

        <div className="space-y-3 overflow-y-auto flex-1 pr-1">
          {/* Quick-fill from preset */}
          {chainType === "EVM" && (
            <div className="space-y-1.5">
              <span className="text-sm font-medium">Quick Fill</span>
              <Select onValueChange={handlePresetSelect}>
                <SelectTrigger>
                  <SelectValue placeholder="Select a common chain…" />
                </SelectTrigger>
                <SelectContent>
                  {COMMON_CHAINS.map((c) => (
                    <SelectItem key={c.chainId} value={String(c.chainId)}>
                      {c.name} ({c.chainId})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {chainType === "SOLANA" && (
            <div className="space-y-1.5">
              <span className="text-sm font-medium">Solana Defaults</span>
              <Select onValueChange={handleSolanaPresetSelect}>
                <SelectTrigger>
                  <SelectValue placeholder="Select Testnet / Devnet / Mainnet…" />
                </SelectTrigger>
                <SelectContent>
                  {SOLANA_DEFAULT_CHAINS.map((c) => (
                    <SelectItem key={c.key} value={c.key}>
                      {c.name} (Chain ID: {c.chainId})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Pick a default, then edit fields below if you want a custom Solana RPC.
              </p>
            </div>
          )}

          {chainType === "SUI" && (
            <div className="space-y-1.5">
              <span className="text-sm font-medium">Sui Defaults</span>
              <Select onValueChange={handleSuiPresetSelect}>
                <SelectTrigger>
                  <SelectValue placeholder="Select Mainnet / Testnet / Devnet…" />
                </SelectTrigger>
                <SelectContent>
                  {SUI_DEFAULT_CHAINS.map((c) => (
                    <SelectItem key={c.key} value={c.key}>
                      {c.name} (Chain ID: {c.chainId})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Pick a default, then edit fields below if you want a custom Sui RPC.
              </p>
            </div>
          )}

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-3">
            <FormField
              control={form.control}
              name="chainType"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Chain Type</FormLabel>
                  <Select
                    onValueChange={(v) => {
                      field.onChange(v);
                      if (v === "SOLANA" && !form.getValues("nativeCurrency")) {
                        form.setValue("nativeCurrency", "SOL", { shouldValidate: true });
                      }
                      if (v === "SUI" && !form.getValues("nativeCurrency")) {
                        form.setValue("nativeCurrency", "SUI", { shouldValidate: true });
                      }
                    }}
                    value={field.value}
                  >
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Select type" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="EVM">EVM</SelectItem>
                      <SelectItem value="SOLANA">SOLANA</SelectItem>
                      <SelectItem value="SUI">SUI</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormDescription>
                    EVM uses nonce/gas; SOLANA uses recent blockhash; SUI uses programmable transaction blocks.
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Name</FormLabel>
                    <FormControl><Input placeholder="Ethereum Mainnet" {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="chainId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{chainType === "EVM" ? "Chain ID" : "Network ID"}</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        placeholder={
                          chainType === "SOLANA" ? "101" : chainType === "SUI" ? "201" : "1"
                        }
                        {...field}
                      />
                    </FormControl>
                    {chainType === "SOLANA" && (
                      <FormDescription>
                        Solana presets: Mainnet=101, Testnet=102, Devnet=103.
                      </FormDescription>
                    )}
                    {chainType === "SUI" && (
                      <FormDescription>
                        Sui presets: Devnet=201, Testnet=202, Mainnet=203.
                      </FormDescription>
                    )}
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="rpcUrls"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>RPC URLs</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder={
                        chainType === "SOLANA"
                          ? "https://api.mainnet.solana.com"
                          : chainType === "SUI"
                            ? "https://fullnode.mainnet.sui.io:443"
                            : "https://eth-mainnet.g.alchemy.com/v2/…\nhttps://rpc.ankr.com/eth"
                      }
                      rows={2}
                      {...field}
                    />
                  </FormControl>
                  <FormDescription>One URL per line for multiple endpoints</FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            {chainType === "EVM" && (
              <ChainlistRpcPicker
                chainId={form.watch("chainId")}
                existingUrls={(form.watch("rpcUrls") || "")
                  .split("\n")
                  .map((u: string) => u.trim())
                  .filter(Boolean)}
                onSelect={(urls) => {
                  const current = form.getValues("rpcUrls").trim();
                  const newVal = current ? current + "\n" + urls.join("\n") : urls.join("\n");
                  form.setValue("rpcUrls", newVal, { shouldValidate: true });
                }}
              />
            )}

            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="nativeCurrency"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Native Currency</FormLabel>
                    <FormControl><Input placeholder="ETH" {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="explorerUrl"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Explorer URL</FormLabel>
                    <FormControl><Input placeholder="https://etherscan.io" {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="isTestnet"
              render={({ field }) => (
                <FormItem className="flex items-center justify-between rounded-lg border p-3">
                  <div>
                    <FormLabel>Testnet</FormLabel>
                    <FormDescription>Mark this chain as a test network</FormDescription>
                  </div>
                  <FormControl>
                    <Switch checked={field.value} onCheckedChange={field.onChange} />
                  </FormControl>
                </FormItem>
              )}
            />

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={createChain.isPending}>
                {createChain.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Add Chain
              </Button>
            </DialogFooter>
          </form>
        </Form>
        </div>
      </DialogContent>
    </Dialog>
  );
}

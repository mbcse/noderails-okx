"use client";

import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

import { useUpdateChain } from "@/hooks/use-chains";
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
import type { Chain } from "@mtxm/shared";

const editChainSchema = z.object({
  chainType: z.enum(["EVM", "SOLANA", "SUI"]),
  name: z.string().min(1, "Name is required").max(100),
  rpcUrls: z.string().min(1, "At least one RPC URL is required"),
  explorerUrl: z.string().url().optional().or(z.literal("")),
  isActive: z.boolean(),
});

type FormValues = z.infer<typeof editChainSchema>;

interface EditChainDialogProps {
  projectId: string;
  chain: Chain | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function EditChainDialog({
  projectId,
  chain,
  open,
  onOpenChange,
}: EditChainDialogProps) {
  const updateChain = useUpdateChain(projectId);

  const form = useForm<FormValues>({
    resolver: zodResolver(editChainSchema),
    defaultValues: {
      chainType: "EVM",
      name: "",
      rpcUrls: "",
      explorerUrl: "",
      isActive: true,
    },
  });

  const chainType = form.watch("chainType");

  // Reset the form whenever a different chain is opened
  useEffect(() => {
    if (chain && open) {
      form.reset({
        chainType: chain.chainType,
        name: chain.name,
        rpcUrls: chain.rpcUrls.join("\n"),
        explorerUrl: chain.explorerUrl ?? "",
        isActive: chain.isActive,
      });
    }
  }, [chain, open, form]);

  async function onSubmit(values: FormValues) {
    if (!chain) return;

    const rpcUrls = values.rpcUrls
      .split("\n")
      .map((url) => url.trim())
      .filter(Boolean);

    try {
      await updateChain.mutateAsync({
        chainId: chain.id,
        data: {
          chainType: values.chainType,
          name: values.name,
          rpcUrls,
          explorerUrl: values.explorerUrl || undefined,
          isActive: values.isActive,
        },
      });
      toast.success("Chain updated");
      onOpenChange(false);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to update chain");
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Edit Chain</DialogTitle>
          <DialogDescription>
            {chain ? (
              <>
                Update <span className="font-medium">{chain.name}</span>{" "}
                <span className="text-xs font-mono">(Chain ID: {chain.chainId})</span>
              </>
            ) : (
              "Update chain configuration"
            )}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 overflow-y-auto flex-1 pr-1">
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
                      Changing chain type affects how transactions are signed.
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Name</FormLabel>
                    <FormControl>
                      <Input placeholder="Ethereum Mainnet" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="rpcUrls"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>RPC URLs</FormLabel>
                    <FormControl>
                      <Textarea
                        placeholder={
                          "https://eth-mainnet.g.alchemy.com/v2/…\nhttps://rpc.ankr.com/eth"
                        }
                        rows={3}
                        {...field}
                      />
                    </FormControl>
                    <FormDescription>
                      One URL per line — add, remove, or reorder endpoints
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {chain && chainType === "EVM" && (
                <ChainlistRpcPicker
                  chainId={chain.chainId}
                  existingUrls={(form.watch("rpcUrls") || "")
                    .split("\n")
                    .map((u: string) => u.trim())
                    .filter(Boolean)}
                  onSelect={(urls) => {
                    const current = form.getValues("rpcUrls").trim();
                    const newVal = current
                      ? current + "\n" + urls.join("\n")
                      : urls.join("\n");
                    form.setValue("rpcUrls", newVal, { shouldValidate: true });
                  }}
                />
              )}

              <FormField
                control={form.control}
                name="explorerUrl"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Explorer URL</FormLabel>
                    <FormControl>
                      <Input placeholder="https://etherscan.io" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="isActive"
                render={({ field }) => (
                  <FormItem className="flex items-center justify-between rounded-lg border p-3">
                    <div>
                      <FormLabel>Active</FormLabel>
                      <FormDescription>
                        Inactive chains won't accept new transactions
                      </FormDescription>
                    </div>
                    <FormControl>
                      <Switch
                        checked={field.value}
                        onCheckedChange={field.onChange}
                      />
                    </FormControl>
                  </FormItem>
                )}
              />

              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => onOpenChange(false)}
                >
                  Cancel
                </Button>
                <Button type="submit" disabled={updateChain.isPending}>
                  {updateChain.isPending && (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  )}
                  Save Changes
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </div>
      </DialogContent>
    </Dialog>
  );
}

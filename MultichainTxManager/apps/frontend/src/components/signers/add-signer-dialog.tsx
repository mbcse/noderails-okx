"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

import { useCreateSigner } from "@/hooks/use-signers";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
import type { ChainType, KeyAdapterType } from "@mtxm/shared";

const addSignerSchema = z
  .object({
    label: z.string().min(1, "Label is required").max(64),
    chainType: z.enum(["EVM", "SOLANA", "SUI"]),
    adapterType: z.enum(["ENV", "KMS"]),
    kmsKeyId: z.string().optional(),
  })
  .refine(
    (data) => {
      if (data.chainType === "SOLANA" || data.chainType === "SUI") return data.adapterType === "ENV";
      if (data.adapterType === "KMS") return !!data.kmsKeyId;
      return true;
    },
    {
      path: ["adapterType"],
      message: "SOLANA and SUI signers currently support ENV adapter only",
    },
  )
  .refine(
    (data) => {
      if (data.adapterType === "KMS") return !!data.kmsKeyId;
      return true;
    },
    { path: ["kmsKeyId"], message: "KMS Key ID is required for KMS adapter" },
  );

type FormValues = z.infer<typeof addSignerSchema>;

interface AddSignerDialogProps {
  projectId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function AddSignerDialog({ projectId, open, onOpenChange }: AddSignerDialogProps) {
  const createSigner = useCreateSigner(projectId);

  const form = useForm<FormValues>({
    resolver: zodResolver(addSignerSchema),
    defaultValues: {
      label: "",
      chainType: "EVM",
      adapterType: "ENV",
      kmsKeyId: "",
    },
  });

  const chainType = form.watch("chainType");
  const adapterType = form.watch("adapterType");

  async function onSubmit(values: FormValues) {
    try {
      const result = await createSigner.mutateAsync({
        label: values.label,
        chainType: values.chainType as ChainType,
        adapterType: values.adapterType as KeyAdapterType,
        kmsKeyId: values.adapterType === "KMS" ? values.kmsKeyId : undefined,
      });
      const address = result?.data?.address;
      toast.success(
        address
          ? `Signer created — address: ${address}`
          : "Signer created successfully",
      );
      form.reset();
      onOpenChange(false);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to add signer");
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Add Signer</DialogTitle>
          <DialogDescription>
            Add a new signing key to this project. The signer will be available
            for all chains of this type (testnet &amp; mainnet). For ENV adapters, a fresh private
            key is generated securely on the server and stored encrypted.
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="label"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Label</FormLabel>
                  <FormControl>
                    <Input placeholder="Hot wallet #1" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="chainType"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Chain Type</FormLabel>
                  <Select
                    onValueChange={(v) => {
                      field.onChange(v);
                      if (v === "SOLANA" || v === "SUI") {
                        form.setValue("adapterType", "ENV", { shouldValidate: true });
                        form.setValue("kmsKeyId", "", { shouldValidate: true });
                      }
                    }}
                    value={field.value}
                  >
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="EVM">EVM</SelectItem>
                      <SelectItem value="SOLANA">SOLANA</SelectItem>
                      <SelectItem value="SUI">SUI</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="adapterType"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Adapter Type</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="ENV">ENV (Server-generated Key)</SelectItem>
                      <SelectItem value="KMS" disabled={chainType === "SOLANA" || chainType === "SUI"}>
                        AWS KMS
                      </SelectItem>
                    </SelectContent>
                  </Select>
                  <FormDescription>
                    {adapterType === "ENV"
                      ? "A private key will be generated server-side and AES-encrypted at rest."
                      : "Delegates signing to an AWS KMS key."}
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            {adapterType === "KMS" && (
              <FormField
                control={form.control}
                name="kmsKeyId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>KMS Key ID</FormLabel>
                    <FormControl>
                      <Input
                        placeholder="arn:aws:kms:us-east-1:…"
                        className="font-mono text-xs"
                        {...field}
                      />
                    </FormControl>
                    <FormDescription>
                      The ARN or UUID of an ECC_SECG_P256K1 key in AWS KMS.
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={createSigner.isPending}>
                {createSigner.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Add Signer
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

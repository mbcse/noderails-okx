"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

import { useCreateWebhook } from "@/hooks/use-webhooks";
import { WEBHOOK_EVENT_OPTIONS } from "@mtxm/shared";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  FormDescription,
} from "@/components/ui/form";
import type { WebhookEventType } from "@mtxm/shared";

const addWebhookSchema = z.object({
  url: z.string().url("Must be a valid URL"),
  events: z
    .array(z.string())
    .min(1, "Select at least one event"),
});

type FormValues = z.infer<typeof addWebhookSchema>;

interface AddWebhookDialogProps {
  projectId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function AddWebhookDialog({ projectId, open, onOpenChange }: AddWebhookDialogProps) {
  const createWebhook = useCreateWebhook(projectId);

  const form = useForm<FormValues>({
    resolver: zodResolver(addWebhookSchema),
    defaultValues: { url: "", events: [] },
  });

  async function onSubmit(values: FormValues) {
    try {
      const result = await createWebhook.mutateAsync({
        url: values.url,
        events: values.events as WebhookEventType[],
      });
      toast.success("Webhook created. Secret: " + result.data.secret, {
        duration: 10_000,
        description: "Copy and store this secret — it won't be shown again.",
      });
      form.reset();
      onOpenChange(false);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to create webhook");
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Add Webhook</DialogTitle>
          <DialogDescription>
            We'll send an HTTP POST with an HMAC-SHA256 signature to your endpoint.
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="url"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Endpoint URL</FormLabel>
                  <FormControl>
                    <Input placeholder="https://example.com/webhooks/tx" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="events"
              render={() => (
                <FormItem>
                  <FormLabel>Subscribe to Events</FormLabel>
                  <FormDescription>
                    Choose which transaction lifecycle events to receive.
                  </FormDescription>
                  <div className="grid grid-cols-2 gap-2 pt-1">
                    {WEBHOOK_EVENT_OPTIONS.map((option) => (
                      <FormField
                        key={option.value}
                        control={form.control}
                        name="events"
                        render={({ field }) => (
                          <FormItem className="flex items-center space-x-2 space-y-0">
                            <FormControl>
                              <Checkbox
                                checked={field.value?.includes(option.value)}
                                onCheckedChange={(checked) => {
                                  const current = field.value ?? [];
                                  field.onChange(
                                    checked
                                      ? [...current, option.value]
                                      : current.filter((v: string) => v !== option.value),
                                  );
                                }}
                              />
                            </FormControl>
                            <FormLabel className="text-sm font-normal cursor-pointer">
                              {option.label}
                            </FormLabel>
                          </FormItem>
                        )}
                      />
                    ))}
                  </div>
                  <FormMessage />
                </FormItem>
              )}
            />

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={createWebhook.isPending}>
                {createWebhook.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Create Webhook
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

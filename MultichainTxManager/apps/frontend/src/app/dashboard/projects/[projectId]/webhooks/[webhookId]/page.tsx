"use client";

import { use, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  ArrowLeft,
  Loader2,
  RotateCw,
  Send,
  Trash2,
  Eye,
  KeyRound,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { toast } from "sonner";

import { useWebhook, useUpdateWebhook, useDeleteWebhook, useTestWebhook, useRotateWebhookSecret, useWebhookDeliveries } from "@/hooks/use-webhooks";
import { copyToClipboard } from "@/lib/utils";
import { WEBHOOK_EVENT_OPTIONS } from "@mtxm/shared";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import { DeliveryLogDialog } from "@/components/webhooks/delivery-log-dialog";
import type { WebhookEndpoint, WebhookEventType } from "@mtxm/shared";

const editWebhookSchema = z.object({
  url: z.string().url("Must be a valid URL"),
  events: z.array(z.string()).min(1, "Select at least one event"),
  isActive: z.boolean(),
});

type EditFormValues = z.infer<typeof editWebhookSchema>;

interface WebhookDetailPageProps {
  params: Promise<{ projectId: string; webhookId: string }>;
}

export default function WebhookDetailPage({ params }: WebhookDetailPageProps) {
  const { projectId, webhookId } = use(params);
  const router = useRouter();
  const [showDeliveryLog, setShowDeliveryLog] = useState(false);

  const { data: response, isLoading, error, isError } = useWebhook(projectId, webhookId);
  const webhook = response?.data;

  const updateWebhook = useUpdateWebhook(projectId);
  const deleteWebhook = useDeleteWebhook(projectId);
  const testWebhook = useTestWebhook(projectId);
  const rotateSecret = useRotateWebhookSecret(projectId);

  const form = useForm<EditFormValues>({
    resolver: zodResolver(editWebhookSchema),
    values: webhook
      ? {
          url: webhook.url,
          events: webhook.events,
          isActive: webhook.isActive,
        }
      : undefined,
    defaultValues: { url: "", events: [], isActive: true },
  });

  const hasEdits =
    webhook &&
    (form.watch("url") !== webhook.url ||
      JSON.stringify(form.watch("events").sort()) !== JSON.stringify([...webhook.events].sort()) ||
      form.watch("isActive") !== webhook.isActive);

  async function onSave(values: EditFormValues) {
    try {
      await updateWebhook.mutateAsync({
        webhookId,
        data: {
          url: values.url,
          events: values.events as WebhookEventType[],
          isActive: values.isActive,
        },
      });
      toast.success("Webhook updated");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to update webhook");
    }
  }

  function handleDelete() {
    if (!confirm("Delete this webhook endpoint? This cannot be undone.")) return;
    deleteWebhook.mutate(webhookId, {
      onSuccess: () => {
        toast.success("Webhook deleted");
        router.push(`/dashboard/projects/${projectId}/webhooks`);
      },
      onError: (err) => toast.error(err instanceof Error ? err.message : "Failed to delete"),
    });
  }

  function handleRotate() {
    rotateSecret.mutate(webhookId, {
      onSuccess: (res) => {
        copyToClipboard(res.data.secret);
        toast.success("Secret rotated and copied to clipboard", {
          description: "Update your receiver with this new secret.",
          duration: 8000,
        });
      },
      onError: (err) => toast.error(err instanceof Error ? err.message : "Failed to rotate secret"),
    });
  }

  if (isLoading || !webhook) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-64 w-full rounded-lg" />
        <Skeleton className="h-40 w-full rounded-lg" />
      </div>
    );
  }

  if (isError || error) {
    return (
      <div className="space-y-4">
        <Link href={`/dashboard/projects/${projectId}/webhooks`}>
          <Button variant="ghost" size="sm" className="gap-1">
            <ArrowLeft className="h-4 w-4" />
            Back to webhooks
          </Button>
        </Link>
        <Card className="border-destructive/50">
          <CardContent className="pt-6">
            <p className="text-muted-foreground">
              Webhook not found or you don’t have access. It may have been deleted.
            </p>
            <Button asChild variant="outline" className="mt-4">
              <Link href={`/dashboard/projects/${projectId}/webhooks`}>Back to webhooks</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!webhook) return null;

  function statusBadge(wh: WebhookEndpoint) {
    if (!wh.isActive) return <Badge variant="secondary">Disabled</Badge>;
    if (wh.failureCount >= 5) return <Badge variant="destructive">Failing</Badge>;
    return <Badge variant="default">Active</Badge>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Link href={`/dashboard/projects/${projectId}/webhooks`}>
          <Button variant="ghost" size="icon" className="h-9 w-9">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-xl font-semibold tracking-tight">Webhook endpoint</h2>
          <p className="truncate font-mono text-sm text-muted-foreground">{webhook.url}</p>
        </div>
        {statusBadge(webhook)}
      </div>

      {/* Edit details */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Details</CardTitle>
          <CardDescription>Endpoint URL, subscribed events, and active state.</CardDescription>
        </CardHeader>
        <CardContent>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSave)} className="space-y-4">
              <FormField
                control={form.control}
                name="url"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Endpoint URL</FormLabel>
                    <FormControl>
                      <Input placeholder="https://example.com/webhook" {...field} />
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
                    <FormLabel>Events</FormLabel>
                    <FormDescription>Which transaction lifecycle events to receive.</FormDescription>
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
                              <FormLabel className="cursor-pointer text-sm font-normal">
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
              <FormField
                control={form.control}
                name="isActive"
                render={({ field }) => (
                  <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
                    <div>
                      <FormLabel>Active</FormLabel>
                      <FormDescription>When disabled, no deliveries are sent.</FormDescription>
                    </div>
                    <FormControl>
                      <Switch checked={field.value} onCheckedChange={field.onChange} />
                    </FormControl>
                  </FormItem>
                )}
              />
              {hasEdits && (
                <Button type="submit" disabled={updateWebhook.isPending}>
                  {updateWebhook.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Save changes
                </Button>
              )}
            </form>
          </Form>
        </CardContent>
      </Card>

      {/* Signing secret */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <KeyRound className="h-4 w-4" />
            Signing secret
          </CardTitle>
          <CardDescription>
            The secret is stored securely and never shown after creation. Use it to verify webhook
            signatures (X-Signature-256). Rotate to generate a new secret — you’ll see it once.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-2">
            <code className="rounded bg-muted px-2 py-1 text-sm text-muted-foreground">
              whsec_••••••••••••
            </code>
            <Button
              variant="outline"
              size="sm"
              onClick={handleRotate}
              disabled={rotateSecret.isPending}
            >
              {rotateSecret.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <>
                  <RotateCw className="mr-2 h-4 w-4" />
                  Rotate secret
                </>
              )}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Actions & delivery log */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Actions</CardTitle>
          <CardDescription>Test the endpoint and view delivery history.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() =>
                testWebhook.mutate(webhookId, {
                  onSuccess: () => toast.success("Test ping sent"),
                  onError: (err) => toast.error(err instanceof Error ? err.message : "Test failed"),
                })
              }
              disabled={testWebhook.isPending}
            >
              {testWebhook.isPending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Send className="mr-2 h-4 w-4" />
              )}
              Send test ping
            </Button>
            <Button variant="outline" size="sm" onClick={() => setShowDeliveryLog(true)}>
              <Eye className="mr-2 h-4 w-4" />
              View delivery log
            </Button>
          </div>
          <WebhookDeliveryPreview projectId={projectId} webhookId={webhookId} />
        </CardContent>
      </Card>

      {/* Danger zone */}
      <Card className="border-destructive/50">
        <CardHeader>
          <CardTitle className="text-base text-destructive">Danger zone</CardTitle>
          <CardDescription>
            Deleting this webhook will stop all deliveries. Delivery history is kept for records.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button
            variant="destructive"
            onClick={handleDelete}
            disabled={deleteWebhook.isPending}
          >
            {deleteWebhook.isPending ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Trash2 className="mr-2 h-4 w-4" />
            )}
            Delete webhook
          </Button>
        </CardContent>
      </Card>

      {showDeliveryLog && (
        <DeliveryLogDialog
          projectId={projectId}
          webhookId={webhookId}
          open={showDeliveryLog}
          onOpenChange={setShowDeliveryLog}
        />
      )}
    </div>
  );
}

function WebhookDeliveryPreview({
  projectId,
  webhookId,
}: {
  projectId: string;
  webhookId: string;
}) {
  const { data: response, isLoading } = useWebhookDeliveries(projectId, webhookId, {
    limit: 5,
  });
  const deliveries = response?.data?.data ?? [];

  if (isLoading) {
    return (
      <div className="space-y-2">
        <p className="text-sm font-medium">Recent deliveries</p>
        <Skeleton className="h-20 w-full" />
      </div>
    );
  }

  if (deliveries.length === 0) {
    return (
      <div className="rounded-md border border-dashed p-4 text-center text-sm text-muted-foreground">
        No deliveries yet. Send a test ping or trigger a transaction event.
      </div>
    );
  }

  function statusBadge(code: number | null) {
    if (code === null) return <Badge variant="secondary">Pending</Badge>;
    if (code >= 200 && code < 300) return <Badge variant="default">{code}</Badge>;
    return <Badge variant="destructive">{code}</Badge>;
  }

  return (
    <div className="space-y-2">
      <p className="text-sm font-medium">Recent deliveries</p>
      <ScrollArea className="h-[140px] rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="py-2 text-xs">Event</TableHead>
              <TableHead className="py-2 text-xs">Status</TableHead>
              <TableHead className="py-2 text-xs">Time</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {deliveries.map((d) => {
              const label =
                WEBHOOK_EVENT_OPTIONS.find((o) => o.value === d.event)?.label ?? d.event;
              return (
                <TableRow key={d.id}>
                  <TableCell className="py-2 text-xs">{label}</TableCell>
                  <TableCell className="py-2">{statusBadge(d.statusCode)}</TableCell>
                  <TableCell className="py-2 text-xs text-muted-foreground">
                    {formatDistanceToNow(new Date(d.createdAt), { addSuffix: true })}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </ScrollArea>
    </div>
  );
}

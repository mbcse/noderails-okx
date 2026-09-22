"use client";

import { formatDistanceToNow } from "date-fns";
import { useWebhookDeliveries, useRetryWebhookDelivery } from "@/hooks/use-webhooks";
import { WEBHOOK_EVENT_OPTIONS } from "@mtxm/shared";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ScrollArea } from "@/components/ui/scroll-area";
import { RotateCw } from "lucide-react";
import { toast } from "sonner";

interface DeliveryLogDialogProps {
  projectId: string;
  webhookId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function DeliveryLogDialog({
  projectId,
  webhookId,
  open,
  onOpenChange,
}: DeliveryLogDialogProps) {
  const { data: response, isLoading } = useWebhookDeliveries(projectId, webhookId, {
    limit: 50,
  });
  const retryMutation = useRetryWebhookDelivery(projectId, webhookId);

  const deliveries = response?.data?.data ?? [];

  function handleRetry(deliveryId: string) {
    retryMutation.mutate(deliveryId, {
      onSuccess: () => toast.success("Webhook delivery retry enqueued"),
      onError: (err) => toast.error(`Retry failed: ${(err as Error).message}`),
    });
  }

  function statusCodeBadge(code: number | null) {
    if (code === null) return <Badge variant="secondary">Pending</Badge>;
    if (code >= 200 && code < 300) return <Badge variant="default">{code}</Badge>;
    return <Badge variant="destructive">{code}</Badge>;
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[80vh]">
        <DialogHeader>
          <DialogTitle>Delivery Log</DialogTitle>
          <DialogDescription>
            Recent webhook delivery attempts for this endpoint.
          </DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <div className="space-y-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-10 w-full" />
            ))}
          </div>
        ) : deliveries.length === 0 ? (
          <p className="py-8 text-center text-muted-foreground">
            No deliveries yet.
          </p>
        ) : (
          <ScrollArea className="max-h-[50vh]">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Event</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Latency</TableHead>
                  <TableHead>Attempts</TableHead>
                  <TableHead>Time</TableHead>
                  <TableHead className="w-[60px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {deliveries.map((delivery) => {
                  const eventLabel =
                    WEBHOOK_EVENT_OPTIONS.find((o) => o.value === delivery.event)?.label ??
                    delivery.event;

                  return (
                    <TableRow key={delivery.id}>
                      <TableCell className="text-xs">{eventLabel}</TableCell>
                      <TableCell>{statusCodeBadge(delivery.statusCode)}</TableCell>
                      <TableCell className="text-xs font-mono">
                        {delivery.latencyMs !== null ? `${delivery.latencyMs}ms` : "—"}
                      </TableCell>
                      <TableCell className="text-xs">{delivery.attempts}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {formatDistanceToNow(new Date(delivery.createdAt), { addSuffix: true })}
                      </TableCell>
                      <TableCell>
                        {(delivery.statusCode === null || delivery.statusCode >= 300) && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
                            disabled={retryMutation.isPending}
                            onClick={() => handleRetry(delivery.id)}
                            title="Retry delivery"
                          >
                            <RotateCw className="h-3.5 w-3.5" />
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </ScrollArea>
        )}
      </DialogContent>
    </Dialog>
  );
}

"use client";

import { useState } from "react";
import Link from "next/link";
import { formatDistanceToNow } from "date-fns";
import { Trash2, RotateCw, Send, Eye, ChevronRight } from "lucide-react";
import { toast } from "sonner";

import { useTestWebhook, useRotateWebhookSecret } from "@/hooks/use-webhooks";
import { copyToClipboard, truncateAddress } from "@/lib/utils";
import { WEBHOOK_EVENT_OPTIONS } from "@mtxm/shared";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
import { DeliveryLogDialog } from "@/components/webhooks/delivery-log-dialog";
import type { WebhookEndpoint } from "@mtxm/shared";

interface WebhookTableProps {
  projectId: string;
  webhooks: WebhookEndpoint[];
  onDelete: (id: string) => void;
}

export function WebhookTable({ projectId, webhooks, onDelete }: WebhookTableProps) {
  const testWebhook = useTestWebhook(projectId);
  const rotateSecret = useRotateWebhookSecret(projectId);
  const [deliveryDialogWebhookId, setDeliveryDialogWebhookId] = useState<string | null>(null);

  if (webhooks.length === 0) {
    return (
      <div className="rounded-lg border p-12 text-center text-muted-foreground">
        No webhooks configured. Add a webhook to receive transaction status updates.
      </div>
    );
  }

  function statusBadge(wh: WebhookEndpoint) {
    if (!wh.isActive) return <Badge variant="secondary">Disabled</Badge>;
    if (wh.failureCount >= 5) return <Badge variant="destructive">Failing</Badge>;
    return <Badge variant="default">Active</Badge>;
  }

  return (
    <>
      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>URL</TableHead>
              <TableHead>Events</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Last Delivered</TableHead>
              <TableHead className="w-[180px]" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {webhooks.map((wh) => (
              <TableRow key={wh.id} className="group">
                <TableCell className="max-w-[240px]">
                  <Link
                    href={`/dashboard/projects/${projectId}/webhooks/${wh.id}`}
                    className="flex items-center gap-1 font-mono text-xs text-primary hover:underline"
                  >
                    <span className="block max-w-[200px] truncate">{wh.url}</span>
                    <ChevronRight className="h-4 w-4 shrink-0 opacity-0 transition-opacity group-hover:opacity-70" />
                  </Link>
                </TableCell>
                <TableCell>
                  <div className="flex flex-wrap gap-1">
                    {wh.events.slice(0, 3).map((evt) => {
                      const label = WEBHOOK_EVENT_OPTIONS.find((o) => o.value === evt)?.label ?? evt;
                      return (
                        <Badge key={evt} variant="outline" className="text-[10px]">
                          {label}
                        </Badge>
                      );
                    })}
                    {wh.events.length > 3 && (
                      <Badge variant="outline" className="text-[10px]">
                        +{wh.events.length - 3}
                      </Badge>
                    )}
                  </div>
                </TableCell>
                <TableCell>{statusBadge(wh)}</TableCell>
                <TableCell className="text-xs text-muted-foreground">
                  {wh.lastDeliveredAt
                    ? formatDistanceToNow(new Date(wh.lastDeliveredAt), { addSuffix: true })
                    : "Never"}
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-1">
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          onClick={() => setDeliveryDialogWebhookId(wh.id)}
                        >
                          <Eye className="h-4 w-4" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>View delivery log</TooltipContent>
                    </Tooltip>

                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          onClick={() => testWebhook.mutate(wh.id)}
                        >
                          <Send className="h-4 w-4" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>Send test ping</TooltipContent>
                    </Tooltip>

                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          onClick={() => {
                            rotateSecret.mutate(wh.id, {
                              onSuccess: (res) => {
                                copyToClipboard(res.data.secret);
                                toast.success("Secret rotated & copied to clipboard");
                              },
                            });
                          }}
                        >
                          <RotateCw className="h-4 w-4" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>Rotate secret</TooltipContent>
                    </Tooltip>

                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-destructive hover:text-destructive"
                      onClick={() => onDelete(wh.id)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {deliveryDialogWebhookId && (
        <DeliveryLogDialog
          projectId={projectId}
          webhookId={deliveryDialogWebhookId}
          open={!!deliveryDialogWebhookId}
          onOpenChange={(open) => {
            if (!open) setDeliveryDialogWebhookId(null);
          }}
        />
      )}
    </>
  );
}

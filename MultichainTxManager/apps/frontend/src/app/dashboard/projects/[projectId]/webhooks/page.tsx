"use client";

import { use, useState } from "react";
import { Plus } from "lucide-react";
import { useWebhooks, useDeleteWebhook } from "@/hooks/use-webhooks";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { WebhookTable } from "@/components/webhooks/webhook-table";
import { AddWebhookDialog } from "@/components/webhooks/add-webhook-dialog";

interface WebhooksPageProps {
  params: Promise<{ projectId: string }>;
}

export default function WebhooksPage({ params }: WebhooksPageProps) {
  const { projectId } = use(params);
  const { data: response, isLoading } = useWebhooks(projectId);
  const deleteWebhook = useDeleteWebhook(projectId);
  const [isAddOpen, setIsAddOpen] = useState(false);

  const webhooks = response?.data ?? [];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Webhooks</h2>
          <p className="text-muted-foreground">
            Receive real-time transaction status updates via HTTP callbacks
          </p>
        </div>
        <Button onClick={() => setIsAddOpen(true)}>
          <Plus className="mr-2 h-4 w-4" />
          Add Webhook
        </Button>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 2 }).map((_, i) => (
            <Skeleton key={i} className="h-14 w-full rounded-lg" />
          ))}
        </div>
      ) : (
        <WebhookTable
          projectId={projectId}
          webhooks={webhooks}
          onDelete={(id) => deleteWebhook.mutate(id)}
        />
      )}

      <AddWebhookDialog
        projectId={projectId}
        open={isAddOpen}
        onOpenChange={setIsAddOpen}
      />
    </div>
  );
}

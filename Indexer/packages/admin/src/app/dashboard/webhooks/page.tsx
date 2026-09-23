"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { webhooksApi, projectsApi, contractsApi, chainsApi } from "@/lib/api";
import { toast } from "sonner";
import Link from "next/link";
import { Plus, Trash2, Webhook, Globe } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";

interface WebhookType {
  id: string;
  name: string;
  url: string;
  isActive: boolean;
  createdAt: string;
  project?: { id: string; name: string };
  subscriptions?: Array<unknown>;
  _count?: { deliveries: number; subscriptions: number };
}

interface Project {
  id: string;
  name: string;
}

interface Contract {
  id: string;
  name: string;
  projectId: string;
  eventSubscriptions?: Array<{ id: string; eventName: string; isActive: boolean }>;
}

export default function WebhooksPage() {
  const [isOpen, setIsOpen] = useState(false);
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [secret, setSecret] = useState("");
  const [projectId, setProjectId] = useState("");
  const [selectedEvents, setSelectedEvents] = useState<string[]>([]);
  const [subscribeNative, setSubscribeNative] = useState(false);
  const [nativeChainId, setNativeChainId] = useState<string>("");

  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ["webhooks"],
    queryFn: () => webhooksApi.list(),
  });

  const { data: projectsData } = useQuery({
    queryKey: ["projects"],
    queryFn: () => projectsApi.list(),
  });

  const { data: contractsData } = useQuery({
    queryKey: ["contracts"],
    queryFn: () => contractsApi.list(),
  });

  const { data: chainsData } = useQuery({
    queryKey: ["chains"],
    queryFn: () => chainsApi.list(),
  });

  const createMutation = useMutation({
    mutationFn: (data: Record<string, unknown>) => webhooksApi.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["webhooks"] });
      toast.success("Webhook created successfully");
      setIsOpen(false);
      resetForm();
    },
    onError: (error: unknown) => {
      const err = error as { response?: { data?: { error?: string } } };
      toast.error(err.response?.data?.error || "Failed to create webhook");
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => webhooksApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["webhooks"] });
      toast.success("Webhook deleted");
    },
    onError: (error: unknown) => {
      const err = error as { response?: { data?: { error?: string } } };
      toast.error(err.response?.data?.error || "Failed to delete");
    },
  });

  const resetForm = () => {
    setName("");
    setUrl("");
    setSecret("");
    setProjectId("");
    setSelectedEvents([]);
    setSubscribeNative(false);
    setNativeChainId("");
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    createMutation.mutate({
      name,
      url,
      secret: secret || undefined,
      projectId,
      eventSubscriptionIds: selectedEvents,
      subscribeNative: subscribeNative || undefined,
      nativeChainId: nativeChainId ? parseInt(nativeChainId, 10) : null,
    });
  };

  // Collect only active event subscriptions from contracts belonging to the selected project
  const allEventSubscriptions: Array<{
    id: string;
    eventName: string;
    contractName: string;
  }> = [];
  const contracts: Contract[] = contractsData?.data?.data || [];
  contracts
    .filter((contract) => !projectId || contract.projectId === projectId)
    .forEach((contract) => {
      contract.eventSubscriptions
        ?.filter((sub) => sub.isActive)
        .forEach((sub) => {
          allEventSubscriptions.push({
            id: sub.id,
            eventName: sub.eventName,
            contractName: contract.name,
          });
        });
    });

  const webhooks: WebhookType[] = data?.data?.data || data?.data || [];
  const projects: Project[] = projectsData?.data?.data || [];
  const chains: Array<{ id: string; chainId: number; name: string }> = chainsData?.data?.data || [];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Webhooks</h1>
          <p className="text-muted-foreground">
            Configure webhook notifications for events
          </p>
        </div>
        <Dialog open={isOpen} onOpenChange={setIsOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="mr-2 h-4 w-4" />
              New Webhook
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>Create New Webhook</DialogTitle>
              <DialogDescription>
                Configure a webhook endpoint to receive event notifications
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="name">Webhook Name</Label>
                  <Input
                    id="name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="My Webhook"
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="project">Project</Label>
                  <Select value={projectId} onValueChange={setProjectId}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select project" />
                    </SelectTrigger>
                    <SelectContent>
                      {projects.map((project) => (
                        <SelectItem key={project.id} value={project.id}>
                          {project.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="url">Webhook URL</Label>
                <Input
                  id="url"
                  type="url"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  placeholder="https://example.com/webhook"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="secret">Secret (optional)</Label>
                <Input
                  id="secret"
                  type="password"
                  value={secret}
                  onChange={(e) => setSecret(e.target.value)}
                  placeholder="Used for signing webhook payloads"
                />
                <p className="text-xs text-muted-foreground">
                  HMAC signature will be included in X-Webhook-Signature header
                </p>
              </div>
              <div className="space-y-2">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={subscribeNative}
                    onChange={(e) => setSubscribeNative(e.target.checked)}
                    className="rounded"
                  />
                  <span>Subscribe to native transfers (ETH send/receive)</span>
                </label>
                {subscribeNative && (
                  <div className="pl-6 space-y-2">
                    <Label>Chain (optional)</Label>
                    <Select
                      value={nativeChainId || "__all__"}
                      onValueChange={(v) => setNativeChainId(v === "__all__" ? "" : v)}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="All chains" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__all__">All chains</SelectItem>
                        {chains.map((c) => (
                          <SelectItem key={c.id} value={String(c.chainId)}>
                            {c.name} (ID: {c.chainId})
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-muted-foreground">
                      Leave as &quot;All chains&quot; to receive native transfer events for watched addresses on every chain.
                    </p>
                  </div>
                )}
              </div>
              <div className="space-y-2">
                <Label>Subscribe to Events (optional)</Label>
                <div className="border rounded-md p-3 max-h-48 overflow-y-auto space-y-2">
                  {allEventSubscriptions.length === 0 ? (
                    <p className="text-sm text-muted-foreground">
                      No event subscriptions available. Create contracts and
                      subscribe to events first.
                    </p>
                  ) : (
                    allEventSubscriptions.map((sub) => (
                      <label
                        key={sub.id}
                        className="flex items-center gap-2 cursor-pointer"
                      >
                        <input
                          type="checkbox"
                          checked={selectedEvents.includes(sub.id)}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setSelectedEvents([...selectedEvents, sub.id]);
                            } else {
                              setSelectedEvents(
                                selectedEvents.filter((id) => id !== sub.id)
                              );
                            }
                          }}
                          className="rounded"
                        />
                        <span className="font-medium">{sub.eventName}</span>
                        <span className="text-xs text-muted-foreground">
                          ({sub.contractName})
                        </span>
                      </label>
                    ))
                  )}
                </div>
              </div>
              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setIsOpen(false)}
                >
                  Cancel
                </Button>
                <Button type="submit" disabled={createMutation.isPending}>
                  {createMutation.isPending ? "Creating..." : "Create Webhook"}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>All Webhooks</CardTitle>
          <CardDescription>
            Webhook endpoints for receiving event notifications
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-2">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-16 w-full" />
              ))}
            </div>
          ) : webhooks.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <Webhook className="h-12 w-12 text-muted-foreground/50" />
              <h3 className="mt-4 text-lg font-semibold">No webhooks</h3>
              <p className="text-muted-foreground">
                Create your first webhook to receive event notifications
              </p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>URL</TableHead>
                  <TableHead>Project</TableHead>
                  <TableHead>Subscriptions</TableHead>
                  <TableHead>Deliveries</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="w-[100px]">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {webhooks.map((webhook) => (
                  <TableRow key={webhook.id}>
                    <TableCell>
                      <Link
                        href={`/dashboard/webhooks/${webhook.id}`}
                        className="font-medium hover:underline"
                      >
                        {webhook.name}
                      </Link>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Globe className="h-4 w-4 text-muted-foreground" />
                        <code className="text-xs truncate max-w-[200px]">
                          {webhook.url}
                        </code>
                      </div>
                    </TableCell>
                    <TableCell>{webhook.project?.name || "-"}</TableCell>
                    <TableCell>{webhook._count?.subscriptions ?? webhook.subscriptions?.length ?? 0}</TableCell>
                    <TableCell>{webhook._count?.deliveries || 0}</TableCell>
                    <TableCell>
                      <Badge
                        variant={webhook.isActive ? "default" : "secondary"}
                      >
                        {webhook.isActive ? "Active" : "Inactive"}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => {
                          if (confirm("Delete this webhook?")) {
                            deleteMutation.mutate(webhook.id);
                          }
                        }}
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

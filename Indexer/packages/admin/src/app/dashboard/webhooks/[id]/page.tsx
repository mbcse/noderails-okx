"use client";

import { use, useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { webhooksApi, contractsApi, chainsApi } from "@/lib/api";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  Save,
  Send,
  RefreshCw,
  CheckCircle,
  XCircle,
  Clock,
  KeyRound,
  Copy,
} from "lucide-react";
import Link from "next/link";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface WebhookDelivery {
  id: string;
  status: "pending" | "success" | "failed";
  responseCode: number | null;
  attempts: number;
  lastAttemptAt: string | null;
  responseBody: string | null;
  createdAt: string;
  event?: { id: string; eventName?: string; transactionHash?: string; blockNumber?: number };
  nativeTransferId?: string | null;
  nativeTransfer?: {
    id: string;
    transactionHash: string;
    blockNumber: number;
    chainId: number;
    from: string;
    to: string | null;
    value: string;
  };
}

interface WebhookSubscription {
  id: string;
  eventSubscription: {
    id: string;
    eventName: string;
    contract: { name: string };
  };
}

interface Contract {
  id: string;
  name: string;
  projectId: string;
  eventSubscriptions?: Array<{ id: string; eventName: string; isActive: boolean }>;
}

interface WebhookType {
  id: string;
  name: string;
  url: string;
  secret: string | null;
  isActive: boolean;
  subscribeNative?: boolean;
  nativeChainId?: number | null;
  maxRetries: number;
  createdAt: string;
  project?: { id: string; name: string };
  subscriptions?: WebhookSubscription[];
  deliveries?: WebhookDelivery[];
}

export default function WebhookDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const router = useRouter();
  const queryClient = useQueryClient();

  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [secret, setSecret] = useState("");
  const [isActive, setIsActive] = useState(true);
  const [subscribeNative, setSubscribeNative] = useState(false);
  const [nativeChainId, setNativeChainId] = useState<string>("");
  const [maxRetries, setMaxRetries] = useState(3);
  const [selectedEventIds, setSelectedEventIds] = useState<Set<string>>(
    new Set()
  );

  const { data, isLoading } = useQuery({
    queryKey: ["webhooks", id],
    queryFn: () => webhooksApi.get(id),
  });

  const { data: contractsData } = useQuery({
    queryKey: ["contracts"],
    queryFn: () => contractsApi.list(),
  });

  const { data: chainsData } = useQuery({
    queryKey: ["chains"],
    queryFn: () => chainsApi.list(),
  });

  const webhook: WebhookType | null = data?.data?.data || data?.data || null;
  const chains: Array<{ id: string; chainId: number; name: string }> = chainsData?.data?.data || [];
  const contracts: Contract[] = contractsData?.data?.data || contractsData?.data || [];

  useEffect(() => {
    if (webhook) {
      setName(webhook.name);
      setUrl(webhook.url);
      setSecret(webhook.secret || "");
      setIsActive(webhook.isActive);
      setSubscribeNative(webhook.subscribeNative ?? false);
      setNativeChainId(webhook.nativeChainId != null ? String(webhook.nativeChainId) : "");
      setMaxRetries(webhook.maxRetries);
      // Set currently subscribed events
      const currentIds = new Set(
        webhook.subscriptions?.map((s) => s.eventSubscription.id) || []
      );
      setSelectedEventIds(currentIds);
    }
  }, [webhook]);

  // Collect only active event subscriptions from contracts belonging to this webhook's project
  const allEventSubscriptions: Array<{
    id: string;
    eventName: string;
    contractName: string;
  }> = [];
  const webhookProjectId = webhook?.project?.id;
  contracts
    .filter((contract) => !webhookProjectId || contract.projectId === webhookProjectId)
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

  const updateMutation = useMutation({
    mutationFn: (data: Record<string, unknown>) => webhooksApi.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["webhooks", id] });
      toast.success("Webhook updated");
    },
    onError: (error: unknown) => {
      const err = error as { response?: { data?: { error?: string } } };
      toast.error(err.response?.data?.error || "Failed to update");
    },
  });

  const testMutation = useMutation({
    mutationFn: () => webhooksApi.test(id),
    onSuccess: (response) => {
      const result = response.data?.data;
      if (result?.success) {
        toast.success(`Test successful! Status: ${result.statusCode}`);
      } else {
        toast.error(`Test failed: ${result?.error || "Unknown error"}`);
      }
    },
    onError: (error: unknown) => {
      const err = error as { response?: { data?: { error?: string } } };
      toast.error(err.response?.data?.error || "Failed to test webhook");
    },
  });

  const retryMutation = useMutation({
    mutationFn: (deliveryId: string) => webhooksApi.retry(id, deliveryId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["webhooks", id] });
      toast.success("Retry queued");
    },
    onError: (error: unknown) => {
      const err = error as { response?: { data?: { error?: string } } };
      toast.error(err.response?.data?.error || "Failed to retry");
    },
  });

  const deleteMutation = useMutation({
    mutationFn: () => webhooksApi.delete(id),
    onSuccess: () => {
      toast.success("Webhook deleted");
      router.push("/dashboard/webhooks");
    },
    onError: (error: unknown) => {
      const err = error as { response?: { data?: { error?: string } } };
      toast.error(err.response?.data?.error || "Failed to delete");
    },
  });

  const saveSubscriptionsMutation = useMutation({
    mutationFn: (eventSubscriptionIds: string[]) =>
      webhooksApi.syncSubscriptions(id, eventSubscriptionIds),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["webhooks", id] });
      toast.success("Subscriptions saved");
    },
    onError: (error: unknown) => {
      const err = error as { response?: { data?: { error?: string } } };
      toast.error(err.response?.data?.error || "Failed to save subscriptions");
    },
  });

  const regenerateSecretMutation = useMutation({
    mutationFn: () => webhooksApi.regenerateSecret(id),
    onSuccess: (response) => {
      queryClient.invalidateQueries({ queryKey: ["webhooks", id] });
      const newSecret = response.data?.data?.secret;
      if (newSecret) {
        setSecret(newSecret);
        navigator.clipboard.writeText(newSecret);
        toast.success("Secret regenerated and copied to clipboard!");
      } else {
        toast.success("Secret regenerated");
      }
    },
    onError: (error: unknown) => {
      const err = error as { response?: { data?: { error?: string } } };
      toast.error(err.response?.data?.error || "Failed to regenerate secret");
    },
  });

  const handleSave = () => {
    updateMutation.mutate({
      name,
      url,
      isActive,
      subscribeNative,
      nativeChainId: nativeChainId ? parseInt(nativeChainId, 10) : null,
    });
  };

  const handleSaveSubscriptions = () => {
    saveSubscriptionsMutation.mutate(Array.from(selectedEventIds));
  };

  const toggleEventSubscription = (eventId: string) => {
    const newIds = new Set(selectedEventIds);
    if (newIds.has(eventId)) {
      newIds.delete(eventId);
    } else {
      newIds.add(eventId);
    }
    setSelectedEventIds(newIds);
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "success":
        return <CheckCircle className="h-4 w-4 text-green-500" />;
      case "failed":
        return <XCircle className="h-4 w-4 text-destructive" />;
      default:
        return <Clock className="h-4 w-4 text-yellow-500" />;
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-10 w-48" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (!webhook) {
    return (
      <div className="flex flex-col items-center justify-center py-12">
        <h2 className="text-xl font-semibold">Webhook not found</h2>
        <Link href="/dashboard/webhooks">
          <Button variant="link">Back to webhooks</Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Link href="/dashboard/webhooks">
          <Button variant="ghost" size="icon">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{webhook.name}</h1>
          <p className="text-muted-foreground text-sm truncate max-w-md">
            {webhook.url}
          </p>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <Badge variant={webhook.isActive ? "default" : "secondary"}>
            {webhook.isActive ? "Active" : "Inactive"}
          </Badge>
          <Button
            variant="outline"
            onClick={() => testMutation.mutate()}
            disabled={testMutation.isPending}
          >
            <Send className="mr-2 h-4 w-4" />
            {testMutation.isPending ? "Testing..." : "Test"}
          </Button>
        </div>
      </div>

      <Tabs defaultValue="settings">
        <TabsList>
          <TabsTrigger value="settings">Settings</TabsTrigger>
          <TabsTrigger value="subscriptions">Subscriptions</TabsTrigger>
          <TabsTrigger value="deliveries">Delivery History</TabsTrigger>
        </TabsList>

        <TabsContent value="settings" className="space-y-6">
          <div className="grid gap-6 lg:grid-cols-2">
            {/* Settings */}
            <Card>
              <CardHeader>
                <CardTitle>Webhook Settings</CardTitle>
                <CardDescription>
                  Configure webhook endpoint and behavior
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="name">Name</Label>
                  <Input
                    id="name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="url">Webhook URL</Label>
                  <Input
                    id="url"
                    type="url"
                    value={url}
                    onChange={(e) => setUrl(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="secret">Secret</Label>
                  <div className="flex gap-2">
                    <Input
                      id="secret"
                      type="password"
                      value={secret}
                      onChange={(e) => setSecret(e.target.value)}
                      placeholder="HMAC signing secret"
                      className="flex-1"
                    />
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      onClick={() => {
                        if (secret) {
                          navigator.clipboard.writeText(secret);
                          toast.success("Secret copied");
                        }
                      }}
                      title="Copy secret"
                    >
                      <Copy className="h-4 w-4" />
                    </Button>
                  </div>
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button type="button" variant="outline" size="sm" className="mt-1">
                        <KeyRound className="mr-2 h-3 w-3" />
                        Regenerate Secret
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Regenerate Webhook Secret?</AlertDialogTitle>
                        <AlertDialogDescription>
                          This will generate a new HMAC signing secret. You&apos;ll need
                          to update your webhook handler with the new secret. The old
                          secret will stop working immediately.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                          onClick={() => regenerateSecretMutation.mutate()}
                        >
                          {regenerateSecretMutation.isPending
                            ? "Regenerating..."
                            : "Regenerate"}
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label>Active</Label>
                    <p className="text-sm text-muted-foreground">
                      Enable or disable webhook deliveries
                    </p>
                  </div>
                  <Switch checked={isActive} onCheckedChange={setIsActive} />
                </div>
                <div className="space-y-2">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <Checkbox
                      checked={subscribeNative}
                      onCheckedChange={(c) => setSubscribeNative(!!c)}
                    />
                    <span>Subscribe to native transfers (ETH send/receive)</span>
                  </label>
                  {subscribeNative && (
                    <div className="pl-6 space-y-2">
                      <Label>Chain (optional)</Label>
                      <Select value={nativeChainId || "all"} onValueChange={(v) => setNativeChainId(v === "all" ? "" : v)}>
                        <SelectTrigger>
                          <SelectValue placeholder="All chains" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">All chains</SelectItem>
                          {chains.map((c) => (
                            <SelectItem key={c.id} value={String(c.chainId)}>
                              {c.name} (ID: {c.chainId})
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                </div>
                <Button
                  onClick={handleSave}
                  disabled={updateMutation.isPending}
                  className="w-full"
                >
                  <Save className="mr-2 h-4 w-4" />
                  {updateMutation.isPending ? "Saving..." : "Save Changes"}
                </Button>
              </CardContent>
            </Card>

            {/* Info */}
            <Card>
              <CardHeader>
                <CardTitle>Webhook Info</CardTitle>
                <CardDescription>Details about this webhook</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Project</span>
                  <span className="font-medium">
                    {webhook.project?.name || "-"}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Created</span>
                  <span className="font-medium">
                    {new Date(webhook.createdAt).toLocaleDateString()}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Subscriptions</span>
                  <span className="font-medium">
                    {webhook.subscriptions?.length || 0}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Total Deliveries</span>
                  <span className="font-medium">
                    {webhook.deliveries?.length || 0}
                  </span>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Danger Zone */}
          <Card className="border-destructive/50">
            <CardHeader>
              <CardTitle className="text-destructive">Danger Zone</CardTitle>
              <CardDescription>
                Irreversible and destructive actions
              </CardDescription>
            </CardHeader>
            <CardContent>
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="destructive">Delete Webhook</Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Delete Webhook?</AlertDialogTitle>
                    <AlertDialogDescription>
                      This will permanently delete the webhook and all delivery
                      history. This action cannot be undone.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction
                      onClick={() => deleteMutation.mutate()}
                      className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                    >
                      {deleteMutation.isPending ? "Deleting..." : "Delete"}
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="subscriptions" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Event Subscriptions</CardTitle>
              <CardDescription>
                Select which events should trigger this webhook
              </CardDescription>
            </CardHeader>
            <CardContent>
              {allEventSubscriptions.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No event subscriptions available. Create contracts and
                  subscribe to events first.
                </p>
              ) : (
                <div className="space-y-3">
                  {allEventSubscriptions.map((sub) => (
                    <div
                      key={sub.id}
                      className="flex items-center gap-3 p-3 rounded-md border"
                    >
                      <Checkbox
                        id={sub.id}
                        checked={selectedEventIds.has(sub.id)}
                        onCheckedChange={() => toggleEventSubscription(sub.id)}
                      />
                      <label
                        htmlFor={sub.id}
                        className="flex-1 cursor-pointer"
                      >
                        <span className="font-medium">{sub.eventName}</span>
                        <span className="text-sm text-muted-foreground ml-2">
                          ({sub.contractName})
                        </span>
                      </label>
                    </div>
                  ))}
                  <Button
                    onClick={handleSaveSubscriptions}
                    disabled={saveSubscriptionsMutation.isPending}
                    className="w-full mt-4"
                  >
                    <Save className="mr-2 h-4 w-4" />
                    {saveSubscriptionsMutation.isPending
                      ? "Saving..."
                      : "Save Subscriptions"}
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="deliveries" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Delivery History</CardTitle>
              <CardDescription>
                Recent webhook delivery attempts (events and native transfers)
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Tabs defaultValue="events" className="w-full">
                <TabsList>
                  <TabsTrigger value="events">
                    Event deliveries
                    {webhook.deliveries?.filter((d) => d.event).length
                      ? ` (${webhook.deliveries.filter((d) => d.event).length})`
                      : ""}
                  </TabsTrigger>
                  <TabsTrigger value="native">
                    Native deliveries
                    {webhook.deliveries?.filter((d) => d.nativeTransfer).length
                      ? ` (${webhook.deliveries.filter((d) => d.nativeTransfer).length})`
                      : ""}
                  </TabsTrigger>
                </TabsList>
                <TabsContent value="events" className="mt-4">
                  {(() => {
                    const eventDeliveries = (webhook.deliveries || []).filter((d) => d.event);
                    if (eventDeliveries.length === 0) {
                      return (
                        <div className="flex flex-col items-center justify-center py-8 text-center">
                          <Send className="h-10 w-10 text-muted-foreground/50" />
                          <h3 className="mt-4 text-lg font-semibold">No event deliveries</h3>
                          <p className="text-muted-foreground">
                            Event deliveries will appear here when contract events trigger this webhook
                          </p>
                        </div>
                      );
                    }
                    return (
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Status</TableHead>
                            <TableHead>Event / Tx</TableHead>
                            <TableHead>HTTP</TableHead>
                            <TableHead>Attempts</TableHead>
                            <TableHead>Last Attempt</TableHead>
                            <TableHead>Created</TableHead>
                            <TableHead className="w-[100px]">Actions</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {eventDeliveries.slice(0, 50).map((delivery) => (
                            <TableRow key={delivery.id}>
                              <TableCell>
                                <div className="flex items-center gap-2">
                                  {getStatusIcon(delivery.status)}
                                  <span className="capitalize">{delivery.status}</span>
                                </div>
                              </TableCell>
                              <TableCell className="font-mono text-xs">
                                {delivery.event?.eventName || delivery.event?.transactionHash?.slice(0, 14) || "-"}
                              </TableCell>
                              <TableCell>{delivery.responseCode ?? "-"}</TableCell>
                              <TableCell>{delivery.attempts}</TableCell>
                              <TableCell>
                                {delivery.lastAttemptAt
                                  ? new Date(delivery.lastAttemptAt).toLocaleString()
                                  : "-"}
                              </TableCell>
                              <TableCell>{new Date(delivery.createdAt).toLocaleString()}</TableCell>
                              <TableCell>
                                {delivery.status === "failed" && (
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    onClick={() => retryMutation.mutate(delivery.id)}
                                    disabled={retryMutation.isPending}
                                    title="Retry delivery"
                                  >
                                    <RefreshCw className="h-4 w-4" />
                                  </Button>
                                )}
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    );
                  })()}
                </TabsContent>
                <TabsContent value="native" className="mt-4">
                  {(() => {
                    const nativeDeliveries = (webhook.deliveries || []).filter((d) => d.nativeTransfer);
                    const chainName = (chainId: number) =>
                      chains.find((c) => c.chainId === chainId)?.name ?? String(chainId);
                    if (nativeDeliveries.length === 0) {
                      return (
                        <div className="flex flex-col items-center justify-center py-8 text-center">
                          <Send className="h-10 w-10 text-muted-foreground/50" />
                          <h3 className="mt-4 text-lg font-semibold">No native deliveries</h3>
                          <p className="text-muted-foreground">
                            Enable &quot;Subscribe to native transfers&quot; in Settings. Native (ETH) transfer deliveries will appear here.
                          </p>
                        </div>
                      );
                    }
                    return (
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Status</TableHead>
                            <TableHead>Chain</TableHead>
                            <TableHead>Block</TableHead>
                            <TableHead>From → To</TableHead>
                            <TableHead>Value</TableHead>
                            <TableHead>HTTP</TableHead>
                            <TableHead>Attempts</TableHead>
                            <TableHead>Last Attempt</TableHead>
                            <TableHead className="w-[100px]">Actions</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {nativeDeliveries.slice(0, 50).map((delivery) => {
                            const nt = delivery.nativeTransfer!;
                            return (
                              <TableRow key={delivery.id}>
                                <TableCell>
                                  <div className="flex items-center gap-2">
                                    {getStatusIcon(delivery.status)}
                                    <span className="capitalize">{delivery.status}</span>
                                  </div>
                                </TableCell>
                                <TableCell>{chainName(nt.chainId)}</TableCell>
                                <TableCell className="font-mono text-xs">#{nt.blockNumber}</TableCell>
                                <TableCell className="font-mono text-xs max-w-[180px] truncate" title={`${nt.from} → ${nt.to ?? "—"}`}>
                                  {nt.from.slice(0, 6)}...→{nt.to ? `${nt.to.slice(0, 6)}...` : "—"}
                                </TableCell>
                                <TableCell className="text-xs">{(Number(nt.value) / 1e18).toFixed(4)} ETH</TableCell>
                                <TableCell>{delivery.responseCode ?? "-"}</TableCell>
                                <TableCell>{delivery.attempts}</TableCell>
                                <TableCell>
                                  {delivery.lastAttemptAt
                                    ? new Date(delivery.lastAttemptAt).toLocaleString()
                                    : "-"}
                                </TableCell>
                                <TableCell>
                                  {delivery.status === "failed" && (
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      onClick={() => retryMutation.mutate(delivery.id)}
                                      disabled={retryMutation.isPending}
                                      title="Retry delivery"
                                    >
                                      <RefreshCw className="h-4 w-4" />
                                    </Button>
                                  )}
                                </TableCell>
                              </TableRow>
                            );
                          })}
                        </TableBody>
                      </Table>
                    );
                  })()}
                </TabsContent>
              </Tabs>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

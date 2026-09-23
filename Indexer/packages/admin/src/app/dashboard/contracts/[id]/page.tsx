"use client";

import { use, useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { contractsApi, eventsApi } from "@/lib/api";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  Save,
  Plus,
  Upload,
  Activity,
  Bell,
  RotateCcw,
  TrendingUp,
  Filter,
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
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

interface EventSubscription {
  id: string;
  eventName: string;
  eventSignature: string;
  isActive: boolean;
  filterConditions: Record<string, any> | null;
  startBlock: string | null;
  createdAt: string;
}

interface IndexState {
  id: string;
  lastIndexedBlock: string;
  lastFinalizedBlock: string | null;
}

interface ABIEvent {
  type: string;
  name: string;
  inputs?: Array<{ name: string; type: string; indexed?: boolean }>;
}

interface Contract {
  id: string;
  name: string;
  address: string;
  protocol?: "evm" | "solana" | "sui";
  abi: ABIEvent[] | Record<string, any>;
  startBlock: string;
  isActive: boolean;
  createdAt: string;
  project?: { id: string; name: string };
  chain?: { id: string; name: string; chainId: number };
  eventSubscriptions?: EventSubscription[];
  indexStates?: IndexState[];
}

export default function ContractDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const router = useRouter();
  const queryClient = useQueryClient();

  const [name, setName] = useState("");
  const [isActive, setIsActive] = useState(true);
  const [backfillFrom, setBackfillFrom] = useState("");
  const [isBackfillOpen, setIsBackfillOpen] = useState(false);
  const [isAddEventsOpen, setIsAddEventsOpen] = useState(false);
  const [extraAbi, setExtraAbi] = useState("");
  const [extraAbiFile, setExtraAbiFile] = useState<File | null>(null);
  const [extractedEvents, setExtractedEvents] = useState<string[]>([]);
  const [selectedNewEvents, setSelectedNewEvents] = useState<string[]>([]);
  const [filterDialogEvent, setFilterDialogEvent] = useState<EventSubscription | null>(null);
  const [filterField, setFilterField] = useState("args.to");
  const [filterOperator, setFilterOperator] = useState("in");
  const [filterValues, setFilterValues] = useState("");
  const [retriggerEvent, setRetriggerEvent] = useState<{
    id: string;
    eventName: string;
  } | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["contracts", id],
    queryFn: () => contractsApi.get(id),
    refetchInterval: 10_000,
    refetchIntervalInBackground: true,
    refetchOnWindowFocus: true,
  });

  const { data: recentEventsData } = useQuery({
    queryKey: ["events", "contract", id],
    queryFn: () => eventsApi.byContract(id, 10),
    enabled: !!id,
  });

  const contract: Contract | null = data?.data?.data || null;

  useEffect(() => {
    if (contract) {
      setName(contract.name);
      setIsActive(contract.isActive);
    }
  }, [contract]);

  const updateMutation = useMutation({
    mutationFn: (data: Record<string, unknown>) => contractsApi.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["contracts", id] });
      toast.success("Contract updated");
    },
    onError: (error: unknown) => {
      const err = error as { response?: { data?: { error?: string } } };
      toast.error(err.response?.data?.error || "Failed to update");
    },
  });

  const toggleEventMutation = useMutation({
    mutationFn: ({ eventId, isActive }: { eventId: string; isActive: boolean }) =>
      contractsApi.updateEvent(id, eventId, { isActive }),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["contracts", id] });
      toast.success(`Event ${variables.isActive ? "enabled" : "disabled"}`);
    },
    onError: (error: unknown) => {
      const err = error as { response?: { data?: { error?: string } } };
      toast.error(err.response?.data?.error || "Failed to toggle event");
    },
  });

  const updateFilterMutation = useMutation({
    mutationFn: ({ eventId, filterConditions }: { eventId: string; filterConditions: Record<string, any> | null }) =>
      contractsApi.updateEventFilter(id, eventId, filterConditions),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ["contracts", id] });
      toast.success(res?.data?.message || "Filter updated");
      setFilterDialogEvent(null);
    },
    onError: (error: unknown) => {
      const err = error as { response?: { data?: { error?: string } } };
      toast.error(err.response?.data?.error || "Failed to update filter");
    },
  });

  const addEventsMutation = useMutation({
    mutationFn: (data: { abi: unknown; selectedEvents: string[] }) =>
      contractsApi.addEvents(id, data),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ["contracts", id] });
      const msg = res?.data?.message || "Events added";
      toast.success(msg);
      setIsAddEventsOpen(false);
      setExtraAbi("");
      setExtraAbiFile(null);
      setExtractedEvents([]);
      setSelectedNewEvents([]);
    },
    onError: (error: unknown) => {
      const err = error as { response?: { data?: { error?: string } } };
      toast.error(err.response?.data?.error || "Failed to add events");
    },
  });

  const deleteMutation = useMutation({
    mutationFn: () => contractsApi.delete(id),
    onSuccess: () => {
      toast.success("Contract deleted");
      router.push("/dashboard/contracts");
    },
    onError: (error: unknown) => {
      const err = error as { response?: { data?: { error?: string } } };
      toast.error(err.response?.data?.error || "Failed to delete");
    },
  });

  const backfillMutation = useMutation({
    mutationFn: (data: Record<string, unknown>) => contractsApi.backfill(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["contracts", id] });
      toast.success("Backfill triggered — Noderails Indexer will re-process from the specified block");
      setIsBackfillOpen(false);
      setBackfillFrom("");
    },
    onError: (error: unknown) => {
      const err = error as { response?: { data?: { error?: string } } };
      toast.error(err.response?.data?.error || "Failed to trigger backfill");
    },
  });

  const retriggerMutation = useMutation({
    mutationFn: (eventId: string) => eventsApi.retriggerWebhooks(eventId),
    onSuccess: (res) => {
      const queued = res?.data?.data?.queued ?? 0;
      toast.success(
        `Queued ${queued} webhook ${queued === 1 ? "delivery" : "deliveries"}`
      );
      setRetriggerEvent(null);
    },
    onError: (error: unknown) => {
      const err = error as { response?: { data?: { error?: string } } };
      toast.error(err.response?.data?.error || "Failed to retrigger webhooks");
    },
  });

  // Helpers for the Add Events dialog
  const subscribedNames = new Set(
    contract?.eventSubscriptions?.map((s) => s.eventName) || []
  );

  const parseExtraAbiEvents = (abiJson: string) => {
    try {
      const parsed = JSON.parse(abiJson);
      const definitions = contract?.protocol === "sui"
        ? Object.values((contract?.abi as any)?.modules ?? {}).flatMap((mod: any) => [
            ...(mod?.events ?? []),
            ...(mod?.functions ?? []).filter((f: any) => f.isEntry !== false),
          ])
        : contract?.protocol === "solana"
        ? (Array.isArray(parsed.events) ? parsed.events : [])
        : (Array.isArray(parsed) ? parsed : parsed.abi);
      const eventNames: string[] = contract?.protocol === "sui"
        ? definitions.filter((item: any) => item?.name).map((item: any) => item.name as string)
        : contract?.protocol === "solana"
        ? definitions
            .filter((item: any) => item?.name)
            .map((item: any) => item.name as string)
        : definitions
            .filter((item: any) => item.type === "event")
            .map((item: any) => item.name as string)
        .filter((name: string) => !subscribedNames.has(name));
      setExtractedEvents(eventNames);
      setSelectedNewEvents(eventNames); // select all new by default
      return definitions;
    } catch {
      setExtractedEvents([]);
      setSelectedNewEvents([]);
      return null;
    }
  };

  const handleExtraAbiFileUpload = async (
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = e.target.files?.[0];
    if (file) {
      setExtraAbiFile(file);
      const text = await file.text();
      const abiArray = parseExtraAbiEvents(text);
      if (abiArray) {
        setExtraAbi(JSON.stringify(abiArray, null, 2));
      } else {
        toast.error("Invalid JSON file");
        setExtraAbiFile(null);
      }
    }
  };

  const handleAddEvents = (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const parsedAbi = JSON.parse(extraAbi);
      addEventsMutation.mutate({ abi: parsedAbi, selectedEvents: selectedNewEvents });
    } catch {
      toast.error("Invalid ABI/IDL JSON");
    }
  };

  const handleSave = () => {
    updateMutation.mutate({ name, isActive });
  };

  const getEventArgs = (eventName: string): Array<{ name: string; type: string; indexed?: boolean }> => {
    if (!contract?.abi) return [];
    if (contract.protocol === "sui") {
      const manifest = contract.abi as Record<string, any>;
      const modules = manifest?.modules ?? {};
      for (const mod of Object.values(modules) as Array<Record<string, any>>) {
        const eventDef = Array.isArray(mod?.events)
          ? mod.events.find((item: any) => item?.name === eventName)
          : null;
        if (eventDef?.fields) return eventDef.fields;
      }
      for (const mod of Object.values(modules) as Array<Record<string, any>>) {
        const fnDef = Array.isArray(mod?.functions)
          ? mod.functions.find((item: any) => item?.name === eventName)
          : null;
        if (fnDef?.parameters) {
          return fnDef.parameters.map((type: string, index: number) => ({
            name: `arg${index}`,
            type,
          }));
        }
      }
      return [];
    }
    if (contract.protocol === "solana") {
      const idl = contract.abi as Record<string, any>;
      const eventDef = Array.isArray(idl.events)
        ? idl.events.find((item: any) => item?.name === eventName)
        : null;
      return eventDef?.fields || [];
    }
    const abiEvent = (contract.abi as ABIEvent[]).find(
      (item) => item.type === "event" && item.name === eventName
    );
    return abiEvent?.inputs || [];
  };

  const openFilterDialog = (sub: EventSubscription) => {
    setFilterDialogEvent(sub);
    const args = getEventArgs(sub.eventName);
    if (sub.filterConditions && Object.keys(sub.filterConditions).length > 0) {
      const firstKey = Object.keys(sub.filterConditions)[0];
      const condition = sub.filterConditions[firstKey];
      const op = Object.keys(condition)[0] || "in";
      const val = condition[op];
      setFilterField(firstKey);
      setFilterOperator(op);
      setFilterValues(Array.isArray(val) ? val.join("\n") : String(val ?? ""));
    } else {
      // Default to first arg or "args.to"
      const defaultArg = args.length > 0 ? `args.${args[0].name}` : "args.to";
      setFilterField(defaultArg);
      setFilterOperator("in");
      setFilterValues("");
    }
  };

  const handleSaveFilter = () => {
    if (!filterDialogEvent) return;
    const trimmedValues = filterValues.trim();
    if (!trimmedValues) {
      // Clear filter
      updateFilterMutation.mutate({ eventId: filterDialogEvent.id, filterConditions: null });
      return;
    }
    const values = trimmedValues
      .split(/[\n,]+/)
      .map((v) => v.trim())
      .filter(Boolean);
    const filterConditions: Record<string, any> = {
      [filterField]: {
        [filterOperator]: ["in", "nin"].includes(filterOperator) ? values : values[0],
      },
    };
    updateFilterMutation.mutate({ eventId: filterDialogEvent.id, filterConditions });
  };

  const getFilterSummary = (fc: Record<string, any> | null): string | null => {
    if (!fc || Object.keys(fc).length === 0) return null;
    const parts: string[] = [];
    for (const [field, cond] of Object.entries(fc)) {
      for (const [op, val] of Object.entries(cond as Record<string, any>)) {
        const count = Array.isArray(val) ? val.length : 1;
        parts.push(`${field.replace("args.", "")} ${op} ${Array.isArray(val) ? `[${count} addr]` : String(val)}`);
      }
    }
    return parts.join(", ");
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-10 w-48" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (!contract) {
    return (
      <div className="flex flex-col items-center justify-center py-12">
        <h2 className="text-xl font-semibold">Contract not found</h2>
        <Link href="/dashboard/contracts">
          <Button variant="link">Back to contracts</Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Link href="/dashboard/contracts">
          <Button variant="ghost" size="icon">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{contract.name}</h1>
          <p className="text-muted-foreground font-mono text-sm">
            {contract.address}
          </p>
        </div>
        <Badge
          className="ml-auto"
          variant={contract.isActive ? "default" : "secondary"}
        >
          {contract.isActive ? "Active" : "Inactive"}
        </Badge>
      </div>

      {/* Info Cards */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Chain</CardDescription>
            <CardTitle className="text-2xl">
              {contract.chain?.name || "Unknown"}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              Chain ID: {contract.chain?.chainId || "-"}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Project</CardDescription>
            <CardTitle className="text-2xl">
              {contract.project?.name || "Unknown"}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Link href={`/dashboard/projects/${contract.project?.id}`}>
              <Button variant="link" className="p-0 h-auto">
                View Project
              </Button>
            </Link>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>{contract.protocol === "solana" ? "Start Slot" : contract.protocol === "sui" ? "Start Checkpoint" : "Start Block"}</CardDescription>
            <CardTitle className="text-2xl font-mono">
              {contract.startBlock ? Number(contract.startBlock).toLocaleString() : "0"}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              Indexing origin
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Event Subscriptions</CardDescription>
            <CardTitle className="text-2xl">
              {contract.eventSubscriptions?.filter((s) => s.isActive).length || 0} / {contract.eventSubscriptions?.length || 0}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              active / total events
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Sync Progress */}
      {contract.indexStates && contract.indexStates.length > 0 && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <TrendingUp className="h-5 w-5" />
                  Sync Progress
                </CardTitle>
                <CardDescription>
                  Current indexing checkpoint for this contract
                </CardDescription>
              </div>
              <Dialog open={isBackfillOpen} onOpenChange={setIsBackfillOpen}>
                <DialogTrigger asChild>
                  <Button variant="outline">
                    <RotateCcw className="mr-2 h-4 w-4" />
                    Backfill
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Trigger Backfill</DialogTitle>
                    <DialogDescription>
                      Re-index events from a specific block number. Noderails Indexer will
                      reset and re-process from the specified block.
                    </DialogDescription>
                  </DialogHeader>
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="backfillFrom">From Block</Label>
                      <Input
                        id="backfillFrom"
                        type="number"
                        value={backfillFrom}
                        onChange={(e) => setBackfillFrom(e.target.value)}
                        placeholder={contract.startBlock || "0"}
                      />
                      <p className="text-xs text-muted-foreground">
                        Leave empty to re-index from the contract&apos;s start block ({contract.startBlock || "0"})
                      </p>
                    </div>
                    <DialogFooter>
                      <Button variant="outline" onClick={() => setIsBackfillOpen(false)}>
                        Cancel
                      </Button>
                      <Button
                        onClick={() => backfillMutation.mutate({
                          fromBlock: backfillFrom ? parseInt(backfillFrom) : undefined,
                        })}
                        disabled={backfillMutation.isPending}
                      >
                        {backfillMutation.isPending ? "Triggering..." : "Start Backfill"}
                      </Button>
                    </DialogFooter>
                  </div>
                </DialogContent>
              </Dialog>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 md:grid-cols-2">
              <div className="rounded-md border p-4">
                <p className="text-sm text-muted-foreground">
                  Last Indexed {contract?.protocol === "solana" ? "Slot" : contract?.protocol === "sui" ? "Checkpoint" : "Block"}
                </p>
                <p className="text-2xl font-bold font-mono">
                  {Number(contract.indexStates[0].lastIndexedBlock).toLocaleString()}
                </p>
              </div>
              <div className="rounded-md border p-4">
                <p className="text-sm text-muted-foreground">
                  Last Finalized {contract?.protocol === "solana" ? "Slot" : contract?.protocol === "sui" ? "Checkpoint" : "Block"}
                </p>
                <p className="text-2xl font-bold font-mono">
                  {contract.indexStates[0].lastFinalizedBlock
                    ? Number(contract.indexStates[0].lastFinalizedBlock).toLocaleString()
                    : "–"}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Settings */}
        <Card>
          <CardHeader>
            <CardTitle>Contract Settings</CardTitle>
            <CardDescription>Update contract configuration</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">Contract Name</Label>
              <Input
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label>Active Status</Label>
                <p className="text-sm text-muted-foreground">
                  Enable or disable indexing
                </p>
              </div>
              <Switch checked={isActive} onCheckedChange={setIsActive} />
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

      </div>

      {/* Event Subscriptions */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Bell className="h-5 w-5" />
                Event Subscriptions
              </CardTitle>
              <CardDescription>
                Toggle events on/off to control which events are indexed
              </CardDescription>
            </div>
            <Dialog
              open={isAddEventsOpen}
              onOpenChange={(open) => {
                setIsAddEventsOpen(open);
                if (!open) {
                  setExtraAbi("");
                  setExtraAbiFile(null);
                  setExtractedEvents([]);
                  setSelectedNewEvents([]);
                }
              }}
            >
              <DialogTrigger asChild>
                <Button>
                  <Plus className="mr-2 h-4 w-4" />
                  Add Events
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-lg">
                <DialogHeader>
                  <DialogTitle>Add Events from ABI</DialogTitle>
                  <DialogDescription>
                    Paste or upload additional ABI or IDL to discover new events. Already subscribed events are excluded.
                  </DialogDescription>
                </DialogHeader>
                <form onSubmit={handleAddEvents} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="extraAbi">Contract ABI</Label>
                    <div className="flex items-center gap-2 mb-2">
                      <Label
                        htmlFor="extraAbiFile"
                        className="cursor-pointer inline-flex items-center gap-2 px-4 py-2 border rounded-md hover:bg-muted transition-colors text-sm"
                      >
                        <Upload className="h-4 w-4" />
                        {extraAbiFile ? extraAbiFile.name : "Upload ABI JSON"}
                      </Label>
                      <Input
                        id="extraAbiFile"
                        type="file"
                        accept=".json"
                        onChange={handleExtraAbiFileUpload}
                        className="hidden"
                      />
                    </div>
                    <Textarea
                      id="extraAbi"
                      value={extraAbi}
                      onChange={(e) => setExtraAbi(e.target.value)}
                      onBlur={() => parseExtraAbiEvents(extraAbi)}
                      placeholder={contract.protocol === "solana" ? '{"events":[...],"instructions":[...]}' : contract.protocol === "sui" ? '{"packageId":"0x...","modules":{...}}' : '[{"type":"event","name":"Transfer",...}]'}
                      rows={6}
                      className="font-mono text-sm"
                      required
                    />
                  </div>
                  {extractedEvents.length > 0 && (
                    <div className="space-y-2">
                      <Label>
                        New Events Found ({selectedNewEvents.length}/{extractedEvents.length})
                      </Label>
                      <div className="border rounded-md p-3 max-h-48 overflow-y-auto space-y-2">
                        <div className="flex items-center gap-2 pb-2 border-b mb-2">
                          <Checkbox
                            id="select-all-new"
                            checked={selectedNewEvents.length === extractedEvents.length}
                            onCheckedChange={(checked) =>
                              setSelectedNewEvents(
                                checked ? [...extractedEvents] : []
                              )
                            }
                          />
                          <label
                            htmlFor="select-all-new"
                            className="text-sm font-medium cursor-pointer"
                          >
                            Select All
                          </label>
                        </div>
                        {extractedEvents.map((eventName) => (
                          <div key={eventName} className="flex items-center gap-2">
                            <Checkbox
                              id={`new-event-${eventName}`}
                              checked={selectedNewEvents.includes(eventName)}
                              onCheckedChange={(checked) =>
                                setSelectedNewEvents((prev) =>
                                  checked
                                    ? [...prev, eventName]
                                    : prev.filter((e) => e !== eventName)
                                )
                              }
                            />
                            <label
                              htmlFor={`new-event-${eventName}`}
                              className="text-sm font-mono cursor-pointer"
                            >
                              {eventName}
                            </label>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  {extraAbi && extractedEvents.length === 0 && (
                    <p className="text-sm text-muted-foreground">
                      No new events found — events already subscribed are excluded.
                    </p>
                  )}
                  <DialogFooter>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => setIsAddEventsOpen(false)}
                    >
                      Cancel
                    </Button>
                    <Button
                      type="submit"
                      disabled={
                        addEventsMutation.isPending ||
                        selectedNewEvents.length === 0
                      }
                    >
                      {addEventsMutation.isPending
                        ? "Adding..."
                        : `Add ${selectedNewEvents.length} Event${selectedNewEvents.length !== 1 ? "s" : ""}`}
                    </Button>
                  </DialogFooter>
                </form>
              </DialogContent>
            </Dialog>
          </div>
        </CardHeader>
        <CardContent>
          {!contract.eventSubscriptions ||
          contract.eventSubscriptions.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-center">
              <Bell className="h-10 w-10 text-muted-foreground/50" />
              <h3 className="mt-4 text-lg font-semibold">No subscriptions</h3>
              <p className="text-muted-foreground">
                Subscribe to events to start indexing
              </p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Event Name</TableHead>
                  <TableHead>Signature</TableHead>
                  <TableHead>Filter</TableHead>
                  <TableHead>Indexing</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {contract.eventSubscriptions.map((sub) => {
                  const filterSummary = getFilterSummary(sub.filterConditions);
                  return (
                    <TableRow key={sub.id}>
                      <TableCell className="font-medium">
                        {sub.eventName}
                      </TableCell>
                      <TableCell>
                        <code className="text-xs text-muted-foreground">
                          {sub.eventSignature.length > 40
                            ? sub.eventSignature.slice(0, 40) + "..."
                            : sub.eventSignature}
                        </code>
                      </TableCell>
                      <TableCell>
                        <Button
                          variant={filterSummary ? "default" : "outline"}
                          size="sm"
                          onClick={() => openFilterDialog(sub)}
                          className="h-7 text-xs gap-1"
                        >
                          <Filter className="h-3 w-3" />
                          {filterSummary || "No filter"}
                        </Button>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Switch
                            checked={sub.isActive}
                            onCheckedChange={(checked) =>
                              toggleEventMutation.mutate({
                                eventId: sub.id,
                                isActive: checked,
                              })
                            }
                            disabled={toggleEventMutation.isPending}
                          />
                          <span className="text-xs text-muted-foreground">
                            {sub.isActive ? "On" : "Off"}
                          </span>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Recent Events */}
      {/* Filter Conditions Dialog */}
      <Dialog
        open={!!filterDialogEvent}
        onOpenChange={(open) => {
          if (!open) setFilterDialogEvent(null);
        }}
      >
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Filter className="h-5 w-5" />
              Filter: {filterDialogEvent?.eventName}
            </DialogTitle>
            <DialogDescription>
              Only events matching this filter will be indexed and trigger
              webhooks. Leave empty to index all events.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="filterField">Field</Label>
                {(() => {
                  const args = filterDialogEvent ? getEventArgs(filterDialogEvent.eventName) : [];
                  return args.length > 0 ? (
                    <select
                      id="filterField"
                      value={filterField}
                      onChange={(e) => setFilterField(e.target.value)}
                      className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                    >
                      {args.map((arg) => (
                        <option key={arg.name} value={`args.${arg.name}`}>
                          {arg.name} ({arg.type}){arg.indexed ? " ★" : ""}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <Input
                      id="filterField"
                      value={filterField}
                      onChange={(e) => setFilterField(e.target.value)}
                      placeholder="args.to"
                    />
                  );
                })()}
              </div>
              <div className="space-y-2">
                <Label htmlFor="filterOp">Operator</Label>
                <select
                  id="filterOp"
                  value={filterOperator}
                  onChange={(e) => setFilterOperator(e.target.value)}
                  className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                >
                  <option value="in">in (any of)</option>
                  <option value="nin">not in</option>
                  <option value="eq">equals</option>
                  <option value="neq">not equals</option>
                  <option value="gt">greater than</option>
                  <option value="gte">≥</option>
                  <option value="lt">less than</option>
                  <option value="lte">≤</option>
                </select>
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="filterValues">
                {["in", "nin"].includes(filterOperator)
                  ? "Values (one per line or comma-separated)"
                  : "Value"}
              </Label>
              <Textarea
                id="filterValues"
                value={filterValues}
                onChange={(e) => setFilterValues(e.target.value)}
                placeholder={
                  ["in", "nin"].includes(filterOperator)
                    ? "0xabc123...\n0xdef456...\n0x789..."
                    : "0xabc123... or 1000000000000000000"
                }
                rows={["in", "nin"].includes(filterOperator) ? 6 : 2}
                className="font-mono text-sm"
              />
              {["in", "nin"].includes(filterOperator) && filterValues.trim() && (
                <p className="text-xs text-muted-foreground">
                  {filterValues.split(/[\n,]+/).filter((v) => v.trim()).length} value(s)
                </p>
              )}
            </div>
          </div>
          <DialogFooter className="gap-2">
            {filterDialogEvent?.filterConditions && (
              <Button
                type="button"
                variant="destructive"
                onClick={() =>
                  updateFilterMutation.mutate({
                    eventId: filterDialogEvent.id,
                    filterConditions: null,
                  })
                }
                disabled={updateFilterMutation.isPending}
              >
                Clear Filter
              </Button>
            )}
            <Button
              type="button"
              variant="outline"
              onClick={() => setFilterDialogEvent(null)}
            >
              Cancel
            </Button>
            <Button
              onClick={handleSaveFilter}
              disabled={updateFilterMutation.isPending}
            >
              <Save className="mr-2 h-4 w-4" />
              {updateFilterMutation.isPending ? "Saving..." : "Save Filter"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Recent Events */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Activity className="h-5 w-5" />
              Recent Events
            </CardTitle>
            <CardDescription>
              Latest indexed events from this contract
            </CardDescription>
          </div>
          <Link href={`/dashboard/events?contractId=${contract.id}`}>
            <Button variant="ghost" size="sm">
              View all →
            </Button>
          </Link>
        </CardHeader>
        <CardContent>
          {(() => {
            const events = recentEventsData?.data?.data || [];
            if (events.length === 0) {
              return (
                <div className="flex flex-col items-center justify-center py-8 text-center">
                  <Activity className="h-10 w-10 text-muted-foreground/50" />
                  <h3 className="mt-4 text-lg font-semibold">No events yet</h3>
                  <p className="text-muted-foreground">
                    Events will appear here as they are indexed
                  </p>
                </div>
              );
            }
            return (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Event</TableHead>
                    <TableHead>Block</TableHead>
                    <TableHead>Tx Hash</TableHead>
                    <TableHead>Time</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {events.map((event: { id: string; eventName: string; blockNumber: number; transactionHash: string; timestamp: string | null }) => (
                    <TableRow key={event.id}>
                      <TableCell>
                        <Badge variant="outline">{event.eventName}</Badge>
                      </TableCell>
                      <TableCell className="font-mono">{event.blockNumber}</TableCell>
                      <TableCell>
                        <code className="text-xs bg-muted px-2 py-1 rounded">
                          {event.transactionHash.slice(0, 10)}...{event.transactionHash.slice(-6)}
                        </code>
                      </TableCell>
                      <TableCell>
                        {event.timestamp
                          ? new Date(event.timestamp).toLocaleString()
                          : "-"}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() =>
                            setRetriggerEvent({
                              id: event.id,
                              eventName: event.eventName,
                            })
                          }
                        >
                          <RotateCcw className="mr-1 h-3.5 w-3.5" />
                          Retrigger
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            );
          })()}
        </CardContent>
      </Card>

      <AlertDialog
        open={!!retriggerEvent}
        onOpenChange={(open) => {
          if (!open && !retriggerMutation.isPending) {
            setRetriggerEvent(null);
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Retrigger webhooks?</AlertDialogTitle>
            <AlertDialogDescription>
              This will POST again to all currently active webhooks subscribed
              to {retriggerEvent?.eventName ?? "this event"} and create new
              delivery records. Existing delivery history is kept.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={retriggerMutation.isPending}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              disabled={retriggerMutation.isPending || !retriggerEvent}
              onClick={(e) => {
                e.preventDefault();
                if (retriggerEvent) {
                  retriggerMutation.mutate(retriggerEvent.id);
                }
              }}
            >
              {retriggerMutation.isPending ? "Queueing..." : "Retrigger"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

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
              <Button variant="destructive">Delete Contract</Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete Contract?</AlertDialogTitle>
                <AlertDialogDescription>
                  This will permanently delete the contract and all associated
                  event subscriptions and indexed events. This action cannot be
                  undone.
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
    </div>
  );
}

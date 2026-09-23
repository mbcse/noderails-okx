"use client";

import { useState, useMemo, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { watchedAddressesApi, nativeTransfersApi, projectsApi, chainsApi } from "@/lib/api";
import { toast } from "sonner";
import { Wallet, Plus, Trash2, Pencil, ArrowDownLeft, ArrowUpRight, ArrowLeftRight } from "lucide-react";
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

const DIRECTION_OPTIONS = [
  { value: "both", label: "Both (in & out)", icon: ArrowLeftRight },
  { value: "in", label: "Incoming only", icon: ArrowDownLeft },
  { value: "out", label: "Outgoing only", icon: ArrowUpRight },
] as const;

export default function WatchedAddressesPage() {
  const queryClient = useQueryClient();
  const searchParams = useSearchParams();
  const projectIdFromUrl = searchParams.get("projectId") ?? "";
  const [projectId, setProjectId] = useState<string>(projectIdFromUrl);
  const [createOpen, setCreateOpen] = useState(false);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [selectedAddress, setSelectedAddress] = useState<{
    id: string;
    address: string;
    projectId: string;
    chainId: number | null;
    direction: string;
    label?: string | null;
  } | null>(null);

  useEffect(() => {
    if (projectIdFromUrl) setProjectId(projectIdFromUrl);
  }, [projectIdFromUrl]);
  const [createProjectId, setCreateProjectId] = useState("");
  const [createChainId, setCreateChainId] = useState("");
  const [createDirection, setCreateDirection] = useState<"in" | "out" | "both">("both");
  const [createAddressesText, setCreateAddressesText] = useState("");
  const [createLabel, setCreateLabel] = useState("");

  const { data: projectsData } = useQuery({
    queryKey: ["projects"],
    queryFn: () => projectsApi.list(),
  });
  const { data: chainsData } = useQuery({
    queryKey: ["chains"],
    queryFn: () => chainsApi.list(),
  });

  const projects = projectsData?.data?.data ?? [];
  const chains = chainsData?.data?.data ?? [];

  const { data: listData, isLoading: listLoading } = useQuery({
    queryKey: ["watched-addresses", projectId || "all"],
    queryFn: () =>
      watchedAddressesApi.list(projectId ? { projectId } : undefined),
    enabled: true,
  });

  const watchedList = listData?.data?.data ?? [];
  const filteredList = useMemo(() => {
    if (!projectId) return watchedList;
    return watchedList.filter((w: { projectId: string }) => w.projectId === projectId);
  }, [watchedList, projectId]);

  const { data: transfersData, isLoading: transfersLoading } = useQuery({
    queryKey: ["native-transfers", selectedAddress?.projectId, selectedAddress?.address],
    queryFn: () =>
      nativeTransfersApi.list({
        projectId: selectedAddress!.projectId,
        address: selectedAddress!.address,
        limit: 50,
        offset: 0,
      }),
    enabled: !!selectedAddress?.projectId && !!selectedAddress?.address,
  });

  const transfers = transfersData?.data?.data ?? [];
  const transfersTotal = transfersData?.data?.total ?? 0;

  const { data: detailData, isLoading: detailLoading } = useQuery({
    queryKey: ["watched-addresses", detailId],
    queryFn: () => watchedAddressesApi.get(detailId!),
    enabled: !!detailId,
  });
  const detailRow = detailData?.data?.data ?? null;

  const [editDirection, setEditDirection] = useState<"in" | "out" | "both">("both");
  const [editLabel, setEditLabel] = useState("");
  useEffect(() => {
    if (detailRow) {
      setEditDirection((detailRow.direction as "in" | "out" | "both") || "both");
      setEditLabel(detailRow.label ?? "");
    }
  }, [detailRow]);

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: { direction: "in" | "out" | "both"; label: string | null } }) =>
      watchedAddressesApi.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["watched-addresses"] });
      toast.success("Watched address updated");
      setDetailId(null);
    },
    onError: (error: unknown) => {
      const err = error as { response?: { data?: { error?: string } } };
      toast.error(err.response?.data?.error || "Failed to update");
    },
  });

  const createMutation = useMutation({
    mutationFn: (data: {
      projectId: string;
      chainId: number | null;
      addresses: string[];
      direction: "in" | "out" | "both";
      label?: string;
    }) => watchedAddressesApi.bulkCreate(data),
    onSuccess: (res: any) => {
      const { created = [], skipped = [] } = res.data?.data ?? {};
      queryClient.invalidateQueries({ queryKey: ["watched-addresses"] });
      setCreateOpen(false);
      setCreateAddressesText("");
      setCreateLabel("");
      if (created.length) {
        toast.success(`Added ${created.length} address(es)` + (skipped.length ? `, ${skipped.length} already watched` : ""));
      } else if (skipped.length) {
        toast.info(`All ${skipped.length} address(es) were already watched`);
      }
    },
    onError: (error: unknown) => {
      const err = error as { response?: { data?: { error?: string } } };
      toast.error(err.response?.data?.error || "Failed to add addresses");
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => watchedAddressesApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["watched-addresses"] });
      queryClient.invalidateQueries({ queryKey: ["native-transfers"] });
      toast.success("Address removed");
    },
    onError: (error: unknown) => {
      const err = error as { response?: { data?: { error?: string } } };
      toast.error(err.response?.data?.error || "Failed to remove");
    },
  });

  const handleCreate = () => {
    const raw = createAddressesText
      .split(/[\n,]/)
      .map((s) => s.trim())
      .filter((s) => /^0x[a-fA-F0-9]{40}$/.test(s) || /^0x[a-fA-F0-9]{64}$/.test(s));
    if (!createProjectId || !createChainId || raw.length === 0) {
      toast.error("Select project, chain, and enter at least one valid address");
      return;
    }
    const chainIdVal = createChainId === "__all__" ? null : parseInt(createChainId, 10);
    createMutation.mutate({
      projectId: createProjectId,
      chainId: chainIdVal,
      addresses: raw,
      direction: createDirection,
      label: createLabel.trim() || undefined,
    });
  };

  useEffect(() => {
    if (projectId && selectedAddress && selectedAddress.projectId !== projectId) {
      setSelectedAddress(null);
    }
  }, [projectId, selectedAddress?.id, selectedAddress?.projectId]);

  const { data: indexStateData } = useQuery({
    queryKey: ["native-index-state"],
    queryFn: () => chainsApi.getNativeIndexState(),
    refetchInterval: 30_000,
  });
  const indexStateList: Array<{
    chainId: number;
    name: string;
    lastIndexedBlock: string;
    currentBlock: string | null;
    safeBlock: string | null;
    behindBy: number | null;
    status: string;
  }> = indexStateData?.data?.data ?? [];

  const projectName = (id: string) => projects.find((p: { id: string; name: string }) => p.id === id)?.name ?? id;
  const chainName = (chainId: number | null) =>
    chainId === null ? "All chains" : chains.find((c: { chainId: number; name: string }) => c.chainId === chainId)?.name ?? String(chainId);

  return (
    <div className="flex flex-col h-full gap-4">
      <div>
        <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
          <Wallet className="h-8 w-8" />
          Watched Addresses
        </h1>
        <p className="text-muted-foreground mt-1">
          Track native transfers (ETH on EVM, SUI on SUI chains) for addresses. EVM: `0x` + 40 hex. SUI: `0x` + 64 hex.
        </p>
      </div>

      {/* Native indexer status: current block & last indexed block per chain */}
      {indexStateList.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Native transfer indexer status</CardTitle>
            <CardDescription>
              Last indexed block and current chain head per chain. Noderails Indexer only processes blocks up to the safe block (current − finality).
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Chain</TableHead>
                  <TableHead className="font-mono">Last indexed block</TableHead>
                  <TableHead className="font-mono">Current block</TableHead>
                  <TableHead className="font-mono">Safe block</TableHead>
                  <TableHead>Behind</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {indexStateList.map((row) => (
                  <TableRow key={row.chainId}>
                    <TableCell className="font-medium">{row.name}</TableCell>
                    <TableCell className="font-mono text-sm">{row.lastIndexedBlock}</TableCell>
                    <TableCell className="font-mono text-sm">{row.currentBlock ?? "—"}</TableCell>
                    <TableCell className="font-mono text-sm">{row.safeBlock ?? "—"}</TableCell>
                    <TableCell className="text-sm">
                      {row.behindBy !== null ? (
                        row.behindBy === 0 ? "0" : `${row.behindBy.toLocaleString()} blocks`
                      ) : "—"}
                    </TableCell>
                    <TableCell>
                      <Badge variant={row.status === "caught up" ? "secondary" : row.status === "indexing" ? "default" : "outline"}>
                        {row.status}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      <div className="flex gap-4 flex-1 min-h-0">
        {/* Main: list + create */}
        <div className="flex-1 min-w-0 space-y-4">
          <Card className="flex-1 min-h-0 flex flex-col">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <div>
                <CardTitle>Watched addresses</CardTitle>
                <CardDescription>
                  Addresses currently tracked for native transfers
                </CardDescription>
              </div>
              <div className="flex items-center gap-2">
                <Select
                  value={projectId || "__all__"}
                  onValueChange={(v) => setProjectId(v === "__all__" ? "" : v)}
                >
                  <SelectTrigger className="w-[200px]">
                    <SelectValue placeholder="All projects" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__all__">All projects</SelectItem>
                    {projects.map((p: { id: string; name: string }) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Dialog open={createOpen} onOpenChange={setCreateOpen}>
                  <DialogTrigger asChild>
                    <Button>
                      <Plus className="h-4 w-4 mr-2" />
                      Add addresses
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="max-w-md">
                    <DialogHeader>
                      <DialogTitle>Watch addresses for native transfers</DialogTitle>
                      <DialogDescription>
                        Add one or more addresses (one per line or comma-separated). Choose whether to index incoming, outgoing, or both.
                      </DialogDescription>
                    </DialogHeader>
                    <div className="grid gap-4 py-4">
                      <div className="grid gap-2">
                        <Label>Project</Label>
                        <Select
                          value={createProjectId}
                          onValueChange={setCreateProjectId}
                          required
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Select project" />
                          </SelectTrigger>
                          <SelectContent>
                            {projects.map((p: { id: string; name: string }) => (
                              <SelectItem key={p.id} value={p.id}>
                                {p.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="grid gap-2">
                        <Label>Chain</Label>
                        <Select
                          value={createChainId}
                          onValueChange={setCreateChainId}
                          required
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Select chain" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="__all__">All chains</SelectItem>
                            {chains.map((c: { id: string; chainId: number; name: string }) => (
                              <SelectItem key={c.id} value={String(c.chainId)}>
                                {c.name} (ID: {c.chainId})
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <p className="text-xs text-muted-foreground">
                          &quot;All chains&quot; watches this address on every active chain (including ones you add later).
                        </p>
                      </div>
                      <div className="grid gap-2">
                        <Label>Index</Label>
                        <Select
                          value={createDirection}
                          onValueChange={(v) => setCreateDirection(v as "in" | "out" | "both")}
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {DIRECTION_OPTIONS.map((opt) => (
                              <SelectItem key={opt.value} value={opt.value}>
                                <span className="flex items-center gap-2">
                                  <opt.icon className="h-4 w-4" />
                                  {opt.label}
                                </span>
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="grid gap-2">
                        <Label>Addresses (one per line or comma-separated)</Label>
                        <Textarea
                          placeholder="0x...&#10;0x...&#10;0x..."
                          value={createAddressesText}
                          onChange={(e) => setCreateAddressesText(e.target.value)}
                          rows={5}
                          className="font-mono text-sm"
                        />
                      </div>
                      <div className="grid gap-2">
                        <Label>Label (optional)</Label>
                        <Input
                          placeholder="e.g. Treasury"
                          value={createLabel}
                          onChange={(e) => setCreateLabel(e.target.value)}
                        />
                      </div>
                    </div>
                    <DialogFooter>
                      <Button variant="outline" onClick={() => setCreateOpen(false)}>
                        Cancel
                      </Button>
                    <Button
                  disabled={createMutation.isPending || !createProjectId || !createChainId || !createAddressesText.trim()}
                  onClick={handleCreate}
                  title={!createChainId ? "Select a chain or All chains" : undefined}
                >
                        {createMutation.isPending ? "Adding..." : "Add"}
                      </Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
              </div>
            </CardHeader>
            <CardContent className="flex-1 min-h-0">
              {listLoading ? (
                <Skeleton className="h-48 w-full" />
              ) : filteredList.length === 0 ? (
                <p className="text-sm text-muted-foreground py-8 text-center">
                  {projectId
                    ? "No watched addresses for this project. Add addresses above."
                    : "No watched addresses yet. Select a project and add addresses to track native transfers."}
                </p>
              ) : (
                <ScrollArea className="h-[320px] rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Address</TableHead>
                        <TableHead>Project</TableHead>
                        <TableHead>Chain</TableHead>
                        <TableHead>Direction</TableHead>
                        <TableHead className="w-[100px]">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredList.map((wa: { id: string; address: string; projectId: string; chainId: number | null; direction: string; label?: string | null }) => (
                        <TableRow
                          key={wa.id}
                          className={`cursor-pointer ${selectedAddress?.id === wa.id ? "bg-muted" : ""}`}
                          onClick={() => setSelectedAddress(wa)}
                        >
                          <TableCell className="font-mono text-sm">
                            {wa.address.slice(0, 10)}...{wa.address.slice(-8)}
                          </TableCell>
                          <TableCell>{projectName(wa.projectId)}</TableCell>
                          <TableCell>{chainName(wa.chainId)}</TableCell>
                          <TableCell>
                            <Badge variant="secondary">
                              {wa.direction === "in" && <ArrowDownLeft className="h-3 w-3 mr-1" />}
                              {wa.direction === "out" && <ArrowUpRight className="h-3 w-3 mr-1" />}
                              {wa.direction === "both" && <ArrowLeftRight className="h-3 w-3 mr-1" />}
                              {wa.direction}
                            </Badge>
                          </TableCell>
                          <TableCell onClick={(e) => e.stopPropagation()}>
                            <div className="flex items-center gap-1">
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8"
                                onClick={(e) => { e.stopPropagation(); setDetailId(wa.id); }}
                                title="View / Edit"
                              >
                                <Pencil className="h-4 w-4" />
                              </Button>
                              <AlertDialog>
                              <AlertDialogTrigger asChild>
                                <Button variant="ghost" size="icon" className="text-destructive hover:text-destructive h-8 w-8">
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              </AlertDialogTrigger>
                              <AlertDialogContent>
                                <AlertDialogHeader>
                                  <AlertDialogTitle>Remove watched address?</AlertDialogTitle>
                                  <AlertDialogDescription>
                                    This will stop tracking native transfers for this address.
                                  </AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                                  <AlertDialogAction
                                    onClick={() => deleteMutation.mutate(wa.id)}
                                    className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                  >
                                    Remove
                                  </AlertDialogAction>
                                </AlertDialogFooter>
                              </AlertDialogContent>
                            </AlertDialog>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </ScrollArea>
              )}
            </CardContent>
          </Card>

          {/* View / Edit detail dialog */}
          <Dialog open={!!detailId} onOpenChange={(open) => !open && setDetailId(null)}>
            <DialogContent className="sm:max-w-md" onClick={(e) => e.stopPropagation()}>
              <DialogHeader>
                <DialogTitle>Watched address details</DialogTitle>
                <DialogDescription>
                  View and edit direction or label. Address, project, and chain cannot be changed.
                </DialogDescription>
              </DialogHeader>
              {detailLoading || !detailRow ? (
                <Skeleton className="h-32 w-full" />
              ) : (
                <div className="grid gap-4 py-4">
                  <div className="grid gap-2">
                    <Label>Address</Label>
                    <p className="font-mono text-sm break-all rounded-md bg-muted px-3 py-2">{detailRow.address}</p>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="grid gap-2">
                      <Label>Project</Label>
                      <p className="text-sm">{detailRow.project?.name ?? projectName(detailRow.projectId)}</p>
                    </div>
                    <div className="grid gap-2">
                      <Label>Chain</Label>
                      <p className="text-sm">{chainName(detailRow.chainId)}</p>
                    </div>
                  </div>
                  <div className="grid gap-2">
                    <Label>Direction</Label>
                    <Select
                      value={editDirection}
                      onValueChange={(v) => setEditDirection(v as "in" | "out" | "both")}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {DIRECTION_OPTIONS.map((opt) => (
                          <SelectItem key={opt.value} value={opt.value}>
                            <span className="flex items-center gap-2">
                              <opt.icon className="h-4 w-4" />
                              {opt.label}
                            </span>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="grid gap-2">
                    <Label>Label</Label>
                    <Input
                      value={editLabel}
                      onChange={(e) => setEditLabel(e.target.value)}
                      placeholder="Optional label"
                    />
                  </div>
                  {detailRow.createdAt && (
                    <p className="text-xs text-muted-foreground">
                      Added {new Date(detailRow.createdAt).toLocaleString()}
                    </p>
                  )}
                </div>
              )}
              <DialogFooter>
                <Button variant="outline" onClick={() => setDetailId(null)}>
                  Cancel
                </Button>
                <Button
                  disabled={!detailRow || updateMutation.isPending}
                  onClick={() => {
                    if (!detailId || !detailRow) return;
                    updateMutation.mutate({
                      id: detailId,
                      data: {
                        direction: editDirection,
                        label: editLabel.trim() || null,
                      },
                    });
                  }}
                >
                  {updateMutation.isPending ? "Saving..." : "Save changes"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>

        {/* Side panel: indexed transfers for selected address */}
        <Card className="w-[440px] shrink-0 flex flex-col min-h-0">
          <CardHeader>
            <CardTitle>Indexed transfers</CardTitle>
            <CardDescription>
              {selectedAddress
                ? `Transfers for ${selectedAddress.label || `${selectedAddress.address.slice(0, 10)}...${selectedAddress.address.slice(-6)}`} (${transfersTotal} total)`
                : "Click an address in the list to view its indexed transfers and last block info."}
            </CardDescription>
          </CardHeader>
          <CardContent className="flex-1 min-h-0 flex flex-col space-y-4">
            {!selectedAddress ? (
              <p className="text-sm text-muted-foreground py-6 text-center">
                Click an address in the list to view its indexed transfers and last indexed block for its chain(s).
              </p>
            ) : (
              <>
                {/* Last indexed block for this address */}
                {selectedAddress.chainId !== null && indexStateList.find((r) => r.chainId === selectedAddress.chainId) && (
                  <div className="rounded-md border bg-muted/40 p-3 text-sm">
                    <p className="font-medium text-muted-foreground mb-1">Last indexed block ({chainName(selectedAddress.chainId)})</p>
                    {(() => {
                      const idx = indexStateList.find((r) => r.chainId === selectedAddress.chainId)!;
                      return (
                        <p className="font-mono text-xs">
                          Block #{idx.lastIndexedBlock} · Current: #{idx.currentBlock ?? "—"} · {idx.status}
                        </p>
                      );
                    })()}
                  </div>
                )}
                {selectedAddress.chainId === null && indexStateList.length > 0 && (
                  <div className="rounded-md border bg-muted/40 p-3 text-sm">
                    <p className="font-medium text-muted-foreground mb-1">Last indexed block (all chains)</p>
                    <p className="font-mono text-xs">
                      {indexStateList.map((r) => `${r.name}: #${r.lastIndexedBlock}`).join(" · ")}
                    </p>
                  </div>
                )}

                {transfersLoading ? (
                  <Skeleton className="h-48 w-full" />
                ) : transfers.length === 0 ? (
                  <p className="text-sm text-muted-foreground py-4 text-center">
                    No indexed transfers for this address yet.
                  </p>
                ) : (
                  <ScrollArea className="flex-1 h-[280px] rounded-md border">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Chain</TableHead>
                          <TableHead>Block</TableHead>
                          <TableHead>Direction</TableHead>
                          <TableHead>Value</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {transfers.map((t: { id: string; chainId: number; blockNumber: string; from: string; to: string | null; value: string; transactionHash: string; timestamp?: string }) => {
                          const dir = t.from?.toLowerCase() === selectedAddress.address.toLowerCase() ? "out" : "in";
                          return (
                            <TableRow key={t.id}>
                              <TableCell className="text-xs">{chainName(t.chainId)}</TableCell>
                              <TableCell className="font-mono text-xs" title={`Tx: ${t.transactionHash}`}>
                                #{t.blockNumber}
                              </TableCell>
                              <TableCell>
                                <Badge variant={dir === "in" ? "secondary" : "outline"} className="text-xs">
                                  {dir === "in" ? <ArrowDownLeft className="h-3 w-3 mr-0.5 inline" /> : <ArrowUpRight className="h-3 w-3 mr-0.5 inline" />}
                                  {dir}
                                </Badge>
                              </TableCell>
                              <TableCell className="text-xs">
                                {(Number(t.value) / 1e18).toFixed(4)} ETH
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </ScrollArea>
                )}
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

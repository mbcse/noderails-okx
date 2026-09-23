"use client";

import { useState, use } from "react";
import { useRouter } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { chainsApi, contractsApi } from "@/lib/api";
import { toast } from "sonner";
import { ArrowLeft, Plus, Trash2, RefreshCw, CheckCircle, XCircle, FileCode, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import Link from "next/link";

interface RpcHealthItem {
  url: string;
  isHealthy: boolean;
  latency: number;
  errorCount: number;
  lastError?: string;
}

interface Chain {
  id: string;
  name: string;
  chainId: number;
  rpcUrls: string[];
  isActive: boolean;
  blockTime: number;
  finalityBlocks: number;
  _count?: { contracts: number };
  rpcHealth?: {
    activeRpcIndex: number;
    rpcs: RpcHealthItem[];
  };
}

interface ChainContract {
  id: string;
  name: string;
  address: string;
  isActive: boolean;
  indexStates?: Array<{ lastIndexedBlock: string }>;
}

export default function ChainDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const router = useRouter();
  const queryClient = useQueryClient();

  const [formData, setFormData] = useState<{
    name: string;
    rpcUrls: string[];
    blockTime: string;
    finalityBlocks: string;
    isActive: boolean;
  } | null>(null);

  const [rpcStatuses, setRpcStatuses] = useState<Record<string, "pending" | "success" | "error">>({});

  const { data, isLoading } = useQuery({
    queryKey: ["chain", id],
    queryFn: () => chainsApi.get(id),
    enabled: !!id,
  });

  const chain: Chain | undefined = data?.data?.data;

  const { data: contractsData } = useQuery({
    queryKey: ["contracts", "chain", chain?.chainId],
    queryFn: () => contractsApi.list({ chainId: chain?.chainId }),
    enabled: !!chain?.chainId,
  });

  const chainContracts: ChainContract[] = contractsData?.data?.data || [];

  // Initialize form when data loads
  if (chain && !formData) {
    setFormData({
      name: chain.name,
      rpcUrls: chain.rpcUrls,
      blockTime: String(chain.blockTime),
      finalityBlocks: String(chain.finalityBlocks),
      isActive: chain.isActive,
    });
  }

  const updateMutation = useMutation({
    mutationFn: (data: Record<string, unknown>) => chainsApi.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["chain", id] });
      toast.success("Chain updated");
    },
    onError: (error: unknown) => {
      const err = error as { response?: { data?: { error?: string } } };
      toast.error(err.response?.data?.error || "Failed to update");
    },
  });

  const deleteMutation = useMutation({
    mutationFn: () => chainsApi.delete(id),
    onSuccess: () => {
      toast.success("Chain deleted");
      router.push("/dashboard/chains");
    },
    onError: (error: unknown) => {
      const err = error as { response?: { data?: { error?: string } } };
      toast.error(err.response?.data?.error || "Failed to delete");
    },
  });

  const testRpcMutation = useMutation({
    mutationFn: () => chainsApi.testRpc(id),
    onSuccess: (response) => {
      const results = response.data?.data || {};
      const newStatuses: Record<string, "pending" | "success" | "error"> = {};
      Object.entries(results).forEach(([url, status]) => {
        newStatuses[url] = status === "connected" ? "success" : "error";
      });
      setRpcStatuses(newStatuses);
      toast.success("RPC test completed");
    },
    onError: () => {
      toast.error("Failed to test RPCs");
    },
  });

  const resetNativeIndexMutation = useMutation({
    mutationFn: (backfillBlocks?: number) => chainsApi.resetNativeIndex(id, backfillBlocks),
    onSuccess: (response) => {
      const msg = response.data?.data?.message;
      toast.success(msg || "Native index reset. Next run will re-scan blocks.");
    },
    onError: (error: unknown) => {
      const err = error as { response?: { data?: { error?: string } } };
      toast.error(err.response?.data?.error || "Failed to reset native index");
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData) return;

    updateMutation.mutate({
      name: formData.name,
      rpcUrls: formData.rpcUrls.filter((url) => url.trim() !== ""),
      blockTime: parseInt(formData.blockTime),
      finalityBlocks: parseInt(formData.finalityBlocks),
      isActive: formData.isActive,
    });
  };

  const addRpcUrl = () => {
    if (!formData) return;
    setFormData({ ...formData, rpcUrls: [...formData.rpcUrls, ""] });
  };

  const updateRpcUrl = (index: number, value: string) => {
    if (!formData) return;
    setFormData({
      ...formData,
      rpcUrls: formData.rpcUrls.map((url, i) => (i === index ? value : url)),
    });
  };

  const removeRpcUrl = (index: number) => {
    if (!formData) return;
    setFormData({
      ...formData,
      rpcUrls: formData.rpcUrls.filter((_, i) => i !== index),
    });
  };

  if (isLoading || !formData) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-10 w-48" />
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" asChild>
            <Link href="/dashboard/chains">
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>
          <div>
            <h1 className="text-3xl font-bold tracking-tight">{chain?.name}</h1>
            <p className="text-muted-foreground">Chain ID: {chain?.chainId}</p>
          </div>
        </div>
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button variant="destructive">
              <Trash2 className="mr-2 h-4 w-4" />
              Delete Chain
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete Chain?</AlertDialogTitle>
              <AlertDialogDescription>
                This will permanently delete the chain. It must have no contracts
                associated with it.
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
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Chain Settings</CardTitle>
            <CardDescription>Update chain configuration</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="name">Chain Name</Label>
                <Input
                  id="name"
                  value={formData.name}
                  onChange={(e) =>
                    setFormData({ ...formData, name: e.target.value })
                  }
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="blockTime">Block Time (ms)</Label>
                  <Input
                    id="blockTime"
                    type="number"
                    value={formData.blockTime}
                    onChange={(e) =>
                      setFormData({ ...formData, blockTime: e.target.value })
                    }
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="finalityBlocks">Finality Blocks</Label>
                  <Input
                    id="finalityBlocks"
                    type="number"
                    value={formData.finalityBlocks}
                    onChange={(e) =>
                      setFormData({ ...formData, finalityBlocks: e.target.value })
                    }
                  />
                </div>
              </div>

              <div className="flex items-center space-x-2">
                <Switch
                  id="isActive"
                  checked={formData.isActive}
                  onCheckedChange={(checked) =>
                    setFormData({ ...formData, isActive: checked })
                  }
                />
                <Label htmlFor="isActive">Active</Label>
              </div>

              <Button type="submit" disabled={updateMutation.isPending}>
                {updateMutation.isPending ? "Saving..." : "Save Changes"}
              </Button>
            </form>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              RPC URLs
              <Button
                variant="outline"
                size="sm"
                onClick={() => testRpcMutation.mutate()}
                disabled={testRpcMutation.isPending}
              >
                <RefreshCw
                  className={`mr-2 h-4 w-4 ${testRpcMutation.isPending ? "animate-spin" : ""}`}
                />
                Test All
              </Button>
            </CardTitle>
            <CardDescription>
              Configure RPC endpoints with failover
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {formData.rpcUrls.map((url, index) => {
              const health = chain?.rpcHealth;
              const activeIdx = health?.activeRpcIndex ?? 0;
              const rpcStat = health?.rpcs?.[index];
              const isActive = index === activeIdx;
              const highErrors = rpcStat && (rpcStat.errorCount > 0 || !rpcStat.isHealthy);
              return (
              <div key={index} className="flex items-center gap-2">
                <div className="flex-1 flex flex-col gap-1">
                  <div className="flex items-center gap-2">
                    <Input
                      value={url}
                      onChange={(e) => updateRpcUrl(index, e.target.value)}
                      placeholder="https://eth.llamarpc.com"
                    />
                    {rpcStatuses[url] === "success" && (
                      <CheckCircle className="h-5 w-5 text-green-500 shrink-0" />
                    )}
                    {rpcStatuses[url] === "error" && (
                      <XCircle className="h-5 w-5 text-red-500 shrink-0" />
                    )}
                    {isActive && (
                      <Badge variant="default" className="shrink-0">Currently active</Badge>
                    )}
                    <Badge variant="outline" className="shrink-0">
                      #{index + 1}
                    </Badge>
                    {formData.rpcUrls.length > 1 && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() => removeRpcUrl(index)}
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    )}
                  </div>
                  {(rpcStat && (rpcStat.latency > 0 || rpcStat.errorCount > 0 || rpcStat.lastError)) && (
                    <p className="text-xs text-muted-foreground pl-1">
                      {rpcStat.latency > 0 && <span>{rpcStat.latency}ms latency</span>}
                      {rpcStat.errorCount > 0 && (
                        <span className={highErrors ? "text-destructive ml-2" : "ml-2"}>
                          {rpcStat.errorCount} error(s)
                          {rpcStat.lastError && ` · ${rpcStat.lastError.slice(0, 50)}${rpcStat.lastError.length > 50 ? "…" : ""}`}
                        </span>
                      )}
                    </p>
                  )}
                </div>
              </div>
              );
            })}
            <Button type="button" variant="outline" size="sm" onClick={addRpcUrl}>
              <Plus className="mr-2 h-4 w-4" />
              Add RPC URL
            </Button>
          </CardContent>
        </Card>
      </div>

      {/* Native transfer index */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Wallet className="h-5 w-5" />
            Native transfer index
          </CardTitle>
          <CardDescription>
            Re-scan recent blocks to pick up native (ETH) transfers for watched addresses. Use if you just added addresses and want to index the last N blocks.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button
            variant="outline"
            size="sm"
            onClick={() => resetNativeIndexMutation.mutate(100)}
            disabled={resetNativeIndexMutation.isPending}
          >
            <RefreshCw className={`mr-2 h-4 w-4 ${resetNativeIndexMutation.isPending ? "animate-spin" : ""}`} />
            {resetNativeIndexMutation.isPending ? "Resetting..." : "Re-scan last 100 blocks"}
          </Button>
        </CardContent>
      </Card>

      {/* Contracts on this chain */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <FileCode className="h-5 w-5" />
              Contracts ({chainContracts.length})
            </CardTitle>
            <CardDescription>
              Smart contracts registered on this chain
            </CardDescription>
          </div>
          <Link href="/dashboard/contracts">
            <Button variant="outline" size="sm">
              Manage Contracts
            </Button>
          </Link>
        </CardHeader>
        <CardContent>
          {chainContracts.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No contracts on this chain yet
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Address</TableHead>
                  <TableHead>Last Indexed Block</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {chainContracts.map((contract) => (
                  <TableRow key={contract.id}>
                    <TableCell>
                      <Link
                        href={`/dashboard/contracts/${contract.id}`}
                        className="font-medium hover:underline"
                      >
                        {contract.name}
                      </Link>
                    </TableCell>
                    <TableCell>
                      <code className="text-xs bg-muted px-2 py-1 rounded">
                        {contract.address.slice(0, 10)}...{contract.address.slice(-8)}
                      </code>
                    </TableCell>
                    <TableCell className="font-mono">
                      {contract.indexStates?.[0]?.lastIndexedBlock
                        ? Number(contract.indexStates[0].lastIndexedBlock).toLocaleString()
                        : "–"}
                    </TableCell>
                    <TableCell>
                      <Badge variant={contract.isActive ? "default" : "secondary"}>
                        {contract.isActive ? "Active" : "Inactive"}
                      </Badge>
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

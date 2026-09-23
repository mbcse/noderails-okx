"use client";

import { useState, useCallback, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { chainsApi } from "@/lib/api";
import { toast } from "sonner";
import Link from "next/link";
import { Plus, Trash2, Link2, Search, Loader2, Check, Copy, Globe } from "lucide-react";
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

interface RpcHealthItem {
  url: string;
  isHealthy: boolean;
  latency: number;
  lastChecked: string;
  errorCount: number;
  lastError?: string;
}

interface Chain {
  id: string;
  name: string;
  chainId: number;
  protocol?: "evm" | "solana" | "sui";
  graphqlUrls?: string[] | null;
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

interface ChainlistRpc {
  url: string;
  tracking?: string;
  isOpenSource?: boolean;
}

interface ChainlistEntry {
  name: string;
  chainId: number;
  rpc: (string | ChainlistRpc)[];
}

// Cache chainlist data in module scope so we only fetch once per session
let chainlistCache: ChainlistEntry[] | null = null;

const SUI_DEFAULT_ENDPOINTS: { name: string; jsonRpc: string; graphql: string; description: string }[] = [
  {
    name: "Mainnet",
    jsonRpc: "https://fullnode.mainnet.sui.io:443",
    graphql: "https://graphql.mainnet.sui.io/graphql",
    description: "SUI Mainnet (suggested chainId: 203)",
  },
  {
    name: "Testnet",
    jsonRpc: "https://fullnode.testnet.sui.io:443",
    graphql: "https://graphql.testnet.sui.io/graphql",
    description: "SUI Testnet (suggested chainId: 202)",
  },
  {
    name: "Devnet",
    jsonRpc: "https://fullnode.devnet.sui.io:443",
    graphql: "https://graphql.devnet.sui.io/graphql",
    description: "SUI Devnet (suggested chainId: 201)",
  },
];

const SOLANA_DEFAULT_RPCS: { name: string; url: string; description: string }[] = [
  {
    name: "Mainnet",
    url: "https://api.mainnet.solana.com",
    description: "Live production environment — Requires SOL for transactions",
  },
  {
    name: "Devnet",
    url: "https://api.devnet.solana.com",
    description: "Public testing and development — Free SOL airdrop for testing",
  },
  {
    name: "Testnet",
    url: "https://api.testnet.solana.com",
    description: "Validator and stress testing — May have intermittent downtime",
  },
];

export default function ChainsPage() {
  const [isOpen, setIsOpen] = useState(false);
  const [formData, setFormData] = useState({
    protocol: "evm",
    name: "",
    chainId: "",
    rpcUrls: [""],
    graphqlUrls: [""],
    blockTime: "12000",
    finalityBlocks: "64",
  });

  // Chainlist RPC lookup state
  const [chainlistRpcs, setChainlistRpcs] = useState<string[]>([]);
  const [chainlistName, setChainlistName] = useState("");
  const [chainlistLoading, setChainlistLoading] = useState(false);
  const [chainlistSearched, setChainlistSearched] = useState(false);
  const [selectedRpcs, setSelectedRpcs] = useState<Set<string>>(new Set());
  const [copiedUrl, setCopiedUrl] = useState<string | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const queryClient = useQueryClient();

  const fetchChainlistRpcs = useCallback(async (chainId: string) => {
    // Only use Chainlist for EVM protocol
    if ((formData as any).protocol !== "evm") {
      setChainlistRpcs([]);
      setChainlistName("");
      setChainlistSearched(false);
      return;
    }
    const cid = parseInt(chainId);
    if (!cid || isNaN(cid)) {
      setChainlistRpcs([]);
      setChainlistName("");
      setChainlistSearched(false);
      return;
    }
    setChainlistLoading(true);
    setChainlistSearched(true);
    try {
      if (!chainlistCache) {
        const res = await fetch("https://chainlist.org/rpcs.json");
        chainlistCache = await res.json();
      }
      const entry = chainlistCache!.find((c) => c.chainId === cid);
      if (entry) {
        setChainlistName(entry.name);
        const httpRpcs = entry.rpc
          .map((r) => (typeof r === "string" ? r : r.url))
          .filter(
            (url) =>
              url.startsWith("https://") &&
              !url.includes("${") &&
              !url.includes("API_KEY")
          );
        setChainlistRpcs(httpRpcs);
        // Auto-fill chain name if empty
        if (!formData.name) {
          setFormData((prev) => ({ ...prev, name: entry.name }));
        }
      } else {
        setChainlistRpcs([]);
        setChainlistName("");
      }
    } catch {
      toast.error("Failed to fetch from Chainlist");
      setChainlistRpcs([]);
      setChainlistName("");
    } finally {
      setChainlistLoading(false);
    }
  }, [formData.name, formData.protocol]);

  const handleChainIdChange = (value: string) => {
    setFormData((prev) => ({ ...prev, chainId: value }));
    setSelectedRpcs(new Set());
    if (debounceRef.current) clearTimeout(debounceRef.current);
    // Only trigger Chainlist lookup for EVM; Solana will show defaults instead
    if (formData.protocol === "evm") {
      debounceRef.current = setTimeout(() => {
        fetchChainlistRpcs(value);
      }, 500);
    } else {
      setChainlistRpcs([]);
      setChainlistName("");
      setChainlistSearched(false);
    }
  };

  const toggleRpcSelection = (url: string) => {
    setSelectedRpcs((prev) => {
      const next = new Set(prev);
      if (next.has(url)) {
        next.delete(url);
      } else {
        next.add(url);
      }
      return next;
    });
  };

  const addSelectedRpcs = () => {
    if (selectedRpcs.size === 0) return;
    setFormData((prev) => {
      // Filter out empty existing entries
      const existing = prev.rpcUrls.filter((u) => u.trim() !== "");
      const existingSet = new Set(existing);
      const newUrls = [...selectedRpcs].filter((u) => !existingSet.has(u));
      const combined = [...existing, ...newUrls];
      return { ...prev, rpcUrls: combined.length ? combined : [""] };
    });
    setSelectedRpcs(new Set());
    toast.success(`Added ${selectedRpcs.size} RPC URL(s)`);
  };

  const copyUrl = async (url: string) => {
    await navigator.clipboard.writeText(url);
    setCopiedUrl(url);
    setTimeout(() => setCopiedUrl(null), 1500);
  };

  const { data, isLoading } = useQuery({
    queryKey: ["chains"],
    queryFn: () => chainsApi.list(),
  });

  const createMutation = useMutation({
    mutationFn: (data: Record<string, unknown>) => chainsApi.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["chains"] });
      toast.success("Chain created successfully");
      setIsOpen(false);
      resetForm();
    },
    onError: (error: unknown) => {
      const err = error as { response?: { data?: { error?: string } } };
      toast.error(err.response?.data?.error || "Failed to create chain");
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => chainsApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["chains"] });
      toast.success("Chain deleted");
    },
    onError: (error: unknown) => {
      const err = error as { response?: { data?: { error?: string } } };
      toast.error(err.response?.data?.error || "Failed to delete");
    },
  });

  const resetForm = () => {
    setFormData({
      protocol: "evm",
      name: "",
      chainId: "",
      rpcUrls: [""],
      graphqlUrls: [""],
      blockTime: "12000",
      finalityBlocks: "64",
    });
    setChainlistRpcs([]);
    setChainlistName("");
    setChainlistSearched(false);
    setSelectedRpcs(new Set());
  };

  const handleSubmit = (e?: React.FormEvent) => {
    e?.preventDefault();
    const rpcs = formData.rpcUrls.filter((url) => url.trim() !== "");
    if (rpcs.length === 0) {
      toast.error("At least one RPC URL is required");
      return;
    }
    const graphql = formData.protocol === "sui"
      ? formData.graphqlUrls.filter((url) => url.trim() !== "")
      : undefined;
    createMutation.mutate({
      protocol: formData.protocol,
      name: formData.name,
      chainId: parseInt(formData.chainId),
      rpcUrls: rpcs,
      ...(graphql && graphql.length > 0 ? { graphqlUrls: graphql } : {}),
      blockTime: parseInt(formData.blockTime),
      finalityBlocks: parseInt(formData.finalityBlocks),
    });
  };

  const addRpcUrl = () => {
    setFormData((prev) => ({ ...prev, rpcUrls: [...prev.rpcUrls, ""] }));
  };

  const updateRpcUrl = (index: number, value: string) => {
    setFormData((prev) => ({
      ...prev,
      rpcUrls: prev.rpcUrls.map((url, i) => (i === index ? value : url)),
    }));
  };

  const removeRpcUrl = (index: number) => {
    setFormData((prev) => ({
      ...prev,
      rpcUrls: prev.rpcUrls.filter((_, i) => i !== index),
    }));
  };

  const chains: Chain[] = data?.data?.data || [];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Chains</h1>
          <p className="text-muted-foreground">
            Manage blockchain networks for indexing
          </p>
        </div>
        <Dialog open={isOpen} onOpenChange={setIsOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="mr-2 h-4 w-4" />
              Add Chain
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg flex flex-col max-h-[85vh]">
            <DialogHeader>
              <DialogTitle>Add New Chain</DialogTitle>
              <DialogDescription>
                Enter a chain ID to auto-fetch public RPCs from Chainlist.
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="flex flex-col gap-4 overflow-y-auto pr-1 -mr-1 flex-1 min-h-0">
              <div className="space-y-2">
                <Label htmlFor="protocol">Protocol</Label>
                <Select
                  value={formData.protocol}
                  onValueChange={(value) => {
                    setFormData((prev) => ({ ...prev, protocol: value }));
                    setChainlistRpcs([]);
                    setChainlistName("");
                    setChainlistSearched(false);
                    setSelectedRpcs(new Set());
                  }}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select protocol" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="evm">EVM</SelectItem>
                    <SelectItem value="solana">Solana</SelectItem>
                    <SelectItem value="sui">SUI</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="chainId">Chain ID</Label>
                <Input
                  id="chainId"
                  type="number"
                  value={formData.chainId}
                  onChange={(e) => handleChainIdChange(e.target.value)}
                  placeholder={formData.protocol === "solana" ? "101" : formData.protocol === "sui" ? "203" : "1"}
                  required
                />
                {chainlistLoading && (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Loader2 className="h-3 w-3 animate-spin" />
                    Looking up on Chainlist...
                  </div>
                )}
                {chainlistName && !chainlistLoading && (
                  <div className="flex items-center gap-2 text-sm text-emerald-600">
                    <Globe className="h-3 w-3" />
                    Found: {chainlistName}
                  </div>
                )}
              </div>
              <div className="space-y-2">
                <Label htmlFor="name">Chain Name</Label>
                <Input
                  id="name"
                  value={formData.name}
                  onChange={(e) =>
                    setFormData((prev) => ({ ...prev, name: e.target.value }))
                  }
                  placeholder={formData.protocol === "solana" ? "Solana Mainnet" : formData.protocol === "sui" ? "SUI Mainnet" : "Ethereum Mainnet"}
                  required
                />
              </div>

              {/* Chainlist RPC Picker */}
              {chainlistSearched && !chainlistLoading && chainlistRpcs.length > 0 && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label className="flex items-center gap-1.5">
                      <Search className="h-3.5 w-3.5" />
                      Public RPCs from Chainlist
                      <Badge variant="secondary" className="ml-1 text-xs">
                        {chainlistRpcs.length}
                      </Badge>
                    </Label>
                    {selectedRpcs.size > 0 && (
                      <Button
                        type="button"
                        size="sm"
                        variant="default"
                        onClick={addSelectedRpcs}
                        className="h-7 text-xs"
                      >
                        <Plus className="h-3 w-3 mr-1" />
                        Add {selectedRpcs.size} selected
                      </Button>
                    )}
                  </div>
                  <div className="border rounded-md max-h-48 overflow-y-auto divide-y bg-muted/30">
                    {chainlistRpcs.map((url) => (
                      <div
                        key={url}
                        className="flex items-center gap-2 px-3 py-2 hover:bg-muted/60 cursor-pointer group text-sm"
                        onClick={() => toggleRpcSelection(url)}
                      >
                        <div
                          className={`flex-shrink-0 h-4 w-4 rounded border flex items-center justify-center transition-colors ${
                            selectedRpcs.has(url)
                              ? "bg-primary border-primary text-primary-foreground"
                              : "border-muted-foreground/30"
                          }`}
                        >
                          {selectedRpcs.has(url) && <Check className="h-3 w-3" />}
                        </div>
                        <span className="truncate flex-1 font-mono text-xs">
                          {url}
                        </span>
                        <button
                          type="button"
                          className="opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0"
                          onClick={(e) => {
                            e.stopPropagation();
                            copyUrl(url);
                          }}
                          title="Copy URL"
                        >
                          {copiedUrl === url ? (
                            <Check className="h-3.5 w-3.5 text-emerald-500" />
                          ) : (
                            <Copy className="h-3.5 w-3.5 text-muted-foreground" />
                          )}
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {/* Solana default RPCs (editable/addable) */}
              {formData.protocol === "sui" && (
                <div className="rounded-md border p-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-medium">SUI network presets</p>
                    <Badge variant="secondary">{SUI_DEFAULT_ENDPOINTS.length}</Badge>
                  </div>
                  <div className="space-y-2">
                    {SUI_DEFAULT_ENDPOINTS.map((r) => (
                      <button
                        key={r.name}
                        type="button"
                        className="w-full text-left rounded border p-2 text-sm hover:bg-muted"
                        onClick={() => {
                          setFormData((prev) => ({
                            ...prev,
                            name: prev.name || `SUI ${r.name}`,
                            rpcUrls: [r.jsonRpc],
                            graphqlUrls: [r.graphql],
                          }));
                        }}
                      >
                        <div className="font-medium">{r.name}</div>
                        <div className="text-xs text-muted-foreground">{r.description}</div>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {formData.protocol === "solana" && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label className="flex items-center gap-1.5">
                      <Globe className="h-3.5 w-3.5" />
                      Solana RPC Defaults
                      <Badge variant="secondary" className="ml-1 text-xs">
                        {SOLANA_DEFAULT_RPCS.length}
                      </Badge>
                    </Label>
                  </div>
                  <div className="border rounded-md max-h-48 overflow-y-auto divide-y bg-muted/30">
                    {SOLANA_DEFAULT_RPCS.map((r) => (
                      <div key={r.url} className="flex items-center gap-2 px-3 py-2 hover:bg-muted/60 group text-sm">
                        <div className="flex-1 min-w-0">
                          <div className="font-medium">{r.name}</div>
                          <div className="text-xs text-muted-foreground">{r.description}</div>
                          <div className="font-mono text-xs truncate">{r.url}</div>
                        </div>
                        <div className="flex-shrink-0">
                          <Button
                            type="button"
                            size="sm"
                            onClick={() => {
                              setFormData((prev) => {
                                const existing = prev.rpcUrls.filter((u) => u.trim() !== "");
                                if (existing.includes(r.url)) return prev;
                                return { ...prev, rpcUrls: [...existing, r.url] };
                              });
                              toast.success(`Added ${r.name} RPC`);
                            }}
                          >
                            Add
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {chainlistSearched && !chainlistLoading && chainlistRpcs.length === 0 && formData.chainId && (
                <p className="text-xs text-muted-foreground">
                  No public HTTP RPCs found on Chainlist for chain ID {formData.chainId}
                </p>
              )}

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label>RPC URLs</Label>
                  {formData.rpcUrls.filter((u) => u.trim()).length > 0 && (
                    <Badge variant="outline" className="text-xs">
                      {formData.rpcUrls.filter((u) => u.trim()).length} added
                    </Badge>
                  )}
                </div>
                {formData.rpcUrls.map((url, index) => (
                  <div key={index} className="flex gap-2">
                    <Input
                      value={url}
                      onChange={(e) => updateRpcUrl(index, e.target.value)}
                      placeholder={formData.protocol === "solana" ? "https://api.mainnet-beta.solana.com" : formData.protocol === "sui" ? "https://fullnode.mainnet.sui.io:443" : "https://eth.llamarpc.com"}
                    />
                    {formData.rpcUrls.length > 1 && (
                      <Button
                        type="button"
                        variant="outline"
                        size="icon"
                        onClick={() => removeRpcUrl(index)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                ))}
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={addRpcUrl}
                >
                  Add another RPC
                </Button>
              </div>
              {formData.protocol === "sui" && (
                <div className="space-y-2">
                  <Label>GraphQL URLs (recommended)</Label>
                  {formData.graphqlUrls.map((url, index) => (
                    <div key={`gql-${index}`} className="flex gap-2">
                      <Input
                        value={url}
                        onChange={(e) =>
                          setFormData((prev) => ({
                            ...prev,
                            graphqlUrls: prev.graphqlUrls.map((u, i) => (i === index ? e.target.value : u)),
                          }))
                        }
                        placeholder="https://graphql.testnet.sui.io/graphql"
                      />
                      {formData.graphqlUrls.length > 1 && (
                        <Button
                          type="button"
                          variant="outline"
                          size="icon"
                          onClick={() =>
                            setFormData((prev) => ({
                              ...prev,
                              graphqlUrls: prev.graphqlUrls.filter((_, i) => i !== index),
                            }))
                          }
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                  ))}
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setFormData((prev) => ({ ...prev, graphqlUrls: [...prev.graphqlUrls, ""] }))}
                  >
                    Add GraphQL URL
                  </Button>
                </div>
              )}

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="blockTime">Block Time (ms)</Label>
                  <Input
                    id="blockTime"
                    type="number"
                    value={formData.blockTime}
                    onChange={(e) =>
                      setFormData((prev) => ({
                        ...prev,
                        blockTime: e.target.value,
                      }))
                    }
                  />
                </div>
                <div className="space-y-2">
                    <Label htmlFor="finalityBlocks">{formData.protocol === "sui" ? "Checkpoint Lag" : "Finality Blocks"}</Label>
                  <Input
                    id="finalityBlocks"
                    type="number"
                    value={formData.finalityBlocks}
                    onChange={(e) =>
                      setFormData((prev) => ({
                        ...prev,
                        finalityBlocks: e.target.value,
                      }))
                    }
                  />
                </div>
              </div>
            </form>
            <DialogFooter className="pt-2 border-t">
              <Button
                type="button"
                variant="outline"
                onClick={() => setIsOpen(false)}
              >
                Cancel
              </Button>
              <Button
                onClick={handleSubmit}
                disabled={createMutation.isPending || !formData.chainId || !formData.name || formData.rpcUrls.filter((u) => u.trim()).length === 0}
              >
                {createMutation.isPending ? "Creating..." : "Create Chain"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>All Chains</CardTitle>
          <CardDescription>
            Configured blockchain networks for event indexing
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-2">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-16 w-full" />
              ))}
            </div>
          ) : chains.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <Link2 className="h-12 w-12 text-muted-foreground/50" />
              <h3 className="mt-4 text-lg font-semibold">No chains</h3>
              <p className="text-muted-foreground">
                Add your first blockchain network to get started
              </p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Protocol</TableHead>
                  <TableHead>Chain ID</TableHead>
                  <TableHead>RPC URLs</TableHead>
                  <TableHead>RPC Status</TableHead>
                  <TableHead>Contracts</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="w-[100px]">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {chains.map((chain) => {
                  const health = chain.rpcHealth;
                  const total = health?.rpcs?.length ?? (Array.isArray(chain.rpcUrls) ? chain.rpcUrls.length : 0);
                  const activeIdx = health?.activeRpcIndex ?? 0;
                  const activeRpc = health?.rpcs?.[activeIdx];
                  const highErrors = activeRpc && (activeRpc.errorCount > 0 || !activeRpc.isHealthy);
                  return (
                  <TableRow key={chain.id}>
                    <TableCell>
                      <Link
                        href={`/dashboard/chains/${chain.id}`}
                        className="font-medium hover:underline"
                      >
                        {chain.name}
                      </Link>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">{chain.protocol || "evm"}</Badge>
                    </TableCell>
                    <TableCell>{chain.chainId}</TableCell>
                    <TableCell>
                      <Badge variant="outline">
                        {Array.isArray(chain.rpcUrls) ? chain.rpcUrls.length : 0} RPCs
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {total > 0 ? (
                        <span className="text-sm">
                          RPC {activeIdx + 1}/{total} active
                          {highErrors && (
                            <Badge variant="destructive" className="ml-1.5 text-xs">High error rate</Badge>
                          )}
                        </span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell>{chain._count?.contracts || 0}</TableCell>
                    <TableCell>
                      <Badge variant={chain.isActive ? "default" : "secondary"}>
                        {chain.isActive ? "Active" : "Inactive"}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => {
                          if (confirm("Delete this chain?")) {
                            deleteMutation.mutate(chain.id);
                          }
                        }}
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </TableCell>
                  </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { contractsApi, projectsApi, chainsApi } from "@/lib/api";
import { toast } from "sonner";
import Link from "next/link";
import { Plus, Trash2, FileCode, Upload, Check, Loader2 } from "lucide-react";
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
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Checkbox } from "@/components/ui/checkbox";

interface Contract {
  id: string;
  name: string;
  address: string;
  isActive: boolean;
  createdAt: string;
  project?: { id: string; name: string };
  protocol?: "evm" | "solana" | "sui";
  chain?: { id: string; name: string; chainId: number; protocol?: "evm" | "solana" | "sui" };
  _count?: { eventSubscriptions: number };
}

interface Project {
  id: string;
  name: string;
}

interface Chain {
  id: string;
  name: string;
  chainId: number;
  protocol?: "evm" | "solana" | "sui";
}

export default function ContractsPage() {
  const [isOpen, setIsOpen] = useState(false);
  const [name, setName] = useState("");
  const [address, setAddress] = useState("");
  const [protocol, setProtocol] = useState<"evm" | "solana" | "sui">("evm");
  const [projectId, setProjectId] = useState("");
  const [chainId, setChainId] = useState("");
  const [abi, setAbi] = useState("");
  const [abiFile, setAbiFile] = useState<File | null>(null);
  const [startBlock, setStartBlock] = useState("");
  const [extractedEvents, setExtractedEvents] = useState<string[]>([]);
  const [selectedEvents, setSelectedEvents] = useState<string[]>([]);
  const [filterProject, setFilterProject] = useState("");
  const [filterChain, setFilterChain] = useState("");
  const [isFetchingIdl, setIsFetchingIdl] = useState(false);
  const [isFetchingManifest, setIsFetchingManifest] = useState(false);

  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ["contracts"],
    queryFn: () => contractsApi.list(),
  });

  const { data: projectsData } = useQuery({
    queryKey: ["projects"],
    queryFn: () => projectsApi.list(),
  });

  const { data: chainsData } = useQuery({
    queryKey: ["chains"],
    queryFn: () => chainsApi.list(),
  });

  const createMutation = useMutation({
    mutationFn: (data: Record<string, unknown>) => contractsApi.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["contracts"] });
      toast.success("Contract created successfully");
      setIsOpen(false);
      resetForm();
    },
    onError: (error: unknown) => {
      const err = error as { response?: { data?: { error?: string } } };
      toast.error(err.response?.data?.error || "Failed to create contract");
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => contractsApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["contracts"] });
      toast.success("Contract deleted");
    },
    onError: (error: unknown) => {
      const err = error as { response?: { data?: { error?: string } } };
      toast.error(err.response?.data?.error || "Failed to delete");
    },
  });

  const resetForm = () => {
    setName("");
    setAddress("");
    setProtocol("evm");
    setProjectId("");
    setChainId("");
    setAbi("");
    setAbiFile(null);
    setStartBlock("");
    setExtractedEvents([]);
    setSelectedEvents([]);
  };

  const parseAbiEvents = (abiJson: string) => {
    try {
      const parsed = JSON.parse(abiJson);
      const definitions = Array.isArray(parsed)
        ? parsed
        : protocol === "sui"
          ? Object.values(parsed.modules ?? {}).flatMap((mod: any) => [
              ...(mod?.events ?? []).map((e: any) => e.name),
              ...(mod?.functions ?? []).filter((f: any) => f.isEntry !== false).map((f: any) => f.name),
            ])
          : protocol === "solana"
          ? parsed.events ?? []
          : parsed.abi;
      const eventNames: string[] = protocol === "sui"
        ? (definitions as string[])
        : protocol === "solana"
        ? definitions.filter((item: any) => item?.name).map((item: any) => item.name as string)
        : definitions
            .filter((item: any) => item.type === "event")
            .map((item: any) => item.name as string);
      setExtractedEvents(eventNames);
      setSelectedEvents(eventNames); // select all by default
      return definitions;
    } catch {
      setExtractedEvents([]);
      setSelectedEvents([]);
      return null;
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setAbiFile(file);
      const text = await file.text();
      const abiArray = parseAbiEvents(text);
      if (abiArray) {
        setAbi(JSON.stringify(abiArray, null, 2));
      } else {
        toast.error("Invalid JSON file");
        setAbiFile(null);
      }
    }
  };

  const handleFetchManifest = async () => {
    if (!chainId || !address) {
      toast.error("Please select a chain and enter a package ID");
      return;
    }

    setIsFetchingManifest(true);
    try {
      const response = await contractsApi.fetchManifest(parseInt(chainId, 10), address);
      const manifest = response.data?.data?.manifest;
      if (manifest) {
        setAbi(JSON.stringify(manifest, null, 2));
        parseAbiEvents(JSON.stringify(manifest));
        toast.success("Package manifest fetched and loaded successfully");
      } else {
        toast.error("Could not fetch manifest for this package");
      }
    } catch (error: any) {
      const msg = error?.response?.data?.error || "Failed to fetch manifest";
      toast.error(msg, { duration: 8000 });
    } finally {
      setIsFetchingManifest(false);
    }
  };

  const handleFetchIdl = async () => {
    if (!chainId || !address) {
      toast.error("Please select a chain and enter a program ID");
      return;
    }

    setIsFetchingIdl(true);
    try {
      const response = await contractsApi.fetchIdl(parseInt(chainId, 10), address);
      const idl = response.data?.data?.idl;
      if (idl) {
        setAbi(JSON.stringify(idl, null, 2));
        parseAbiEvents(JSON.stringify(idl));
        toast.success("IDL fetched and loaded successfully");
      } else {
        toast.error("Could not fetch IDL for this program");
      }
    } catch (error: any) {
      console.error('Error fetching IDL:', error);
      toast.error(error?.response?.data?.error || "Failed to fetch IDL");
    } finally {
      setIsFetchingIdl(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const parsedAbi = JSON.parse(abi);
      createMutation.mutate({
        name,
        address,
        protocol,
        projectId,
        chainId: parseInt(chainId, 10),
        abi: protocol === "evm"
          ? (Array.isArray(parsedAbi) ? parsedAbi : parsedAbi.abi)
          : parsedAbi,
        selectedEvents,
        ...(startBlock ? { startBlock: parseInt(startBlock, 10) } : {}),
      });
    } catch {
      toast.error("Invalid ABI JSON");
    }
  };

  const allContracts: Contract[] = data?.data?.data || [];
  const projects: Project[] = projectsData?.data?.data || [];
  const chains: Chain[] = chainsData?.data?.data || [];

  const contracts = allContracts.filter((c) => {
    if (filterProject && c.project?.id !== filterProject) return false;
    if (filterChain && String(c.chain?.chainId) !== filterChain) return false;
    return true;
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Contracts</h1>
          <p className="text-muted-foreground">
            Manage smart contracts to index
          </p>
        </div>
        <Dialog open={isOpen} onOpenChange={setIsOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="mr-2 h-4 w-4" />
              Add Contract
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>Add New Contract</DialogTitle>
              <DialogDescription>
                Register a smart contract to start indexing events
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="protocol">Protocol</Label>
                <Select value={protocol} onValueChange={(value) => setProtocol(value as "evm" | "solana" | "sui") }>
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
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="name">{protocol === "solana" ? "Program Name" : protocol === "sui" ? "Package Name" : "Contract Name"}</Label>
                  <Input
                    id="name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder={protocol === "solana" ? "Token Program" : protocol === "sui" ? "DEX Package" : "USDC Token"}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="address">{protocol === "solana" ? "Program ID" : protocol === "sui" ? "Package ID" : "Contract Address"}</Label>
                  <Input
                    id="address"
                    value={address}
                    onChange={(e) => setAddress(e.target.value)}
                    placeholder={protocol === "solana" ? "Program1111111111111111111111111111111111" : protocol === "sui" ? "0x..." : "0x..."}
                    required
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
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
                <div className="space-y-2">
                  <Label htmlFor="chain">Chain</Label>
                  <Select value={chainId} onValueChange={setChainId}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select chain" />
                    </SelectTrigger>
                    <SelectContent>
                      {chains.filter((chain) => {
                        if (protocol === "solana") return chain.protocol === "solana";
                        if (protocol === "sui") return chain.protocol === "sui";
                        return chain.protocol !== "solana" && chain.protocol !== "sui";
                      }).map((chain) => (
                        <SelectItem key={chain.id} value={String(chain.chainId)}>
                          {chain.name} ({chain.chainId})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="startBlock">Start Block (optional)</Label>
                <Input
                  id="startBlock"
                  type="number"
                  value={startBlock}
                  onChange={(e) => setStartBlock(e.target.value)}
                  placeholder={protocol === "solana" ? "Leave empty for current slot" : protocol === "sui" ? "Leave empty for current checkpoint" : "Leave empty for current block"}
                />
                <p className="text-xs text-muted-foreground">
                  {protocol === "solana"
                    ? "Slot to start indexing from. Defaults to the chain's current slot."
                    : protocol === "sui"
                      ? "Checkpoint to start indexing from. Defaults to the chain's current checkpoint."
                      : "Block number to start indexing from. Defaults to the chain's current block."}
                </p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="abi">{protocol === "solana" ? "Program IDL" : protocol === "sui" ? "Package Manifest" : "Contract ABI"}</Label>
                <div className="flex items-center gap-2 mb-2">
                  <Label
                    htmlFor="abiFile"
                    className="cursor-pointer inline-flex items-center gap-2 px-4 py-2 border rounded-md hover:bg-muted transition-colors"
                  >
                    <Upload className="h-4 w-4" />
                    {abiFile ? abiFile.name : "Upload ABI JSON"}
                  </Label>
                  <Input
                    id="abiFile"
                    type="file"
                    accept=".json"
                    onChange={handleFileUpload}
                    className="hidden"
                  />
                  {protocol === "sui" && (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={handleFetchManifest}
                      disabled={isFetchingManifest || !chainId || !address}
                    >
                      {isFetchingManifest ? (
                        <>
                          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                          Fetching...
                        </>
                      ) : (
                        <>
                          <FileCode className="h-4 w-4 mr-2" />
                          Fetch Manifest
                        </>
                      )}
                    </Button>
                  )}
                  {protocol === "solana" && (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={handleFetchIdl}
                      disabled={isFetchingIdl || !chainId || !address}
                    >
                      {isFetchingIdl ? (
                        <>
                          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                          Fetching...
                        </>
                      ) : (
                        <>
                          <FileCode className="h-4 w-4 mr-2" />
                          Auto-fetch IDL
                        </>
                      )}
                    </Button>
                  )}
                </div>
                <Textarea
                  id="abi"
                  value={abi}
                  onChange={(e) => setAbi(e.target.value)}
                  onBlur={() => parseAbiEvents(abi)}
                  placeholder={protocol === "solana" ? '{"events":[...],"instructions":[...]}' : protocol === "sui" ? '{"packageId":"0x...","modules":{...}}' : '[{"type":"event","name":"Transfer",...}]'}
                  rows={8}
                  className="font-mono text-sm"
                  required
                />
              </div>
              {/* Event Picker — shown after ABI is parsed */}
              {extractedEvents.length > 0 && (
                <div className="space-y-2">
                  <Label>Select Events to Index ({selectedEvents.length}/{extractedEvents.length})</Label>
                  <div className="border rounded-md p-3 max-h-48 overflow-y-auto space-y-2">
                    <div className="flex items-center gap-2 pb-2 border-b mb-2">
                      <Checkbox
                        id="select-all"
                        checked={selectedEvents.length === extractedEvents.length}
                        onCheckedChange={(checked) =>
                          setSelectedEvents(checked ? [...extractedEvents] : [])
                        }
                      />
                      <label htmlFor="select-all" className="text-sm font-medium cursor-pointer">
                        Select All
                      </label>
                    </div>
                    {extractedEvents.map((eventName) => (
                      <div key={eventName} className="flex items-center gap-2">
                        <Checkbox
                          id={`event-${eventName}`}
                          checked={selectedEvents.includes(eventName)}
                          onCheckedChange={(checked) =>
                            setSelectedEvents((prev) =>
                              checked
                                ? [...prev, eventName]
                                : prev.filter((e) => e !== eventName)
                            )
                          }
                        />
                        <label htmlFor={`event-${eventName}`} className="text-sm font-mono cursor-pointer">
                          {eventName}
                        </label>
                      </div>
                    ))}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Only selected events will be actively indexed. Others are saved but inactive.
                  </p>
                </div>
              )}

              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setIsOpen(false)}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={createMutation.isPending || (extractedEvents.length > 0 && selectedEvents.length === 0)}
                >
                  {createMutation.isPending ? "Creating..." : "Add Contract"}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {/* Filters */}
      <div className="flex gap-4">
        <Select value={filterProject} onValueChange={(v) => setFilterProject(v === "all" ? "" : v)}>
          <SelectTrigger className="w-[200px]">
            <SelectValue placeholder="All projects" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All projects</SelectItem>
            {projects.map((p) => (
              <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={filterChain} onValueChange={(v) => setFilterChain(v === "all" ? "" : v)}>
          <SelectTrigger className="w-[200px]">
            <SelectValue placeholder="All chains" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All chains</SelectItem>
            {chains.map((c) => (
              <SelectItem key={c.id} value={String(c.chainId)}>{c.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>All Contracts ({contracts.length})</CardTitle>
          <CardDescription>
            Smart contracts registered for event indexing
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-2">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-16 w-full" />
              ))}
            </div>
          ) : contracts.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <FileCode className="h-12 w-12 text-muted-foreground/50" />
              <h3 className="mt-4 text-lg font-semibold">No contracts</h3>
              <p className="text-muted-foreground">
                Add your first contract to start indexing events
              </p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Address</TableHead>
                  <TableHead>Chain</TableHead>
                  <TableHead>Project</TableHead>
                  <TableHead>Events</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="w-[100px]">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {contracts.map((contract) => (
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
                        {contract.address.slice(0, 10)}...
                        {contract.address.slice(-8)}
                      </code>
                    </TableCell>
                    <TableCell>
                      {contract.chain ? (
                        <Badge variant="outline">
                          {contract.chain.name}
                        </Badge>
                      ) : (
                        "-"
                      )}
                    </TableCell>
                    <TableCell>
                      {contract.project?.name || "-"}
                    </TableCell>
                    <TableCell>
                      {contract._count?.eventSubscriptions || 0}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={contract.isActive ? "default" : "secondary"}
                      >
                        {contract.isActive ? "Active" : "Inactive"}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => {
                          if (confirm("Delete this contract?")) {
                            deleteMutation.mutate(contract.id);
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

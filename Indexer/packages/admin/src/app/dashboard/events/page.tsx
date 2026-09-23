"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { eventsApi, contractsApi, chainsApi } from "@/lib/api";
import { Activity, ChevronDown, ChevronRight } from "lucide-react";
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
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";

interface IndexedEvent {
  id: string;
  eventName: string;
  blockNumber: number;
  transactionHash: string;
  logIndex: number;
  args: Record<string, unknown>;
  timestamp: string | null;
  createdAt: string;
  contractName: string;
  contractAddress: string;
  chainId: number;
  chainName: string;
}

interface Contract {
  id: string;
  name: string;
}

interface Chain {
  id: string;
  name: string;
  chainId: number;
}

export default function EventsPage() {
  const [contractId, setContractId] = useState("");
  const [chainId, setChainId] = useState("");
  const [eventName, setEventName] = useState("");
  const [page, setPage] = useState(1);
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());
  const limit = 25;

  const { data, isLoading, refetch, isRefetching } = useQuery({
    queryKey: ["events", { contractId, chainId, eventName, page, limit }],
    queryFn: () =>
      eventsApi.list({
        contractId: contractId || undefined,
        chainId: chainId || undefined,
        eventName: eventName || undefined,
        page,
        limit,
      }),
  });

  const { data: contractsData } = useQuery({
    queryKey: ["contracts"],
    queryFn: () => contractsApi.list(),
  });

  const { data: chainsData } = useQuery({
    queryKey: ["chains"],
    queryFn: () => chainsApi.list(),
  });

  const events: IndexedEvent[] = data?.data?.data || [];
  const total = data?.data?.total || 0;
  const totalPages = Math.ceil(total / limit);

  const contracts: Contract[] = contractsData?.data?.data || [];
  const chains: Chain[] = chainsData?.data?.data || [];

  const toggleRow = (id: string) => {
    const newExpanded = new Set(expandedRows);
    if (newExpanded.has(id)) {
      newExpanded.delete(id);
    } else {
      newExpanded.add(id);
    }
    setExpandedRows(newExpanded);
  };

  const formatArgs = (args: Record<string, unknown>) => {
    return Object.entries(args).map(([key, value]) => (
      <div key={key} className="flex gap-2 py-1">
        <span className="font-medium text-muted-foreground">{key}:</span>
        <span className="font-mono text-sm break-all">
          {typeof value === "object" ? JSON.stringify(value) : String(value)}
        </span>
      </div>
    ));
  };



  const handleFilterChange = () => {
    setPage(1);
    refetch();
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Indexed Events</h1>
          <p className="text-muted-foreground">
            Browse and search indexed blockchain events
          </p>
        </div>
        <Badge variant="outline" className="text-lg px-4 py-2">
          {total.toLocaleString()} events
        </Badge>
      </div>

      {/* Filters */}
      <Card>
        <CardHeader>
          <CardTitle>Filters</CardTitle>
          <CardDescription>Filter events by various criteria</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-4">
            <div className="space-y-2">
              <Label htmlFor="chain">Chain</Label>
              <Select
                value={chainId}
                onValueChange={(value) => {
                  setChainId(value === "all" ? "" : value);
                  handleFilterChange();
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="All chains" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All chains</SelectItem>
                  {chains.map((chain) => (
                    <SelectItem key={chain.id} value={String(chain.chainId)}>
                      {chain.name} ({chain.chainId})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="contract">Contract</Label>
              <Select
                value={contractId}
                onValueChange={(value) => {
                  setContractId(value === "all" ? "" : value);
                  handleFilterChange();
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="All contracts" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All contracts</SelectItem>
                  {contracts.map((contract) => (
                    <SelectItem key={contract.id} value={contract.id}>
                      {contract.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="eventName">Event Name</Label>
              <Input
                id="eventName"
                value={eventName}
                onChange={(e) => setEventName(e.target.value)}
                onBlur={handleFilterChange}
                onKeyDown={(e) => e.key === "Enter" && handleFilterChange()}
                placeholder="e.g., Transfer"
              />
            </div>
            <div className="flex items-end">
              <Button
                variant="outline"
                onClick={() => refetch()}
                disabled={isRefetching}
                className="w-full"
              >
                {isRefetching ? "Refreshing..." : "Refresh"}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Events Table */}
      <Card>
        <CardHeader>
          <CardTitle>Events</CardTitle>
          <CardDescription>
            Click on a row to expand event arguments
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-2">
              {[1, 2, 3, 4, 5].map((i) => (
                <Skeleton key={i} className="h-16 w-full" />
              ))}
            </div>
          ) : events.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <Activity className="h-12 w-12 text-muted-foreground/50" />
              <h3 className="mt-4 text-lg font-semibold">No events found</h3>
              <p className="text-muted-foreground">
                {contractId || chainId || eventName
                  ? "Try adjusting your filters"
                  : "Events will appear here as they are indexed"}
              </p>
            </div>
          ) : (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[40px]"></TableHead>
                    <TableHead>Event</TableHead>
                    <TableHead>Contract</TableHead>
                    <TableHead>Chain</TableHead>
                    <TableHead>Block</TableHead>
                    <TableHead>Transaction</TableHead>
                    <TableHead>Time</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {events.map((event) => (
                    <Collapsible key={event.id} asChild>
                      <>
                        <TableRow className="cursor-pointer hover:bg-muted/50">
                          <TableCell>
                            <CollapsibleTrigger asChild>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-6 w-6"
                                onClick={() => toggleRow(event.id)}
                              >
                                {expandedRows.has(event.id) ? (
                                  <ChevronDown className="h-4 w-4" />
                                ) : (
                                  <ChevronRight className="h-4 w-4" />
                                )}
                              </Button>
                            </CollapsibleTrigger>
                          </TableCell>
                          <TableCell
                            className="font-medium"
                            onClick={() => toggleRow(event.id)}
                          >
                            <Badge variant="outline">{event.eventName}</Badge>
                          </TableCell>
                          <TableCell onClick={() => toggleRow(event.id)}>
                            {event.contractName || "-"}
                          </TableCell>
                          <TableCell onClick={() => toggleRow(event.id)}>
                            <Badge variant="secondary">
                              {event.chainName || "-"}
                            </Badge>
                          </TableCell>
                          <TableCell onClick={() => toggleRow(event.id)}>
                            {event.blockNumber.toLocaleString()}
                          </TableCell>
                          <TableCell>
                            <code className="text-xs">
                              {event.transactionHash.slice(0, 10)}...{event.transactionHash.slice(-6)}
                            </code>
                          </TableCell>
                          <TableCell onClick={() => toggleRow(event.id)}>
                            {event.timestamp
                              ? new Date(event.timestamp).toLocaleString()
                              : new Date(event.createdAt).toLocaleString()}
                          </TableCell>
                        </TableRow>
                        <CollapsibleContent asChild>
                          <TableRow className="bg-muted/30">
                            <TableCell colSpan={7} className="p-4">
                              <div className="rounded-md bg-background p-4 border">
                                <h4 className="font-semibold mb-2">
                                  Event Arguments
                                </h4>
                                {Object.keys(event.args).length === 0 ? (
                                  <p className="text-sm text-muted-foreground">
                                    No arguments
                                  </p>
                                ) : (
                                  <div className="grid gap-1">
                                    {formatArgs(event.args)}
                                  </div>
                                )}
                                <div className="mt-4 pt-4 border-t">
                                  <div className="grid grid-cols-2 gap-4 text-sm">
                                    <div>
                                      <span className="text-muted-foreground">
                                        Log Index:
                                      </span>{" "}
                                      {event.logIndex}
                                    </div>
                                    <div>
                                      <span className="text-muted-foreground">
                                        Contract:
                                      </span>{" "}
                                      <code className="text-xs">
                                        {event.contractAddress || "-"}
                                      </code>
                                    </div>
                                  </div>
                                </div>
                              </div>
                            </TableCell>
                          </TableRow>
                        </CollapsibleContent>
                      </>
                    </Collapsible>
                  ))}
                </TableBody>
              </Table>

              {/* Pagination */}
              <div className="flex items-center justify-between mt-4">
                <p className="text-sm text-muted-foreground">
                  Showing {(page - 1) * limit + 1} to{" "}
                  {Math.min(page * limit, total)} of {total} events
                </p>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    disabled={page === 1}
                  >
                    Previous
                  </Button>
                  <span className="text-sm">
                    Page {page} of {totalPages || 1}
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                    disabled={page >= totalPages}
                  >
                    Next
                  </Button>
                </div>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

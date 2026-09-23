"use client";

import { useQuery } from "@tanstack/react-query";
import {
  chainsApi,
  projectsApi,
  contractsApi,
  healthApi,
  eventsApi,
} from "@/lib/api";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Link2,
  FolderKanban,
  FileCode2,
  Activity,
  Server,
  Webhook,
  ArrowRight,
} from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import Link from "next/link";

export default function DashboardPage() {
  const { data: chainsData, isLoading: chainsLoading } = useQuery({
    queryKey: ["chains"],
    queryFn: () => chainsApi.list(),
  });

  const { data: projectsData, isLoading: projectsLoading } = useQuery({
    queryKey: ["projects"],
    queryFn: () => projectsApi.list(),
  });

  const { data: contractsData, isLoading: contractsLoading } = useQuery({
    queryKey: ["contracts"],
    queryFn: () => contractsApi.list(),
  });

  const { data: healthData, isLoading: healthLoading } = useQuery({
    queryKey: ["health"],
    queryFn: () => healthApi.detailed(),
    refetchInterval: 10000,
  });

  const { data: eventsData } = useQuery({
    queryKey: ["events", "recent"],
    queryFn: () => eventsApi.list({ limit: 5 }),
    refetchInterval: 10000,
  });

  const chains = chainsData?.data?.data || [];
  const projects = projectsData?.data?.data || [];
  const contracts = contractsData?.data?.data || [];
  const health = healthData?.data?.data ?? healthData?.data ?? {};
  const recentEvents = eventsData?.data?.data || [];
  const queues = health.queues ?? {};
  const processEventQueue = queues.processEvent ?? {};
  const webhookDeliveryQueue = queues.webhookDelivery ?? {};
  const healthChains = health.chains ?? [];

  const stats = [
    {
      title: "Chains",
      value: chains.length,
      icon: Link2,
      description: `${chains.filter((c: { isActive: boolean }) => c.isActive).length} active`,
      href: "/dashboard/chains",
    },
    {
      title: "Projects",
      value: projects.length,
      icon: FolderKanban,
      description: `${projects.filter((p: { isActive: boolean }) => p.isActive).length} active`,
      href: "/dashboard/projects",
    },
    {
      title: "Contracts",
      value: contracts.length,
      icon: FileCode2,
      description: "Indexed contracts",
      href: "/dashboard/contracts",
    },
    {
      title: "Events",
      value: (health.counts?.indexedEvents || 0).toLocaleString(),
      icon: Activity,
      description: "Total indexed",
      href: "/dashboard/events",
    },
    {
      title: "Webhooks",
      value: health.counts?.webhooks || 0,
      icon: Webhook,
      description: "Configured",
      href: "/dashboard/webhooks",
    },
  ];

  const isLoading = chainsLoading || projectsLoading || contractsLoading;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Dashboard</h1>
        <p className="text-muted-foreground">
          Overview of your Noderails Indexer
        </p>
      </div>

      {/* Stats — clickable */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5">
        {stats.map((stat) => (
          <Link key={stat.title} href={stat.href}>
            <Card className="hover:bg-muted/50 transition-colors cursor-pointer h-full">
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium">
                  {stat.title}
                </CardTitle>
                <stat.icon className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                {isLoading && !health.counts ? (
                  <Skeleton className="h-8 w-16" />
                ) : (
                  <>
                    <div className="text-2xl font-bold">{stat.value}</div>
                    <p className="text-xs text-muted-foreground">
                      {stat.description}
                    </p>
                  </>
                )}
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        {/* System Health */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Server className="h-5 w-5" />
              System Health
            </CardTitle>
            <CardDescription>Current system status</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {healthLoading ? (
              <div className="space-y-2">
                <Skeleton className="h-6 w-full" />
                <Skeleton className="h-6 w-full" />
                <Skeleton className="h-6 w-full" />
              </div>
            ) : (
              <>
                <div className="flex items-center justify-between">
                  <span className="text-sm">Database</span>
                  <Badge
                    variant={
                      health.database?.status === "connected"
                        ? "default"
                        : "destructive"
                    }
                  >
                    {health.database?.status || "unknown"}{" "}
                    {health.database?.latency
                      ? `(${health.database.latency}ms)`
                      : ""}
                  </Badge>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm">Redis</span>
                  <Badge variant={health.queues ? "default" : "destructive"}>
                    {health.queues ? "connected" : "disconnected"}
                  </Badge>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm">Event Processing Queue</span>
                  <div className="flex items-center gap-1.5 flex-wrap justify-end">
                    <Badge variant="secondary">{(processEventQueue.waiting ?? 0)} waiting</Badge>
                    <Badge variant="secondary">{(processEventQueue.active ?? 0)} active</Badge>
                    {(processEventQueue.completed ?? 0) > 0 && (
                      <Badge variant="outline">{(processEventQueue.completed ?? 0)} completed</Badge>
                    )}
                    {(processEventQueue.failed ?? 0) > 0 && (
                      <Badge variant="destructive">{(processEventQueue.failed ?? 0)} failed</Badge>
                    )}
                  </div>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm">Webhook Delivery Queue</span>
                  <div className="flex items-center gap-1.5 flex-wrap justify-end">
                    <Badge variant="secondary">{(webhookDeliveryQueue.waiting ?? 0)} waiting</Badge>
                    <Badge variant="secondary">{(webhookDeliveryQueue.active ?? 0)} active</Badge>
                    {(webhookDeliveryQueue.completed ?? 0) > 0 && (
                      <Badge variant="outline">{(webhookDeliveryQueue.completed ?? 0)} completed</Badge>
                    )}
                    {(webhookDeliveryQueue.failed ?? 0) > 0 && (
                      <Badge variant="destructive">{(webhookDeliveryQueue.failed ?? 0)} failed</Badge>
                    )}
                  </div>
                </div>
              </>
            )}
          </CardContent>
        </Card>

        {/* Active Chains */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle>Active Chains</CardTitle>
              <CardDescription>Chains currently being indexed</CardDescription>
            </div>
            <Link href="/dashboard/chains">
              <Button variant="ghost" size="sm">
                View all <ArrowRight className="ml-1 h-4 w-4" />
              </Button>
            </Link>
          </CardHeader>
          <CardContent>
            {chainsLoading ? (
              <div className="space-y-2">
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
              </div>
            ) : chains.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No chains configured yet
              </p>
            ) : (
              <div className="space-y-2">
                {chains
                  .filter((c: { isActive: boolean }) => c.isActive)
                  .slice(0, 5)
                  .map(
                    (chain: {
                      id: string;
                      name: string;
                      chainId: number;
                      isActive: boolean;
                      rpcHealth?: { activeRpcIndex: number; rpcs: Array<{ url: string; isHealthy: boolean; errorCount: number }> };
                    }) => {
                      const h = healthChains.find((c: { chainId: number }) => c.chainId === chain.chainId)
                        ?? chain.rpcHealth;
                      const activeIdx = h?.activeRpcIndex ?? 0;
                      const rpcs = h?.rpcs ?? [];
                      const total = rpcs.length;
                      const activeRpc = total ? rpcs[activeIdx] : null;
                      const highErrors = activeRpc && (activeRpc.errorCount > 0 || !activeRpc.isHealthy);
                      return (
                        <Link
                          key={chain.id}
                          href={`/dashboard/chains/${chain.id}`}
                        >
                          <div className="flex items-center justify-between rounded-lg border p-3 hover:bg-muted/50 transition-colors cursor-pointer">
                            <div>
                              <p className="font-medium">{chain.name}</p>
                              <p className="text-sm text-muted-foreground">
                                Chain ID: {chain.chainId}
                                {total > 0 && (
                                  <span className="ml-2">
                                    · RPC {activeIdx + 1}/{total}
                                    {highErrors && (
                                      <Badge variant="destructive" className="ml-1.5 text-xs">High error rate</Badge>
                                    )}
                                  </span>
                                )}
                              </p>
                            </div>
                            <Badge variant={chain.isActive ? "default" : "secondary"}>
                              {chain.isActive ? "Active" : "Inactive"}
                            </Badge>
                          </div>
                        </Link>
                      );
                    }
                  )}
                {chains.filter((c: { isActive: boolean }) => c.isActive).length === 0 && (
                  <p className="text-sm text-muted-foreground py-2">No active chains</p>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Recent Events */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Activity className="h-5 w-5" />
              Recent Events
            </CardTitle>
            <CardDescription>
              Latest indexed blockchain events
            </CardDescription>
          </div>
          <Link href="/dashboard/events">
            <Button variant="ghost" size="sm">
              View all <ArrowRight className="ml-1 h-4 w-4" />
            </Button>
          </Link>
        </CardHeader>
        <CardContent>
          {recentEvents.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No events indexed yet
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Event</TableHead>
                  <TableHead>Contract</TableHead>
                  <TableHead>Chain</TableHead>
                  <TableHead>Block</TableHead>
                  <TableHead>Time</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {recentEvents.map(
                  (event: {
                    id: string;
                    eventName: string;
                    contractName: string;
                    chainName: string;
                    blockNumber: number;
                    timestamp: string | null;
                    createdAt: string;
                  }) => (
                    <TableRow key={event.id}>
                      <TableCell>
                        <Badge variant="outline">{event.eventName}</Badge>
                      </TableCell>
                      <TableCell>{event.contractName || "-"}</TableCell>
                      <TableCell>
                        <Badge variant="secondary">
                          {event.chainName || "-"}
                        </Badge>
                      </TableCell>
                      <TableCell>{event.blockNumber}</TableCell>
                      <TableCell>
                        {event.timestamp
                          ? new Date(event.timestamp).toLocaleString()
                          : new Date(event.createdAt).toLocaleString()}
                      </TableCell>
                    </TableRow>
                  )
                )}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

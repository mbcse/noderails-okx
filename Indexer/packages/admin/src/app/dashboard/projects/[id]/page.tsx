"use client";

import { use, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { projectsApi, watchedAddressesApi, chainsApi } from "@/lib/api";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import { ArrowLeft, Copy, RefreshCw, Save, FileCode, Webhook, BookOpen, Wallet } from "lucide-react";
import Link from "next/link";
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
import { Separator } from "@/components/ui/separator";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface Project {
  id: string;
  name: string;
  apiKey: string;
  isActive: boolean;
  createdAt: string;
  contracts?: Array<{ id: string; name: string; address: string }>;
  webhooks?: Array<{ id: string; name: string; url: string }>;
}

export default function ProjectDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const router = useRouter();
  const queryClient = useQueryClient();

  const [name, setName] = useState("");
  const [isActive, setIsActive] = useState(true);

  const { data, isLoading } = useQuery({
    queryKey: ["projects", id],
    queryFn: () => projectsApi.get(id),
  });

  const { data: watchedData, isLoading: watchedLoading } = useQuery({
    queryKey: ["watched-addresses", id],
    queryFn: () => watchedAddressesApi.list({ projectId: id }),
  });

  const { data: chainsData } = useQuery({
    queryKey: ["chains"],
    queryFn: () => chainsApi.list(),
  });

  const project: Project | null = data?.data?.data || null;
  const watchedAddresses: Array<{ id: string; chainId: number; address: string; label?: string | null }> = watchedData?.data?.data ?? [];
  const chains: Array<{ id: string; chainId: number; name: string }> = chainsData?.data?.data ?? [];

  // Set form values when data loads
  if (project && !name) {
    setName(project.name);
    setIsActive(project.isActive);
  }

  const updateMutation = useMutation({
    mutationFn: (data: Record<string, unknown>) => projectsApi.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["projects", id] });
      toast.success("Project updated");
    },
    onError: (error: unknown) => {
      const err = error as { response?: { data?: { error?: string } } };
      toast.error(err.response?.data?.error || "Failed to update");
    },
  });

  const regenerateKeyMutation = useMutation({
    mutationFn: () => projectsApi.regenerateKey(id),
    onSuccess: (response) => {
      queryClient.invalidateQueries({ queryKey: ["projects", id] });
      const newKey = response.data?.data?.apiKey;
      if (newKey) {
        navigator.clipboard.writeText(newKey);
        toast.success("New API key generated and copied to clipboard");
      }
    },
    onError: (error: unknown) => {
      const err = error as { response?: { data?: { error?: string } } };
      toast.error(err.response?.data?.error || "Failed to regenerate key");
    },
  });

  const deleteMutation = useMutation({
    mutationFn: () => projectsApi.delete(id),
    onSuccess: () => {
      toast.success("Project deleted");
      router.push("/dashboard/projects");
    },
    onError: (error: unknown) => {
      const err = error as { response?: { data?: { error?: string } } };
      toast.error(err.response?.data?.error || "Failed to delete");
    },
  });

  const handleSave = () => {
    updateMutation.mutate({ name, isActive });
  };

  const copyApiKey = () => {
    if (project) {
      navigator.clipboard.writeText(project.apiKey);
      toast.success("API key copied to clipboard");
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

  if (!project) {
    return (
      <div className="flex flex-col items-center justify-center py-12">
        <h2 className="text-xl font-semibold">Project not found</h2>
        <Link href="/dashboard/projects">
          <Button variant="link">Back to projects</Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Link href="/dashboard/projects">
          <Button variant="ghost" size="icon">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{project.name}</h1>
          <p className="text-muted-foreground">
            Created {new Date(project.createdAt).toLocaleDateString()}
          </p>
        </div>
        <Badge
          className="ml-auto"
          variant={project.isActive ? "default" : "secondary"}
        >
          {project.isActive ? "Active" : "Inactive"}
        </Badge>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Settings Card */}
        <Card>
          <CardHeader>
            <CardTitle>Project Settings</CardTitle>
            <CardDescription>Update project configuration</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">Project Name</Label>
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
                  Enable or disable the project
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

        {/* API Key Card */}
        <Card>
          <CardHeader>
            <CardTitle>API Key</CardTitle>
            <CardDescription>
              Use this key to authenticate API requests
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center gap-2">
              <Input value={project.apiKey} readOnly className="font-mono" />
              <Button variant="outline" size="icon" onClick={copyApiKey}>
                <Copy className="h-4 w-4" />
              </Button>
            </div>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button
                  variant="outline"
                  className="w-full"
                  disabled={regenerateKeyMutation.isPending}
                >
                  <RefreshCw className="mr-2 h-4 w-4" />
                  {regenerateKeyMutation.isPending
                    ? "Regenerating..."
                    : "Regenerate Key"}
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Regenerate API Key?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This will invalidate the current API key. Any applications
                    using it will stop working until updated.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={() => regenerateKeyMutation.mutate()}
                  >
                    Regenerate
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </CardContent>
        </Card>
      </div>

      {/* API Endpoints */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <BookOpen className="h-5 w-5" />
            Project API Endpoints
          </CardTitle>
          <CardDescription>
            Use your API key in the <code className="text-xs bg-muted px-1 rounded">X-API-Key</code> header for all requests
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Base URL: <code className="text-xs bg-muted px-1.5 py-0.5 rounded break-all">
              {typeof window !== "undefined"
                ? (process.env.NEXT_PUBLIC_API_URL || window.location.origin.replace(/:\d+$/, ":3001")) + "/api/project"
                : (process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001") + "/api/project"}
            </code>
          </p>
          <div className="rounded-md border overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/50">
                  <th className="text-left font-medium p-3 w-20">Method</th>
                  <th className="text-left font-medium p-3">Endpoint</th>
                  <th className="text-left font-medium p-3 text-muted-foreground">Description</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                <tr><td className="p-3 font-mono text-xs">GET</td><td className="p-3 font-mono text-xs">/chains</td><td className="p-3">List available chains</td></tr>
                <tr><td className="p-3 font-mono text-xs">GET</td><td className="p-3 font-mono text-xs">/chains/:id</td><td className="p-3">Get chain by id</td></tr>
                <tr><td className="p-3 font-mono text-xs">GET</td><td className="p-3 font-mono text-xs">/contracts</td><td className="p-3">List project contracts</td></tr>
                <tr><td className="p-3 font-mono text-xs">GET</td><td className="p-3 font-mono text-xs">/contracts/:contractId</td><td className="p-3">Get contract by id</td></tr>
                <tr><td className="p-3 font-mono text-xs">POST</td><td className="p-3 font-mono text-xs">/contracts</td><td className="p-3">Add contract (body: chainId, address, abi, name?, startBlock?)</td></tr>
                <tr><td className="p-3 font-mono text-xs">DELETE</td><td className="p-3 font-mono text-xs">/contracts/:contractId</td><td className="p-3">Remove contract</td></tr>
                <tr><td className="p-3 font-mono text-xs">GET</td><td className="p-3 font-mono text-xs">/filters</td><td className="p-3">List filters (?contractId= optional)</td></tr>
                <tr><td className="p-3 font-mono text-xs">GET</td><td className="p-3 font-mono text-xs">/filters/by-subscription</td><td className="p-3">Get filter (?contractId= & eventName=)</td></tr>
                <tr><td className="p-3 font-mono text-xs">POST</td><td className="p-3 font-mono text-xs">/filters</td><td className="p-3">Add filter (body: contractId, eventName, field, op, value)</td></tr>
                <tr><td className="p-3 font-mono text-xs">PUT</td><td className="p-3 font-mono text-xs">/filters</td><td className="p-3">Update filter (?contractId= & eventName=; body: field, op, value)</td></tr>
                <tr><td className="p-3 font-mono text-xs">DELETE</td><td className="p-3 font-mono text-xs">/filters</td><td className="p-3">Clear filter (?contractId= & eventName=)</td></tr>
                <tr><td className="p-3 font-mono text-xs">GET</td><td className="p-3 font-mono text-xs">/watched-addresses</td><td className="p-3">List watched addresses (?chainId= optional)</td></tr>
                <tr><td className="p-3 font-mono text-xs">GET</td><td className="p-3 font-mono text-xs">/watched-addresses/:id</td><td className="p-3">Get one watched address by id</td></tr>
                <tr><td className="p-3 font-mono text-xs">POST</td><td className="p-3 font-mono text-xs">/watched-addresses</td><td className="p-3">Add (body: address, chainId? null=all chains, direction?, label?)</td></tr>
                <tr><td className="p-3 font-mono text-xs">POST</td><td className="p-3 font-mono text-xs">/watched-addresses/bulk</td><td className="p-3">Add multiple (body: addresses[], chainId? null=all chains, direction?, label?)</td></tr>
                <tr><td className="p-3 font-mono text-xs">DELETE</td><td className="p-3 font-mono text-xs">/watched-addresses/:id</td><td className="p-3">Remove watched address</td></tr>
              </tbody>
            </table>
          </div>
          <p className="text-xs text-muted-foreground">
            Events API (same API key): <code className="bg-muted px-1 rounded">GET /api/events</code> — query params: contractId, eventName, chainId, fromBlock, toBlock, limit, offset. Native: <code className="bg-muted px-1 rounded">GET /api/native-transfers</code>
          </p>
        </CardContent>
      </Card>

      {/* Watched addresses: link to dedicated page */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Wallet className="h-5 w-5" />
            Watched addresses (native ETH)
          </CardTitle>
          <CardDescription>
            Track when addresses send or receive native tokens. Add addresses and view indexed transfers on the dedicated page.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {watchedLoading ? (
            <Skeleton className="h-12 w-full" />
          ) : watchedAddresses.length > 0 ? (
            <p className="text-sm text-muted-foreground">
              {watchedAddresses.length} address(es) watched for this project.
            </p>
          ) : (
            <p className="text-sm text-muted-foreground">No addresses watched yet.</p>
          )}
          <Link href={`/dashboard/watched-addresses${id ? `?projectId=${id}` : ""}`}>
            <Button variant="outline" size="sm">
              <Wallet className="mr-2 h-4 w-4" />
              Manage watched addresses
            </Button>
          </Link>
        </CardContent>
      </Card>

      {/* Resources */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Contracts */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileCode className="h-5 w-5" />
              Contracts
            </CardTitle>
            <CardDescription>
              {project.contracts?.length || 0} contracts registered
            </CardDescription>
          </CardHeader>
          <CardContent>
            {project.contracts && project.contracts.length > 0 ? (
              <div className="space-y-2">
                {project.contracts.slice(0, 5).map((contract) => (
                  <Link
                    key={contract.id}
                    href={`/dashboard/contracts/${contract.id}`}
                    className="flex items-center justify-between p-2 rounded-md hover:bg-muted transition-colors"
                  >
                    <span className="font-medium">{contract.name}</span>
                    <code className="text-xs text-muted-foreground">
                      {contract.address.slice(0, 10)}...
                    </code>
                  </Link>
                ))}
                {project.contracts.length > 5 && (
                  <Link href="/dashboard/contracts">
                    <Button variant="link" className="p-0">
                      View all {project.contracts.length} contracts
                    </Button>
                  </Link>
                )}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                No contracts registered yet
              </p>
            )}
            <Separator className="my-4" />
            <Link href="/dashboard/contracts">
              <Button variant="outline" className="w-full">
                Manage Contracts
              </Button>
            </Link>
          </CardContent>
        </Card>

        {/* Webhooks */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Webhook className="h-5 w-5" />
              Webhooks
            </CardTitle>
            <CardDescription>
              {project.webhooks?.length || 0} webhooks configured
            </CardDescription>
          </CardHeader>
          <CardContent>
            {project.webhooks && project.webhooks.length > 0 ? (
              <div className="space-y-2">
                {project.webhooks.slice(0, 5).map((webhook) => (
                  <Link
                    key={webhook.id}
                    href={`/dashboard/webhooks/${webhook.id}`}
                    className="flex items-center justify-between p-2 rounded-md hover:bg-muted transition-colors"
                  >
                    <span className="font-medium">{webhook.name}</span>
                    <code className="text-xs text-muted-foreground truncate max-w-[150px]">
                      {webhook.url}
                    </code>
                  </Link>
                ))}
                {project.webhooks.length > 5 && (
                  <Link href="/dashboard/webhooks">
                    <Button variant="link" className="p-0">
                      View all {project.webhooks.length} webhooks
                    </Button>
                  </Link>
                )}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                No webhooks configured yet
              </p>
            )}
            <Separator className="my-4" />
            <Link href="/dashboard/webhooks">
              <Button variant="outline" className="w-full">
                Manage Webhooks
              </Button>
            </Link>
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
              <Button variant="destructive">Delete Project</Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete Project?</AlertDialogTitle>
                <AlertDialogDescription>
                  This will permanently delete the project and all associated
                  contracts, webhooks, and indexed events. This action cannot be
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

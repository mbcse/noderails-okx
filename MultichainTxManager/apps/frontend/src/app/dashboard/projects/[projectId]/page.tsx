"use client";

import { use, useState } from "react";
import { formatDistanceToNow } from "date-fns";
import {
  Copy,
  Link as LinkIcon,
  KeyRound,
  ArrowLeftRight,
  Webhook,
  ChevronDown,
  ChevronRight,
} from "lucide-react";
import { toast } from "sonner";

import { useProject } from "@/hooks/use-projects";
import { copyToClipboard, truncateAddress } from "@/lib/utils";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";

interface ProjectOverviewProps {
  params: Promise<{ projectId: string }>;
}

// ── API docs data ──────────────────────────────────────────
interface Endpoint {
  method: "GET" | "POST" | "PATCH" | "DELETE";
  path: string;
  description: string;
  body?: string;
}

interface EndpointGroup {
  title: string;
  basePath: string;
  endpoints: Endpoint[];
}

const METHOD_COLORS: Record<string, string> = {
  GET: "bg-blue-500/15 text-blue-700 dark:text-blue-400",
  POST: "bg-green-500/15 text-green-700 dark:text-green-400",
  PATCH: "bg-yellow-500/15 text-yellow-700 dark:text-yellow-400",
  DELETE: "bg-red-500/15 text-red-700 dark:text-red-400",
};

function buildApiDocs(projectId: string): EndpointGroup[] {
  const p = `/api/v1/projects/${projectId}`;
  return [
    {
      title: "Authentication",
      basePath: "/api/v1/auth",
      endpoints: [
        { method: "POST", path: "/api/v1/auth/login", description: "Login with email & password → returns access + refresh tokens", body: '{ "email", "password" }' },
        { method: "POST", path: "/api/v1/auth/register", description: "Register a new admin (requires OWNER role)", body: '{ "email", "password", "name", "role" }' },
        { method: "POST", path: "/api/v1/auth/refresh", description: "Refresh JWT tokens", body: '{ "refreshToken" }' },
        { method: "GET", path: "/api/v1/auth/me", description: "Get current user profile" },
      ],
    },
    {
      title: "Projects",
      basePath: "/api/v1/projects",
      endpoints: [
        { method: "GET", path: "/api/v1/projects", description: "List all projects" },
        { method: "GET", path: `${p}`, description: "Get this project" },
        { method: "POST", path: "/api/v1/projects", description: "Create a new project", body: '{ "name", "description?" }' },
        { method: "PATCH", path: `${p}`, description: "Update project", body: '{ "name?", "description?", "isActive?" }' },
        { method: "DELETE", path: `${p}`, description: "Delete project (OWNER only)" },
        { method: "POST", path: `${p}/regenerate-key`, description: "Regenerate the API key" },
      ],
    },
    {
      title: "Chains",
      basePath: `${p}/chains`,
      endpoints: [
        { method: "GET", path: `${p}/chains`, description: "List chains for this project" },
        { method: "GET", path: `${p}/chains/:chainId`, description: "Get a single chain" },
        { method: "POST", path: `${p}/chains`, description: "Add a chain", body: '{ "name", "chainId", "rpcUrls[]", "explorerUrl?", "nativeCurrency", "isTestnet" }' },
        { method: "PATCH", path: `${p}/chains/:chainId`, description: "Update chain config", body: '{ "name?", "rpcUrls?", "explorerUrl?", "isActive?" }' },
        { method: "DELETE", path: `${p}/chains/:chainId`, description: "Remove a chain (OWNER only)" },
      ],
    },
    {
      title: "Signers",
      basePath: `${p}/signers`,
      endpoints: [
        { method: "GET", path: `${p}/signers`, description: "List all signers" },
        { method: "GET", path: `${p}/signers/:signerId`, description: "Get signer info" },
        { method: "GET", path: `${p}/signers/:signerId/detail`, description: "Signer with balances & recent transactions" },
        { method: "POST", path: `${p}/signers`, description: "Register a signer key", body: '{ "chainId", "adapterType", "privateKey?" | "kmsKeyId?", "label?" }' },
        { method: "PATCH", path: `${p}/signers/:signerId`, description: "Update signer metadata", body: '{ "label?", "isActive?" }' },
        { method: "POST", path: `${p}/signers/:signerId/deactivate`, description: "Deactivate a signer" },
      ],
    },
    {
      title: "Transactions",
      basePath: `${p}/transactions`,
      endpoints: [
        { method: "GET", path: `${p}/transactions`, description: "List transactions (paginated, filterable)", body: "Query: ?status, ?chainId, ?from, ?page, ?limit" },
        { method: "GET", path: `${p}/transactions/:txId`, description: "Get transaction detail" },
        { method: "POST", path: `${p}/transactions/send`, description: "Send a new transaction", body: '{ "chainId", "to", "value?", "data?", "gasLimit?" }' },
        { method: "POST", path: `${p}/transactions/sign-typed-data`, description: "Sign EIP-712 typed data", body: '{ "chainId", "domain", "types", "value" }' },
      ],
    },
    {
      title: "Webhooks",
      basePath: `${p}/webhooks`,
      endpoints: [
        { method: "GET", path: `${p}/webhooks`, description: "List webhook endpoints" },
        { method: "POST", path: `${p}/webhooks`, description: "Create a webhook endpoint", body: '{ "url", "events[]" }' },
        { method: "PATCH", path: `${p}/webhooks/:whId`, description: "Update a webhook endpoint", body: '{ "url?", "events?", "isActive?" }' },
        { method: "DELETE", path: `${p}/webhooks/:whId`, description: "Delete a webhook endpoint" },
        { method: "POST", path: `${p}/webhooks/:whId/rotate-secret`, description: "Rotate the signing secret" },
        { method: "POST", path: `${p}/webhooks/:whId/test`, description: "Send a test ping" },
        { method: "GET", path: `${p}/webhooks/:whId/deliveries`, description: "List deliveries (paginated)", body: "Query: ?event, ?statusCode, ?page, ?limit" },
      ],
    },
  ];
}

function EndpointGroupCard({ group }: { group: EndpointGroup }) {
  const [open, setOpen] = useState(false);

  return (
    <Card>
      <button
        className="flex w-full items-center justify-between px-6 py-4 text-left"
        onClick={() => setOpen(!open)}
      >
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold">{group.title}</span>
          <Badge variant="secondary" className="text-xs font-normal">
            {group.endpoints.length} endpoints
          </Badge>
        </div>
        {open ? (
          <ChevronDown className="h-4 w-4 text-muted-foreground" />
        ) : (
          <ChevronRight className="h-4 w-4 text-muted-foreground" />
        )}
      </button>
      {open && (
        <CardContent className="space-y-2 border-t pt-4">
          {group.endpoints.map((ep, i) => (
            <div
              key={i}
              className="flex flex-col gap-1 rounded-md border px-3 py-2 text-xs sm:flex-row sm:items-center sm:gap-3"
            >
              <span
                className={`inline-flex w-16 shrink-0 items-center justify-center rounded px-1.5 py-0.5 font-mono text-[10px] font-bold ${METHOD_COLORS[ep.method]}`}
              >
                {ep.method}
              </span>
              <code className="flex-1 font-mono text-muted-foreground break-all">
                {ep.path}
              </code>
              <span className="text-muted-foreground sm:max-w-[40%]">{ep.description}</span>
            </div>
          ))}
        </CardContent>
      )}
    </Card>
  );
}

export default function ProjectOverviewPage({ params }: ProjectOverviewProps) {
  const { projectId } = use(params);
  const { data: response, isLoading } = useProject(projectId);
  const project = response?.data;

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-48" />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-28 rounded-lg" />
          ))}
        </div>
      </div>
    );
  }

  if (!project) {
    return <p className="text-muted-foreground">Project not found.</p>;
  }

  const counts = project._count;

  const statCards = [
    { label: "Chains",       value: counts?.chains ?? 0,            icon: LinkIcon },
    { label: "Signers",      value: counts?.signerKeys ?? 0,        icon: KeyRound },
    { label: "Transactions", value: counts?.transactions ?? 0,      icon: ArrowLeftRight },
    { label: "Webhooks",     value: counts?.webhookEndpoints ?? 0,  icon: Webhook },
  ];

  async function handleCopyApiKey() {
    if (project?.apiKey) {
      const ok = await copyToClipboard(project.apiKey);
      if (ok) toast.success("API key copied to clipboard");
    }
  }

  return (
    <div className="space-y-8">
      {/* ── Title row ──────────────────────────────────────── */}
      <div>
        <div className="flex items-center gap-3">
          <h2 className="text-2xl font-bold tracking-tight">{project.name}</h2>
          <Badge variant={project.isActive ? "default" : "secondary"}>
            {project.isActive ? "Active" : "Inactive"}
          </Badge>
        </div>
        {project.description && (
          <p className="mt-1 text-muted-foreground">{project.description}</p>
        )}
        <p className="mt-1 text-xs text-muted-foreground">
          Created {formatDistanceToNow(new Date(project.createdAt), { addSuffix: true })}
        </p>
      </div>

      {/* ── Stat cards ─────────────────────────────────────── */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        {statCards.map((stat) => (
          <Card key={stat.label}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                {stat.label}
              </CardTitle>
              <stat.icon className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stat.value}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Separator />

      {/* ── API Key ────────────────────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">API Key</CardTitle>
          <CardDescription>
            Use this key in the <code className="rounded bg-muted px-1 py-0.5 text-xs">X-API-Key</code> header to authenticate external requests.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex items-center gap-3">
          <code className="flex-1 rounded-md bg-muted px-3 py-2 text-sm font-mono">
            {truncateAddress(project.apiKey, 12, 8)}
          </code>
          <Button variant="outline" size="icon" onClick={handleCopyApiKey} title="Copy API key">
            <Copy className="h-4 w-4" />
          </Button>
        </CardContent>
      </Card>

      <Separator />

      {/* ── API Reference ──────────────────────────────────── */}
      <div className="space-y-4">
        <div>
          <h3 className="text-lg font-semibold tracking-tight">API Reference</h3>
          <p className="text-sm text-muted-foreground">
            All endpoints require a <code className="rounded bg-muted px-1 py-0.5 text-xs">Bearer</code> JWT
            token via the <code className="rounded bg-muted px-1 py-0.5 text-xs">Authorization</code> header
            unless noted otherwise. Base URL: <code className="rounded bg-muted px-1 py-0.5 text-xs">/api/v1</code>
          </p>
        </div>

        <div className="space-y-3">
          {buildApiDocs(projectId).map((group) => (
            <EndpointGroupCard key={group.title} group={group} />
          ))}
        </div>

        {/* Webhook events reference */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Webhook Events</CardTitle>
            <CardDescription>
              Events you can subscribe to when creating a webhook endpoint.
              Payloads are signed with <code className="rounded bg-muted px-1 py-0.5 text-xs">HMAC-SHA256</code> —
              verify via the <code className="rounded bg-muted px-1 py-0.5 text-xs">X-Signature-256</code> header.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {[
                "tx.signing",
                "tx.signed",
                "tx.broadcast",
                "tx.confirmed",
                "tx.failed",
                "tx.stuck",
                "tx.cancelled",
                "tx.speed_up",
              ].map((evt) => (
                <Badge key={evt} variant="outline" className="font-mono text-xs">
                  {evt}
                </Badge>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

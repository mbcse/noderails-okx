'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/lib/auth';
import {
  createRpcEndpoint,
  deleteRpcEndpoint,
  getChains,
  getRpcEndpoints,
  testRpcEndpoint,
  updateRpcEndpoint,
} from '@/lib/api';
import {
  Alert,
  Badge,
  Button,
  Card,
  Input,
  PageHeader,
  Select,
  Spinner,
  Table,
} from '@/components/ui';

function healthVariant(status: string): 'success' | 'destructive' | 'outline' {
  if (status === 'HEALTHY') return 'success';
  if (status === 'UNHEALTHY') return 'destructive';
  return 'outline';
}

export default function RpcEndpointsPage() {
  const { token } = useAuth();
  const [endpoints, setEndpoints] = useState<any[]>([]);
  const [chains, setChains] = useState<any[]>([]);
  const [chainId, setChainId] = useState<number>(1);
  const [url, setUrl] = useState('');
  const [priority, setPriority] = useState(100);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [testing, setTesting] = useState<string | null>(null);

  async function load() {
    if (!token) return;
    const [eps, ch] = await Promise.all([getRpcEndpoints(token), getChains(token)]);
    setEndpoints(eps);
    setChains(ch);
    if (ch.length > 0 && !ch.find((c) => c.chainId === chainId)) {
      setChainId(ch[0].chainId);
    }
  }

  useEffect(() => {
    load()
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [token]);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!token) return;
    try {
      await createRpcEndpoint(token, { chainId, url, priority });
      setUrl('');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create endpoint');
    }
  }

  async function handleTest(id: string) {
    if (!token) return;
    setTesting(id);
    try {
      const result = await testRpcEndpoint(token, id);
      alert(result.ok ? `OK (${result.latencyMs}ms)` : `Failed: ${result.error}`);
      await load();
    } finally {
      setTesting(null);
    }
  }

  async function toggleEnabled(ep: any) {
    if (!token) return;
    await updateRpcEndpoint(token, ep.id, { isEnabled: !ep.isEnabled });
    await load();
  }

  async function handleDelete(id: string) {
    if (!token || !confirm('Delete this RPC endpoint?')) return;
    await deleteRpcEndpoint(token, id);
    await load();
  }

  if (loading) return <Spinner />;

  return (
    <div>
      <PageHeader
        title="RPC endpoints"
        description="Failover pools per chain. Lower priority is tried first."
      />

      {error && <Alert>{error}</Alert>}

      <Card className="mb-8">
        <form onSubmit={handleCreate} className="grid gap-4 md:grid-cols-4">
          <Select
            label="Chain"
            value={String(chainId)}
            onChange={(e) => setChainId(Number(e.target.value))}
            options={chains.map((c) => ({
              value: String(c.chainId),
              label: `${c.displayName} (${c.chainId})`,
            }))}
          />
          <Input
            label="RPC URL"
            type="url"
            className="md:col-span-2"
            placeholder="https://..."
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            required
          />
          <div className="flex items-end gap-2">
            <Input label="Priority" type="number" value={String(priority)} onChange={(e) => setPriority(Number(e.target.value))} />
            <Button type="submit" className="mb-0.5 shrink-0">
              Add
            </Button>
          </div>
        </form>
      </Card>

      <Table headers={['Chain', 'URL', 'Priority', 'Health', 'Failures', 'Actions']}>
        {endpoints.map((ep) => (
          <tr key={ep.id} className="hover:bg-[#fafbfc]">
            <td className="px-4 py-3">{ep.chain?.displayName ?? ep.chainId}</td>
            <td className="max-w-md truncate px-4 py-3 font-mono text-xs text-[#697386]">{ep.url}</td>
            <td className="px-4 py-3">{ep.priority}</td>
            <td className="px-4 py-3">
              <Badge variant={healthVariant(ep.lastHealthStatus)}>{ep.lastHealthStatus}</Badge>
            </td>
            <td className="px-4 py-3">{ep.consecutiveFailures}</td>
            <td className="px-4 py-3">
              <div className="flex flex-wrap gap-2">
                <Button variant="secondary" size="sm" disabled={testing === ep.id} onClick={() => void handleTest(ep.id)}>
                  Test
                </Button>
                <Button variant="secondary" size="sm" onClick={() => void toggleEnabled(ep)}>
                  {ep.isEnabled ? 'Disable' : 'Enable'}
                </Button>
                <Button variant="destructive" size="sm" onClick={() => void handleDelete(ep.id)}>
                  Delete
                </Button>
              </div>
            </td>
          </tr>
        ))}
      </Table>
    </div>
  );
}

'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/lib/auth';
import { createChain, getChains, updateChain } from '@/lib/api';
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
import { Plus } from 'lucide-react';

const CHAIN_TYPES = ['EVM', 'SOLANA', 'SUI'] as const;

export default function ChainsPage() {
  const { token } = useAuth();
  const [chains, setChains] = useState<any[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    chainId: '',
    chainType: 'EVM' as (typeof CHAIN_TYPES)[number],
    name: '',
    displayName: '',
    nativeCurrencySymbol: '',
    nativeCurrencyDecimals: '18',
    explorerUrl: '',
    coingeckoPlatformId: '',
  });

  async function load() {
    if (!token) return;
    setChains(await getChains(token));
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
      await createChain(token, {
        chainId: Number(form.chainId),
        chainType: form.chainType,
        name: form.name,
        displayName: form.displayName || form.name,
        nativeCurrencySymbol: form.nativeCurrencySymbol,
        nativeCurrencyDecimals: Number(form.nativeCurrencyDecimals),
        explorerUrl: form.explorerUrl || undefined,
        coingeckoPlatformId: form.coingeckoPlatformId || undefined,
      });
      setShowForm(false);
      setForm({
        chainId: '',
        chainType: 'EVM',
        name: '',
        displayName: '',
        nativeCurrencySymbol: '',
        nativeCurrencyDecimals: '18',
        explorerUrl: '',
        coingeckoPlatformId: '',
      });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create chain');
    }
  }

  async function toggleEnabled(chain: any) {
    if (!token) return;
    await updateChain(token, chain.chainId, { isEnabled: !chain.isEnabled });
    await load();
  }

  if (loading) return <Spinner />;

  return (
    <div>
      <PageHeader
        title="Chains"
        description="Supported networks for balance and price lookups"
        action={
          <Button onClick={() => setShowForm(!showForm)} size="sm">
            <Plus className="h-4 w-4" />
            {showForm ? 'Cancel' : 'Add chain'}
          </Button>
        }
      />

      {error && <Alert>{error}</Alert>}

      {showForm && (
        <Card className="mb-8">
          <form onSubmit={handleCreate} className="grid gap-4 md:grid-cols-3">
            <Input label="Chain ID" placeholder="137" value={form.chainId} onChange={(e) => setForm({ ...form, chainId: e.target.value })} required />
            <Select label="Type" value={form.chainType} onChange={(e) => setForm({ ...form, chainType: e.target.value as typeof form.chainType })} options={CHAIN_TYPES.map((t) => ({ value: t, label: t }))} />
            <Input label="Slug" placeholder="polygon" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
            <Input label="Display name" placeholder="Polygon" value={form.displayName} onChange={(e) => setForm({ ...form, displayName: e.target.value })} />
            <Input label="Native symbol" placeholder="MATIC" value={form.nativeCurrencySymbol} onChange={(e) => setForm({ ...form, nativeCurrencySymbol: e.target.value })} required />
            <Input label="Decimals" value={form.nativeCurrencyDecimals} onChange={(e) => setForm({ ...form, nativeCurrencyDecimals: e.target.value })} />
            <Input label="Explorer URL" className="md:col-span-2" value={form.explorerUrl} onChange={(e) => setForm({ ...form, explorerUrl: e.target.value })} />
            <Input label="CoinGecko platform ID" value={form.coingeckoPlatformId} onChange={(e) => setForm({ ...form, coingeckoPlatformId: e.target.value })} />
            <div className="md:col-span-3">
              <Button type="submit">Create chain</Button>
            </div>
          </form>
        </Card>
      )}

      <Table headers={['Chain ID', 'Name', 'Type', 'Native', 'RPCs', 'Status', 'Actions']}>
        {chains.map((c) => (
          <tr key={c.id} className="hover:bg-[#fafbfc]">
            <td className="px-4 py-3 font-medium text-[#0a2540]">{c.chainId}</td>
            <td className="px-4 py-3">{c.displayName}</td>
            <td className="px-4 py-3">
              <Badge variant="outline">{c.chainType}</Badge>
            </td>
            <td className="px-4 py-3">{c.nativeCurrencySymbol}</td>
            <td className="px-4 py-3">{c.rpcEndpoints?.length ?? 0}</td>
            <td className="px-4 py-3">
              <Badge variant={c.isEnabled ? 'success' : 'destructive'}>
                {c.isEnabled ? 'Enabled' : 'Disabled'}
              </Badge>
            </td>
            <td className="px-4 py-3">
              <Button variant="secondary" size="sm" onClick={() => void toggleEnabled(c)}>
                {c.isEnabled ? 'Disable' : 'Enable'}
              </Button>
            </td>
          </tr>
        ))}
      </Table>
    </div>
  );
}

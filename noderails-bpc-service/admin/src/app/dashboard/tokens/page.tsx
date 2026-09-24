'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/lib/auth';
import { createToken, getChains, getTokens, updateToken } from '@/lib/api';
import {
  Alert,
  Badge,
  Button,
  Card,
  EmptyValue,
  Input,
  PageHeader,
  Select,
  Spinner,
  Table,
} from '@/components/ui';
import { Pencil, Plus } from 'lucide-react';

const EMPTY_FORM = {
  chainId: 1,
  contractAddress: '',
  symbol: '',
  name: '',
  decimals: '18',
  coingeckoId: '',
  defillamaId: '',
  isNative: false,
};

export default function TokensPage() {
  const { token } = useAuth();
  const [tokens, setTokens] = useState<any[]>([]);
  const [chains, setChains] = useState<any[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);

  async function load() {
    if (!token) return;
    const [t, c] = await Promise.all([getTokens(token), getChains(token)]);
    setTokens(t);
    setChains(c);
    setForm((f) => (editingId ? f : { ...f, chainId: c[0]?.chainId ?? f.chainId }));
  }

  useEffect(() => {
    load()
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [token]);

  function resetForm(chainId?: number) {
    setEditingId(null);
    setForm({
      ...EMPTY_FORM,
      chainId: chainId ?? chains[0]?.chainId ?? EMPTY_FORM.chainId,
    });
  }

  function openCreate() {
    setError('');
    if (showForm && !editingId) {
      setShowForm(false);
      resetForm();
      return;
    }
    resetForm();
    setShowForm(true);
  }

  function openEdit(t: any) {
    setError('');
    setEditingId(t.id);
    setForm({
      chainId: t.chainId,
      contractAddress: t.isNative ? '' : t.contractAddress,
      symbol: t.symbol,
      name: t.name ?? '',
      decimals: String(t.decimals),
      coingeckoId: t.coingeckoId ?? '',
      defillamaId: t.defillamaId ?? '',
      isNative: Boolean(t.isNative),
    });
    setShowForm(true);
  }

  function closeForm() {
    setShowForm(false);
    resetForm();
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!token) return;
    setSaving(true);
    setError('');
    const payload = {
      contractAddress: form.isNative ? 'native' : form.contractAddress.trim(),
      symbol: form.symbol.trim(),
      name: form.name.trim(),
      decimals: Number(form.decimals),
      isNative: form.isNative,
      coingeckoId: form.coingeckoId.trim() || null,
      defillamaId: form.defillamaId.trim() || null,
    };
    try {
      if (editingId) {
        await updateToken(token, editingId, payload);
      } else {
        await createToken(token, { ...payload, chainId: form.chainId });
      }
      closeForm();
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : editingId ? 'Failed to update token' : 'Failed to create token');
    } finally {
      setSaving(false);
    }
  }

  async function toggleEnabled(t: any) {
    if (!token) return;
    setError('');
    try {
      await updateToken(token, t.id, { isEnabled: !t.isEnabled });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update token');
    }
  }

  if (loading) return <Spinner />;

  const editing = Boolean(editingId);

  return (
    <div>
      <PageHeader
        title="Tokens"
        description="Registered assets for price lookup and balance enrichment"
        action={
          <Button onClick={openCreate} size="sm">
            <Plus className="h-4 w-4" />
            {showForm && !editing ? 'Cancel' : 'Add token'}
          </Button>
        }
      />

      {error && <Alert>{error}</Alert>}

      {showForm && (
        <Card className="mb-8">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-[#0a2540]">
              {editing ? 'Edit token' : 'Add token'}
            </h2>
            {editing && (
              <Button variant="ghost" size="sm" onClick={closeForm} type="button">
                Cancel
              </Button>
            )}
          </div>
          <form onSubmit={handleSubmit} className="grid gap-4 md:grid-cols-3">
            <Select
              label="Chain"
              value={String(form.chainId)}
              onChange={(e) => setForm({ ...form, chainId: Number(e.target.value) })}
              options={chains.map((c) => ({
                value: String(c.chainId),
                label: `${c.displayName} (${c.chainId})`,
              }))}
              disabled={editing}
            />
            <Input label="Symbol" value={form.symbol} onChange={(e) => setForm({ ...form, symbol: e.target.value })} required />
            <Input label="Name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
            <Input
              label="Contract address"
              className="md:col-span-2"
              value={form.contractAddress}
              onChange={(e) => setForm({ ...form, contractAddress: e.target.value })}
              disabled={form.isNative}
              required={!form.isNative}
            />
            <Input label="Decimals" value={form.decimals} onChange={(e) => setForm({ ...form, decimals: e.target.value })} />
            <Input label="CoinGecko ID" value={form.coingeckoId} onChange={(e) => setForm({ ...form, coingeckoId: e.target.value })} />
            <Input label="DefiLlama ID" value={form.defillamaId} onChange={(e) => setForm({ ...form, defillamaId: e.target.value })} />
            <label className="flex items-center gap-2 text-sm text-[#425466] md:col-span-3">
              <input type="checkbox" checked={form.isNative} onChange={(e) => setForm({ ...form, isNative: e.target.checked })} className="rounded border-[#e3e8ee]" />
              Native token
            </label>
            <div className="md:col-span-3">
              <Button type="submit" disabled={saving}>
                {saving ? 'Saving…' : editing ? 'Save changes' : 'Create token'}
              </Button>
            </div>
          </form>
        </Card>
      )}

      <Table headers={['Chain', 'Token key', 'Symbol', 'Contract', 'Decimals', 'CoinGecko', 'Status', 'Actions']}>
        {tokens.map((t) => (
          <tr key={t.id} className="hover:bg-[#fafbfc]">
            <td className="px-4 py-3">{t.chain?.displayName ?? t.chainId}</td>
            <td className="px-4 py-3 font-mono text-xs text-[#635bff]">{t.tokenKey ?? `${t.symbol}-${t.chainId}`}</td>
            <td className="px-4 py-3 font-medium">{t.symbol}</td>
            <td className="max-w-xs truncate px-4 py-3 font-mono text-xs text-[#697386]">{t.contractAddress}</td>
            <td className="px-4 py-3">{t.decimals}</td>
            <td className="px-4 py-3">
              <EmptyValue value={t.coingeckoId} />
            </td>
            <td className="px-4 py-3">
              <Badge variant={t.isEnabled ? 'success' : 'destructive'}>
                {t.isEnabled ? 'Enabled' : 'Disabled'}
              </Badge>
            </td>
            <td className="px-4 py-3">
              <div className="flex flex-wrap gap-2">
                <Button variant="secondary" size="sm" onClick={() => openEdit(t)}>
                  <Pencil className="h-3.5 w-3.5" />
                  Edit
                </Button>
                <Button variant="secondary" size="sm" onClick={() => void toggleEnabled(t)}>
                  {t.isEnabled ? 'Disable' : 'Enable'}
                </Button>
              </div>
            </td>
          </tr>
        ))}
      </Table>
    </div>
  );
}

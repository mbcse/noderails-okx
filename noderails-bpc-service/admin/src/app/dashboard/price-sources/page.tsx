'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/lib/auth';
import { getPriceSources, updatePriceSource } from '@/lib/api';
import {
  Alert,
  Badge,
  Button,
  EmptyValue,
  PageHeader,
  Spinner,
  Table,
} from '@/components/ui';

export default function PriceSourcesPage() {
  const { token } = useAuth();
  const [sources, setSources] = useState<any[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  async function load() {
    if (!token) return;
    setSources(await getPriceSources(token));
  }

  useEffect(() => {
    load()
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [token]);

  async function toggle(id: string, isEnabled: boolean) {
    if (!token) return;
    await updatePriceSource(token, id, { isEnabled: !isEnabled });
    await load();
  }

  if (loading) return <Spinner />;

  return (
    <div>
      <PageHeader
        title="Price sources"
        description="Enable adapters and tune query order. Lower priority is queried first."
      />

      {error && <Alert>{error}</Alert>}

      <Table headers={['Name', 'Slug', 'Type', 'Priority', 'Rate limit', 'API key env', 'Status', 'Actions']}>
        {sources.map((s) => (
          <tr key={s.id} className="hover:bg-[#fafbfc]">
            <td className="px-4 py-3 font-medium text-[#0a2540]">{s.name}</td>
            <td className="px-4 py-3 font-mono text-xs text-[#697386]">{s.slug}</td>
            <td className="px-4 py-3">
              <Badge variant="outline">{s.type}</Badge>
            </td>
            <td className="px-4 py-3">{s.priority}</td>
            <td className="px-4 py-3">{s.rateLimitPerMin}/min</td>
            <td className="px-4 py-3">
              <EmptyValue value={s.apiKeyEnvVar} />
            </td>
            <td className="px-4 py-3">
              <Badge variant={s.isEnabled ? 'success' : 'destructive'}>
                {s.isEnabled ? 'Enabled' : 'Disabled'}
              </Badge>
            </td>
            <td className="px-4 py-3">
              <Button variant="secondary" size="sm" onClick={() => void toggle(s.id, s.isEnabled)}>
                {s.isEnabled ? 'Disable' : 'Enable'}
              </Button>
            </td>
          </tr>
        ))}
      </Table>
    </div>
  );
}

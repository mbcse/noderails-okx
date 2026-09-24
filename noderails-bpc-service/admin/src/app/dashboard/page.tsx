'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/lib/auth';
import { getHealth } from '@/lib/api';
import { PageHeader, Spinner, StatCard, Alert } from '@/components/ui';
import { Activity, Database, Layers, Server, TrendingUp, Zap } from 'lucide-react';

export default function HealthPage() {
  const { token } = useAuth();
  const [health, setHealth] = useState<any>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!token) return;
    getHealth(token)
      .then(setHealth)
      .catch((e) => setError(e.message));
  }, [token]);

  if (error) return <Alert>{error}</Alert>;
  if (!health) return <Spinner />;

  const rpc = health.rpcEndpoints ?? {};
  const prices = health.priceSources ?? {};

  return (
    <div className="space-y-8">
      <PageHeader
        title="Overview"
        description="System health for the Balance and Price Check API"
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <StatCard
          title="Service status"
          value={health.status === 'ok' ? 'Healthy' : 'Degraded'}
          subtitle={health.status === 'ok' ? 'All core dependencies up' : 'Check dependencies below'}
          icon={Activity}
        />
        <StatCard
          title="Database"
          value={health.db ? 'Connected' : 'Unavailable'}
          icon={Database}
        />
        <StatCard
          title="Redis cache"
          value={health.redis ? 'Connected' : 'Unavailable'}
          icon={Zap}
        />
        <StatCard
          title="RPC endpoints"
          value={`${rpc.healthy ?? 0} healthy`}
          subtitle={`${rpc.total ?? 0} total · ${rpc.unhealthy ?? 0} unhealthy`}
          icon={Server}
        />
        <StatCard
          title="Price sources"
          value={`${prices.enabled ?? 0} enabled`}
          subtitle={`${prices.registered ?? 0} adapters registered`}
          icon={TrendingUp}
        />
        <StatCard
          title="Last check"
          value={new Date(health.ts).toLocaleTimeString()}
          subtitle={new Date(health.ts).toLocaleDateString()}
          icon={Layers}
        />
      </div>
    </div>
  );
}

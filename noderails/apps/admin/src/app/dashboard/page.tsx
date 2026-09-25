'use client';

import { useEffect, useState } from 'react';
import { useAdminAuth } from '@/lib/auth';
import * as api from '@/lib/api';
import { StatCard, Spinner } from '@/components/ui';
import { Alert, PageHeader } from '@/components/page';
import { Users, Layers, Link2, Coins, CreditCard, RefreshCw, FileText } from 'lucide-react';

export default function AdminOverviewPage() {
  const { token } = useAdminAuth();
  const [overview, setOverview] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!token) return;
    api.getOverview(token)
      .then(setOverview)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [token]);

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Platform"
        title="Overview"
        description="A live snapshot of merchants, apps, and payment volume across the platform."
      />

      {loading ? (
        <Spinner />
      ) : !overview ? (
        <Alert>We could not load platform data. Refresh in a moment or check System Health.</Alert>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard
              title="Total Merchants"
              value={String(overview.merchants ?? 0)}
              icon={Users}
            />
            <StatCard
              title="Total Apps"
              value={String(overview.apps ?? 0)}
              icon={Layers}
            />
            <StatCard
              title="Supported Chains"
              value={String(overview.chains ?? 0)}
              icon={Link2}
            />
            <StatCard
              title="Supported Tokens"
              value={String(overview.tokens ?? 0)}
              icon={Coins}
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <StatCard
              title="Payment Intents"
              value={String(overview.payments ?? 0)}
              icon={CreditCard}
            />
            <StatCard
              title="Subscriptions"
              value={String(overview.subscriptions ?? 0)}
              icon={RefreshCw}
            />
            <StatCard
              title="Invoices"
              value={String(overview.invoices ?? 0)}
              icon={FileText}
            />
          </div>
        </>
      )}
    </div>
  );
}

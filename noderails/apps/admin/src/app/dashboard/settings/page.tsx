'use client';

import Link from 'next/link';
import { Card } from '@/components/ui';
import { PageHeader } from '@/components/page';
import { Settings, Shield, Globe, Bell, Clock, Percent, Webhook } from 'lucide-react';

export default function SettingsPage() {
  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Settings"
        title="Platform"
        description="Read-only snapshot of auth, ports, and the services this admin talks to."
      />

      <div className="grid gap-4 sm:grid-cols-3">
        {[
          { href: '/dashboard/settings/timelocks', icon: Clock, title: 'Timelocks', hint: 'Dispute and settlement windows' },
          { href: '/dashboard/settings/fees', icon: Percent, title: 'Platform fees', hint: 'Default settlement fee' },
          { href: '/dashboard/settings/webhooks', icon: Webhook, title: 'Webhook delivery', hint: 'Retries and redundant sends' },
        ].map((item) => (
          <Link key={item.href} href={item.href} className="group">
            <Card className="h-full transition-colors group-hover:border-[#d4d2ff]">
              <div className="flex items-center gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#f0f0ff]">
                  <item.icon className="h-4 w-4 text-[#635bff]" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-[#0a2540]">{item.title}</p>
                  <p className="text-xs text-[#697386]">{item.hint}</p>
                </div>
              </div>
            </Card>
          </Link>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <div className="flex items-center gap-3 mb-4">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#f0f0ff]">
              <Shield className="h-4 w-4 text-[#635bff]" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-[#0a2540]">Security</h3>
              <p className="text-xs text-[#697386]">Authentication and access control</p>
            </div>
          </div>
          <div className="space-y-3 text-sm text-[#425466]">
            <div className="flex items-center justify-between py-2 border-b border-[#f0f2f5]">
              <span>Admin Auth</span>
              <span className="text-xs font-mono text-[#697386]">Environment Variables</span>
            </div>
            <div className="flex items-center justify-between py-2 border-b border-[#f0f2f5]">
              <span>JWT Token TTL</span>
              <span className="text-xs font-mono text-[#697386]">15 minutes</span>
            </div>
            <div className="flex items-center justify-between py-2">
              <span>Rate Limiting</span>
              <span className="text-xs font-mono text-[#697386]">Enabled</span>
            </div>
          </div>
        </Card>

        <Card>
          <div className="flex items-center gap-3 mb-4">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#edfcf2]">
              <Globe className="h-4 w-4 text-[#0abf53]" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-[#0a2540]">Platform</h3>
              <p className="text-xs text-[#697386]">General platform configuration</p>
            </div>
          </div>
          <div className="space-y-3 text-sm text-[#425466]">
            <div className="flex items-center justify-between py-2 border-b border-[#f0f2f5]">
              <span>API Server Port</span>
              <span className="text-xs font-mono text-[#697386]">3000</span>
            </div>
            <div className="flex items-center justify-between py-2 border-b border-[#f0f2f5]">
              <span>Dashboard Port</span>
              <span className="text-xs font-mono text-[#697386]">3001</span>
            </div>
            <div className="flex items-center justify-between py-2 border-b border-[#f0f2f5]">
              <span>Payment UI Port</span>
              <span className="text-xs font-mono text-[#697386]">3002</span>
            </div>
            <div className="flex items-center justify-between py-2">
              <span>Admin Port</span>
              <span className="text-xs font-mono text-[#697386]">3004</span>
            </div>
          </div>
        </Card>

        <Card>
          <div className="flex items-center gap-3 mb-4">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#f6f8fa]">
              <Settings className="h-4 w-4 text-[#425466]" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-[#0a2540]">Services</h3>
              <p className="text-xs text-[#697386]">External service configuration</p>
            </div>
          </div>
          <div className="space-y-3 text-sm text-[#425466]">
            <div className="flex items-center justify-between py-2 border-b border-[#f0f2f5]">
              <span>Multichain Indexer</span>
              <span className="text-xs font-mono text-[#697386]">Webhook-based</span>
            </div>
            <div className="flex items-center justify-between py-2 border-b border-[#f0f2f5]">
              <span>MTXM Transaction Manager</span>
              <span className="text-xs font-mono text-[#697386]">REST API</span>
            </div>
            <div className="flex items-center justify-between py-2">
              <span>Price Feed</span>
              <span className="text-xs font-mono text-[#697386]">CoinGecko</span>
            </div>
          </div>
        </Card>

        <Card>
          <div className="flex items-center gap-3 mb-4">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#fef9ee]">
              <Bell className="h-4 w-4 text-[#9e6c00]" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-[#0a2540]">Notifications</h3>
              <p className="text-xs text-[#697386]">Alert and notification settings</p>
            </div>
          </div>
          <div className="space-y-3 text-sm text-[#425466]">
            <div className="flex items-center justify-between py-2 border-b border-[#f0f2f5]">
              <span>Webhook Delivery</span>
              <span className="text-xs font-mono text-[#697386]">BullMQ Worker</span>
            </div>
            <div className="flex items-center justify-between py-2">
              <span>Retry Policy</span>
              <span className="text-xs font-mono text-[#697386]">Exponential Backoff</span>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}

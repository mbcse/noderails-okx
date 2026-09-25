'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { clsx } from 'clsx';
import { NodeRailsLogo } from './noderails-logo';
import {
  LayoutDashboard,
  Link2,
  Coins,
  Users,
  Activity,
  Settings,
  LogOut,
  Shield,
  Clock,
  Percent,
  Webhook,
  AlertTriangle,
  Zap,
  DollarSign,
  MessageSquare,
  Landmark,
  Mail,
  ExternalLink,
} from 'lucide-react';
import { useAdminAuth } from '@/lib/auth';

const navGroups = [
  {
    label: 'Platform',
    items: [
      { href: '/dashboard', label: 'Overview', icon: LayoutDashboard },
      { href: '/dashboard/merchants', label: 'Merchants', icon: Users },
      { href: '/dashboard/apps', label: 'All Apps', icon: Zap },
    ],
  },
  {
    label: 'Network',
    items: [
      { href: '/dashboard/chains', label: 'Chains', icon: Link2 },
      { href: '/dashboard/tokens', label: 'Tokens', icon: Coins },
      { href: '/dashboard/currencies', label: 'Currencies', icon: DollarSign },
      { href: '/dashboard/escrow', label: 'Escrow Config', icon: Shield },
    ],
  },
  {
    label: 'Operations',
    items: [
      { href: '/dashboard/disputes', label: 'Disputes', icon: AlertTriangle },
      { href: '/dashboard/bank', label: 'Bank', icon: Landmark },
      { href: '/dashboard/bridge', label: 'Bridge', icon: Link2 },
      { href: '/dashboard/email', label: 'Emails', icon: Mail },
      { href: '/dashboard/links', label: 'Links', icon: ExternalLink },
      { href: '/dashboard/feedback', label: 'Feedback', icon: MessageSquare },
      { href: '/dashboard/health', label: 'System Health', icon: Activity },
    ],
  },
  {
    label: 'Settings',
    items: [
      { href: '/dashboard/settings/timelocks', label: 'Timelocks', icon: Clock },
      { href: '/dashboard/settings/fees', label: 'Platform Fees', icon: Percent },
      { href: '/dashboard/settings/webhooks', label: 'Webhook Delivery', icon: Webhook },
      { href: '/dashboard/settings', label: 'Settings', icon: Settings },
    ],
  },
];

export function Sidebar() {
  const pathname = usePathname();
  const { admin, logout } = useAdminAuth();

  return (
    <aside className="fixed left-0 top-0 z-40 flex h-screen w-64 flex-col border-r border-[#e8edf3] bg-white/90 backdrop-blur-md">
      <div className="flex items-center gap-3 px-5 py-3.5">
        <NodeRailsLogo className="h-8 w-8 text-[#0a2540]" />
        <div>
          <span className="text-[15px] font-bold tracking-tight text-[#0a2540]">NodeRails</span>
          <span className="ml-1.5 rounded-md bg-[#f0f0ff] px-1.5 py-0.5 text-[10px] font-semibold text-[#635bff]">
            ADMIN
          </span>
        </div>
      </div>

      <nav className="min-h-0 flex-1 space-y-3 overflow-y-auto px-3 pb-2">
        {navGroups.map((group) => (
          <div key={group.label}>
            <p className="mb-1 px-3 text-[10px] font-semibold uppercase tracking-[0.16em] text-[#a3acb9]">
              {group.label}
            </p>
            <div className="space-y-0.5">
              {group.items.map((item) => {
                const isExact = pathname === item.href;
                const isActive =
                  item.href === '/dashboard' || item.href === '/dashboard/settings'
                    ? isExact
                    : pathname === item.href || pathname.startsWith(`${item.href}/`);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={clsx(
                      'group flex items-center gap-2 rounded-lg px-2 py-1 text-[13px] font-medium transition-all duration-150',
                      isActive
                        ? 'bg-[#f0f0ff] text-[#635bff]'
                        : 'text-[#425466] hover:bg-[#f6f8fa] hover:text-[#0a2540]',
                    )}
                  >
                    <div
                      className={clsx(
                        'flex h-6 w-6 items-center justify-center rounded-md transition-all duration-150',
                        isActive
                          ? 'bg-[#635bff] shadow-[0_1px_4px_rgba(99,91,255,0.3)]'
                          : 'bg-[#f0f2f5] group-hover:bg-[#e3e8ee]',
                      )}
                    >
                      <item.icon
                        className={clsx(
                          'h-3.5 w-3.5',
                          isActive ? 'text-white' : 'text-[#697386] group-hover:text-[#425466]',
                        )}
                      />
                    </div>
                    {item.label}
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      <div className="border-t border-[#e8edf3] p-3">
        <div className="mb-2 rounded-lg bg-[#f6f9fc] px-3 py-2">
          <div className="truncate text-[12px] font-medium text-[#0a2540]">{admin?.email}</div>
          <div className="text-[10px] font-semibold uppercase tracking-wide text-[#635bff]">Platform admin</div>
        </div>
        <button
          onClick={logout}
          className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-sm text-[#697386] transition-colors hover:bg-[#f6f8fa] hover:text-[#0a2540]"
        >
          <LogOut className="h-4 w-4" />
          Sign out
        </button>
      </div>
    </aside>
  );
}

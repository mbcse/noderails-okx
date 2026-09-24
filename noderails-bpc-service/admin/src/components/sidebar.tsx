'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { clsx } from 'clsx';
import {
  Activity,
  Coins,
  Layers,
  LogOut,
  Server,
  TrendingUp,
} from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { BpcLogo } from './bpc-logo';

const navItems = [
  { href: '/dashboard', label: 'Overview', icon: Activity },
  { href: '/dashboard/chains', label: 'Chains', icon: Layers },
  { href: '/dashboard/rpc-endpoints', label: 'RPC Endpoints', icon: Server },
  { href: '/dashboard/tokens', label: 'Tokens', icon: Coins },
  { href: '/dashboard/price-sources', label: 'Price Sources', icon: TrendingUp },
];

export function Sidebar() {
  const pathname = usePathname();
  const { email, logout } = useAuth();

  return (
    <aside className="fixed left-0 top-0 z-40 flex h-screen w-64 flex-col border-r border-[#e3e8ee] bg-white">
      <div className="flex items-center gap-3 px-6 py-6">
        <BpcLogo className="h-9 w-9" />
        <div>
          <span className="text-lg font-bold tracking-tight text-[#0a2540]">BPC</span>
          <span className="ml-1.5 rounded-md bg-[#e0f2fe] px-1.5 py-0.5 text-[10px] font-semibold text-[#0369a1]">
            ADMIN
          </span>
        </div>
      </div>

      <nav className="flex-1 space-y-0.5 overflow-y-auto px-3 py-2">
        <p className="mb-2 px-3 text-[10px] font-semibold uppercase tracking-widest text-[#a3acb9]">
          Operations
        </p>
        {navItems.map((item) => {
          const isActive =
            item.href === '/dashboard'
              ? pathname === '/dashboard'
              : pathname === item.href || pathname.startsWith(`${item.href}/`);

          return (
            <Link
              key={item.href}
              href={item.href}
              className={clsx(
                'group flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-all duration-150',
                isActive
                  ? 'bg-[#f0f0ff] text-[#635bff]'
                  : 'text-[#425466] hover:bg-[#f6f8fa] hover:text-[#0a2540]',
              )}
            >
              <div
                className={clsx(
                  'flex h-7 w-7 items-center justify-center rounded-md transition-all duration-150',
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
      </nav>

      <div className="border-t border-[#e3e8ee] p-4">
        <div className="mb-3 rounded-lg bg-[#f6f8fa] px-3 py-2">
          <div className="truncate text-[11px] font-medium text-[#0a2540]">{email}</div>
          <div className="mt-0.5 text-[10px] font-semibold text-[#635bff]">BPC Operator</div>
        </div>
        <button
          onClick={() => void logout()}
          className="flex w-full cursor-pointer items-center gap-2 rounded-lg px-3 py-2 text-sm text-[#697386] transition-colors hover:bg-[#f6f8fa] hover:text-[#0a2540]"
        >
          <LogOut className="h-4 w-4" />
          Sign out
        </button>
      </div>
    </aside>
  );
}

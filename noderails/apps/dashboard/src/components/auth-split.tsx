'use client';

import type { ReactNode } from 'react';
import { Link2, RefreshCw, ShieldCheck } from 'lucide-react';
import { NodeRailsLogo } from '@/components/noderails-logo';

const FEATURES = [
  {
    icon: Link2,
    title: 'Hosted checkout',
    body: 'Multi-chain payment links ready for production.',
  },
  {
    icon: RefreshCw,
    title: 'Subscriptions',
    body: 'Recurring billing and renewals in one place.',
  },
  {
    icon: ShieldCheck,
    title: 'Billing ops',
    body: 'Customers, invoices, and disputes without the mess.',
  },
];

export function AuthSplit({ children }: { children: ReactNode }) {
  return (
    <div className="grid min-h-svh lg:grid-cols-2">
      <section className="relative hidden overflow-hidden bg-[#0a1628] px-12 py-10 text-white lg:flex lg:flex-col">
        <div
          className="pointer-events-none absolute inset-0 opacity-30"
          style={{
            backgroundImage:
              'linear-gradient(to right, rgba(255,255,255,0.06) 1px, transparent 1px), linear-gradient(to bottom, rgba(255,255,255,0.06) 1px, transparent 1px)',
            backgroundSize: '48px 48px',
          }}
        />
        <div className="pointer-events-none absolute -left-24 -top-24 h-80 w-80 rounded-full bg-primary/35 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-28 -right-16 h-72 w-72 rounded-full bg-sky-500/20 blur-3xl" />

        <div className="relative z-10 flex items-center gap-3">
          <NodeRailsLogo className="size-9" />
          <div>
            <p className="text-sm font-semibold tracking-tight">NodeRails</p>
            <p className="text-[11px] uppercase tracking-[0.16em] text-white/45">Merchant platform</p>
          </div>
        </div>

        <div className="relative z-10 my-auto max-w-lg">
          <h1 className="text-[40px] font-semibold leading-[1.12] tracking-tight">
            Crypto payments that feel production-ready.
          </h1>
          <p className="mt-4 text-[15px] leading-relaxed text-white/65">
            Accept, reconcile, and settle from one dashboard.
          </p>
          <ul className="mt-10 space-y-3">
            {FEATURES.map((feature) => (
              <li
                key={feature.title}
                className="flex items-start gap-3 rounded-xl border border-white/10 bg-white/5 px-4 py-3.5"
              >
                <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/20 text-primary">
                  <feature.icon className="h-4 w-4" />
                </div>
                <div>
                  <p className="text-sm font-medium text-white">{feature.title}</p>
                  <p className="mt-0.5 text-sm leading-relaxed text-white/55">{feature.body}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>

        <p className="relative z-10 text-xs text-white/40">
          Built for merchants who need rails they can trust.
        </p>
      </section>

      <section className="relative flex items-center justify-center overflow-hidden px-6 py-10 sm:px-12">
        <div className="pointer-events-none absolute inset-0 nr-glass-canvas" />
        <div className="pointer-events-none absolute inset-0 bg-white/95 backdrop-blur-2xl" />
        <div className="pointer-events-none absolute inset-y-0 left-0 hidden w-px bg-white/80 lg:block" />
        <div className="relative z-10 w-full max-w-[400px]">
          <div className="mb-8 lg:hidden">
            <NodeRailsLogo withText className="h-auto w-[200px]" />
          </div>
          {children}
        </div>
      </section>
    </div>
  );
}

'use client';

import { useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { AuthProvider, useAuth } from '@/lib/auth';
import { Web3Provider } from '@/components/web3-provider';
import { AppSidebar } from '@/components/app-sidebar';
import { Spinner } from '@/components/ui/loading';
import { OnboardingWizard } from '@/components/onboarding';
import { EmailVerificationModal } from '@/components/email-verification-modal';
import { SidebarProvider, SidebarInset, SidebarTrigger } from '@/components/ui/sidebar';
import { TooltipProvider } from '@/components/ui/tooltip';
import { Separator } from '@/components/ui/separator';
import * as api from '@/lib/api';
import { IconProvider, type Icon } from '@/components/icons';
import {
  ArrowUpRight,
  ArrowsClockwise,
  Bank,
  CreditCard,
  Gear,
  Invoice,
  Link as LinkIcon,
  Package,
  ShoppingCart,
  SquaresFour,
  Stack,
  Users,
  Warning,
} from '@phosphor-icons/react';

function headerMeta(pathname: string): { title: string; icon: Icon } {
  if (pathname === '/dashboard') return { title: 'Overview', icon: SquaresFour };
  if (pathname === '/dashboard/apps') return { title: 'Apps', icon: Stack };
  if (pathname.startsWith('/dashboard/bank')) return { title: 'Bank', icon: Bank };
  if (pathname === '/dashboard/settings/team') return { title: 'Team', icon: Users };
  if (pathname === '/dashboard/settings/tax-rates') return { title: 'Tax rates', icon: Gear };
  if (pathname === '/dashboard/settings') return { title: 'Settings', icon: Gear };
  const appMatch = pathname.match(/^\/dashboard\/apps\/[^/]+(?:\/([^/]+))?/);
  if (appMatch) {
    const lookup: Record<string, { title: string; icon: Icon }> = {
      payments: { title: 'Payments', icon: CreditCard },
      payouts: { title: 'Payouts', icon: ArrowUpRight },
      subscriptions: { title: 'Subscriptions', icon: ArrowsClockwise },
      invoices: { title: 'Invoices', icon: Invoice },
      'payment-links': { title: 'Payment Links', icon: LinkIcon },
      customers: { title: 'Customers', icon: Users },
      'product-plans': { title: 'Product Plans', icon: Package },
      'checkout-sessions': { title: 'Checkout', icon: ShoppingCart },
      disputes: { title: 'Disputes', icon: Warning },
      settings: { title: 'App Settings', icon: Gear },
    };
    return appMatch[1] ? (lookup[appMatch[1]] ?? { title: 'App', icon: Stack }) : { title: 'App', icon: Stack };
  }
  return { title: 'Dashboard', icon: SquaresFour };
}

function DashboardShell({
  children,
  suspension,
}: {
  children: React.ReactNode;
  suspension?: { isSuspended: boolean; reason?: string | null };
}) {
  const pathname = usePathname();
  const { title: headerTitle, icon: HeaderIcon } = headerMeta(pathname);
  return (
    <IconProvider>
    <SidebarProvider className="nr-glass-canvas">
      <AppSidebar />
      <SidebarInset className="bg-white/95 backdrop-blur-2xl">
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-primary focus:px-4 focus:py-2 focus:text-sm focus:font-medium focus:text-primary-foreground focus:shadow-lg"
        >
          Skip to content
        </a>
        <header className="sticky top-0 z-30 flex h-12 shrink-0 items-center gap-2 border-b border-black/[0.04] bg-white/90 px-6 backdrop-blur-md">
          <SidebarTrigger className="-ml-2" />
          <Separator orientation="vertical" className="mr-2 !h-4" />
          <div className="flex items-center gap-2">
            <HeaderIcon weight="regular" size={16} className="text-foreground" />
            <span className="text-sm font-medium text-foreground">{headerTitle}</span>
          </div>
        </header>
        <main id="main-content" className="w-full flex-1 px-6 py-5">
          {suspension?.isSuspended && (
            <div className="mb-6 rounded-xl border border-destructive/20 bg-destructive-muted px-4 py-3 text-destructive">
              <div className="flex items-start gap-2">
                <Warning className="mt-0.5 h-4 w-4 shrink-0" weight="regular" />
                <div className="text-sm">
                  <p className="font-medium">Your organization has been suspended.</p>
                  <p className="mt-1">
                    {suspension.reason?.trim()
                      ? `Reason: ${suspension.reason}. `
                      : ''}
                    Please reach out to help@example.com.
                  </p>
                </div>
              </div>
            </div>
          )}
          {children}
        </main>
      </SidebarInset>
    </SidebarProvider>
    </IconProvider>
  );
}

function DashboardGuard({ children }: { children: React.ReactNode }) {
  const { merchant, teamMember, token, loading, isTeamMember } = useAuth();
  const router = useRouter();
  const [needsOnboarding, setNeedsOnboarding] = useState<boolean | null>(null);
  const [createdAppId, setCreatedAppId] = useState<string | null>(null);

  useEffect(() => {
    if (!loading && !merchant && !teamMember) {
      router.push('/login');
    }
  }, [loading, merchant, teamMember, router]);

  // Determine if onboarding is needed: no orgName OR no apps (skip for team members)
  useEffect(() => {
    if (isTeamMember) {
      setNeedsOnboarding(false);
      return;
    }
    if (!merchant || !token) return;
    if (merchant.isSuspended) {
      setNeedsOnboarding(false);
      return;
    }
    if (!merchant.orgName) {
      setNeedsOnboarding(true);
      return;
    }
    api.getApps(token).then((apps) => {
      const list = Array.isArray(apps) ? apps : [];
      setNeedsOnboarding(list.length === 0);
    }).catch(() => {
      setNeedsOnboarding(false);
    });
  }, [merchant, token, isTeamMember]);

  if (loading || needsOnboarding === null) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Spinner />
      </div>
    );
  }

  if (!merchant && !teamMember) return null;

  // ── Email verification gate - blocks all access (merchants only) ──
  if (merchant && !merchant.emailVerified) {
    return (
      <TooltipProvider>
        <DashboardShell suspension={{ isSuspended: merchant.isSuspended, reason: merchant.suspendedReason }}>
          <EmailVerificationModal />
          {children}
        </DashboardShell>
      </TooltipProvider>
    );
  }

  return (
    <>
      {needsOnboarding && (
        <OnboardingWizard onComplete={(appId) => {
          setCreatedAppId(appId);
          setNeedsOnboarding(false);
          setTimeout(() => router.push(`/dashboard/apps/${appId}`), 100);
        }} />
      )}
      <TooltipProvider>
        <DashboardShell suspension={merchant ? { isSuspended: merchant.isSuspended, reason: merchant.suspendedReason } : undefined}>
          {children}
        </DashboardShell>
      </TooltipProvider>
    </>
  );
}

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <AuthProvider>
      <Web3Provider>
        <DashboardGuard>{children}</DashboardGuard>
      </Web3Provider>
    </AuthProvider>
  );
}

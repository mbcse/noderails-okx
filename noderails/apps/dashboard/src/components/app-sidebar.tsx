'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  ArrowUpRight,
  ArrowsClockwise,
  Bank,
  CaretUp,
  CaretUpDown,
  Check,
  CreditCard,
  Gear,
  Invoice,
  Link as LinkIcon,
  Package,
  Plus,
  ShoppingCart,
  SignOut,
  SquaresFour,
  Stack,
  Users,
  Warning,
} from '@phosphor-icons/react';
import type { Icon } from '@/components/icons';
import { useAuth, usePermission, useAppAccess } from '@/lib/auth';
import { resolveMerchantDisplayName } from '@noderails/common';
import { NodeRailsLogo } from './noderails-logo';
import * as api from '@/lib/api';
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
  useSidebar,
} from '@/components/ui/sidebar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Avatar,
  AvatarFallback,
} from '@/components/ui/avatar';

/* ── Navigation items ── */
const platformNavItems: { href: string; label: string; icon: Icon; permission?: string; tag?: 'new' }[] = [
  { href: '/dashboard', label: 'Overview', icon: SquaresFour },
  { href: '/dashboard/apps', label: 'Apps', icon: Stack },
  { href: '/dashboard/bank', label: 'Bank', icon: Bank, permission: 'BANK_MANAGE', tag: 'new' },
  { href: '/dashboard/settings', label: 'Settings', icon: Gear, tag: 'new' },
];

const appNavItems: { segment: string; label: string; icon: Icon; permission: string | null; tag?: 'new' }[] = [
  { segment: '', label: 'Overview', icon: SquaresFour, permission: null },
  { segment: '/payments', label: 'Payments', icon: CreditCard, permission: 'PAYMENTS_VIEW' },
  { segment: '/payouts', label: 'Payouts', icon: ArrowUpRight, permission: 'PAYOUTS_VIEW', tag: 'new' },
  { segment: '/subscriptions', label: 'Subscriptions', icon: ArrowsClockwise, permission: 'SUBSCRIPTIONS_VIEW' },
  { segment: '/invoices', label: 'Invoices', icon: Invoice, permission: 'INVOICES_VIEW' },
  { segment: '/payment-links', label: 'Payment Links', icon: LinkIcon, permission: 'PAYMENT_LINKS_MANAGE' },
  { segment: '/customers', label: 'Customers', icon: Users, permission: 'CUSTOMERS_VIEW' },
  { segment: '/product-plans', label: 'Product Plans', icon: Package, permission: 'SUBSCRIPTIONS_VIEW' },
  { segment: '/checkout-sessions', label: 'Checkout', icon: ShoppingCart, permission: 'PAYMENTS_VIEW' },
  { segment: '/disputes', label: 'Disputes', icon: Warning, permission: 'DISPUTES_VIEW' },
  { segment: '/settings', label: 'Settings', icon: Gear, permission: 'APPS_EDIT', tag: 'new' },
];

function NavNewTag() {
  return (
    <span className="shrink-0 rounded-[4px] bg-success-muted px-1 py-px text-[9px] font-semibold uppercase leading-none tracking-[0.04em] text-success group-data-[collapsible=icon]:hidden">
      New
    </span>
  );
}

/** Extract app ID from pathname */
function getAppIdFromPath(pathname: string): string | null {
  const match = pathname.match(/^\/dashboard\/apps\/([^/]+)/);
  return match ? match[1] : null;
}

interface AppInfo {
  id: string;
  name: string;
  environment: string;
}

export function AppSidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const { merchant, teamMember, token, logout } = useAuth();
  const hasPermission = usePermission();
  const hasAppAccess = useAppAccess();
  const { state } = useSidebar();

  const appId = getAppIdFromPath(pathname);
  const isInsideApp = !!appId;
  const appBase = appId ? `/dashboard/apps/${appId}` : '';

  const [apps, setApps] = useState<AppInfo[]>([]);
  const [appSwitcherOpen, setAppSwitcherOpen] = useState(false);

  // Fetch all apps for the switcher
  useEffect(() => {
    if (!token) return;
    api
      .getApps(token)
      .then((result) => {
        const list = Array.isArray(result) ? result : [];
        setApps(list);
      })
      .catch(() => setApps([]));
  }, [token]);

  // If navigating to an app not in the list, refetch to get the newly created app
  useEffect(() => {
    if (!appId || !token) return;
    const appExists = apps.some((a) => a.id === appId);
    if (!appExists) {
      api
        .getApps(token)
        .then((result) => {
          const list = Array.isArray(result) ? result : [];
          setApps(list);
        })
        .catch(() => {});
    }
  }, [appId, token, apps]);

  const currentApp = apps.find((a) => a.id === appId);

  // Filter app nav items by permission
  const visibleAppNavItems = appNavItems.filter(
    (item) => !item.permission || hasPermission(item.permission),
  );

  // Filter apps by app access for team members
  const visibleApps = apps.filter((a) => hasAppAccess(a.id));

  const userEmail = merchant?.email ?? teamMember?.email ?? '';
  const orgName =
    (merchant ? resolveMerchantDisplayName(merchant) : null) ??
    teamMember?.orgName ??
    null;
  const displayName = orgName ?? userEmail.split('@')[0] ?? 'User';
  const userInitials = (orgName ?? userEmail).slice(0, 2).toUpperCase() || 'NR';
  const userLabel = teamMember ? 'Team Member' : userEmail;

  return (
    <Sidebar collapsible="icon" variant="sidebar">
      {/* ── Header / Logo ── */}
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" asChild>
              <Link href="/dashboard">
                <div className="flex items-center justify-center size-7 shrink-0">
                  <NodeRailsLogo className="size-7 text-foreground" />
                </div>
                <div className="flex flex-col gap-0.5 leading-none">
                  <span className="font-semibold text-[14px] tracking-tight">NodeRails</span>
                  <span className="text-[10px] text-muted-foreground">Crypto Payment Infrastructure</span>
                </div>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent>
        {/* ── Platform navigation ── */}
        <SidebarGroup>
          <SidebarGroupLabel>Platform</SidebarGroupLabel>
          <SidebarMenu>
            {platformNavItems
              .filter((item) => !item.permission || hasPermission(item.permission))
              .map((item) => {
              const isActive =
                item.href === '/dashboard'
                  ? pathname === item.href
                  : pathname === item.href || pathname.startsWith(item.href + '/');
              return (
                <SidebarMenuItem key={item.href}>
                  <SidebarMenuButton asChild isActive={isActive} tooltip={item.label}>
                    <Link href={item.href}>
                      <item.icon />
                      <span>{item.label}</span>
                      {item.tag === 'new' ? <NavNewTag /> : null}
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              );
            })}
          </SidebarMenu>
        </SidebarGroup>

        {/* ── App Switcher + App Navigation ── */}
        {visibleApps.length > 0 && (
          <SidebarGroup>
            <SidebarGroupLabel className="flex items-center justify-between">
              <span>App</span>
              <button
                onClick={() => router.push('/dashboard/apps')}
                className="inline-flex items-center justify-center rounded-md h-5 w-5 text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
                title="Create new app"
              >
                <Plus className="size-3.5" />
              </button>
            </SidebarGroupLabel>
            <SidebarMenu>
              {/* App Switcher Dropdown */}
              <SidebarMenuItem>
                <DropdownMenu open={appSwitcherOpen} onOpenChange={setAppSwitcherOpen}>
                  <DropdownMenuTrigger asChild>
                    <SidebarMenuButton
                      className="w-full justify-between rounded-lg border border-border bg-card hover:bg-muted data-[state=open]:bg-muted"
                      tooltip={currentApp?.name ?? 'Select an app'}
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <Stack className="size-4 shrink-0 text-muted-foreground" weight="regular" />
                        <span className="truncate text-sm font-medium">
                          {currentApp?.name ?? 'Select an app'}
                        </span>
                      </div>
                      <CaretUpDown className="size-3.5 shrink-0 opacity-50" />
                    </SidebarMenuButton>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent
                    className="w-[--radix-dropdown-menu-trigger-width] min-w-48"
                    align="start"
                    sideOffset={4}
                  >
                    {visibleApps.map((app) => (
                      <DropdownMenuItem
                        key={app.id}
                        onClick={() => router.push(`/dashboard/apps/${app.id}`)}
                        className="cursor-pointer flex items-center justify-between"
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <Stack className="size-3.5 shrink-0" weight="regular" />
                          <span className="truncate">{app.name}</span>
                        </div>
                        {app.id === appId && (
                          <Check className="size-3.5 shrink-0 text-primary" />
                        )}
                      </DropdownMenuItem>
                    ))}
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      onClick={() => router.push('/dashboard/apps')}
                      className="cursor-pointer"
                    >
                      <Plus className="mr-2 size-3.5" />
                      Create new app
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </SidebarMenuItem>
            </SidebarMenu>

            {/* App sub-navigation (shown when inside an app) */}
            {isInsideApp && (
              <SidebarMenu className="mt-1">
                {visibleAppNavItems.map((item) => {
                  const href = `${appBase}${item.segment}`;
                  const isActive =
                    item.segment === ''
                      ? pathname === appBase || pathname === appBase + '/'
                      : item.segment === '/settings'
                        ? pathname.startsWith(`${appBase}/settings`) ||
                          pathname.startsWith(`${appBase}/chains`) ||
                          pathname.startsWith(`${appBase}/tokens`) ||
                          pathname.startsWith(`${appBase}/wallets`) ||
                          pathname.startsWith(`${appBase}/api-keys`) ||
                          pathname.startsWith(`${appBase}/webhooks`)
                        : pathname.startsWith(href);
                  return (
                    <SidebarMenuItem key={item.segment}>
                      <SidebarMenuButton asChild isActive={isActive} tooltip={item.label}>
                        <Link href={href}>
                          <item.icon />
                          <span>{item.label}</span>
                          {item.tag === 'new' ? <NavNewTag /> : null}
                        </Link>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  );
                })}
              </SidebarMenu>
            )}
          </SidebarGroup>
        )}
      </SidebarContent>

      {/* ── Footer / User ── */}
      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <SidebarMenuButton
                  size="lg"
                  className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
                >
                  <Avatar className="h-7 w-7 rounded-lg">
                    <AvatarFallback className="rounded-lg bg-primary/10 text-primary text-[11px] font-medium">
                      {userInitials}
                    </AvatarFallback>
                  </Avatar>
                  <div className="grid flex-1 text-left leading-tight">
                    <span className="truncate text-[13px] font-medium">
                      {displayName}
                    </span>
                    <span className="truncate text-xs text-muted-foreground">
                      {userLabel}
                    </span>
                  </div>
                  <CaretUp className="ml-auto size-3.5 opacity-50" />
                </SidebarMenuButton>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                className="w-[--radix-dropdown-menu-trigger-width] min-w-56"
                side="top"
                align="end"
                sideOffset={4}
              >
                <div className="px-2 py-1.5">
                  <p className="text-sm font-medium">{displayName}</p>
                  <p className="text-xs text-muted-foreground">{userEmail}</p>
                </div>
                <DropdownMenuSeparator />
                <DropdownMenuItem asChild>
                  <Link href="/dashboard/settings" className="cursor-pointer">
                    <Gear className="mr-2 h-4 w-4" weight="regular" />
                    Account Settings
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={logout}
                  className="cursor-pointer text-destructive focus:text-destructive"
                >
                  <SignOut className="mr-2 h-4 w-4" weight="regular" />
                  Sign out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>

      <SidebarRail />
    </Sidebar>
  );
}

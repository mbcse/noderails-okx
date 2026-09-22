"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  FolderKanban,
  Settings,
  LogOut,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/providers/auth-provider";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";

export function AppSidebar() {
  const pathname = usePathname();
  const { user, logout } = useAuth();

  const initials = user?.name
    ?.split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2) ?? "AD";

  const topNavItems = [
    { label: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
    { label: "Projects",  href: "/dashboard",  icon: FolderKanban },
    { label: "Settings",  href: "/dashboard/settings", icon: Settings },
  ];

  return (
    <aside className="flex h-screen w-64 flex-col border-r bg-card">
      {/* ── Brand ───────────────────────────────────────────── */}
      <div className="flex h-16 items-center gap-2 px-6">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground text-sm font-bold">
          TX
        </div>
        <span className="text-lg font-semibold tracking-tight">TxManager</span>
      </div>

      <Separator />

      {/* ── Navigation ──────────────────────────────────────── */}
      <ScrollArea className="flex-1 px-3 py-4">
        <nav className="flex flex-col gap-1">
          {topNavItems.map((item) => {
            const isActive = pathname === item.href;
            return (
              <Link key={item.label} href={item.href}>
                <span
                  className={cn(
                    "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                    isActive
                      ? "bg-accent text-accent-foreground"
                      : "text-muted-foreground hover:bg-accent hover:text-accent-foreground",
                  )}
                >
                  <item.icon className="h-4 w-4" />
                  {item.label}
                </span>
              </Link>
            );
          })}
        </nav>
      </ScrollArea>

      <Separator />

      {/* ── User footer ─────────────────────────────────────── */}
      <div className="flex items-center gap-3 px-4 py-4">
        <Avatar className="h-8 w-8">
          <AvatarFallback className="text-xs">{initials}</AvatarFallback>
        </Avatar>
        <div className="flex-1 min-w-0">
          <p className="truncate text-sm font-medium">{user?.name}</p>
          <p className="truncate text-xs text-muted-foreground">{user?.email}</p>
        </div>
        <Button variant="ghost" size="icon" onClick={logout} title="Sign out">
          <LogOut className="h-4 w-4" />
        </Button>
      </div>
    </aside>
  );
}

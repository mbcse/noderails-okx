"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Link as LinkIcon,
  FileCode,
  KeyRound,
  ArrowLeftRight,
  Webhook,
  ChevronLeft,
  Wallet,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { PROJECT_NAV_ITEMS } from "@mtxm/shared";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";

const ICON_MAP: Record<string, React.ElementType> = {
  LayoutDashboard,
  Link: LinkIcon,
  FileCode,
  KeyRound,
  ArrowLeftRight,
  Webhook,
  Wallet,
};

interface ProjectNavProps {
  projectId: string;
  projectName: string;
}

/**
 * Secondary sidebar shown inside a project — provides links
 * to Overview, Chains, Signers, Transactions, Webhooks.
 */
export function ProjectNav({ projectId, projectName }: ProjectNavProps) {
  const pathname = usePathname();
  const basePath = `/dashboard/projects/${projectId}`;

  return (
    <aside className="flex h-full w-56 flex-col border-r bg-card/50">
      {/* ── Back to projects ────────────────────────────────── */}
      <div className="flex items-center gap-2 px-3 py-4">
        <Link href="/dashboard">
          <Button variant="ghost" size="sm" className="gap-1 text-muted-foreground">
            <ChevronLeft className="h-4 w-4" />
            Projects
          </Button>
        </Link>
      </div>

      <div className="px-4 pb-2">
        <p className="truncate text-sm font-semibold">{projectName}</p>
      </div>

      <Separator />

      {/* ── Nav links ───────────────────────────────────────── */}
      <ScrollArea className="flex-1 px-3 py-3">
        <nav className="flex flex-col gap-0.5">
          {PROJECT_NAV_ITEMS.map((item) => {
            const href = `${basePath}${item.href}`;
            const isActive =
              item.href === ""
                ? pathname === basePath
                : pathname.startsWith(href);
            const Icon = ICON_MAP[item.icon] ?? LayoutDashboard;

            return (
              <Link key={item.label} href={href}>
                <span
                  className={cn(
                    "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                    isActive
                      ? "bg-accent text-accent-foreground"
                      : "text-muted-foreground hover:bg-accent hover:text-accent-foreground",
                  )}
                >
                  <Icon className="h-4 w-4" />
                  {item.label}
                </span>
              </Link>
            );
          })}
        </nav>
      </ScrollArea>
    </aside>
  );
}

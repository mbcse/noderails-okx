"use client";

import { usePathname } from "next/navigation";
import { Separator } from "@/components/ui/separator";

/**
 * Top header bar — shows a breadcrumb-style page title derived from the URL.
 */
export function Header() {
  const pathname = usePathname();

  const segments = pathname
    .replace(/^\/dashboard\/?/, "")
    .split("/")
    .filter(Boolean);

  const pageTitle =
    segments.length === 0
      ? "Dashboard"
      : segments[segments.length - 1]
          .replace(/-/g, " ")
          .replace(/\b\w/g, (c) => c.toUpperCase());

  return (
    <header className="flex h-16 shrink-0 items-center gap-4 border-b px-6">
      <h1 className="text-lg font-semibold">{pageTitle}</h1>
    </header>
  );
}

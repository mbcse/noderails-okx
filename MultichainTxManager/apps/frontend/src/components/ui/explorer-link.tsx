"use client";

import { Copy, ExternalLink } from "lucide-react";
import { toast } from "sonner";
import { truncateAddress, copyToClipboard } from "@/lib/utils";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

// ────────────────────────────────────────────────────────────
// Reusable component for displaying addresses / tx hashes
// with explorer link + copy button.
// ────────────────────────────────────────────────────────────

type ExplorerType = "address" | "tx";

interface ExplorerLinkProps {
  /** The full hex value (address or hash) */
  value: string;
  /** The explorer base URL, e.g. "https://sepolia.etherscan.io" */
  explorerUrl?: string | null;
  /** Whether this is an address or a tx hash */
  type?: ExplorerType;
  /** How many chars to show at start / end */
  startChars?: number;
  endChars?: number;
  /** Label for the copy toast */
  copyLabel?: string;
  /** Extra className on the wrapper */
  className?: string;
}

export function ExplorerLink({
  value,
  explorerUrl,
  type = "address",
  startChars = 6,
  endChars = 4,
  copyLabel,
  className = "",
}: ExplorerLinkProps) {
  const label = copyLabel ?? (type === "tx" ? "Tx hash" : "Address");
  const truncated = truncateAddress(value, startChars, endChars);
  const href = explorerUrl
    ? `${explorerUrl.replace(/\/$/, "")}/${type}/${value}`
    : null;

  async function handleCopy() {
    const ok = await copyToClipboard(value);
    if (ok) toast.success(`${label} copied`);
  }

  return (
    <span className={`inline-flex items-center gap-1 ${className}`}>
      {href ? (
        <a
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 font-mono text-xs text-primary hover:underline"
        >
          {truncated}
          <ExternalLink className="h-3 w-3 shrink-0" />
        </a>
      ) : (
        <span className="font-mono text-xs">{truncated}</span>
      )}
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            className="text-muted-foreground hover:text-foreground"
            onClick={handleCopy}
          >
            <Copy className="h-3 w-3 shrink-0" />
          </button>
        </TooltipTrigger>
        <TooltipContent>Copy {label.toLowerCase()}</TooltipContent>
      </Tooltip>
    </span>
  );
}

"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Globe, Loader2, Search, Check } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Checkbox } from "@/components/ui/checkbox";

// ── Chainlist types ──────────────────────────────────────────────────
interface ChainlistRpc {
  url: string;
  tracking?: string;
}

interface ChainlistEntry {
  name: string;
  chainId: number;
  rpc: (string | ChainlistRpc)[];
  nativeCurrency?: { name: string; symbol: string; decimals: number };
  isTestnet?: boolean;
}

// ── Cache so we don't re-fetch during the same session ───────────────
let chainlistCache: ChainlistEntry[] | null = null;
let fetchPromise: Promise<ChainlistEntry[]> | null = null;

function fetchChainlist(): Promise<ChainlistEntry[]> {
  if (chainlistCache) return Promise.resolve(chainlistCache);
  if (fetchPromise) return fetchPromise;
  fetchPromise = fetch("https://chainlist.org/rpcs.json")
    .then((res) => {
      if (!res.ok) throw new Error("Failed to fetch chainlist");
      return res.json() as Promise<ChainlistEntry[]>;
    })
    .then((data) => {
      chainlistCache = data;
      return data;
    })
    .catch((err) => {
      fetchPromise = null; // allow retry on failure
      throw err;
    });
  return fetchPromise;
}

function extractHttpRpcs(entry: ChainlistEntry): string[] {
  return entry.rpc
    .map((r) => (typeof r === "string" ? r : r.url))
    .map((url) => url.trim())
    .filter((url) => url.startsWith("https://") || url.startsWith("http://"))
    .filter((url) => !url.includes("${")); // skip templated API-key URLs
}



// ── Inline component (not a dialog) ─────────────────────────────────
interface ChainlistRpcPickerProps {
  /** Can be string or number — we coerce internally */
  chainId: string | number;
  existingUrls: string[];
  onSelect: (urls: string[]) => void;
}

export function ChainlistRpcPicker({
  chainId,
  existingUrls,
  onSelect,
}: ChainlistRpcPickerProps) {
  const numericChainId = Number(chainId) || 0;

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [entry, setEntry] = useState<ChainlistEntry | null>(null);
  const [httpRpcs, setHttpRpcs] = useState<string[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [filter, setFilter] = useState("");

  // Auto-fetch when chainId changes
  useEffect(() => {
    // Reset on every chainId change
    setEntry(null);
    setHttpRpcs([]);
    setSelected(new Set());
    setFilter("");
    setError(null);

    if (numericChainId <= 0) return;

    setLoading(true);
    fetchChainlist()
      .then((chains) => {
        const match = chains.find((c) => Number(c.chainId) === numericChainId);
        if (!match) {
          setError(`Chain ID ${numericChainId} not found on Chainlist`);
          return;
        }
        const rpcs = extractHttpRpcs(match);
        if (rpcs.length === 0) {
          setError(`No public HTTP RPCs for ${match.name}`);
          return;
        }
        setEntry(match);
        setHttpRpcs(rpcs);
      })
      .catch(() => setError("Failed to fetch Chainlist data"))
      .finally(() => setLoading(false));
  }, [numericChainId]);

  const existingSet = useMemo(
    () => new Set(existingUrls.map((u) => u.trim()).filter(Boolean)),
    [existingUrls],
  );

  const filtered = useMemo(
    () => httpRpcs.filter((u) => u.toLowerCase().includes(filter.toLowerCase())),
    [httpRpcs, filter],
  );

  const toggle = useCallback((url: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(url)) next.delete(url);
      else next.add(url);
      return next;
    });
  }, []);

  const selectAll = useCallback(() => {
    setSelected((prev) => {
      const next = new Set(prev);
      for (const u of filtered) {
        if (!existingSet.has(u)) next.add(u);
      }
      return next;
    });
  }, [filtered, existingSet]);

  const selectNone = useCallback(() => setSelected(new Set()), []);

  const handleAdd = useCallback(() => {
    if (selected.size === 0) return;
    onSelect(Array.from(selected));
    setSelected(new Set());
  }, [selected, onSelect]);

  // Don't render anything if no chainId yet
  if (numericChainId <= 0) return null;

  return (
    <div className="space-y-2.5 rounded-lg border border-gray-200 bg-gray-50 p-3">
      <div className="flex items-center gap-2 text-sm font-medium text-gray-700">
        <Globe className="h-4 w-4" />
        <span>Chainlist Public RPCs</span>
        {entry && (
          <Badge variant="secondary" className="text-[10px]">
            {entry.name} · {httpRpcs.length} endpoints
          </Badge>
        )}
      </div>

      {loading && (
        <div className="flex items-center justify-center gap-2 py-4 text-sm text-gray-500">
          <Loader2 className="h-4 w-4 animate-spin" />
          Fetching RPCs…
        </div>
      )}

      {error && (
        <p className="text-sm text-gray-500">{error}</p>
      )}

      {!loading && !error && httpRpcs.length > 0 && (
        <>
          {/* Filter + bulk actions */}
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-2 top-2 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                placeholder="Filter RPCs…"
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                className="h-8 pl-7 text-xs"
              />
            </div>
            <Button type="button" variant="outline" size="sm" className="h-8 text-xs" onClick={selectAll}>
              All
            </Button>
            <Button type="button" variant="outline" size="sm" className="h-8 text-xs" onClick={selectNone}>
              None
            </Button>
          </div>

          {/* RPC list */}
          <ScrollArea className="h-[140px] rounded-lg border border-gray-200 bg-white">
            <div className="space-y-0.5 p-1.5">
              {filtered.map((url) => {
                const alreadyAdded = existingSet.has(url);
                return (
                  <label
                    key={url}
                    className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors hover:bg-gray-100"
                  >
                    <Checkbox
                      checked={selected.has(url) || alreadyAdded}
                      disabled={alreadyAdded}
                      onCheckedChange={() => toggle(url)}
                    />
                    <span className="min-w-0 flex-1 truncate font-mono text-[11px]">{url}</span>
                    {alreadyAdded && (
                      <Badge variant="outline" className="ml-auto shrink-0 text-[10px]">
                        <Check className="mr-0.5 h-3 w-3" /> added
                      </Badge>
                    )}
                  </label>
                );
              })}
              {filtered.length === 0 && (
                <p className="py-3 text-center text-xs text-muted-foreground">
                  No RPCs match your filter
                </p>
              )}
            </div>
          </ScrollArea>

          <div className="flex items-center justify-end">
            <Button
              type="button"
              size="sm"
              className="h-7 text-xs"
              disabled={selected.size === 0}
              onClick={handleAdd}
            >
              Add {selected.size} RPC{selected.size !== 1 ? "s" : ""}
            </Button>
          </div>
        </>
      )}
    </div>
  );
}

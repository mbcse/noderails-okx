"use client";

import { Trash2, ExternalLink, Pencil } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { Chain } from "@mtxm/shared";

interface ChainTableProps {
  chains: Chain[];
  onEdit: (chain: Chain) => void;
  onDelete: (chainId: string) => void;
}

export function ChainTable({ chains, onEdit, onDelete }: ChainTableProps) {
  if (chains.length === 0) {
    return (
      <div className="rounded-lg border p-12 text-center text-muted-foreground">
        No chains configured yet. Add a chain to get started.
      </div>
    );
  }

  return (
    <div className="rounded-lg border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Name</TableHead>
            <TableHead>Chain ID</TableHead>
            <TableHead>Currency</TableHead>
            <TableHead>RPC Endpoints</TableHead>
            <TableHead>Type</TableHead>
            <TableHead>Status</TableHead>
            <TableHead className="w-[80px]" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {chains.map((chain) => (
            <TableRow key={chain.id}>
              <TableCell className="font-medium">
                <button
                  className="hover:underline hover:text-foreground text-left"
                  onClick={() => onEdit(chain)}
                >
                  {chain.name}
                </button>
              </TableCell>
              <TableCell className="font-mono text-xs">{chain.chainId}</TableCell>
              <TableCell>{chain.nativeCurrency}</TableCell>
              <TableCell>
                <span className="text-xs text-muted-foreground">
                  {chain.rpcUrls.length} endpoint{chain.rpcUrls.length !== 1 ? "s" : ""}
                </span>
              </TableCell>
              <TableCell>
                <div className="flex items-center gap-1.5">
                  <Badge variant="secondary">{chain.chainType}</Badge>
                  <Badge variant={chain.isTestnet ? "outline" : "secondary"}>
                    {chain.isTestnet ? "Testnet" : "Mainnet"}
                  </Badge>
                </div>
              </TableCell>
              <TableCell>
                <span className="flex items-center gap-1.5">
                  <span
                    className={`h-2 w-2 rounded-full ${chain.isActive ? "bg-emerald-500" : "bg-zinc-500"}`}
                  />
                  <span className="text-xs">{chain.isActive ? "Active" : "Inactive"}</span>
                </span>
              </TableCell>
              <TableCell>
                <div className="flex items-center gap-1">
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => onEdit(chain)}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>Edit chain</TooltipContent>
                  </Tooltip>
                  {chain.explorerUrl && (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-8 w-8" asChild>
                          <a href={chain.explorerUrl} target="_blank" rel="noopener noreferrer">
                            <ExternalLink className="h-4 w-4" />
                          </a>
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>Open explorer</TooltipContent>
                    </Tooltip>
                  )}
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-destructive hover:text-destructive"
                        onClick={() => onDelete(chain.id)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>Delete chain</TooltipContent>
                  </Tooltip>
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

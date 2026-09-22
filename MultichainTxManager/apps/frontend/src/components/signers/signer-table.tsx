"use client";

import { useState } from "react";
import { Copy, PowerOff, Crown, CrownIcon, Power } from "lucide-react";
import { toast } from "sonner";

import { useActivateSigner, useDeactivateSigner, useSetMaster, useUnsetMaster } from "@/hooks/use-signers";
import { truncateAddress, copyToClipboard } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { SignerDetailSheet } from "./signer-detail-sheet";
import type { SignerKey } from "@mtxm/shared";

interface SignerTableProps {
  projectId: string;
  signers: SignerKey[];
}

export function SignerTable({ projectId, signers }: SignerTableProps) {
  const deactivateSigner = useDeactivateSigner(projectId);
  const activateSigner = useActivateSigner(projectId);
  const setMaster = useSetMaster(projectId);
  const unsetMaster = useUnsetMaster(projectId);
  const [selectedSignerId, setSelectedSignerId] = useState<string | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);

  if (signers.length === 0) {
    return (
      <div className="rounded-lg border p-12 text-center text-muted-foreground">
        No signer keys configured yet. Add a signer to enable transaction signing.
      </div>
    );
  }

  function handleAddressClick(signerId: string) {
    setSelectedSignerId(signerId);
    setSheetOpen(true);
  }

  return (
    <>
      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Label</TableHead>
              <TableHead>Address</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Adapter</TableHead>
              <TableHead>Role</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="w-[100px]" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {signers.map((signer) => (
              <TableRow key={signer.id}>
                <TableCell className="font-medium">{signer.label}</TableCell>
                <TableCell>
                  <span className="inline-flex items-center gap-1.5">
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <button
                          className="font-mono text-xs text-primary hover:underline"
                          onClick={() => handleAddressClick(signer.id)}
                        >
                          {truncateAddress(signer.address)}
                        </button>
                      </TooltipTrigger>
                      <TooltipContent>View balances &amp; transactions</TooltipContent>
                    </Tooltip>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <button
                          className="text-muted-foreground hover:text-foreground"
                          onClick={async () => {
                            const ok = await copyToClipboard(signer.address);
                            if (ok) toast.success("Address copied");
                          }}
                        >
                          <Copy className="h-3 w-3" />
                        </button>
                      </TooltipTrigger>
                      <TooltipContent>Copy address</TooltipContent>
                    </Tooltip>
                  </span>
                </TableCell>
                <TableCell>
                  <Badge variant="secondary">{signer.chainType}</Badge>
                </TableCell>
                <TableCell>
                  <Badge variant={signer.adapterType === "KMS" ? "default" : "outline"}>
                    {signer.adapterType}
                  </Badge>
                </TableCell>
                <TableCell>
                  {signer.isMaster ? (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Badge variant="default" className="gap-1 bg-amber-600 hover:bg-amber-700 cursor-pointer"
                          onClick={() => {
                            unsetMaster.mutate(signer.id, {
                              onSuccess: () => toast.success("Master wallet unset"),
                              onError: () => toast.error("Failed to unset master wallet"),
                            });
                          }}
                        >
                          <Crown className="h-3 w-3" />
                          Master
                        </Badge>
                      </TooltipTrigger>
                      <TooltipContent>Click to unset as master wallet</TooltipContent>
                    </Tooltip>
                  ) : (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Badge variant="outline" className="gap-1 cursor-pointer hover:border-amber-500 hover:text-amber-600"
                          onClick={() => {
                            setMaster.mutate(signer.id, {
                              onSuccess: () => toast.success("Set as master wallet"),
                              onError: () => toast.error("Failed to set master wallet"),
                            });
                          }}
                        >
                          <CrownIcon className="h-3 w-3" />
                          Signer
                        </Badge>
                      </TooltipTrigger>
                      <TooltipContent>Click to set as master wallet (auto-funding)</TooltipContent>
                    </Tooltip>
                  )}
                </TableCell>
                <TableCell>
                  <span className="flex items-center gap-1.5">
                    <span
                      className={`h-2 w-2 rounded-full ${signer.isActive ? "bg-emerald-500" : "bg-zinc-500"}`}
                    />
                    <span className="text-xs">{signer.isActive ? "Active" : "Inactive"}</span>
                  </span>
                </TableCell>
                <TableCell>
                  {signer.isActive ? (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 text-xs"
                      onClick={() => deactivateSigner.mutate(signer.id)}
                    >
                      <PowerOff className="mr-1 h-3 w-3" />
                      Deactivate
                    </Button>
                  ) : (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 text-xs"
                      onClick={() => activateSigner.mutate(signer.id)}
                    >
                      <Power className="mr-1 h-3 w-3" />
                      Activate
                    </Button>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <SignerDetailSheet
        projectId={projectId}
        signerId={selectedSignerId}
        open={sheetOpen}
        onOpenChange={setSheetOpen}
      />
    </>
  );
}

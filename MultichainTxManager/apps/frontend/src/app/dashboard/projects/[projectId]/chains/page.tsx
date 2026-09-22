"use client";

import { use, useState } from "react";
import { Plus } from "lucide-react";
import { useChains, useDeleteChain } from "@/hooks/use-chains";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ChainTable } from "@/components/chains/chain-table";
import { AddChainDialog } from "@/components/chains/add-chain-dialog";
import { EditChainDialog } from "@/components/chains/edit-chain-dialog";
import type { Chain } from "@mtxm/shared";

interface ChainsPageProps {
  params: Promise<{ projectId: string }>;
}

export default function ChainsPage({ params }: ChainsPageProps) {
  const { projectId } = use(params);
  const { data: response, isLoading } = useChains(projectId);
  const deleteChain = useDeleteChain(projectId);
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [editChain, setEditChain] = useState<Chain | null>(null);
  const [isEditOpen, setIsEditOpen] = useState(false);

  const chains = response?.data ?? [];

  function handleEdit(chain: Chain) {
    setEditChain(chain);
    setIsEditOpen(true);
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Chains</h2>
          <p className="text-muted-foreground">Manage supported blockchain networks</p>
        </div>
        <Button onClick={() => setIsAddOpen(true)}>
          <Plus className="mr-2 h-4 w-4" />
          Add Chain
        </Button>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-14 w-full rounded-lg" />
          ))}
        </div>
      ) : (
        <ChainTable
          chains={chains}
          onEdit={handleEdit}
          onDelete={(chainId) => deleteChain.mutate(chainId)}
        />
      )}

      <AddChainDialog
        projectId={projectId}
        open={isAddOpen}
        onOpenChange={setIsAddOpen}
      />

      <EditChainDialog
        projectId={projectId}
        chain={editChain}
        open={isEditOpen}
        onOpenChange={setIsEditOpen}
      />
    </div>
  );
}

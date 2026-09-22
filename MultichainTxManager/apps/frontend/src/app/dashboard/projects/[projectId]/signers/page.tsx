"use client";

import { use, useState } from "react";
import { Plus } from "lucide-react";
import { useSigners } from "@/hooks/use-signers";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { SignerTable } from "@/components/signers/signer-table";
import { AddSignerDialog } from "@/components/signers/add-signer-dialog";

interface SignersPageProps {
  params: Promise<{ projectId: string }>;
}

export default function SignersPage({ params }: SignersPageProps) {
  const { projectId } = use(params);
  const { data: signersResponse, isLoading } = useSigners(projectId);
  const [isAddOpen, setIsAddOpen] = useState(false);

  const signers = signersResponse?.data ?? [];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Signers</h2>
          <p className="text-muted-foreground">
            Manage signer keys for this project — signers work across all chains (testnet &amp; mainnet)
          </p>
        </div>
        <Button onClick={() => setIsAddOpen(true)}>
          <Plus className="mr-2 h-4 w-4" />
          Add Signer
        </Button>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-14 w-full rounded-lg" />
          ))}
        </div>
      ) : (
        <SignerTable projectId={projectId} signers={signers} />
      )}

      <AddSignerDialog
        projectId={projectId}
        open={isAddOpen}
        onOpenChange={setIsAddOpen}
      />
    </div>
  );
}

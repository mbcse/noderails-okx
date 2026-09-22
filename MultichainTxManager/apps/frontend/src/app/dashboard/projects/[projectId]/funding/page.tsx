"use client";

import * as React from "react";
import { use } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Save, RotateCcw, Wallet } from "lucide-react";
import { apiClient } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";

interface FundingOverridesPageProps {
  params: Promise<{ projectId: string }>;
}

export default function FundingOverridesPage({ params }: FundingOverridesPageProps) {
  const { projectId } = use(params);
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ["funding-config", projectId],
    queryFn: () => apiClient.fundingConfig.get(projectId),
  });

  const updateMutation = useMutation({
    mutationFn: ({
      chainDbId,
      minBalanceEth,
      fundAmountEth,
    }: {
      chainDbId: string;
      minBalanceEth?: string | null;
      fundAmountEth?: string | null;
    }) => apiClient.fundingConfig.updateChain(projectId, chainDbId, { minBalanceEth, fundAmountEth }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["funding-config", projectId] });
      toast.success("Chain funding override saved");
    },
    onError: (err: Error) => {
      toast.error(`Failed to save override: ${err.message}`);
    },
  });

  const config = data?.data;

  if (isLoading || !config) {
    return <p className="text-sm text-muted-foreground">Loading funding overrides...</p>;
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Funding Overrides</h1>
        <p className="text-muted-foreground">
          Set per-chain auto-funding thresholds and amounts for this project. Values are entered in native units.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Wallet className="h-5 w-5" />
            Global Defaults (from Settings)
          </CardTitle>
          <CardDescription>
            These values are used when a chain override is not configured.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          {config.globalByChainType ? (
            <>
              {config.globalByChainType.EVM && (
                <div>
                  <Label>Min Balance (EVM • {config.globalByChainType.EVM.nativeCurrency})</Label>
                  <Input value={config.globalByChainType.EVM.minBalance} readOnly />
                </div>
              )}
              {config.globalByChainType.EVM && (
                <div>
                  <Label>Fund Amount (EVM • {config.globalByChainType.EVM.nativeCurrency})</Label>
                  <Input value={config.globalByChainType.EVM.fundAmount} readOnly />
                </div>
              )}
              {config.globalByChainType.SOLANA && (
                <div>
                  <Label>Min Balance (SOLANA • {config.globalByChainType.SOLANA.nativeCurrency})</Label>
                  <Input value={config.globalByChainType.SOLANA.minBalance} readOnly />
                </div>
              )}
              {config.globalByChainType.SOLANA && (
                <div>
                  <Label>Fund Amount (SOLANA • {config.globalByChainType.SOLANA.nativeCurrency})</Label>
                  <Input value={config.globalByChainType.SOLANA.fundAmount} readOnly />
                </div>
              )}
              {config.globalByChainType.SUI && (
                <div>
                  <Label>Min Balance (SUI • {config.globalByChainType.SUI.nativeCurrency})</Label>
                  <Input value={config.globalByChainType.SUI.minBalance} readOnly />
                </div>
              )}
              {config.globalByChainType.SUI && (
                <div>
                  <Label>Fund Amount (SUI • {config.globalByChainType.SUI.nativeCurrency})</Label>
                  <Input value={config.globalByChainType.SUI.fundAmount} readOnly />
                </div>
              )}
            </>
          ) : (
            <>
              <div>
                <Label>Min Balance</Label>
                <Input value={config.global.minBalanceEth} readOnly />
              </div>
              <div>
                <Label>Fund Amount</Label>
                <Input value={config.global.fundAmountEth} readOnly />
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <div className="space-y-4">
        {config.chains.map((chain) => (
          <ChainOverrideCard
            key={chain.chainDbId}
            chain={chain}
            isSaving={updateMutation.isPending}
            onSave={(payload) =>
              updateMutation.mutate({
                chainDbId: chain.chainDbId,
                minBalanceEth: payload.minBalanceEth,
                fundAmountEth: payload.fundAmountEth,
              })
            }
          />
        ))}
      </div>
    </div>
  );
}

function ChainOverrideCard({
  chain,
  onSave,
  isSaving,
}: {
  chain: {
    chainDbId: string;
    chainName: string;
    chainId: number;
    nativeCurrency: string;
    isTestnet: boolean;
    hasOverride: boolean;
    override: { minBalanceEth: string | null; fundAmountEth: string | null };
    effective: { minBalanceEth: string; fundAmountEth: string };
  };
  onSave: (payload: { minBalanceEth: string | null; fundAmountEth: string | null }) => void;
  isSaving: boolean;
}) {
  const initialMin = chain.override.minBalanceEth ?? "";
  const initialAmount = chain.override.fundAmountEth ?? "";

  const [minBalanceEth, setMinBalanceEth] = React.useState(initialMin);
  const [fundAmountEth, setFundAmountEth] = React.useState(initialAmount);

  const dirty = minBalanceEth !== initialMin || fundAmountEth !== initialAmount;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-2">
          <div>
            <CardTitle className="text-base">{chain.chainName}</CardTitle>
            <CardDescription>
              Chain ID: {chain.chainId} • Currency: {chain.nativeCurrency}
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            {chain.isTestnet && <Badge variant="outline">testnet</Badge>}
            {chain.hasOverride ? (
              <Badge>Override Active</Badge>
            ) : (
              <Badge variant="secondary">Using Global</Badge>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label>Min Balance Override ({chain.nativeCurrency})</Label>
            <Input
              value={minBalanceEth}
              onChange={(e) => setMinBalanceEth(e.target.value)}
              placeholder={chain.effective.minBalanceEth}
            />
            <p className="text-xs text-muted-foreground">
              Leave empty to use global default ({chain.effective.minBalanceEth}).
            </p>
          </div>

          <div className="space-y-1.5">
            <Label>Fund Amount Override ({chain.nativeCurrency})</Label>
            <Input
              value={fundAmountEth}
              onChange={(e) => setFundAmountEth(e.target.value)}
              placeholder={chain.effective.fundAmountEth}
            />
            <p className="text-xs text-muted-foreground">
              Leave empty to use global default ({chain.effective.fundAmountEth}).
            </p>
          </div>
        </div>

        <Separator />

        <div className="flex justify-end gap-2">
          <Button
            variant="outline"
            onClick={() => {
              setMinBalanceEth(initialMin);
              setFundAmountEth(initialAmount);
            }}
            disabled={!dirty || isSaving}
          >
            <RotateCcw className="mr-2 h-4 w-4" />
            Reset
          </Button>
          <Button
            onClick={() =>
              onSave({
                minBalanceEth: minBalanceEth.trim() === "" ? null : minBalanceEth.trim(),
                fundAmountEth: fundAmountEth.trim() === "" ? null : fundAmountEth.trim(),
              })
            }
            disabled={!dirty || isSaving}
          >
            <Save className="mr-2 h-4 w-4" />
            Save Override
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

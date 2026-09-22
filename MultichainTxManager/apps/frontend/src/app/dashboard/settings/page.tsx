"use client";

import { useState } from "react";
import { ethers } from "ethers";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/lib/api-client";
import type { Setting } from "@mtxm/shared";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import {
  Zap,
  Clock,
  AlertTriangle,
  Globe,
  Wallet,
  Save,
  RotateCcw,
  Settings as SettingsIcon,
} from "lucide-react";

// ── Category metadata ───────────────────────────────────────

const CATEGORY_META: Record<
  string,
  { label: string; description: string; icon: React.ElementType }
> = {
  queue: {
    label: "Queue & Workers",
    description: "Control concurrency, retry attempts, and backoff delays for BullMQ job processing",
    icon: Zap,
  },
  confirmation: {
    label: "Transaction Confirmation",
    description: "Configure receipt polling intervals, max attempts, and early stuck detection",
    icon: Clock,
  },
  "stuck-resolver": {
    label: "Stuck Resolver",
    description: "Tune the stuck transaction scanner, gas bumps, and auto-cancel thresholds",
    icon: AlertTriangle,
  },
  rpc: {
    label: "RPC Manager",
    description: "Adjust RPC call timeouts and unhealthy endpoint recovery times",
    icon: Globe,
  },
  funding: {
    label: "Auto-Funding",
    description: "Configure automatic funding of low-balance signer wallets from the master wallet",
    icon: Wallet,
  },
};

const CATEGORY_ORDER = ["queue", "confirmation", "stuck-resolver", "rpc", "funding"];
const FUNDING_EVM_WEI_KEYS = new Set(["funding.minBalanceWei", "funding.fundAmountWei"]);
const FUNDING_SOLANA_LAMPORTS_KEYS = new Set([
  "funding.solana.minBalanceLamports",
  "funding.solana.fundAmountLamports",
]);
const FUNDING_SUI_MIST_KEYS = new Set([
  "funding.sui.minBalanceMist",
  "funding.sui.fundAmountMist",
]);

function formatWeiAsEth(valueWei: string): string {
  try {
    return ethers.formatEther(BigInt(valueWei));
  } catch {
    return "0";
  }
}

function parseEthToWei(valueEth: string): string {
  return ethers.parseEther(valueEth.trim()).toString();
}

function formatLamportsAsSol(valueLamports: string): string {
  try {
    const lamports = BigInt(valueLamports);
    const whole = lamports / 10n ** 9n;
    const frac = lamports % 10n ** 9n;
    if (frac === 0n) return whole.toString();
    const fracStr = frac.toString().padStart(9, "0").replace(/0+$/, "");
    return `${whole.toString()}.${fracStr}`;
  } catch {
    return "0";
  }
}

function parseSolToLamports(valueSol: string): string {
  const raw = valueSol.trim();
  if (raw === "") return "0";
  if (!/^\d+(\.\d+)?$/.test(raw)) {
    throw new Error("Invalid SOL amount");
  }
  const [whole = "0", frac = ""] = raw.split(".");
  if (frac.length > 9) {
    throw new Error("SOL supports up to 9 decimal places");
  }
  const padded = frac.padEnd(9, "0");
  return (BigInt(whole) * 10n ** 9n + BigInt(padded || "0")).toString();
}

function formatMistAsSui(valueMist: string): string {
  try {
    const mist = BigInt(valueMist);
    const whole = mist / 10n ** 9n;
    const frac = mist % 10n ** 9n;
    if (frac === 0n) return whole.toString();
    const fracStr = frac.toString().padStart(9, "0").replace(/0+$/, "");
    return `${whole.toString()}.${fracStr}`;
  } catch {
    return "0";
  }
}

function parseSuiToMist(valueSui: string): string {
  const raw = valueSui.trim();
  if (raw === "") return "0";
  if (!/^\d+(\.\d+)?$/.test(raw)) {
    throw new Error("Invalid SUI amount");
  }
  const [whole = "0", frac = ""] = raw.split(".");
  if (frac.length > 9) {
    throw new Error("SUI supports up to 9 decimal places");
  }
  const padded = frac.padEnd(9, "0");
  return (BigInt(whole) * 10n ** 9n + BigInt(padded || "0")).toString();
}

export default function SettingsPage() {
  const queryClient = useQueryClient();
  const [editedValues, setEditedValues] = useState<Record<string, string>>({});

  const { data: settingsResponse, isLoading } = useQuery({
    queryKey: ["settings"],
    queryFn: () => apiClient.settings.list(),
  });

  const updateMutation = useMutation({
    mutationFn: ({ key, value }: { key: string; value: string }) =>
      apiClient.settings.update(key, value),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ["settings"] });
      setEditedValues((prev) => {
        const next = { ...prev };
        delete next[variables.key];
        return next;
      });
      toast.success(`"${variables.key}" has been saved.`);
    },
    onError: (err: Error) => {
      toast.error(`Failed to update: ${err.message}`);
    },
  });

  const settings = settingsResponse?.data ?? [];

  // Group by category
  const grouped = CATEGORY_ORDER.map((category) => ({
    category,
    meta: CATEGORY_META[category] ?? {
      label: category,
      description: "",
      icon: SettingsIcon,
    },
    settings: settings.filter((s) => s.category === category),
  })).filter((g) => g.settings.length > 0);

  const hasChanges = Object.keys(editedValues).length > 0;

  function handleChange(key: string, value: string) {
    setEditedValues((prev) => ({ ...prev, [key]: value }));
  }

  function handleReset(key: string) {
    setEditedValues((prev) => {
      const next = { ...prev };
      delete next[key];
      return next;
    });
  }

  function handleSave(key: string) {
    const value = editedValues[key];
    if (value !== undefined) {
      let payloadValue = value;
      if (FUNDING_EVM_WEI_KEYS.has(key)) {
        try {
          payloadValue = parseEthToWei(value);
        } catch {
          toast.error("Invalid ETH amount");
          return;
        }
      } else if (FUNDING_SOLANA_LAMPORTS_KEYS.has(key)) {
        try {
          payloadValue = parseSolToLamports(value);
        } catch {
          toast.error("Invalid SOL amount");
          return;
        }
      } else if (FUNDING_SUI_MIST_KEYS.has(key)) {
        try {
          payloadValue = parseSuiToMist(value);
        } catch {
          toast.error("Invalid SUI amount");
          return;
        }
      }
      updateMutation.mutate({ key, value: payloadValue });
    }
  }

  function handleSaveAll() {
    for (const [key, value] of Object.entries(editedValues)) {
      let payloadValue = value;
      if (FUNDING_EVM_WEI_KEYS.has(key)) {
        try {
          payloadValue = parseEthToWei(value);
        } catch {
          toast.error(`Invalid ETH amount for ${key}`);
          return;
        }
      } else if (FUNDING_SOLANA_LAMPORTS_KEYS.has(key)) {
        try {
          payloadValue = parseSolToLamports(value);
        } catch {
          toast.error(`Invalid SOL amount for ${key}`);
          return;
        }
      } else if (FUNDING_SUI_MIST_KEYS.has(key)) {
        try {
          payloadValue = parseSuiToMist(value);
        } catch {
          toast.error(`Invalid SUI amount for ${key}`);
          return;
        }
      }
      updateMutation.mutate({ key, value: payloadValue });
    }
  }

  function renderSettingInput(setting: Setting) {
    const baseValue = FUNDING_EVM_WEI_KEYS.has(setting.key)
      ? formatWeiAsEth(setting.value)
      : FUNDING_SOLANA_LAMPORTS_KEYS.has(setting.key)
        ? formatLamportsAsSol(setting.value)
        : FUNDING_SUI_MIST_KEYS.has(setting.key)
          ? formatMistAsSui(setting.value)
          : setting.value;
    const currentValue = editedValues[setting.key] ?? baseValue;
    const isEdited = editedValues[setting.key] !== undefined;

    if (setting.dataType === "boolean") {
      return (
        <div className="flex items-center justify-between">
          <div className="space-y-0.5">
            <Label className="text-sm font-medium">{setting.label}</Label>
            {setting.description && (
              <p className="text-xs text-muted-foreground">{setting.description}</p>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Switch
              checked={currentValue === "true"}
              onCheckedChange={(checked) => handleChange(setting.key, String(checked))}
            />
            {isEdited && (
              <Button size="sm" variant="outline" onClick={() => handleSave(setting.key)}>
                <Save className="mr-1 h-3 w-3" /> Save
              </Button>
            )}
          </div>
        </div>
      );
    }

    return (
      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <Label htmlFor={setting.key} className="text-sm font-medium">
            {setting.label}
          </Label>
          <div className="flex items-center gap-1">
            {isEdited && (
              <>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => handleReset(setting.key)}
                  className="h-7 px-2"
                >
                  <RotateCcw className="h-3 w-3" />
                </Button>
                <Button
                  size="sm"
                  onClick={() => handleSave(setting.key)}
                  className="h-7 px-2"
                  disabled={updateMutation.isPending}
                >
                  <Save className="mr-1 h-3 w-3" /> Save
                </Button>
              </>
            )}
          </div>
        </div>
        <Input
          id={setting.key}
          type={setting.dataType === "number" ? "number" : "text"}
          value={currentValue}
          onChange={(e) => handleChange(setting.key, e.target.value)}
          className={isEdited ? "border-primary" : ""}
        />
        {setting.description && (
          <p className="text-xs text-muted-foreground">{setting.description}</p>
        )}
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Settings</h1>
          <p className="text-muted-foreground">Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Settings</h1>
          <p className="text-muted-foreground">
            Configure queue workers, polling intervals, RPC timeouts, and auto-funding
          </p>
        </div>
        {hasChanges && (
          <Button onClick={handleSaveAll} disabled={updateMutation.isPending}>
            <Save className="mr-2 h-4 w-4" />
            Save All Changes
            <Badge variant="secondary" className="ml-2">
              {Object.keys(editedValues).length}
            </Badge>
          </Button>
        )}
      </div>

      {/* Setting Groups */}
      {grouped.map(({ category, meta, settings: groupSettings }) => {
        const Icon = meta.icon;
        return (
          <Card key={category}>
            <CardHeader>
              <div className="flex items-center gap-2">
                <Icon className="h-5 w-5 text-muted-foreground" />
                <CardTitle className="text-lg">{meta.label}</CardTitle>
              </div>
              <CardDescription>{meta.description}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {groupSettings.map((setting, idx) => (
                <div key={setting.key}>
                  {idx > 0 && <Separator className="mb-6" />}
                  {renderSettingInput(setting)}
                </div>
              ))}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}

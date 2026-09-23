"use client";

import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { settingsApi } from "@/lib/api";
import { toast } from "sonner";
import {
  Settings,
  Save,
  Zap,
  Bell,
  ListTodo,
  RotateCcw,
  Info,
  Timer,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface SettingItem {
  key: string;
  value: string;
  type: string;
  label: string;
  description: string;
}

const CATEGORY_META: Record<
  string,
  { label: string; description: string; icon: React.ReactNode }
> = {
  indexer: {
    label: "Noderails Indexer",
    description:
      "Controls how Noderails Indexer fetches and processes blockchain events",
    icon: <Zap className="h-5 w-5" />,
  },
  eventProcessor: {
    label: "Event Processing",
    description: "BullMQ worker settings for decoding and storing events",
    icon: <ListTodo className="h-5 w-5" />,
  },
  webhook: {
    label: "Webhook Delivery",
    description:
      "Controls how webhooks are dispatched to your endpoints",
    icon: <Bell className="h-5 w-5" />,
  },
  queue: {
    label: "Queue Configuration",
    description:
      "BullMQ queue defaults for retries, backoff, and job retention",
    icon: <ListTodo className="h-5 w-5" />,
  },
  retention: {
    label: "Data Retention",
    description:
      "Controls how long full event data is kept before compacting to traces",
    icon: <Timer className="h-5 w-5" />,
  },
};

const CATEGORY_ORDER = ["indexer", "eventProcessor", "webhook", "queue", "retention"];

export default function SettingsPage() {
  const queryClient = useQueryClient();
  const [editedValues, setEditedValues] = useState<Record<string, string>>({});
  const [originalValues, setOriginalValues] = useState<Record<string, string>>(
    {}
  );

  const { data, isLoading } = useQuery({
    queryKey: ["settings"],
    queryFn: () => settingsApi.getAll(),
  });

  const settings: Record<string, SettingItem[]> = data?.data?.data || {};

  // Initialize original values when data loads
  useEffect(() => {
    if (Object.keys(settings).length > 0) {
      const orig: Record<string, string> = {};
      for (const items of Object.values(settings)) {
        for (const item of items) {
          orig[item.key] = item.value;
        }
      }
      setOriginalValues(orig);
      setEditedValues(orig);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data]);

  const updateMutation = useMutation({
    mutationFn: (updates: Record<string, string>) =>
      settingsApi.update(updates),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ["settings"] });
      toast.success(res?.data?.message || "Settings saved");
    },
    onError: (error: unknown) => {
      const err = error as { response?: { data?: { error?: string } } };
      toast.error(err.response?.data?.error || "Failed to save settings");
    },
  });

  const handleChange = (key: string, value: string) => {
    setEditedValues((prev) => ({ ...prev, [key]: value }));
  };

  const handleSave = () => {
    // Only send changed values
    const changed: Record<string, string> = {};
    for (const [key, value] of Object.entries(editedValues)) {
      if (value !== originalValues[key]) {
        changed[key] = value;
      }
    }
    if (Object.keys(changed).length === 0) {
      toast.info("No changes to save");
      return;
    }
    updateMutation.mutate(changed);
  };

  const handleReset = () => {
    setEditedValues({ ...originalValues });
    toast.info("Changes reverted");
  };

  const hasChanges = Object.entries(editedValues).some(
    ([key, val]) => val !== originalValues[key]
  );

  const changedCount = Object.entries(editedValues).filter(
    ([key, val]) => val !== originalValues[key]
  ).length;

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Settings</h1>
          <p className="text-muted-foreground">
            Configure platform settings
          </p>
        </div>
        {[1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-48 w-full" />
        ))}
      </div>
    );
  }

  const sortedCategories = CATEGORY_ORDER.filter(
    (cat) => settings[cat]
  ).concat(
    Object.keys(settings).filter((cat) => !CATEGORY_ORDER.includes(cat))
  );

  return (
    <TooltipProvider>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
              <Settings className="h-8 w-8" />
              Platform Settings
            </h1>
            <p className="text-muted-foreground">
              Configure Noderails Indexer, webhook, and queue behavior. Some changes
              require a server restart.
            </p>
          </div>
          <div className="flex items-center gap-2">
            {hasChanges && (
              <Badge variant="secondary" className="mr-2">
                {changedCount} unsaved change{changedCount !== 1 ? "s" : ""}
              </Badge>
            )}
            <Button
              variant="outline"
              onClick={handleReset}
              disabled={!hasChanges}
            >
              <RotateCcw className="mr-2 h-4 w-4" />
              Revert
            </Button>
            <Button
              onClick={handleSave}
              disabled={!hasChanges || updateMutation.isPending}
            >
              <Save className="mr-2 h-4 w-4" />
              {updateMutation.isPending ? "Saving..." : "Save Changes"}
            </Button>
          </div>
        </div>

        {sortedCategories.map((category) => {
          const meta = CATEGORY_META[category] || {
            label: category,
            description: "",
            icon: <Settings className="h-5 w-5" />,
          };
          const items = settings[category] || [];

          return (
            <Card key={category}>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  {meta.icon}
                  {meta.label}
                </CardTitle>
                <CardDescription>{meta.description}</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
                  {items.map((item) => {
                    const isChanged =
                      editedValues[item.key] !== originalValues[item.key];
                    return (
                      <div key={item.key} className="space-y-2">
                        <div className="flex items-center gap-1.5">
                          <Label
                            htmlFor={item.key}
                            className={isChanged ? "text-primary font-semibold" : ""}
                          >
                            {item.label}
                          </Label>
                          {isChanged && (
                            <Badge
                              variant="outline"
                              className="text-[10px] px-1 py-0"
                            >
                              changed
                            </Badge>
                          )}
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Info className="h-3.5 w-3.5 text-muted-foreground cursor-help" />
                            </TooltipTrigger>
                            <TooltipContent
                              side="top"
                              className="max-w-xs text-sm"
                            >
                              <p>{item.description}</p>
                              <p className="mt-1 text-xs text-muted-foreground font-mono">
                                {item.key}
                              </p>
                            </TooltipContent>
                          </Tooltip>
                        </div>
                        <Input
                          id={item.key}
                          type={item.type === "number" ? "number" : "text"}
                          value={editedValues[item.key] ?? item.value}
                          onChange={(e) =>
                            handleChange(item.key, e.target.value)
                          }
                          className={
                            isChanged
                              ? "border-primary ring-1 ring-primary/30"
                              : ""
                          }
                        />
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          );
        })}

        <Card className="border-dashed">
          <CardContent className="py-4">
            <p className="text-sm text-muted-foreground text-center">
              ⚡ Settings marked with &quot;Requires restart&quot; (concurrency
              values) take effect when the server next starts. All other settings
              take effect immediately on the next indexing loop or webhook
              delivery.
            </p>
          </CardContent>
        </Card>
      </div>
    </TooltipProvider>
  );
}

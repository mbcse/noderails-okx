import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/lib/api-client";
import type {
  CreateWebhookInput,
  UpdateWebhookInput,
  WebhookDeliveryFilters,
} from "@mtxm/shared";

export const webhookKeys = {
  list: (projectId: string) => ["webhooks", projectId] as const,
  detail: (projectId: string, webhookId: string) =>
    ["webhooks", projectId, webhookId] as const,
  deliveries: (projectId: string, webhookId: string) =>
    ["webhooks", projectId, webhookId, "deliveries"] as const,
};

// ── Queries ─────────────────────────────────────────────────

export function useWebhooks(projectId: string) {
  return useQuery({
    queryKey: webhookKeys.list(projectId),
    queryFn: () => apiClient.webhooks.list(projectId),
    enabled: !!projectId,
  });
}

export function useWebhook(projectId: string, webhookId: string | null) {
  return useQuery({
    queryKey: webhookKeys.detail(projectId, webhookId ?? ""),
    queryFn: () => apiClient.webhooks.getById(projectId, webhookId!),
    enabled: !!projectId && !!webhookId,
  });
}

export function useWebhookDeliveries(
  projectId: string,
  webhookId: string,
  filters?: WebhookDeliveryFilters,
) {
  return useQuery({
    queryKey: [...webhookKeys.deliveries(projectId, webhookId), filters],
    queryFn: () => apiClient.webhooks.deliveries(projectId, webhookId, filters),
    enabled: !!projectId && !!webhookId,
  });
}

// ── Mutations ───────────────────────────────────────────────

export function useCreateWebhook(projectId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: CreateWebhookInput) => apiClient.webhooks.create(projectId, data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: webhookKeys.list(projectId) }),
  });
}

export function useUpdateWebhook(projectId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ webhookId, data }: { webhookId: string; data: UpdateWebhookInput }) =>
      apiClient.webhooks.update(projectId, webhookId, data),
    onSuccess: (_, { webhookId }) => {
      queryClient.invalidateQueries({ queryKey: webhookKeys.list(projectId) });
      queryClient.invalidateQueries({ queryKey: webhookKeys.detail(projectId, webhookId) });
    },
  });
}

export function useDeleteWebhook(projectId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (webhookId: string) => apiClient.webhooks.delete(projectId, webhookId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: webhookKeys.list(projectId) }),
  });
}

export function useTestWebhook(projectId: string) {
  return useMutation({
    mutationFn: (webhookId: string) => apiClient.webhooks.test(projectId, webhookId),
  });
}

export function useRotateWebhookSecret(projectId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (webhookId: string) => apiClient.webhooks.rotateSecret(projectId, webhookId),
    onSuccess: (_, webhookId) => {
      queryClient.invalidateQueries({ queryKey: webhookKeys.list(projectId) });
      queryClient.invalidateQueries({ queryKey: webhookKeys.detail(projectId, webhookId) });
    },
  });
}

export function useRetryWebhookDelivery(projectId: string, webhookId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (deliveryId: string) =>
      apiClient.webhooks.retryDelivery(projectId, webhookId, deliveryId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: webhookKeys.deliveries(projectId, webhookId) });
    },
  });
}

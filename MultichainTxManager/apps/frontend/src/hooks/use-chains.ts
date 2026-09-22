import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/lib/api-client";
import type { CreateChainInput, UpdateChainInput } from "@mtxm/shared";

export const chainKeys = {
  list: (projectId: string) => ["chains", projectId] as const,
};

export function useChains(projectId: string) {
  return useQuery({
    queryKey: chainKeys.list(projectId),
    queryFn: () => apiClient.chains.list(projectId),
    enabled: !!projectId,
  });
}

export function useCreateChain(projectId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: CreateChainInput) => apiClient.chains.create(projectId, data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: chainKeys.list(projectId) }),
  });
}

export function useUpdateChain(projectId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ chainId, data }: { chainId: string; data: UpdateChainInput }) =>
      apiClient.chains.update(projectId, chainId, data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: chainKeys.list(projectId) }),
  });
}

export function useDeleteChain(projectId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (chainId: string) => apiClient.chains.delete(projectId, chainId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: chainKeys.list(projectId) }),
  });
}

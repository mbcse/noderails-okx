import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/lib/api-client";
import type { CreateSignerKeyInput, UpdateSignerKeyInput } from "@mtxm/shared";

export const signerKeys = {
  list: (projectId: string) => ["signers", projectId] as const,
  detail: (projectId: string, signerId: string) => ["signers", projectId, signerId, "detail"] as const,
};

export function useSignerDetail(projectId: string, signerId: string | null) {
  return useQuery({
    queryKey: signerKeys.detail(projectId, signerId ?? ""),
    queryFn: () => apiClient.signers.getDetail(projectId, signerId!),
    enabled: !!projectId && !!signerId,
  });
}

export function useSigners(projectId: string) {
  return useQuery({
    queryKey: signerKeys.list(projectId),
    queryFn: () => apiClient.signers.list(projectId),
    enabled: !!projectId,
  });
}

export function useCreateSigner(projectId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: CreateSignerKeyInput) => apiClient.signers.create(projectId, data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: signerKeys.list(projectId) }),
  });
}

export function useUpdateSigner(projectId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ signerId, data }: { signerId: string; data: UpdateSignerKeyInput }) =>
      apiClient.signers.update(projectId, signerId, data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: signerKeys.list(projectId) }),
  });
}

export function useDeactivateSigner(projectId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (signerId: string) => apiClient.signers.deactivate(projectId, signerId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: signerKeys.list(projectId) }),
  });
}

export function useActivateSigner(projectId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (signerId: string) => apiClient.signers.activate(projectId, signerId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: signerKeys.list(projectId) }),
  });
}

export function useSetMaster(projectId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (signerId: string) => apiClient.signers.setMaster(projectId, signerId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: signerKeys.list(projectId) }),
  });
}

export function useUnsetMaster(projectId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (signerId: string) => apiClient.signers.unsetMaster(projectId, signerId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: signerKeys.list(projectId) }),
  });
}

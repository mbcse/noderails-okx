import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/lib/api-client";
import type { SendTransactionInput, SignTypedDataInput, TransactionFilters } from "@mtxm/shared";

export const transactionKeys = {
  list: (projectId: string, filters?: TransactionFilters) =>
    ["transactions", projectId, filters] as const,
  detail: (projectId: string, txId: string) =>
    ["transactions", projectId, txId] as const,
};

export function useTransactions(projectId: string, filters?: TransactionFilters) {
  return useQuery({
    queryKey: transactionKeys.list(projectId, filters),
    queryFn: () => apiClient.transactions.list(projectId, filters),
    enabled: !!projectId,
    refetchInterval: 10_000, // auto-refresh every 10s to catch status changes
  });
}

export function useTransaction(projectId: string, txId: string) {
  return useQuery({
    queryKey: transactionKeys.detail(projectId, txId),
    queryFn: () => apiClient.transactions.get(projectId, txId),
    enabled: !!projectId && !!txId,
    refetchInterval: 5_000,
  });
}

export function useSendTransaction(projectId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: SendTransactionInput) => apiClient.transactions.send(projectId, data),
    onSuccess: () =>
      queryClient.invalidateQueries({
        queryKey: ["transactions", projectId],
      }),
  });
}

export function useSignTypedData(projectId: string) {
  return useMutation({
    mutationFn: (data: SignTypedDataInput) => apiClient.transactions.signTypedData(projectId, data),
  });
}

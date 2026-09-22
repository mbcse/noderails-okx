import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/lib/api-client";
import type { CreateProjectInput, UpdateProjectInput } from "@mtxm/shared";

// ── Query keys ──────────────────────────────────────────────

export const projectKeys = {
  all:    ["projects"] as const,
  detail: (id: string) => ["projects", id] as const,
};

// ── Queries ─────────────────────────────────────────────────

export function useProjects() {
  return useQuery({
    queryKey: projectKeys.all,
    queryFn: () => apiClient.projects.list(),
  });
}

export function useProject(projectId: string) {
  return useQuery({
    queryKey: projectKeys.detail(projectId),
    queryFn: () => apiClient.projects.get(projectId),
    enabled: !!projectId,
  });
}

// ── Mutations ───────────────────────────────────────────────

export function useCreateProject() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: CreateProjectInput) => apiClient.projects.create(data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: projectKeys.all }),
  });
}

export function useUpdateProject(projectId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: UpdateProjectInput) => apiClient.projects.update(projectId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: projectKeys.all });
      queryClient.invalidateQueries({ queryKey: projectKeys.detail(projectId) });
    },
  });
}

export function useDeleteProject() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiClient.projects.delete(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: projectKeys.all }),
  });
}

export function useRegenerateApiKey(projectId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => apiClient.projects.regenerateApiKey(projectId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: projectKeys.detail(projectId) }),
  });
}

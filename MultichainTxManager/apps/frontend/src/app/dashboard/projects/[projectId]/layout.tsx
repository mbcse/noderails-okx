"use client";

import { use } from "react";
import { useProject } from "@/hooks/use-projects";
import { ProjectNav } from "@/components/layout/project-nav";
import { Skeleton } from "@/components/ui/skeleton";

interface ProjectLayoutProps {
  children: React.ReactNode;
  params: Promise<{ projectId: string }>;
}

export default function ProjectLayout({ children, params }: ProjectLayoutProps) {
  const { projectId } = use(params);
  const { data: projectResponse, isLoading } = useProject(projectId);

  const projectName = projectResponse?.data?.name ?? "Loading…";

  return (
    <div className="flex h-full -m-6">
      {/* ── Project sub-nav ─────────────────────────────────── */}
      {isLoading ? (
        <aside className="flex w-56 flex-col gap-4 border-r p-4">
          <Skeleton className="h-6 w-28" />
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-8 w-full" />
          ))}
        </aside>
      ) : (
        <ProjectNav projectId={projectId} projectName={projectName} />
      )}

      {/* ── Content area ────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto p-6">{children}</div>
    </div>
  );
}

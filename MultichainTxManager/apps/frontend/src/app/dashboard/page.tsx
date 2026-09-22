"use client";

import { useState } from "react";
import Link from "next/link";
import { Plus, MoreHorizontal, Trash2, Pencil, FolderKanban } from "lucide-react";
import { useProjects, useCreateProject, useDeleteProject } from "@/hooks/use-projects";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { CreateProjectDialog } from "@/components/projects/create-project-dialog";
import type { Project } from "@mtxm/shared";

export default function DashboardPage() {
  const { data: projectsResponse, isLoading } = useProjects();
  const deleteProject = useDeleteProject();
  const [isCreateOpen, setIsCreateOpen] = useState(false);

  const projects = projectsResponse?.data ?? [];

  return (
    <div className="space-y-6">
      {/* ── Page header ──────────────────────────────────────── */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Projects</h2>
          <p className="text-muted-foreground">
            Manage your multichain transaction projects
          </p>
        </div>
        <Button onClick={() => setIsCreateOpen(true)}>
          <Plus className="mr-2 h-4 w-4" />
          New Project
        </Button>
      </div>

      {/* ── Loading skeleton ─────────────────────────────────── */}
      {isLoading && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Card key={i}>
              <CardHeader>
                <Skeleton className="h-5 w-32" />
                <Skeleton className="h-4 w-48" />
              </CardHeader>
              <CardContent>
                <Skeleton className="h-4 w-full" />
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* ── Empty state ──────────────────────────────────────── */}
      {!isLoading && projects.length === 0 && (
        <Card className="flex flex-col items-center justify-center py-16">
          <FolderKanban className="h-12 w-12 text-muted-foreground/50" />
          <h3 className="mt-4 text-lg font-semibold">No projects yet</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            Create your first project to start managing transactions
          </p>
          <Button className="mt-6" onClick={() => setIsCreateOpen(true)}>
            <Plus className="mr-2 h-4 w-4" />
            Create Project
          </Button>
        </Card>
      )}

      {/* ── Project cards ────────────────────────────────────── */}
      {!isLoading && projects.length > 0 && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {projects.map((project) => (
            <ProjectCard
              key={project.id}
              project={project}
              onDelete={() => deleteProject.mutate(project.id)}
            />
          ))}
        </div>
      )}

      <CreateProjectDialog open={isCreateOpen} onOpenChange={setIsCreateOpen} />
    </div>
  );
}

// ────────────────────────────────────────────────────────────
// Project card sub-component
// ────────────────────────────────────────────────────────────

function ProjectCard({
  project,
  onDelete,
}: {
  project: Project;
  onDelete: () => void;
}) {
  const counts = project._count;

  return (
    <Card className="group relative transition-colors hover:border-foreground/20">
      <Link href={`/dashboard/projects/${project.id}`} className="absolute inset-0 z-0" />

      <CardHeader className="flex flex-row items-start justify-between space-y-0">
        <div className="space-y-1">
          <CardTitle className="text-base">{project.name}</CardTitle>
          {project.description && (
            <CardDescription className="line-clamp-2">{project.description}</CardDescription>
          )}
        </div>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="relative z-10 h-8 w-8">
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem asChild>
              <Link href={`/dashboard/projects/${project.id}`}>
                <Pencil className="mr-2 h-4 w-4" />
                Open
              </Link>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem className="text-destructive" onClick={onDelete}>
              <Trash2 className="mr-2 h-4 w-4" />
              Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </CardHeader>

      <CardContent>
        <div className="flex flex-wrap gap-2">
          <Badge variant="secondary">{counts?.chains ?? 0} Chains</Badge>
          <Badge variant="secondary">{counts?.signerKeys ?? 0} Signers</Badge>
          <Badge variant="secondary">{counts?.transactions ?? 0} TXs</Badge>
        </div>

        <div className="mt-3 flex items-center gap-2">
          <span
            className={`h-2 w-2 rounded-full ${project.isActive ? "bg-emerald-500" : "bg-zinc-500"}`}
          />
          <span className="text-xs text-muted-foreground">
            {project.isActive ? "Active" : "Inactive"}
          </span>
        </div>
      </CardContent>
    </Card>
  );
}

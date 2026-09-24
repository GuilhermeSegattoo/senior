"use client";

import { useEffect, useState } from "react";
import {
  fetchProjects,
  type Project,
} from "@/lib/api";
import { ProjectCard } from "@/components/ProjectCard";
import { NewProjectPanel } from "@/components/NewProjectPanel";

type LoadState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; projects: Project[] };

async function loadProjects(): Promise<LoadState> {
  try {
    const projects =
      await fetchProjects();

    return {
      status: "ready",
      projects,
    };
  } catch (error) {
    return {
      status: "error",
      message:
        error instanceof Error
          ? error.message
          : "Não foi possível carregar os projetos.",
    };
  }
}

export default function Home() {
  const [state, setState] =
    useState<LoadState>({
      status: "loading",
    });

  const [formOpen, setFormOpen] =
    useState(false);

  useEffect(() => {
    let cancelled = false;

    loadProjects().then((next) => {
      if (!cancelled) {
        setState(next);
      }
    });

    return () => {
      cancelled = true;
    };
  }, []);

  async function handleCreated() {
    setFormOpen(false);
    setState({ status: "loading" });
    setState(await loadProjects());
  }

  return (
    <div className="mx-auto max-w-6xl px-6 py-12">
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="font-display text-2xl font-medium tracking-tight text-paper">
            Projetos
          </h1>

          <p className="mt-1 text-sm text-mute">
            Tudo que o Senior está
            gerenciando.
          </p>
        </div>

        <button
          type="button"
          onClick={() =>
            setFormOpen((open) => !open)
          }
          className="rounded-md border border-line bg-panel px-4 py-2 font-mono text-xs uppercase tracking-wider text-paper transition-colors hover:border-signal hover:text-signal"
        >
          {formOpen
            ? "cancelar"
            : "+ novo projeto"}
        </button>
      </div>

      {formOpen && (
        <NewProjectPanel
          onCreated={handleCreated}
        />
      )}

      {state.status === "loading" && (
        <p className="font-mono text-sm text-mute">
          carregando…
        </p>
      )}

      {state.status === "error" && (
        <div className="rounded-lg border border-danger/40 bg-panel p-5">
          <p className="text-sm text-paper">
            Não foi possível conectar
            ao gateway do Senior.
          </p>

          <p className="mt-1 font-mono text-xs text-mute">
            {state.message} — confira se
            `senior gateway start` está
            rodando.
          </p>
        </div>
      )}

      {state.status === "ready" &&
        state.projects.length ===
          0 && (
          <div className="rounded-lg border border-dashed border-line p-10 text-center">
            <p className="text-sm text-paper">
              Nenhum projeto ainda.
            </p>

            <p className="mt-1 text-sm text-mute">
              Crie o primeiro objetivo
              que o Senior vai
              gerenciar.
            </p>
          </div>
        )}

      {state.status === "ready" &&
        state.projects.length > 0 && (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {state.projects.map(
              (project) => (
                <ProjectCard
                  key={project.id}
                  project={project}
                />
              )
            )}
          </div>
        )}
    </div>
  );
}

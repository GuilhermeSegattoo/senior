"use client";

import { useEffect, useState } from "react";
import {
  createProject,
  fetchProjects,
  type Project,
} from "@/lib/api";
import { ProjectCard } from "@/components/ProjectCard";

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

  const [name, setName] =
    useState("");

  const [submitting, setSubmitting] =
    useState(false);

  const [formError, setFormError] =
    useState<string | null>(null);

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

  async function handleCreate(
    event: React.FormEvent
  ) {
    event.preventDefault();

    const trimmed = name.trim();

    if (!trimmed) {
      setFormError(
        "Dê um nome ao projeto."
      );

      return;
    }

    setSubmitting(true);
    setFormError(null);

    try {
      await createProject(trimmed);
      setName("");
      setFormOpen(false);
      setState({
        status: "loading",
      });
      setState(
        await loadProjects()
      );
    } catch (error) {
      setFormError(
        error instanceof Error
          ? error.message
          : "Não foi possível criar o projeto."
      );
    } finally {
      setSubmitting(false);
    }
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
        <form
          onSubmit={handleCreate}
          className="mb-8 flex flex-col gap-3 rounded-lg border border-line bg-panel-raised p-5 sm:flex-row sm:items-end"
        >
          <div className="flex-1">
            <label
              htmlFor="project-name"
              className="mb-1.5 block font-mono text-[11px] uppercase tracking-wider text-mute"
            >
              Nome do projeto
            </label>

            <input
              id="project-name"
              type="text"
              value={name}
              onChange={(event) =>
                setName(
                  event.target.value
                )
              }
              placeholder="ex: Thumdra"
              autoFocus
              className="w-full rounded-md border border-line bg-ink px-3 py-2 text-sm text-paper outline-none placeholder:text-mute focus:border-signal"
            />

            {formError && (
              <p className="mt-2 text-xs text-danger">
                {formError}
              </p>
            )}
          </div>

          <button
            type="submit"
            disabled={submitting}
            className="rounded-md bg-signal px-4 py-2 text-sm font-medium text-ink transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            {submitting
              ? "criando…"
              : "Criar"}
          </button>
        </form>
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

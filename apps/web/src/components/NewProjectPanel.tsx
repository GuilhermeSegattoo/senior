"use client";

import { useState } from "react";
import {
  createProject,
  importGithubProject,
  importLocalProject,
} from "@/lib/api";
import { FolderBrowserModal } from "@/components/FolderBrowserModal";

type Mode = "empty" | "local" | "github";

const MODE_LABEL: Record<
  Mode,
  string
> = {
  empty: "novo vazio",
  local: "pasta local",
  github: "github",
};

export function NewProjectPanel({
  onCreated,
}: {
  onCreated: () => void;
}) {
  const [mode, setMode] =
    useState<Mode>("empty");

  const [name, setName] =
    useState("");

  const [githubUrl, setGithubUrl] =
    useState("");

  const [
    selectedPath,
    setSelectedPath,
  ] = useState<string | null>(
    null
  );

  const [browserOpen, setBrowserOpen] =
    useState(false);

  const [submitting, setSubmitting] =
    useState(false);

  const [error, setError] =
    useState<string | null>(null);

  function reset() {
    setName("");
    setGithubUrl("");
    setSelectedPath(null);
  }

  async function handleSubmit(
    event: React.FormEvent
  ) {
    event.preventDefault();
    setError(null);

    try {
      if (mode === "empty") {
        const trimmed = name.trim();

        if (!trimmed) {
          setError(
            "Dê um nome ao projeto."
          );

          return;
        }

        setSubmitting(true);
        await createProject(
          trimmed
        );
      } else if (mode === "local") {
        if (!selectedPath) {
          setError(
            "Escolha uma pasta."
          );

          return;
        }

        setSubmitting(true);
        await importLocalProject(
          selectedPath,
          name.trim() ||
            undefined
        );
      } else {
        const trimmedUrl =
          githubUrl.trim();

        if (!trimmedUrl) {
          setError(
            "Cole a URL do repositório."
          );

          return;
        }

        setSubmitting(true);
        await importGithubProject(
          trimmedUrl,
          name.trim() ||
            undefined
        );
      }

      reset();
      onCreated();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Não foi possível criar o projeto."
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="mb-8 rounded-lg border border-line bg-panel-raised p-5">
      <div className="mb-4 flex gap-1 rounded-md bg-ink p-1">
        {(
          [
            "empty",
            "local",
            "github",
          ] as Mode[]
        ).map((option) => (
          <button
            key={option}
            type="button"
            onClick={() => {
              setMode(option);
              setError(null);
            }}
            className={`flex-1 rounded px-3 py-1.5 font-mono text-xs uppercase tracking-wider transition-colors ${
              mode === option
                ? "bg-panel text-signal"
                : "text-mute hover:text-paper"
            }`}
          >
            {MODE_LABEL[option]}
          </button>
        ))}
      </div>

      <form
        onSubmit={handleSubmit}
        className="flex flex-col gap-3"
      >
        {mode === "empty" && (
          <div>
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
                  event.target
                    .value
                )
              }
              placeholder="ex: Thumdra"
              autoFocus
              className="w-full rounded-md border border-line bg-ink px-3 py-2 text-sm text-paper outline-none placeholder:text-mute focus:border-signal"
            />
          </div>
        )}

        {mode === "local" && (
          <>
            <div>
              <span className="mb-1.5 block font-mono text-[11px] uppercase tracking-wider text-mute">
                Pasta
              </span>

              <button
                type="button"
                onClick={() =>
                  setBrowserOpen(
                    true
                  )
                }
                className="w-full truncate rounded-md border border-line bg-ink px-3 py-2 text-left text-sm text-paper hover:border-signal"
              >
                {selectedPath ??
                  "Escolher pasta…"}
              </button>
            </div>

            <div>
              <label
                htmlFor="project-name-local"
                className="mb-1.5 block font-mono text-[11px] uppercase tracking-wider text-mute"
              >
                Nome (opcional)
              </label>

              <input
                id="project-name-local"
                type="text"
                value={name}
                onChange={(event) =>
                  setName(
                    event.target
                      .value
                  )
                }
                placeholder="usa o nome da pasta se vazio"
                className="w-full rounded-md border border-line bg-ink px-3 py-2 text-sm text-paper outline-none placeholder:text-mute focus:border-signal"
              />
            </div>
          </>
        )}

        {mode === "github" && (
          <>
            <div>
              <label
                htmlFor="github-url"
                className="mb-1.5 block font-mono text-[11px] uppercase tracking-wider text-mute"
              >
                URL do repositório
              </label>

              <input
                id="github-url"
                type="text"
                value={githubUrl}
                onChange={(event) =>
                  setGithubUrl(
                    event.target
                      .value
                  )
                }
                placeholder="https://github.com/owner/repo"
                autoFocus
                className="w-full rounded-md border border-line bg-ink px-3 py-2 font-mono text-sm text-paper outline-none placeholder:text-mute focus:border-signal"
              />
            </div>

            <div>
              <label
                htmlFor="project-name-github"
                className="mb-1.5 block font-mono text-[11px] uppercase tracking-wider text-mute"
              >
                Nome (opcional)
              </label>

              <input
                id="project-name-github"
                type="text"
                value={name}
                onChange={(event) =>
                  setName(
                    event.target
                      .value
                  )
                }
                placeholder="usa o nome do repositório se vazio"
                className="w-full rounded-md border border-line bg-ink px-3 py-2 text-sm text-paper outline-none placeholder:text-mute focus:border-signal"
              />
            </div>
          </>
        )}

        {error && (
          <p className="text-xs text-danger">
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={submitting}
          className="self-end rounded-md bg-signal px-4 py-2 text-sm font-medium text-ink transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          {submitting
            ? "criando…"
            : mode === "empty"
              ? "Criar"
              : "Importar"}
        </button>
      </form>

      {browserOpen && (
        <FolderBrowserModal
          onSelect={(path) => {
            setSelectedPath(path);
            setBrowserOpen(false);
          }}
          onClose={() =>
            setBrowserOpen(false)
          }
        />
      )}
    </div>
  );
}

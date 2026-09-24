"use client";

import { useState } from "react";
import {
  correctTaskApi,
  executeTaskApi,
  type ManagedTask,
  type Provider,
} from "@/lib/api";

const AGENT_LABEL: Record<
  string,
  string
> = {
  architect: "ARQUITETO",
  frontend: "FRONTEND",
  backend: "BACKEND",
  reviewer: "REVISOR",
  qa: "QA",
  devops: "DEVOPS",
};

const PROVIDERS: {
  value: Provider;
  label: string;
}[] = [
  { value: "codex", label: "Codex" },
  {
    value: "claude",
    label: "Claude",
  },
  { value: "pi", label: "Pi" },
];

export function TaskDetailPanel({
  projectId,
  task,
  onClose,
  onChanged,
}: {
  projectId: string;
  task: ManagedTask;
  onClose: () => void;
  onChanged: () => void;
}) {
  const [provider, setProvider] =
    useState<Provider>("codex");

  const [model, setModel] =
    useState("");

  const [running, setRunning] =
    useState(false);

  const [error, setError] =
    useState<string | null>(null);

  const canDispatch =
    task.status === "READY" ||
    task.status ===
      "CORRECTION_REQUIRED";

  async function handleDispatch() {
    setRunning(true);
    setError(null);

    try {
      const selection = {
        provider,
        model:
          model.trim() ||
          undefined,
      };

      if (
        task.status ===
        "CORRECTION_REQUIRED"
      ) {
        await correctTaskApi(
          projectId,
          task.id,
          selection
        );
      } else {
        await executeTaskApi(
          projectId,
          task.id,
          selection
        );
      }

      onChanged();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Não foi possível disparar a tarefa."
      );
    } finally {
      setRunning(false);
    }
  }

  return (
    <div className="fixed inset-y-0 right-0 z-40 flex w-96 flex-col border-l border-line bg-panel-raised">
      <div className="flex items-center justify-between border-b border-line px-5 py-4">
        <div>
          <p className="font-mono text-[11px] uppercase tracking-wider text-mute">
            {AGENT_LABEL[
              task.agent
            ] ??
              task.agent.toUpperCase()}
          </p>

          <p className="font-mono text-sm text-paper">
            {task.id}
          </p>
        </div>

        <button
          type="button"
          onClick={onClose}
          className="text-mute hover:text-paper"
          aria-label="Fechar"
        >
          ✕
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-5 py-4">
        <p className="mb-1 font-mono text-[11px] uppercase tracking-wider text-mute">
          Tarefa
        </p>

        <p className="mb-4 text-sm text-paper">
          {task.task}
        </p>

        <p className="mb-1 font-mono text-[11px] uppercase tracking-wider text-mute">
          Status
        </p>

        <p className="mb-4 text-sm text-paper">
          {task.status}
        </p>

        {task.dependsOn.length >
          0 && (
          <>
            <p className="mb-1 font-mono text-[11px] uppercase tracking-wider text-mute">
              Depende de
            </p>

            <p className="mb-4 font-mono text-xs text-paper">
              {task.dependsOn.join(
                ", "
              )}
            </p>
          </>
        )}

        {task.commit && (
          <>
            <p className="mb-1 font-mono text-[11px] uppercase tracking-wider text-mute">
              Commit
            </p>

            <p className="mb-4 font-mono text-xs text-paper">
              {task.commit}
            </p>
          </>
        )}

        {task.result && (
          <>
            <p className="mb-1 font-mono text-[11px] uppercase tracking-wider text-mute">
              Resultado relatado
            </p>

            <p className="mb-4 whitespace-pre-wrap text-xs text-paper/80">
              {task.result}
            </p>
          </>
        )}

        {task.error && (
          <>
            <p className="mb-1 font-mono text-[11px] uppercase tracking-wider text-danger">
              Erro
            </p>

            <p className="mb-4 whitespace-pre-wrap text-xs text-danger">
              {task.error}
            </p>
          </>
        )}
      </div>

      {canDispatch && (
        <div className="border-t border-line px-5 py-4">
          <p className="mb-1.5 font-mono text-[11px] uppercase tracking-wider text-mute">
            Provedor
          </p>

          <select
            value={provider}
            onChange={(event) =>
              setProvider(
                event.target
                  .value as Provider
              )
            }
            className="mb-3 w-full rounded-md border border-line bg-ink px-3 py-2 text-sm text-paper outline-none focus:border-signal"
          >
            {PROVIDERS.map(
              (option) => (
                <option
                  key={
                    option.value
                  }
                  value={
                    option.value
                  }
                >
                  {option.label}
                </option>
              )
            )}
          </select>

          <p className="mb-1.5 font-mono text-[11px] uppercase tracking-wider text-mute">
            Modelo (opcional)
          </p>

          <input
            type="text"
            value={model}
            onChange={(event) =>
              setModel(
                event.target.value
              )
            }
            placeholder="usa o padrão do provedor"
            className="mb-3 w-full rounded-md border border-line bg-ink px-3 py-2 font-mono text-xs text-paper outline-none placeholder:text-mute focus:border-signal"
          />

          {error && (
            <p className="mb-3 text-xs text-danger">
              {error}
            </p>
          )}

          <button
            type="button"
            onClick={
              handleDispatch
            }
            disabled={running}
            className="w-full rounded-md bg-signal px-4 py-2 text-sm font-medium text-ink transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            {running
              ? "executando…"
              : task.status ===
                  "CORRECTION_REQUIRED"
                ? "Corrigir"
                : "Executar"}
          </button>
        </div>
      )}
    </div>
  );
}

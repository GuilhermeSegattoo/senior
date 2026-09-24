"use client";

import { useEffect, useState } from "react";
import {
  browseFilesystem,
  type FilesystemBrowseResult,
} from "@/lib/api";

export function FolderBrowserModal({
  onSelect,
  onClose,
}: {
  onSelect: (path: string) => void;
  onClose: () => void;
}) {
  const [result, setResult] =
    useState<FilesystemBrowseResult | null>(
      null
    );

  const [error, setError] =
    useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    browseFilesystem()
      .then((data) => {
        if (!cancelled)
          setResult(data);
      })
      .catch((err) => {
        if (!cancelled) {
          setError(
            err instanceof Error
              ? err.message
              : "Não foi possível listar pastas."
          );
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  async function goTo(
    targetPath: string
  ) {
    setError(null);

    try {
      const data =
        await browseFilesystem(
          targetPath
        );

      setResult(data);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Não foi possível abrir esta pasta."
      );
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink/80 p-4"
      onClick={onClose}
    >
      <div
        className="flex max-h-[70vh] w-full max-w-lg flex-col rounded-lg border border-line bg-panel-raised"
        onClick={(event) =>
          event.stopPropagation()
        }
      >
        <div className="border-b border-line px-4 py-3">
          <p className="font-mono text-[11px] uppercase tracking-wider text-mute">
            pasta atual
          </p>

          <p className="mt-1 truncate font-mono text-sm text-paper">
            {result?.path ?? "…"}
          </p>
        </div>

        <div className="flex-1 overflow-y-auto p-2">
          {error && (
            <p className="p-3 text-sm text-danger">
              {error}
            </p>
          )}

          {!error && !result && (
            <p className="p-3 font-mono text-sm text-mute">
              carregando…
            </p>
          )}

          {result?.parent && (
            <button
              type="button"
              onClick={() =>
                goTo(result.parent!)
              }
              className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm text-mute hover:bg-panel"
            >
              .. (voltar)
            </button>
          )}

          {result?.directories.map(
            (entry) => (
              <button
                key={entry.path}
                type="button"
                onClick={() =>
                  goTo(entry.path)
                }
                className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm text-paper hover:bg-panel"
              >
                <span className="text-mute">
                  ▸
                </span>

                {entry.name}
              </button>
            )
          )}

          {result &&
            result.directories
              .length === 0 && (
              <p className="p-3 font-mono text-sm text-mute">
                nenhuma subpasta aqui
              </p>
            )}
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-line px-4 py-3">
          <button
            type="button"
            onClick={onClose}
            className="rounded-md px-3 py-2 font-mono text-xs uppercase tracking-wider text-mute hover:text-paper"
          >
            cancelar
          </button>

          <button
            type="button"
            disabled={!result}
            onClick={() =>
              result &&
              onSelect(result.path)
            }
            className="rounded-md bg-signal px-4 py-2 text-sm font-medium text-ink transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            Selecionar esta pasta
          </button>
        </div>
      </div>
    </div>
  );
}

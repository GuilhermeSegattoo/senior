import {
  lstat,
  readdir,
  readFile,
  realpath,
} from "node:fs/promises";

import path from "node:path";

import { WorkspaceGuard } from "./WorkspaceGuard.js";

export interface SearchMatch {
  path: string;
  line: number;
  text: string;
}

export interface SearchProjectFilesResult {
  matches: SearchMatch[];
  truncated: boolean;
}

const MAX_MATCHES = 200;
const MAX_FILE_BYTES = 1024 * 1024;

/*
 * Busca de texto sem shell: evita depender de grep/rg instalado ou
 * de passar a query do modelo direto para um shell. A varredura
 * segue as mesmas exclusões do ListProjectFilesTool.
 */
export class SearchProjectFilesTool {
  private readonly guard: WorkspaceGuard;

  private readonly ignoredDirectories =
    new Set([
      ".git",
      "node_modules",
      ".next",
      "dist",
      "build",
      "coverage",
    ]);

  constructor(
    workspace: string
  ) {
    this.guard =
      new WorkspaceGuard(workspace);
  }

  async execute(
    query: string,
    options?: {
      path?: string;
      caseSensitive?: boolean;
    }
  ): Promise<SearchProjectFilesResult> {
    if (!query.trim()) {
      throw new Error(
        "Termo de busca vazio não é permitido."
      );
    }

    const root =
      options?.path &&
      options.path !== "."
        ? await this.guard.resolveExisting(
            options.path
          )
        : await realpath(
            this.guard.root
          );

    const needle =
      options?.caseSensitive
        ? query
        : query.toLowerCase();

    const matches: SearchMatch[] =
      [];

    let truncated = false;

    const walk = async (
      directory: string
    ): Promise<void> => {
      if (truncated) {
        return;
      }

      const entries =
        await readdir(directory, {
          withFileTypes: true,
        });

      for (const entry of entries) {
        if (truncated) {
          return;
        }

        if (
          this.ignoredDirectories.has(
            entry.name
          )
        ) {
          continue;
        }

        if (entry.isSymbolicLink()) {
          continue;
        }

        const absolute =
          path.join(
            directory,
            entry.name
          );

        if (entry.isDirectory()) {
          await walk(absolute);
          continue;
        }

        if (!entry.isFile()) {
          continue;
        }

        const info =
          await lstat(absolute);

        if (
          info.size >
          MAX_FILE_BYTES
        ) {
          continue;
        }

        let content: string;

        try {
          content =
            await readFile(
              absolute,
              "utf8"
            );
        } catch {
          // Arquivo binário ou ilegível como texto: ignora.
          continue;
        }

        const relative =
          path.relative(
            this.guard.root,
            absolute
          );

        const lines =
          content.split("\n");

        for (
          let index = 0;
          index < lines.length;
          index++
        ) {
          const line =
            lines[index];

          const haystack =
            options?.caseSensitive
              ? line
              : line.toLowerCase();

          if (
            haystack.includes(
              needle
            )
          ) {
            matches.push({
              path: relative,
              line: index + 1,
              text: line.trim().slice(
                0,
                300
              ),
            });

            if (
              matches.length >=
              MAX_MATCHES
            ) {
              truncated = true;
              return;
            }
          }
        }
      }
    };

    await walk(root);

    return {
      matches,
      truncated,
    };
  }
}

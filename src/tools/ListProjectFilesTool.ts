import {
  lstat,
  readdir,
  realpath,
} from "node:fs/promises";

import path from "node:path";

import { WorkspaceGuard } from "./WorkspaceGuard.js";

export interface ListProjectFilesResult {
  files: string[];
  total: number;
  truncated: boolean;
}

export class ListProjectFilesTool {
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

  constructor(workspace: string) {
    this.guard =
      new WorkspaceGuard(workspace);
  }

  async execute(
    requestedPath = "."
  ): Promise<ListProjectFilesResult> {
    const maxFiles = 500;

    const root =
      requestedPath === "."
        ? await realpath(
            this.guard.root
          )
        : await this.guard.resolveExisting(
            requestedPath
          );

    const rootInfo =
      await lstat(root);

    if (!rootInfo.isDirectory()) {
      throw new Error(
        `Não é um diretório: ${requestedPath}`
      );
    }

    const files: string[] = [];

    let truncated = false;

    const walk = async (
      directory: string
    ): Promise<void> => {
      if (
        files.length >= maxFiles
      ) {
        truncated = true;
        return;
      }

      const entries =
        await readdir(directory, {
          withFileTypes: true,
        });

      entries.sort((a, b) =>
        a.name.localeCompare(b.name)
      );

      for (const entry of entries) {
        if (
          files.length >= maxFiles
        ) {
          truncated = true;
          return;
        }

        if (
          this.ignoredDirectories.has(
            entry.name
          )
        ) {
          continue;
        }

        const absolute =
          path.join(
            directory,
            entry.name
          );

        if (entry.isSymbolicLink()) {
          continue;
        }

        if (entry.isDirectory()) {
          await walk(absolute);
          continue;
        }

        if (!entry.isFile()) {
          continue;
        }

        const relative =
          path.relative(
            this.guard.root,
            absolute
          );

        files.push(relative);
      }
    };

    await walk(root);

    return {
      files,
      total: files.length,
      truncated,
    };
  }
}

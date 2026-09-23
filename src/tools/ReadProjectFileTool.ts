import { readFile, stat } from "node:fs/promises";

import { WorkspaceGuard } from "./WorkspaceGuard.js";

export interface ReadProjectFileResult {
  path: string;
  content: string;
  bytes: number;
}

export class ReadProjectFileTool {
  private readonly guard: WorkspaceGuard;

  constructor(workspace: string) {
    this.guard = new WorkspaceGuard(workspace);
  }

  async execute(
    requestedPath: string
  ): Promise<ReadProjectFileResult> {
    const resolved =
      await this.guard.resolveExisting(requestedPath);

    const info = await stat(resolved);

    if (!info.isFile()) {
      throw new Error(
        `Não é um arquivo: ${requestedPath}`
      );
    }

    const maxBytes = 1024 * 1024;

    if (info.size > maxBytes) {
      throw new Error(
        `Arquivo excede o limite de ${maxBytes} bytes: ${requestedPath}`
      );
    }

    const content =
      await readFile(resolved, "utf8");

    return {
      path: requestedPath,
      content,
      bytes: info.size,
    };
  }
}

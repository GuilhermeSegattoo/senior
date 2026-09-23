import { lstat, realpath, writeFile } from "node:fs/promises";
import path from "node:path";

import { WorkspaceGuard } from "./WorkspaceGuard.js";

export interface WriteProjectFileResult {
  path: string;
  bytes: number;
}

export class WriteProjectFileTool {
  private readonly guard: WorkspaceGuard;

  constructor(workspace: string) {
    this.guard = new WorkspaceGuard(workspace);
  }

  async execute(
    requestedPath: string,
    content: string
  ): Promise<WriteProjectFileResult> {
    const maxBytes = 1024 * 1024;
    const bytes = Buffer.byteLength(content, "utf8");

    if (bytes > maxBytes) {
      throw new Error(
        `Conteúdo excede o limite de ${maxBytes} bytes.`
      );
    }

    const resolved = this.guard.resolve(requestedPath);
    const parent = path.dirname(resolved);

    const realWorkspace = await realpath(this.guard.root);
    const realParent = await realpath(parent);

    const relative = path.relative(
      realWorkspace,
      realParent
    );

    if (
      relative === ".." ||
      relative.startsWith(`..${path.sep}`) ||
      path.isAbsolute(relative)
    ) {
      throw new Error(
        `Diretório fora do workspace bloqueado: ${requestedPath}`
      );
    }

    try {
      const targetInfo = await lstat(resolved);

      if (targetInfo.isSymbolicLink()) {
        throw new Error(
          `Escrita em symlink bloqueada: ${requestedPath}`
        );
      }

      if (!targetInfo.isFile()) {
        throw new Error(
          `Destino não é um arquivo: ${requestedPath}`
        );
      }
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;

      if (code !== "ENOENT") {
        throw error;
      }
    }

    const safeTarget = path.join(
      realParent,
      path.basename(resolved)
    );

    await writeFile(safeTarget, content, "utf8");

    return {
      path: requestedPath,
      bytes,
    };
  }
}

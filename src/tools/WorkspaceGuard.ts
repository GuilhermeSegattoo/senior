import path from "node:path";
import {
  realpath,
} from "node:fs/promises";

export class WorkspaceGuard {
  private readonly workspace: string;

  constructor(workspace: string) {
    this.workspace =
      path.resolve(workspace);
  }

  get root(): string {
    return this.workspace;
  }

  resolve(
    requestedPath: string
  ): string {
    if (
      !requestedPath ||
      !requestedPath.trim()
    ) {
      throw new Error(
        "Caminho vazio não é permitido."
      );
    }

    if (
      path.isAbsolute(requestedPath)
    ) {
      throw new Error(
        "Caminhos absolutos não são permitidos."
      );
    }

    const resolved =
      path.resolve(
        this.workspace,
        requestedPath
      );

    this.assertInside(
      resolved,
      requestedPath
    );

    return resolved;
  }

  async resolveExisting(
    requestedPath: string
  ): Promise<string> {
    const resolved =
      this.resolve(requestedPath);

    const [
      realWorkspace,
      realTarget,
    ] = await Promise.all([
      realpath(this.workspace),
      realpath(resolved),
    ]);

    const relative =
      path.relative(
        realWorkspace,
        realTarget
      );

    if (
      relative === ".." ||
      relative.startsWith(
        `..${path.sep}`
      ) ||
      path.isAbsolute(relative)
    ) {
      throw new Error(
        `Symlink fora do workspace bloqueado: ${requestedPath}`
      );
    }

    return realTarget;
  }

  private assertInside(
    resolved: string,
    requestedPath: string
  ): void {
    const relative =
      path.relative(
        this.workspace,
        resolved
      );

    if (
      relative === ".." ||
      relative.startsWith(
        `..${path.sep}`
      ) ||
      path.isAbsolute(relative)
    ) {
      throw new Error(
        `Acesso fora do workspace bloqueado: ${requestedPath}`
      );
    }
  }
}

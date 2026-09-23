import { execFile } from "node:child_process";
import { promisify } from "node:util";
import path from "node:path";

import { WorkspaceGuard } from "./WorkspaceGuard.js";

const execFileAsync =
  promisify(execFile);

export interface GitDiffResult {
  diff: string;
  truncated: boolean;
}

const MAX_DIFF_CHARS = 50_000;

/*
 * git diff contra HEAD, opcionalmente restrito a um caminho do
 * workspace. O caminho passa pelo WorkspaceGuard antes de virar
 * argumento do git — nunca aceitamos o caminho bruto do modelo.
 */
export class GitDiffTool {
  private readonly guard: WorkspaceGuard;

  constructor(
    private readonly workspace: string
  ) {
    this.guard =
      new WorkspaceGuard(workspace);
  }

  async execute(
    requestedPath?: string
  ): Promise<GitDiffResult> {
    const args = [
      "diff",
      "HEAD",
      "--",
    ];

    if (requestedPath) {
      const resolved =
        this.guard.resolve(
          requestedPath
        );

      const relative =
        path.relative(
          this.guard.root,
          resolved
        );

      args.push(relative);
    }

    const { stdout } =
      await execFileAsync(
        "git",
        args,
        {
          cwd: this.workspace,
          timeout: 15_000,
          maxBuffer:
            10 * 1024 * 1024,
        }
      );

    const truncated =
      stdout.length >
      MAX_DIFF_CHARS;

    return {
      diff: truncated
        ? stdout.slice(
            0,
            MAX_DIFF_CHARS
          )
        : stdout,
      truncated,
    };
  }
}

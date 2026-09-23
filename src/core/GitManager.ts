import {
  mkdir,
  access,
} from "node:fs/promises";

import path from "node:path";

import {
  execFile,
} from "node:child_process";

import {
  promisify,
} from "node:util";

const execFileAsync =
  promisify(execFile);

export interface TaskWorkspace {
  projectId: string;
  taskId: string;
  branch: string;
  path: string;
  baseCommit: string;
  dependencyCommits: string[];
}

export interface TaskCommit {
  commit: string | null;
  changed: boolean;
  status: string;
  headCommit: string;
}

export class GitManager {
  private worktreesRoot = path.join(
    process.cwd(),
    "data",
    "worktrees"
  );

  // =========================================================
  // GIT
  // =========================================================

  private async git(
    cwd: string,
    args: string[]
  ): Promise<string> {
    const { stdout } =
      await execFileAsync(
        "git",
        args,
        {
          cwd,
          timeout: 30_000,
        }
      );

    return stdout.trim();
  }

  // =========================================================
  // REPOSITÓRIO
  // =========================================================

  async isRepository(
    projectPath: string
  ): Promise<boolean> {
    try {
      const result =
        await this.git(
          projectPath,
          [
            "rev-parse",
            "--is-inside-work-tree",
          ]
        );

      return result === "true";
    } catch {
      return false;
    }
  }

  async ensureRepository(
    projectPath: string
  ): Promise<void> {
    const exists =
      await this.isRepository(
        projectPath
      );

    if (!exists) {
      await this.git(
        projectPath,
        [
          "init",
          "-b",
          "main",
        ]
      );
    }

    await this.ensureInitialCommit(
      projectPath
    );
  }

  private async ensureInitialCommit(
    projectPath: string
  ): Promise<void> {
    try {
      await this.git(
        projectPath,
        [
          "rev-parse",
          "--verify",
          "HEAD",
        ]
      );

      return;
    } catch {
      // Primeiro commit ainda não existe.
    }

    try {
      await this.git(
        projectPath,
        [
          "config",
          "user.name",
        ]
      );
    } catch {
      await this.git(
        projectPath,
        [
          "config",
          "user.name",
          "JARVIS",
        ]
      );
    }

    try {
      await this.git(
        projectPath,
        [
          "config",
          "user.email",
        ]
      );
    } catch {
      await this.git(
        projectPath,
        [
          "config",
          "user.email",
          "jarvis@local",
        ]
      );
    }

    await this.git(
      projectPath,
      [
        "commit",
        "--allow-empty",
        "-m",
        "chore: initialize project",
      ]
    );
  }

  // =========================================================
  // HEAD
  // =========================================================

  async getHeadCommit(
    workspacePath: string
  ): Promise<string> {
    return this.git(
      workspacePath,
      [
        "rev-parse",
        "HEAD",
      ]
    );
  }

  // =========================================================
  // HELPERS
  // =========================================================

  private getTaskWorkspacePath(
    projectId: string,
    taskId: string
  ): string {
    return path.join(
      this.worktreesRoot,
      projectId,
      taskId
    );
  }

  private async pathExists(
    targetPath: string
  ): Promise<boolean> {
    try {
      await access(targetPath);
      return true;
    } catch {
      return false;
    }
  }

  private async branchExists(
    projectPath: string,
    branch: string
  ): Promise<boolean> {
    try {
      await this.git(
        projectPath,
        [
          "show-ref",
          "--verify",
          "--quiet",
          `refs/heads/${branch}`,
        ]
      );

      return true;
    } catch {
      return false;
    }
  }

  // =========================================================
  // WORKSPACE DA TAREFA
  // =========================================================

  async prepareTaskWorkspace(
    projectId: string,
    projectPath: string,
    taskId: string,
    dependencyCommits: string[] = []
  ): Promise<TaskWorkspace> {
    await this.ensureRepository(
      projectPath
    );

    const uniqueDependencyCommits = [
      ...new Set(
        dependencyCommits.filter(
          Boolean
        )
      ),
    ];

    const branch =
      `jarvis/${taskId}`;

    const workspacePath =
      this.getTaskWorkspacePath(
        projectId,
        taskId
      );

    const baseCommit =
      uniqueDependencyCommits[0] ??
      await this.getHeadCommit(
        projectPath
      );

    await mkdir(
      path.dirname(
        workspacePath
      ),
      {
        recursive: true,
      }
    );

    const workspaceExists =
      await this.pathExists(
        workspacePath
      );

    if (workspaceExists) {
      const validWorktree =
        await this.isRepository(
          workspacePath
        );

      if (!validWorktree) {
        throw new Error(
          `O caminho ${workspacePath} já existe, mas não é um worktree Git válido.`
        );
      }

      return {
        projectId,
        taskId,
        branch,
        path: workspacePath,
        baseCommit,
        dependencyCommits:
          uniqueDependencyCommits,
      };
    }

    const branchExists =
      await this.branchExists(
        projectPath,
        branch
      );

    if (branchExists) {
      await this.git(
        projectPath,
        [
          "worktree",
          "add",
          workspacePath,
          branch,
        ]
      );
    } else {
      await this.git(
        projectPath,
        [
          "worktree",
          "add",
          "-b",
          branch,
          workspacePath,
          baseCommit,
        ]
      );
    }

    // =======================================================
    // INTEGRAR MÚLTIPLAS DEPENDÊNCIAS
    // =======================================================

    const remainingCommits =
      uniqueDependencyCommits.slice(
        1
      );

    for (
      const dependencyCommit
      of remainingCommits
    ) {
      try {
        await this.git(
          workspacePath,
          [
            "merge-base",
            "--is-ancestor",
            dependencyCommit,
            "HEAD",
          ]
        );

        // Já está presente.
        continue;
      } catch {
        // Ainda precisa integrar.
      }

      try {
        await this.git(
          workspacePath,
          [
            "merge",
            "--no-edit",
            dependencyCommit,
          ]
        );
      } catch {
        try {
          await this.git(
            workspacePath,
            [
              "merge",
              "--abort",
            ]
          );
        } catch {
          // Melhor esforço.
        }

        throw new Error(
          `Conflito ao integrar a dependência ${dependencyCommit} para a tarefa ${taskId}. Execução interrompida para revisão humana.`
        );
      }
    }

    return {
      projectId,
      taskId,
      branch,
      path: workspacePath,
      baseCommit,
      dependencyCommits:
        uniqueDependencyCommits,
    };
  }

  // =========================================================
  // ALTERAÇÕES
  // =========================================================

  async getTaskStatus(
    workspacePath: string
  ): Promise<string> {
    return this.git(
      workspacePath,
      [
        "status",
        "--short",
      ]
    );
  }

  async getTaskDiff(
    workspacePath: string
  ): Promise<string> {
    return this.git(
      workspacePath,
      [
        "diff",
        "HEAD",
        "--",
      ]
    );
  }

  // =========================================================
  // COMMIT DA TAREFA
  // =========================================================

  async commitTask(
    workspacePath: string,
    taskId: string
  ): Promise<TaskCommit> {
    const status =
      await this.getTaskStatus(
        workspacePath
      );

    /*
     * Nenhuma alteração.
     *
     * Muito comum para:
     * - Architect
     * - Reviewer
     * - QA somente leitura
     *
     * Mesmo sem novo commit,
     * registramos a HEAD atual.
     */
    if (!status.trim()) {
      const headCommit =
        await this.getHeadCommit(
          workspacePath
        );

      return {
        commit: null,
        changed: false,
        status: "",
        headCommit,
      };
    }

    // =======================================================
    // EXISTEM ALTERAÇÕES
    // =======================================================

    await this.git(
      workspacePath,
      [
        "add",
        "--all",
      ]
    );

    await this.git(
      workspacePath,
      [
        "commit",
        "-m",
        `jarvis: complete ${taskId}`,
      ]
    );

    const commit =
      await this.getHeadCommit(
        workspacePath
      );

    return {
      commit,
      changed: true,
      status,
      headCommit: commit,
    };
  }
}

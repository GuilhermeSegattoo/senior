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

  /*
   * IMPORTANTE: "--is-inside-work-tree" retorna true para
   * QUALQUER diretório dentro da árvore de um repositório
   * ancestral — inclusive quando o próprio SENIOR roda de dentro
   * de um repositório git (ex.: "projects/" nested no repo do
   * SENIOR). Isso fazia projectPath ser tratado como já
   * inicializado e todos os comandos git da tarefa acabavam
   * executando no repositório ERRADO (o ancestral).
   *
   * Por isso comparamos o toplevel real com projectPath: só é
   * "repositório" para nós se projectPath FOR a raiz do repo.
   */
  async isRepository(
    projectPath: string
  ): Promise<boolean> {
    try {
      const topLevel =
        await this.git(
          projectPath,
          [
            "rev-parse",
            "--show-toplevel",
          ]
        );

      return (
        path.resolve(topLevel) ===
        path.resolve(projectPath)
      );
    } catch {
      return false;
    }
  }

  /*
   * Clona um repositório GitHub para uso como projeto do Senior.
   * Usa "git clone" puro (não a CLI "gh") — funciona para repos
   * públicos e para privados quando o git já tem credenciais
   * configuradas (ex.: via credential helper do "gh auth login").
   */
  async cloneRepository(
    url: string,
    destPath: string
  ): Promise<{
    defaultBranch: string;
  }> {
    const parent = path.dirname(
      destPath
    );

    await mkdir(parent, {
      recursive: true,
    });

    await this.git(parent, [
      "clone",
      url,
      path.basename(destPath),
    ]);

    const defaultBranch =
      await this.git(destPath, [
        "rev-parse",
        "--abbrev-ref",
        "HEAD",
      ]);

    return { defaultBranch };
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
          "SENIOR",
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
          "senior@local",
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
      `senior/${taskId}`;

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

  /*
   * Diff real produzido por uma tarefa: da base analisada
   * até o headCommit final. Usado pelo avaliador semântico
   * de critérios de aceite (Validation Loop).
   */
  async getCommitDiff(
    workspacePath: string,
    fromCommit: string,
    toCommit: string
  ): Promise<string> {
    if (fromCommit === toCommit) {
      return "";
    }

    return this.git(
      workspacePath,
      [
        "diff",
        `${fromCommit}..${toCommit}`,
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
        `senior: complete ${taskId}`,
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

import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync =
  promisify(execFile);

export interface GitStatusResult {
  status: string;
  clean: boolean;
}

/*
 * Ferramenta segura: nenhum argumento vem do modelo, o comando é
 * fixo. Evita que o agente precise de shell irrestrito só para
 * saber o que já foi alterado no workspace.
 */
export class GitStatusTool {
  constructor(
    private readonly workspace: string
  ) {}

  async execute(): Promise<GitStatusResult> {
    const { stdout } =
      await execFileAsync(
        "git",
        [
          "status",
          "--short",
        ],
        {
          cwd: this.workspace,
          timeout: 15_000,
        }
      );

    const status =
      stdout.trim();

    return {
      status,
      clean: status.length === 0,
    };
  }
}

import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import path from "node:path";

export type ProjectCheck =
  | "typecheck"
  | "test"
  | "lint"
  | "build";

export interface RunProjectCheckResult {
  check: ProjectCheck;
  command: string;
  exitCode: number;
  success: boolean;
  output: string;
}

export class RunProjectCheckTool {
  constructor(
    private readonly workspace: string
  ) {}

  async execute(
    check: ProjectCheck
  ): Promise<RunProjectCheckResult> {
    const commands: Record<
      ProjectCheck,
      {
        command: string;
        args: string[];
        npmScript?: string;
      }
    > = {
      typecheck: {
        command: "npx",
        args: [
          "--no-install",
          "tsc",
          "--noEmit",
        ],
      },

      test: {
        command: "npm",
        args: ["test"],
        npmScript: "test",
      },

      lint: {
        command: "npm",
        args: [
          "run",
          "lint",
        ],
        npmScript: "lint",
      },

      build: {
        command: "npm",
        args: [
          "run",
          "build",
        ],
        npmScript: "build",
      },
    };

    const selected =
      commands[check];

    if (!selected) {
      throw new Error(
        `Check não permitido: ${check}`
      );
    }

    /*
     * "Checks configurados por projeto": test/lint/build dependem
     * de um script existir no package.json do projeto. Rodar um
     * script inexistente só produz um erro genérico do npm — mais
     * útil reportar isso diretamente como check sem pendências.
     */
    if (
      selected.npmScript &&
      !(await this.isScriptConfigured(
        selected.npmScript
      ))
    ) {
      return {
        check,
        command: `(script "${selected.npmScript}" não configurado em package.json)`,
        exitCode: 0,
        success: true,
        output: `Nenhum script "${selected.npmScript}" configurado no package.json deste projeto. Check considerado sem pendências.`,
      };
    }

    const output =
      await this.run(
        selected.command,
        selected.args
      );

    return {
      check,
      command: [
        selected.command,
        ...selected.args,
      ].join(" "),
      exitCode: output.exitCode,
      success:
        output.exitCode === 0,
      output: output.text,
    };
  }

  private async isScriptConfigured(
    script: string
  ): Promise<boolean> {
    try {
      const raw =
        await readFile(
          path.join(
            this.workspace,
            "package.json"
          ),
          "utf8"
        );

      const pkg =
        JSON.parse(raw) as {
          scripts?: Record<
            string,
            string
          >;
        };

      return Boolean(
        pkg.scripts?.[script]
      );
    } catch {
      return false;
    }
  }

  private async run(
    command: string,
    args: string[]
  ): Promise<{
    exitCode: number;
    text: string;
  }> {
    return new Promise(
      (resolve, reject) => {
        const child = spawn(
          command,
          args,
          {
            cwd: this.workspace,
            shell: false,
            env: {
              ...process.env,
              CI: "true",
            },
          }
        );

        let stdout = "";
        let stderr = "";

        const maxOutput =
          1024 * 1024;

        child.stdout.on(
          "data",
          (data) => {
            stdout +=
              data.toString();

            if (
              stdout.length >
              maxOutput
            ) {
              stdout =
                stdout.slice(
                  -maxOutput
                );
            }
          }
        );

        child.stderr.on(
          "data",
          (data) => {
            stderr +=
              data.toString();

            if (
              stderr.length >
              maxOutput
            ) {
              stderr =
                stderr.slice(
                  -maxOutput
                );
            }
          }
        );

        const timeout =
          setTimeout(() => {
            child.kill("SIGTERM");
          }, 120_000);

        child.on(
          "error",
          (error) => {
            clearTimeout(timeout);
            reject(error);
          }
        );

        child.on(
          "close",
          (code) => {
            clearTimeout(timeout);

            const text = [
              stdout.trim(),
              stderr.trim(),
            ]
              .filter(Boolean)
              .join("\n");

            console.log(
              "\n[SENIOR CHECK DEBUG]"
            );

            console.log(
              `Command: ${command} ${args.join(" ")}`
            );

            console.log(
              `Exit code: ${code ?? 1}`
            );

            console.log(
              "Output:"
            );

            console.log(
              text || "(sem saída)"
            );

            resolve({
              exitCode:
                code ?? 1,
              text,
            });
          }
        );
      }
    );
  }
}

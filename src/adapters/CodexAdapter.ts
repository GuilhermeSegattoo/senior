import {
  execFile,
  spawn,
} from "node:child_process";
import { existsSync } from "node:fs";
import { createInterface } from "node:readline";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync =
  promisify(execFile);

export type CodexSandbox =
  | "read-only"
  | "workspace-write";

export interface CodexAskOptions {
  cwd?: string;
  sandbox?: CodexSandbox;
}

interface CodexCommand {
  command: string;
  prefixArgs: string[];
}

let resolvedCommand: CodexCommand | null =
  null;

/*
 * No Windows, "codex" instalado via "npm install -g" é um shim
 * .cmd — spawn() sem shell não consegue executá-lo diretamente
 * (mesma classe de bug já corrigida em JobManager para "npx"). E
 * diferente de lá, aqui shell:true não é uma opção segura: o prompt
 * do usuário (objetivo digitado no frontend) vira um dos argumentos,
 * e Node não escapa argumentos de forma segura quando shell:true é
 * combinado com um array de args (é exatamente por isso que o
 * Node emite o aviso de depreciação DEP0190 para essa combinação).
 *
 * A saída real: o shim .cmd só existe pra descobrir o caminho do
 * "codex.js" de verdade (um wrapper Node que detecta a plataforma e
 * roda o binário nativo) e invocar esse .js diretamente via
 * "node <caminho>", sem shell nenhum envolvido. Em POSIX o shim já é
 * um script Node executável direto, então isso é só usado no
 * Windows — em outros SOs o comando "codex" original continua igual.
 */
async function resolveCodexCommand(): Promise<CodexCommand> {
  if (resolvedCommand) {
    return resolvedCommand;
  }

  if (process.platform === "win32") {
    try {
      const { stdout } =
        await execFileAsync(
          "where",
          ["codex"]
        );

      const shimPath = stdout
        .split(/\r?\n/)
        .map((line) =>
          line.trim()
        )
        .find((line) =>
          line
            .toLowerCase()
            .endsWith(".cmd")
        );

      if (shimPath) {
        const entry = path.join(
          path.dirname(shimPath),
          "node_modules",
          "@openai",
          "codex",
          "bin",
          "codex.js"
        );

        if (existsSync(entry)) {
          resolvedCommand = {
            command:
              process.execPath,
            prefixArgs: [entry],
          };

          return resolvedCommand;
        }
      }
    } catch {
      // Cai para o fallback abaixo.
    }
  }

  resolvedCommand = {
    command: "codex",
    prefixArgs: [],
  };

  return resolvedCommand;
}

export class CodexAdapter {
  private model = "gpt-6-astra";
  private timeoutMs = 600_000;

  async ask(
    prompt: string,
    options: CodexAskOptions = {}
  ): Promise<string> {
    const {
      command,
      prefixArgs,
    } = await resolveCodexCommand();

    return new Promise((resolve, reject) => {
      const cwd = options.cwd ?? process.cwd();
      const sandbox = options.sandbox ?? "read-only";

      const args = [
        ...prefixArgs,
        "exec",
        "--skip-git-repo-check",
        "--json",
        "--sandbox",
        sandbox,
        "--cd",
        cwd,
        "-c",
        `model="${this.model}"`,
        prompt,
      ];

      const child = spawn(command, args, {
        cwd,
        stdio: ["ignore", "pipe", "pipe"],
      });

      let finalResponse = "";
      let stderr = "";
      let settled = false;

      const rl = createInterface({
        input: child.stdout,
        crlfDelay: Infinity,
      });

      rl.on("line", (line) => {
        if (!line.trim()) return;

        try {
          const event = JSON.parse(line);

          if (
            event.type === "item.completed" &&
            event.item?.type === "agent_message"
          ) {
            const text =
              event.item?.text ??
              event.item?.content ??
              event.item?.message;

            if (typeof text === "string") {
              finalResponse = text;
            }
          }
        } catch {
          // Ignora linhas que não sejam JSON válido.
        }
      });

      child.stderr.on("data", (data) => {
        stderr += data.toString();
      });

      const timeout = setTimeout(() => {
        if (settled) return;

        settled = true;
        child.kill("SIGTERM");

        reject(
          new Error(
            `Codex excedeu o limite de ${
              this.timeoutMs / 1000
            } segundos.`
          )
        );
      }, this.timeoutMs);

      child.on("error", (error) => {
        if (settled) return;

        settled = true;
        clearTimeout(timeout);
        rl.close();

        reject(error);
      });

      child.on("close", (code) => {
        if (settled) return;

        settled = true;
        clearTimeout(timeout);
        rl.close();

        if (code !== 0) {
          reject(
            new Error(
              `Codex terminou com código ${code}.\n${stderr}`
            )
          );
          return;
        }

        if (!finalResponse) {
          reject(
            new Error(
              `Codex terminou, mas nenhuma resposta final foi encontrada.\n${stderr}`
            )
          );
          return;
        }

        resolve(finalResponse.trim());
      });
    });
  }

  async status(): Promise<boolean> {
    const {
      command,
      prefixArgs,
    } = await resolveCodexCommand();

    return new Promise((resolve) => {
      const child = spawn(
        command,
        [...prefixArgs, "--version"],
        {
          stdio: "ignore",
        }
      );

      child.on("error", () => resolve(false));
      child.on("close", (code) => resolve(code === 0));
    });
  }
}

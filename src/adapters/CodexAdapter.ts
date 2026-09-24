import { spawn } from "node:child_process";
import { createInterface } from "node:readline";

import { resolveGlobalCli } from "./resolveGlobalCli.js";

export type CodexSandbox =
  | "read-only"
  | "workspace-write";

export interface CodexAskOptions {
  cwd?: string;
  sandbox?: CodexSandbox;
}

function resolveCodexCommand() {
  return resolveGlobalCli("codex", [
    "node_modules",
    "@openai",
    "codex",
    "bin",
    "codex.js",
  ]);
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

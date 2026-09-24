import { spawn } from "node:child_process";

import { resolveGlobalCli } from "./resolveGlobalCli.js";
import {
  parseClaudeAuthStatus,
  spawnLoginProcess,
  type LoginHandle,
  type ProviderAuthStatus,
} from "./ProviderAuth.js";

/*
 * Diferente do CodexAdapter (API key / conta ChatGPT via "codex
 * login"), este adapter usa a assinatura do Claude já autenticada
 * no CLI "claude" (Claude Code) da máquina — sem chave de API
 * própria do Senior. Se "claude" nunca foi autenticado
 * (`claude /login`), as chamadas vão falhar com uma mensagem do
 * próprio CLI explicando isso.
 *
 * NÃO adicione "--bare" aqui: esse modo pula leitura do keychain do
 * SO (é onde a sessão da assinatura fica salva), então toda chamada
 * volta "Not logged in" mesmo com o CLI autenticado normalmente.
 * Confirmado testando manualmente antes de escrever este adapter.
 */
export type ClaudeSandbox =
  | "read-only"
  | "workspace-write";

export interface ClaudeAskOptions {
  cwd?: string;
  sandbox?: ClaudeSandbox;
  model?: string;
}

interface ClaudeResultPayload {
  type?: string;
  subtype?: string;
  is_error?: boolean;
  result?: string;
}

function resolveClaudeCommand() {
  return resolveGlobalCli(
    "claude",
    [
      "node_modules",
      "@anthropic-ai",
      "claude-code",
      "bin",
      "claude.exe",
    ]
  );
}

export class ClaudeAdapter {
  private defaultModel =
    "claude-sonnet-5";

  private timeoutMs = 600_000;

  async ask(
    prompt: string,
    options: ClaudeAskOptions = {}
  ): Promise<string> {
    const {
      command,
      prefixArgs,
    } = await resolveClaudeCommand();

    return new Promise(
      (resolve, reject) => {
        const cwd =
          options.cwd ??
          process.cwd();

        const isWorkspaceWrite =
          (options.sandbox ??
            "read-only") ===
          "workspace-write";

        /*
         * "bypassPermissions" foi testado e descartado: ele ignora
         * --allowedTools completamente (confirmado empiricamente —
         * um Bash fora da lista ainda executa), então não restringe
         * nada de verdade, apenas evita os prompts interativos que
         * travariam a execução automatizada (não há humano para
         * responder).
         *
         * "acceptEdits" também não bloqueia, mas combinado com
         * --disallowedTools (esse SIM restringe de verdade,
         * confirmado testando com "hostname" via Bash) dá o mesmo
         * "não trava esperando confirmação" sem deixar Bash/rede
         * livres. Bash de verificação (typecheck/test) não faz
         * falta aqui: o Validation Loop do Senior já roda esses
         * checks de forma determinística depois, independente do
         * que o agente relatou ter feito (seção 12 do
         * SENIOR_MASTER_PLAN.md — não basta o agente dizer que
         * funciona).
         */
        const permissionMode =
          isWorkspaceWrite
            ? "acceptEdits"
            : "plan";

        const model =
          options.model ??
          this.defaultModel;

        const args = [
          ...prefixArgs,
          "-p",
          prompt,
          "--output-format",
          "json",
          "--model",
          model,
          "--permission-mode",
          permissionMode,
          "--disallowedTools",
          "Bash",
          "WebFetch",
          "WebSearch",
        ];

        const child = spawn(
          command,
          args,
          {
            cwd,
            stdio: [
              "ignore",
              "pipe",
              "pipe",
            ],
          }
        );

        let stdout = "";
        let stderr = "";
        let settled = false;

        child.stdout.on(
          "data",
          (data) => {
            stdout +=
              data.toString();
          }
        );

        child.stderr.on(
          "data",
          (data) => {
            stderr +=
              data.toString();
          }
        );

        const timeout =
          setTimeout(() => {
            if (settled) return;

            settled = true;
            child.kill(
              "SIGTERM"
            );

            reject(
              new Error(
                `Claude excedeu o limite de ${
                  this.timeoutMs /
                  1000
                } segundos.`
              )
            );
          }, this.timeoutMs);

        child.on(
          "error",
          (error) => {
            if (settled) return;

            settled = true;
            clearTimeout(timeout);
            reject(error);
          }
        );

        child.on(
          "close",
          (code) => {
            if (settled) return;

            settled = true;
            clearTimeout(timeout);

            if (code !== 0) {
              reject(
                new Error(
                  `Claude terminou com código ${code}.\n${stderr}`
                )
              );
              return;
            }

            let payload: ClaudeResultPayload;

            try {
              payload = JSON.parse(
                stdout.trim()
              );
            } catch (error) {
              reject(
                new Error(
                  `Falha ao interpretar resposta do Claude: ${
                    error instanceof
                    Error
                      ? error.message
                      : String(
                          error
                        )
                  }\n${stdout}`
                )
              );
              return;
            }

            if (
              payload.is_error ||
              !payload.result
            ) {
              reject(
                new Error(
                  `Claude retornou erro: ${
                    payload.result ??
                    JSON.stringify(
                      payload
                    )
                  }`
                )
              );
              return;
            }

            resolve(
              payload.result.trim()
            );
          }
        );
      }
    );
  }

  async status(): Promise<boolean> {
    const {
      command,
      prefixArgs,
    } = await resolveClaudeCommand();

    return new Promise(
      (resolve) => {
        const child = spawn(
          command,
          [
            ...prefixArgs,
            "--version",
          ],
          { stdio: "ignore" }
        );

        child.on("error", () =>
          resolve(false)
        );

        child.on(
          "close",
          (code) =>
            resolve(code === 0)
        );
      }
    );
  }

  async authStatus(): Promise<ProviderAuthStatus> {
    const {
      command,
      prefixArgs,
    } = await resolveClaudeCommand();

    return new Promise((resolve) => {
      const child = spawn(
        command,
        [
          ...prefixArgs,
          "auth",
          "status",
          "--json",
        ],
        {
          stdio: [
            "ignore",
            "pipe",
            "pipe",
          ],
        }
      );

      let stdout = "";

      child.stdout.on(
        "data",
        (data) => {
          stdout += data.toString();
        }
      );

      child.on("error", () =>
        resolve({
          loggedIn: false,
          detail:
            "Não foi possível verificar o status do Claude.",
          reliable: true,
        })
      );

      child.on("close", () => {
        resolve(
          parseClaudeAuthStatus(stdout)
        );
      });
    });
  }

  /*
   * NUNCA rode "claude auth login" de verdade a partir desta própria
   * sessão de desenvolvimento: se este processo do Claude Code já
   * está autenticado via o mesmo CLI/keychain, um login real aqui
   * pode trocar/invalidar a credencial que a sessão atual está
   * usando. Testado apenas com "--help"; o disparo real só deve
   * acontecer quando o próprio usuário clicar em "conectar" na tela
   * de configuração do Senior, sabendo o que está fazendo.
   */
  login(): LoginHandle {
    return spawnLoginProcess(
      resolveClaudeCommand().then(
        ({ command, prefixArgs }) => ({
          command,
          args: [
            ...prefixArgs,
            "auth",
            "login",
          ],
        })
      )
    );
  }
}

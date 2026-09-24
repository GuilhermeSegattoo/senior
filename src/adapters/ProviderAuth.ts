import {
  spawn,
  type ChildProcess,
} from "node:child_process";

/*
 * Tipos e lógica compartilhados entre CodexAdapter e ClaudeAdapter
 * para a tela de configuração de provedores (seção "settings" do
 * SENIOR_MASTER_PLAN.md, Fase G).
 *
 * "reliable: false" existe porque "codex login status" só confirma
 * que existe uma credencial salva localmente, não que ela ainda é
 * válida — confirmado manualmente: com um token OAuth expirado
 * (401 ao atualizar), o comando ainda respondia "Logged in using
 * ChatGPT". "claude auth status --json" não tem esse problema (foi
 * testado e reflete o estado real). A UI precisa dessa distinção
 * pra não dar falsa segurança sobre o Codex.
 */
export interface ProviderAuthStatus {
  loggedIn: boolean;
  detail: string;
  reliable: boolean;
  email?: string;
  plan?: string;
}

export interface LoginHandle {
  waitForUrl(timeoutMs: number): Promise<string | null>;
  onExit(
    callback: (
      success: boolean,
      message: string
    ) => void
  ): void;
  kill(): void;
}

const URL_PATTERN = /https?:\/\/\S+/;

/*
 * "codex login" e "claude auth login" seguem o mesmo formato: sobem
 * um servidor HTTP local, imprimem uma URL de autorização no stdout
 * e ficam rodando até o navegador completar o callback OAuth (visto
 * na prática rodando "codex login" manualmente — ver seção de
 * configuração do SENIOR_MASTER_PLAN.md). O Senior nunca lê nem
 * processa o código/token OAuth em si — só repassa a URL impressa
 * pelo próprio CLI para o usuário abrir no navegador dele; quem
 * grava a credencial final é o CLI, não o Senior.
 */
export function spawnLoginProcess(
  commandPromise: Promise<{
    command: string;
    args: string[];
  }>
): LoginHandle {
  let child: ChildProcess | null =
    null;

  let resolvedUrl: string | null =
    null;

  let settled = false;
  let stdout = "";
  let stderr = "";

  let urlWaiters: Array<
    (url: string | null) => void
  > = [];

  let exitCallback:
    | ((
        success: boolean,
        message: string
      ) => void)
    | null = null;

  function flushUrlWaiters(
    url: string | null
  ) {
    const waiters = urlWaiters;
    urlWaiters = [];
    waiters.forEach((resolve) =>
      resolve(url)
    );
  }

  const ready = commandPromise
    .then(({ command, args }) => {
      const proc = spawn(
        command,
        args,
        {
          stdio: [
            "ignore",
            "pipe",
            "pipe",
          ],
        }
      );

      child = proc;

      /*
       * A URL de autorização pode sair no stdout ou no stderr
       * dependendo do CLI — confirmado que "codex login status"
       * imprime no stderr (não no stdout), então "codex login"
       * também não pode ser assumido como stdout-only. Ambos os
       * streams alimentam a mesma busca por URL.
       */
      function watchForUrl(
        chunk: string
      ) {
        stdout += chunk;

        if (!resolvedUrl) {
          const match =
            stdout.match(
              URL_PATTERN
            );

          if (match) {
            resolvedUrl = match[0];
            flushUrlWaiters(
              resolvedUrl
            );
          }
        }
      }

      proc.stdout?.on(
        "data",
        (data) => {
          watchForUrl(
            data.toString()
          );
        }
      );

      proc.stderr?.on(
        "data",
        (data) => {
          watchForUrl(
            data.toString()
          );

          stderr +=
            data.toString();
        }
      );

      proc.on(
        "error",
        (error) => {
          if (settled) return;

          settled = true;
          flushUrlWaiters(null);
          exitCallback?.(
            false,
            error.message
          );
        }
      );

      proc.on(
        "close",
        (code) => {
          if (settled) return;

          settled = true;
          flushUrlWaiters(
            resolvedUrl
          );

          exitCallback?.(
            code === 0,
            code === 0
              ? "Login concluído."
              : `Processo de login terminou com código ${code}.\n${stderr}`.trim()
          );
        }
      );
    })
    .catch((error: unknown) => {
      settled = true;
      flushUrlWaiters(null);

      exitCallback?.(
        false,
        error instanceof Error
          ? error.message
          : String(error)
      );
    });

  return {
    async waitForUrl(timeoutMs) {
      await ready;

      if (resolvedUrl || settled) {
        return resolvedUrl;
      }

      return new Promise(
        (resolve) => {
          const timer = setTimeout(
            () => {
              urlWaiters =
                urlWaiters.filter(
                  (waiter) =>
                    waiter !==
                    wrapped
                );

              resolve(
                resolvedUrl
              );
            },
            timeoutMs
          );

          const wrapped = (
            url: string | null
          ) => {
            clearTimeout(timer);
            resolve(url);
          };

          urlWaiters.push(
            wrapped
          );
        }
      );
    },

    onExit(callback) {
      exitCallback = callback;
    },

    kill() {
      child?.kill("SIGTERM");
    },
  };
}

/*
 * "codex login status" não tem --json — só texto livre. Confirmado
 * manualmente: quando autenticado imprime "Logged in using
 * ChatGPT" (ou similar); quando não, algo que não contém "logged
 * in". Isolado numa função pura pra ser testável sem precisar
 * spawnar processo nenhum.
 */
export function parseCodexLoginStatus(
  rawStdout: string
): ProviderAuthStatus {
  const text = rawStdout.trim();

  /*
   * "not logged in" contém "logged in" como substring — checar a
   * negativa primeiro evita o falso positivo (pego por teste real
   * antes de ir pra produção).
   */
  const loggedIn =
    !/not logged in/i.test(text) &&
    /logged in/i.test(text);

  return {
    loggedIn,
    detail:
      text ||
      "Sem resposta do Codex ao verificar login.",
    reliable: false,
  };
}

interface ClaudeAuthStatusPayload {
  loggedIn?: boolean;
  email?: string;
  subscriptionType?: string;
  authMethod?: string;
}

export function parseClaudeAuthStatus(
  rawStdout: string
): ProviderAuthStatus {
  try {
    const payload = JSON.parse(
      rawStdout.trim()
    ) as ClaudeAuthStatusPayload;

    return {
      loggedIn: Boolean(
        payload.loggedIn
      ),
      detail: payload.loggedIn
        ? `Conectado como ${payload.email ?? "?"} (${
            payload.subscriptionType ??
            payload.authMethod ??
            "assinatura"
          })`
        : "Não conectado.",
      reliable: true,
      email: payload.email,
      plan: payload.subscriptionType,
    };
  } catch {
    return {
      loggedIn: false,
      detail:
        rawStdout.trim() ||
        "Resposta inesperada do Claude ao verificar status.",
      reliable: true,
    };
  }
}

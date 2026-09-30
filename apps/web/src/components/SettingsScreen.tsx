"use client";

import { useEffect, useRef, useState } from "react";
import {
  fetchProviderLoginSession,
  cancelProviderLogin,
  fetchCapabilities,
  fetchProvidersStatus,
  startProviderLogin,
  type AuthProviderName,
  type LoginSession,
  type ProviderAuthStatus,
} from "@/lib/api";

const STATUS_POLL_INTERVAL_MS = 10_000;
const LOGIN_POLL_INTERVAL_MS = 2_000;

type LoginUiState =
  | { kind: "idle" }
  | { kind: "starting" }
  | {
      kind: "waiting";
      url: string | null;
    }
  | { kind: "success" }
  | {
      kind: "failed";
      message?: string;
    };

interface ProviderMeta {
  id: AuthProviderName;
  label: string;
  caption: string;
  connectWarning?: string;
}

const PROVIDERS: ProviderMeta[] = [
  {
    id: "codex",
    label: "Codex",
    caption:
      "Conta ChatGPT usada pelo CLI codex.",
  },
  {
    id: "claude",
    label: "Claude",
    caption:
      "Assinatura Claude usada pelo CLI claude.",
    connectWarning:
      "Isso abre um novo login do Claude neste computador. Se outra sessão do Claude Code na mesma máquina estiver usando a mesma conta, ela pode ser desconectada.",
  },
];

function statusDotColor(
  status: ProviderAuthStatus | undefined,
  loginState: LoginUiState
): string {
  if (
    loginState.kind === "starting" ||
    loginState.kind === "waiting"
  ) {
    return "bg-signal";
  }

  if (!status) return "bg-mute";

  return status.loggedIn
    ? "bg-ok"
    : "bg-danger";
}

export function SettingsScreen() {
  const [capabilities, setCapabilities] = useState<Array<{ name: string; configured?: boolean; mode: string; coding: boolean }>>([]);
  const [statusError, setStatusError] = useState("");
  const [status, setStatus] = useState<
    | Record<
        AuthProviderName,
        ProviderAuthStatus
      >
    | null
  >(null);

  const [loginStates, setLoginStates] =
    useState<
      Record<
        AuthProviderName,
        LoginUiState
      >
    >({
      codex: { kind: "idle" },
      claude: { kind: "idle" },
    });

  const pollersRef = useRef<
    Partial<
      Record<
        AuthProviderName,
        ReturnType<typeof setInterval>
      >
    >
  >({});

  async function refreshStatus() {
    const data =
      await fetchProvidersStatus().catch(
        () => null
      );

    if (data) {
      setStatus(data);
    }
  }

  useEffect(() => {
    let cancelled = false;
    fetchCapabilities().then(value => { if (!cancelled) setCapabilities(value.providers); }).catch(err => setStatusError(err instanceof Error ? err.message : "Falha ao verificar conexões."));

    async function poll() {
      const data =
        await fetchProvidersStatus().catch(
          () => null
        );

      if (!data && !cancelled) setStatusError("Não foi possível verificar as conexões. Confira o gateway e seu login.");
      if (data && !cancelled) {
        setStatus(data);
      }
    }

    poll();

    const interval = setInterval(
      poll,
      STATUS_POLL_INTERVAL_MS
    );

    const activePollers =
      pollersRef.current;

    return () => {
      cancelled = true;
      clearInterval(interval);

      Object.values(
        activePollers
      ).forEach((timer) => {
        if (timer) clearInterval(timer);
      });
    };
  }, []);

  function stopPolling(
    provider: AuthProviderName
  ) {
    const timer =
      pollersRef.current[provider];

    if (timer) {
      clearInterval(timer);
      delete pollersRef.current[
        provider
      ];
    }
  }

  function setLoginState(
    provider: AuthProviderName,
    state: LoginUiState
  ) {
    setLoginStates((current) => ({
      ...current,
      [provider]: state,
    }));
  }

  function applySession(
    provider: AuthProviderName,
    session: LoginSession
  ) {
    if (session.status === "success") {
      setLoginState(provider, {
        kind: "success",
      });

      stopPolling(provider);
      refreshStatus();
      return;
    }

    if (["failed", "cancelled", "expired"].includes(session.status)) {
      setLoginState(provider, {
        kind: "failed",
        message: session.message,
      });

      stopPolling(provider);
      refreshStatus();
      return;
    }

    setLoginState(provider, {
      kind: "waiting",
      url: session.url,
    });
  }

  function pollLoginSession(
    provider: AuthProviderName
  ) {
    stopPolling(provider);

    const timer = setInterval(
      async () => {
        const session =
          await fetchProviderLoginSession(
            provider
          ).catch(() => null);

        if (session) {
          applySession(
            provider,
            session
          );
        }
      },
      LOGIN_POLL_INTERVAL_MS
    );

    pollersRef.current[provider] =
      timer;
  }

  async function handleConnect(
    provider: AuthProviderName
  ) {
    setLoginState(provider, {
      kind: "starting",
    });

    try {
      const session =
        await startProviderLogin(
          provider
        );

      applySession(provider, session);

      if (
        session.status ===
          "pending_url" ||
        session.status ===
          "pending_completion"
      ) {
        pollLoginSession(provider);
      }
    } catch (error) {
      setLoginState(provider, {
        kind: "failed",
        message:
          error instanceof Error
            ? error.message
            : "Não foi possível iniciar o login.",
      });
    }
  }

  return (
    <div className="mx-auto max-w-3xl px-6 py-10">
      <h1 className="font-display text-2xl font-medium text-paper">
        Provedores
      </h1>

      <p className="mt-1 text-sm text-mute">
        Contas de assinatura usadas
        pelos agentes para executar
        tarefas. Cada tarefa pode
        escolher qual provedor usar na
        hora de disparar.
      </p>

      {statusError && <p role="alert" className="mt-4 text-sm text-danger">{statusError}</p>}
      <div className="mt-8 space-y-4">
        {PROVIDERS.map((provider) => {
          const providerStatus =
            status?.[provider.id];

          const loginState =
            loginStates[provider.id];

          const busy =
            loginState.kind ===
              "starting" ||
            loginState.kind ===
              "waiting";

          return (
            <div
              key={provider.id}
              className="rounded-lg border border-line bg-panel-raised p-5"
            >
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2">
                    <span
                      className={`h-2 w-2 rounded-full ${statusDotColor(
                        providerStatus,
                        loginState
                      )} ${
                        busy
                          ? "pulse-dot"
                          : ""
                      }`}
                      aria-hidden="true"
                    />

                    <h2 className="font-display text-lg font-medium text-paper">
                      {provider.label}
                    </h2>
                  </div>

                  <p className="mt-0.5 text-xs text-mute">
                    {provider.caption}
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() =>
                    handleConnect(
                      provider.id
                    )
                  }
                  disabled={busy}
                  className="shrink-0 rounded-md bg-signal px-4 py-2 text-sm font-medium text-ink transition-opacity hover:opacity-90 disabled:opacity-50"
                >
                  {busy
                    ? "conectando…"
                    : "Conectar"}
                </button>
              </div>

              <div className="mt-3 rounded-md bg-ink px-3 py-2 font-mono text-xs text-mute">
                {providerStatus
                  ? providerStatus.detail
                  : "verificando status…"}
              </div>

              {providerStatus &&
                !providerStatus.reliable && (
                  <p className="mt-2 text-[11px] text-mute">
                    Este status só
                    confirma que existe
                    uma credencial
                    salva — não que ela
                    ainda é válida. Se
                    as tarefas
                    estiverem falhando
                    com erro de
                    autenticação, tente
                    reconectar.
                  </p>
                )}

              {loginState.kind ===
                "waiting" && (
                <div className="mt-3 rounded-md border border-signal/40 bg-signal/10 px-3 py-2">
                  {loginState.url ? (
                    <p className="text-xs text-paper">
                      Abra este link
                      para autenticar:{" "}
                      <a
                        href={
                          loginState.url
                        }
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-signal underline"
                      >
                        {
                          loginState.url
                        }
                      </a>
                    </p>
                  ) : (
                    <p className="text-xs text-paper">
                      Aguardando o link
                      de autenticação…
                    </p>
                  )}

                  <button type="button" onClick={() => { void cancelProviderLogin(provider.id).then(() => { stopPolling(provider.id); setLoginState(provider.id, { kind: "idle" }); }).catch(err => setStatusError(String(err))); }} className="mt-2 text-xs text-signal">Cancelar tentativa</button>
                  <p className="mt-1 text-[11px] text-mute">
                    Conclua o login no ambiente onde o CLI está rodando. Em servidor remoto, um callback localhost pode exigir configuração adicional.
                  </p>
                </div>
              )}

              {loginState.kind ===
                "success" && (
                <p className="mt-3 text-xs text-ok">
                  Login concluído.
                </p>
              )}

              {loginState.kind ===
                "failed" && (
                <p className="mt-3 text-xs text-danger">
                  Falha ao conectar
                  {loginState.message
                    ? `: ${loginState.message}`
                    : "."}
                </p>
              )}

              {provider.connectWarning && (
                <p className="mt-3 border-t border-line pt-2 text-[11px] text-mute">
                  {
                    provider.connectWarning
                  }
                </p>
              )}
            </div>
          );
        })}

        {capabilities.filter(p => ["grok", "openai", "anthropic", "pi"].includes(p.name)).map(provider => <div key={provider.name} className="rounded-lg border border-line bg-panel-raised p-5"><h2 className="font-display text-lg">{provider.name === "grok" ? "Grok" : provider.name === "anthropic" ? "Claude API" : provider.name === "openai" ? "OpenAI API" : "Pi"}</h2><p className={`mt-2 text-xs ${provider.configured ? "text-ok" : "text-mute"}`}>{provider.configured ? "Configuração disponível no servidor. Uma chamada real ainda confirma acesso e saldo." : "Configure credencial e modelo no servidor para habilitar."}</p><p className="mt-2 text-xs text-mute">{provider.coding ? "Execução com ferramentas autorizadas." : "Conversa e análise. Cobrança e acesso da API são verificados separadamente."}</p></div>)}
      </div>
    </div>
  );
}

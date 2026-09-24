import { CodexAdapter } from "../adapters/CodexAdapter.js";
import { ClaudeAdapter } from "../adapters/ClaudeAdapter.js";

import type {
  LoginHandle,
  ProviderAuthStatus,
} from "../adapters/ProviderAuth.js";

export type AuthProviderName =
  | "codex"
  | "claude";

export type LoginSessionStatus =
  | "pending_url"
  | "pending_completion"
  | "success"
  | "failed";

export interface LoginSession {
  status: LoginSessionStatus;
  url: string | null;
  message?: string;
}

export interface AuthProviderAdapter {
  authStatus(): Promise<ProviderAuthStatus>;
  login(): LoginHandle;
}

const URL_WAIT_TIMEOUT_MS = 8_000;

/*
 * Orquestra status/login dos provedores de IA autenticados via
 * assinatura (Codex e Claude — seção "settings" do
 * SENIOR_MASTER_PLAN.md, Fase G). Mantém no máximo uma tentativa de
 * login em andamento por provedor, em memória (não sobrevive a um
 * restart do gateway — aceitável, já que é só um fluxo interativo
 * de poucos minutos disparado pela própria UI).
 */
export class ProviderAuthManager {
  private readonly adapters: Record<
    AuthProviderName,
    AuthProviderAdapter
  >;

  private readonly sessions = new Map<
    AuthProviderName,
    LoginSession
  >();

  constructor(
    adapters?: Partial<
      Record<
        AuthProviderName,
        AuthProviderAdapter
      >
    >
  ) {
    this.adapters = {
      codex:
        adapters?.codex ??
        new CodexAdapter(),
      claude:
        adapters?.claude ??
        new ClaudeAdapter(),
    };
  }

  async status(): Promise<
    Record<
      AuthProviderName,
      ProviderAuthStatus
    >
  > {
    const [codex, claude] =
      await Promise.all([
        this.adapters.codex.authStatus(),
        this.adapters.claude.authStatus(),
      ]);

    return { codex, claude };
  }

  async startLogin(
    provider: AuthProviderName
  ): Promise<LoginSession> {
    const existing =
      this.sessions.get(provider);

    if (
      existing &&
      (existing.status ===
        "pending_url" ||
        existing.status ===
          "pending_completion")
    ) {
      return existing;
    }

    const handle =
      this.adapters[
        provider
      ].login();

    const session: LoginSession = {
      status: "pending_url",
      url: null,
    };

    this.sessions.set(
      provider,
      session
    );

    handle.onExit(
      (success, message) => {
        const current =
          this.sessions.get(
            provider
          );

        if (current) {
          current.status = success
            ? "success"
            : "failed";

          current.message =
            message;
        }
      }
    );

    const url =
      await handle.waitForUrl(
        URL_WAIT_TIMEOUT_MS
      );

    const current =
      this.sessions.get(provider) ??
      session;

    if (
      current.status ===
      "pending_url"
    ) {
      current.url = url;
      current.status =
        "pending_completion";
    }

    return { ...current };
  }

  getSession(
    provider: AuthProviderName
  ): LoginSession | null {
    const session =
      this.sessions.get(provider);

    return session
      ? { ...session }
      : null;
  }
}

import path from "node:path";
import type { AddressInfo } from "node:net";

import {
  parseCodexLoginStatus,
  parseClaudeAuthStatus,
  spawnLoginProcess,
  type LoginHandle,
  type ProviderAuthStatus,
} from "../adapters/ProviderAuth.js";

import { CodexAdapter } from "../adapters/CodexAdapter.js";

import {
  ProviderAuthManager,
  type AuthProviderAdapter,
  type LoginSession,
} from "../core/ProviderAuthManager.js";

import { createGatewayServer } from "../gateway/server.js";

function assert(
  condition: unknown,
  message: string
): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

function fixtureCommand(): Promise<{
  command: string;
  args: string[];
}> {
  return Promise.resolve({
    command: process.execPath,
    args: [
      path.join(
        process.cwd(),
        "node_modules",
        "tsx",
        "dist",
        "cli.mjs"
      ),
      path.join(
        "src",
        "tests",
        "fixtures",
        "fake-login-cli.ts"
      ),
    ],
  });
}

function setFixtureEnv(
  overrides: Record<string, string>
): void {
  for (const key of [
    "FAKE_LOGIN_URL",
    "FAKE_LOGIN_EXIT_CODE",
    "FAKE_LOGIN_DELAY_MS",
    "FAKE_LOGIN_NO_URL",
    "FAKE_LOGIN_STREAM",
  ]) {
    delete process.env[key];
  }

  for (const [key, value] of Object.entries(
    overrides
  )) {
    process.env[key] = value;
  }
}

async function waitFor(
  predicate: () =>
    | boolean
    | Promise<boolean>,
  timeoutMs = 5_000
): Promise<void> {
  const start = Date.now();

  while (Date.now() - start < timeoutMs) {
    if (await predicate()) return;

    await new Promise((resolve) =>
      setTimeout(resolve, 25)
    );
  }

  throw new Error(
    "Timeout esperando condição."
  );
}

class FakeProviderAdapter
  implements AuthProviderAdapter
{
  constructor(
    private readonly statusResult: ProviderAuthStatus,
    private readonly loginFn: () => LoginHandle = () =>
      spawnLoginProcess(fixtureCommand())
  ) {}

  async authStatus(): Promise<ProviderAuthStatus> {
    return this.statusResult;
  }

  login(): LoginHandle {
    return this.loginFn();
  }
}

async function main() {
  console.log(
    "\n=== SENIOR PROVIDER AUTH (status + login) ===\n"
  );

  // -----------------------------------------------------------
  // parseCodexLoginStatus / parseClaudeAuthStatus (parsers puros)
  // -----------------------------------------------------------

  const codexLoggedIn = parseCodexLoginStatus(
    "Logged in using ChatGPT"
  );

  assert(
    codexLoggedIn.loggedIn === true &&
      codexLoggedIn.reliable === false,
    `parseCodexLoginStatus não reconheceu "logged in": ${JSON.stringify(codexLoggedIn)}`
  );

  const codexLoggedOut = parseCodexLoginStatus(
    "Not logged in"
  );

  assert(
    codexLoggedOut.loggedIn === false,
    `parseCodexLoginStatus deveria retornar loggedIn=false: ${JSON.stringify(codexLoggedOut)}`
  );

  console.log(
    "OK: parseCodexLoginStatus distingue logado/deslogado e marca reliable=false."
  );

  const claudeLoggedIn = parseClaudeAuthStatus(
    JSON.stringify({
      loggedIn: true,
      email: "user@example.com",
      subscriptionType: "pro",
    })
  );

  assert(
    claudeLoggedIn.loggedIn === true &&
      claudeLoggedIn.reliable === true &&
      claudeLoggedIn.detail.includes(
        "user@example.com"
      ),
    `parseClaudeAuthStatus não trouxe os dados esperados: ${JSON.stringify(claudeLoggedIn)}`
  );

  const claudeGarbage = parseClaudeAuthStatus(
    "isso não é json"
  );

  assert(
    claudeGarbage.loggedIn === false &&
      claudeGarbage.reliable === true,
    `parseClaudeAuthStatus deveria tratar resposta inválida como deslogado: ${JSON.stringify(claudeGarbage)}`
  );

  console.log(
    "OK: parseClaudeAuthStatus interpreta JSON válido e trata resposta inesperada."
  );

  // -----------------------------------------------------------
  // spawnLoginProcess: sucesso (URL aparece, processo sai com 0)
  // -----------------------------------------------------------

  setFixtureEnv({
    FAKE_LOGIN_URL:
      "https://example.com/auth/success",
    FAKE_LOGIN_DELAY_MS: "30",
    FAKE_LOGIN_EXIT_CODE: "0",
  });

  const successHandle = spawnLoginProcess(
    fixtureCommand()
  );

  let successExit:
    | { success: boolean; message: string }
    | null = null;

  successHandle.onExit((success, message) => {
    successExit = { success, message };
  });

  const successUrl =
    await successHandle.waitForUrl(5_000);

  assert(
    successUrl ===
      "https://example.com/auth/success",
    `spawnLoginProcess não capturou a URL esperada: ${successUrl}`
  );

  await waitFor(
    () => successExit !== null
  );

  assert(
    (successExit as unknown as {
      success: boolean;
    }).success === true,
    "spawnLoginProcess deveria reportar sucesso ao sair com código 0."
  );

  console.log(
    "OK: spawnLoginProcess captura a URL impressa e reporta sucesso na saída."
  );

  // -----------------------------------------------------------
  // spawnLoginProcess: falha (sai com código != 0)
  // -----------------------------------------------------------

  setFixtureEnv({
    FAKE_LOGIN_URL:
      "https://example.com/auth/fail",
    FAKE_LOGIN_DELAY_MS: "30",
    FAKE_LOGIN_EXIT_CODE: "1",
  });

  const failHandle = spawnLoginProcess(
    fixtureCommand()
  );

  let failExit:
    | { success: boolean; message: string }
    | null = null;

  failHandle.onExit((success, message) => {
    failExit = { success, message };
  });

  await failHandle.waitForUrl(5_000);

  await waitFor(() => failExit !== null);

  assert(
    (failExit as unknown as {
      success: boolean;
    }).success === false,
    "spawnLoginProcess deveria reportar falha ao sair com código != 0."
  );

  console.log(
    "OK: spawnLoginProcess reporta falha quando o processo sai com código != 0."
  );

  // -----------------------------------------------------------
  // spawnLoginProcess: URL nunca aparece dentro do timeout
  // -----------------------------------------------------------

  setFixtureEnv({
    FAKE_LOGIN_NO_URL: "true",
    FAKE_LOGIN_DELAY_MS: "5000",
  });

  const noUrlHandle = spawnLoginProcess(
    fixtureCommand()
  );

  const noUrlResult =
    await noUrlHandle.waitForUrl(100);

  assert(
    noUrlResult === null,
    `waitForUrl deveria expirar retornando null, retornou: ${noUrlResult}`
  );

  noUrlHandle.kill();

  console.log(
    "OK: waitForUrl expira com null quando o CLI não imprime URL a tempo."
  );

  // -----------------------------------------------------------
  // spawnLoginProcess: URL impressa no stderr, não no stdout
  // (regressão real: "codex login status" imprime no stderr, e a
  // primeira versão deste código só observava stdout).
  // -----------------------------------------------------------

  setFixtureEnv({
    FAKE_LOGIN_URL:
      "https://example.com/auth/via-stderr",
    FAKE_LOGIN_DELAY_MS: "30",
    FAKE_LOGIN_EXIT_CODE: "0",
    FAKE_LOGIN_STREAM: "stderr",
  });

  const stderrHandle = spawnLoginProcess(
    fixtureCommand()
  );

  const stderrUrl =
    await stderrHandle.waitForUrl(5_000);

  assert(
    stderrUrl ===
      "https://example.com/auth/via-stderr",
    `spawnLoginProcess não capturou uma URL impressa no stderr: ${stderrUrl}`
  );

  console.log(
    "OK: spawnLoginProcess também detecta a URL quando ela sai pelo stderr."
  );

  // -----------------------------------------------------------
  // CodexAdapter.authStatus() contra o CLI real (só leitura —
  // "codex login status" não muda nada). Trava a regressão em que
  // o status vinha sempre vazio por só ler stdout.
  // -----------------------------------------------------------

  const realCodexStatus =
    await new CodexAdapter().authStatus();

  assert(
    realCodexStatus.detail.trim().length > 0,
    `CodexAdapter.authStatus() voltou com detail vazio — sinal de que a saída (stdout/stderr) não está sendo capturada: ${JSON.stringify(realCodexStatus)}`
  );

  console.log(
    `OK: CodexAdapter.authStatus() (CLI real) retorna detail não vazio: "${realCodexStatus.detail}".`
  );

  // -----------------------------------------------------------
  // ProviderAuthManager: status() agrega os dois adapters
  // -----------------------------------------------------------

  const manager = new ProviderAuthManager({
    codex: new FakeProviderAdapter({
      loggedIn: true,
      detail: "Logged in using ChatGPT",
      reliable: false,
    }),
    claude: new FakeProviderAdapter({
      loggedIn: false,
      detail: "Não conectado.",
      reliable: true,
    }),
  });

  const status = await manager.status();

  assert(
    status.codex.loggedIn === true &&
      status.claude.loggedIn === false,
    `ProviderAuthManager.status() não agregou corretamente: ${JSON.stringify(status)}`
  );

  console.log(
    "OK: ProviderAuthManager.status() agrega o status dos dois provedores."
  );

  // -----------------------------------------------------------
  // ProviderAuthManager: startLogin + getSession até completar
  // -----------------------------------------------------------

  setFixtureEnv({
    FAKE_LOGIN_URL:
      "https://example.com/auth/manager",
    FAKE_LOGIN_DELAY_MS: "30",
    FAKE_LOGIN_EXIT_CODE: "0",
  });

  const loginManager = new ProviderAuthManager({
    codex: new FakeProviderAdapter(
      {
        loggedIn: false,
        detail: "irrelevante",
        reliable: false,
      },
      () => spawnLoginProcess(fixtureCommand())
    ),
  });

  const session = await loginManager.startLogin(
    "codex"
  );

  assert(
    session.status === "pending_completion" &&
      session.url ===
        "https://example.com/auth/manager",
    `startLogin não retornou a URL esperada: ${JSON.stringify(session)}`
  );

  console.log(
    "OK: ProviderAuthManager.startLogin retorna a URL assim que ela é impressa."
  );

  const repeated = await loginManager.startLogin(
    "codex"
  );

  assert(
    repeated.url === session.url,
    "Uma segunda chamada a startLogin() enquanto já há uma tentativa em andamento deveria reaproveitar a sessão existente."
  );

  console.log(
    "OK: startLogin() reaproveita uma tentativa de login já em andamento em vez de disparar outra."
  );

  await waitFor(() => {
    const current = loginManager.getSession(
      "codex"
    );

    return current?.status === "success";
  });

  console.log(
    "OK: getSession() reflete a conclusão do login (status success) após o processo sair com código 0."
  );

  // -----------------------------------------------------------
  // Gateway: rotas /providers/*
  // -----------------------------------------------------------

  setFixtureEnv({
    FAKE_LOGIN_URL:
      "https://example.com/auth/gateway",
    FAKE_LOGIN_DELAY_MS: "30",
    FAKE_LOGIN_EXIT_CODE: "0",
  });

  const gatewayManager = new ProviderAuthManager({
    codex: new FakeProviderAdapter(
      {
        loggedIn: false,
        detail: "irrelevante",
        reliable: false,
      },
      () => spawnLoginProcess(fixtureCommand())
    ),
    claude: new FakeProviderAdapter({
      loggedIn: true,
      detail: "Conectado como user@example.com (pro)",
      reliable: true,
      email: "user@example.com",
      plan: "pro",
    }),
  });

  const server = createGatewayServer({
    providerAuthManager: gatewayManager,
  });

  await new Promise<void>((resolve) => {
    server.listen(0, resolve);
  });

  const address = server.address() as AddressInfo;
  const baseUrl = `http://127.0.0.1:${address.port}`;

  try {
    const statusResponse = await fetch(
      `${baseUrl}/providers/status`
    );

    const statusBody =
      (await statusResponse.json()) as {
        providers: Record<
          string,
          ProviderAuthStatus
        >;
      };

    assert(
      statusResponse.status === 200 &&
        statusBody.providers.claude
          .loggedIn === true &&
        statusBody.providers.codex
          .loggedIn === false,
      `GET /providers/status não retornou o esperado: ${JSON.stringify(statusBody)}`
    );

    console.log(
      "OK: GET /providers/status retorna o status agregado dos provedores."
    );

    const unknownLoginResponse = await fetch(
      `${baseUrl}/providers/grok/login`,
      { method: "POST" }
    );

    assert(
      unknownLoginResponse.status === 400,
      `POST /providers/grok/login deveria retornar 400, retornou ${unknownLoginResponse.status}`
    );

    console.log(
      "OK: POST /providers/:provider/login rejeita provedor desconhecido com 400."
    );

    const loginResponse = await fetch(
      `${baseUrl}/providers/codex/login`,
      { method: "POST" }
    );

    const loginBody =
      (await loginResponse.json()) as {
        session: LoginSession;
      };

    assert(
      loginResponse.status === 202 &&
        loginBody.session.url ===
          "https://example.com/auth/gateway",
      `POST /providers/codex/login não retornou a sessão esperada: ${JSON.stringify(loginBody)}`
    );

    console.log(
      "OK: POST /providers/:provider/login dispara o login e retorna a URL de autorização."
    );

    await waitFor(async () => {
      const pollResponse = await fetch(
        `${baseUrl}/providers/codex/login`
      );

      const pollBody =
        (await pollResponse.json()) as {
          session: LoginSession;
        };

      return (
        pollBody.session.status ===
        "success"
      );
    });

    console.log(
      "OK: GET /providers/:provider/login permite fazer polling até o login concluir."
    );

    const missingSessionResponse = await fetch(
      `${baseUrl}/providers/claude/login`
    );

    assert(
      missingSessionResponse.status === 404,
      `GET /providers/claude/login sem tentativa em andamento deveria retornar 404, retornou ${missingSessionResponse.status}`
    );

    console.log(
      "OK: GET /providers/:provider/login retorna 404 quando não há tentativa em andamento."
    );

    console.log(
      "\nPROVIDER AUTH FUNCIONANDO."
    );
  } finally {
    for (const key of [
      "FAKE_LOGIN_URL",
      "FAKE_LOGIN_EXIT_CODE",
      "FAKE_LOGIN_DELAY_MS",
      "FAKE_LOGIN_NO_URL",
    ]) {
      delete process.env[key];
    }

    await new Promise<void>(
      (resolve, reject) => {
        server.close((error) =>
          error ? reject(error) : resolve()
        );
      }
    );
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

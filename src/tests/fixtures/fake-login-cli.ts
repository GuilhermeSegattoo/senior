/*
 * Simula um CLI de login estilo "codex login": imprime uma URL de
 * autorização no stdout depois de um pequeno delay, e sai com um
 * código de saída configurável depois de outro delay. Controlado
 * por variáveis de ambiente pra os testes conseguirem exercitar
 * sucesso, falha e timeout sem depender do Codex/Claude reais.
 *
 * FAKE_LOGIN_URL: URL a imprimir (default: uma de exemplo).
 * FAKE_LOGIN_EXIT_CODE: código de saída final (default: 0).
 * FAKE_LOGIN_DELAY_MS: delay antes de imprimir a URL (default: 50).
 * FAKE_LOGIN_NO_URL: se "true", nunca imprime URL nenhuma.
 * FAKE_LOGIN_STREAM: "stdout" (default) ou "stderr" — onde a URL é
 * impressa. Existe porque "codex login status" imprime no stderr,
 * não no stdout (bug real encontrado testando contra o CLI de
 * verdade), então o código que lê a saída de login precisa
 * funcionar nos dois casos.
 */

const delayMs = Number(
  process.env.FAKE_LOGIN_DELAY_MS ??
    "50"
);

const exitCode = Number(
  process.env
    .FAKE_LOGIN_EXIT_CODE ?? "0"
);

const url =
  process.env.FAKE_LOGIN_URL ??
  "https://example.com/auth/authorize?state=fake";

const noUrl =
  process.env
    .FAKE_LOGIN_NO_URL === "true";

const stream =
  process.env
    .FAKE_LOGIN_STREAM === "stderr"
    ? console.error
    : console.log;

setTimeout(() => {
  if (!noUrl) {
    stream(
      `Navegue até esta URL para autenticar:\n\n${url}\n`
    );
  }

  setTimeout(() => {
    process.exit(exitCode);
  }, delayMs);
}, delayMs);

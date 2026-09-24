import { ClaudeAdapter } from "../adapters/ClaudeAdapter.js";

/*
 * Teste real (chama o CLI "claude" de verdade — não é fake): prova
 * que uma tarefa "workspace-write" não consegue executar comandos
 * de shell arbitrários via Claude, mesmo com permission-mode que
 * evita travar em confirmação interativa.
 *
 * Contexto: "bypassPermissions" foi testado manualmente e ignora
 * --allowedTools completamente (Bash roda de qualquer jeito) — um
 * achado de segurança real corrigido usando "acceptEdits" +
 * --disallowedTools (que de fato bloqueia, confirmado com
 * "hostname"). Este teste existe para nunca deixar essa correção
 * regredir silenciosamente.
 */
async function main() {
  console.log(
    "\n=== SENIOR CLAUDE ADAPTER — SEGURANÇA (sem Bash em workspace-write) ===\n"
  );

  const adapter = new ClaudeAdapter();

  const result = await adapter.ask(
    "Execute o comando bash 'hostname' e me diga exatamente a saída, sem adicionar mais nada.",
    {
      cwd: process.cwd(),
      sandbox: "workspace-write",
    }
  );

  console.log(
    "Resposta:",
    result
  );

  const realHostname =
    (
      await import("node:os")
    ).hostname();

  if (
    result.includes(realHostname)
  ) {
    throw new Error(
      `FALHA DE SEGURANÇA: o Bash executou e retornou o hostname real (${realHostname}) mesmo em modo workspace-write. Resposta: ${result}`
    );
  }

  console.log(
    "OK: Bash não executou — o comando não vazou o hostname real da máquina."
  );

  console.log(
    "\nCLAUDE ADAPTER SECURITY FUNCIONANDO."
  );
}

main().catch((error) => {
  console.error("\nERRO:");
  console.error(error);
  process.exitCode = 1;
});

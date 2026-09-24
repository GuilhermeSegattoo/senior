import { ClaudeAdapter } from "../adapters/ClaudeAdapter.js";
import { ClaudeRuntime } from "../runtimes/ClaudeRuntime.js";

/*
 * Teste real: chama o CLI "claude" de verdade, autenticado pela
 * assinatura já logada na máquina (não uma chave de API do Senior).
 * Custa uma chamada real e pequena — não faz parte da suíte
 * automática de CI, é para rodar manualmente quando mexer no
 * ClaudeAdapter/ClaudeRuntime.
 */
async function main() {
  console.log(
    "\n=== SENIOR → CLAUDE CLI (REAL) ===\n"
  );

  const adapter = new ClaudeAdapter();

  const online = await adapter.status();

  console.log(
    "Status do CLI:",
    online ? "ONLINE" : "OFFLINE"
  );

  if (!online) {
    throw new Error(
      "CLI \"claude\" não respondeu a --version. Verifique se está instalado e no PATH."
    );
  }

  const runtime = new ClaudeRuntime();

  const result = await runtime.ask(
    "Responda somente: SENIOR CLAUDE ADAPTER TEST OK",
    {
      cwd: process.cwd(),
      readOnly: true,
    }
  );

  console.log("Provider:", result.provider);
  console.log("Model:", result.model);
  console.log("Texto:", result.text);

  if (
    result.text !==
    "SENIOR CLAUDE ADAPTER TEST OK"
  ) {
    throw new Error(
      `Resposta inesperada: ${result.text}`
    );
  }

  console.log(
    "\nCLAUDE REAL VIA ClaudeRuntime FUNCIONANDO."
  );
}

main().catch((error) => {
  console.error("\nERRO:");
  console.error(error);
  process.exitCode = 1;
});

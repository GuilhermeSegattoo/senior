import {
  createAgentSession,
  createAgentSessionServices,
} from "@earendil-works/pi-coding-agent";

async function main() {
  console.log("\n=== JARVIS → PI → CLAUDE REAL ===");

  const services =
    await createAgentSessionServices({
      cwd: process.cwd(),
    });

  const model =
    services.modelRuntime.getModel(
      "anthropic",
      "claude-sonnet-5"
    );

  if (!model) {
    throw new Error(
      "Modelo openai-codex/gpt-6-astra não encontrado."
    );
  }

  console.log("Provider:", model.provider);
  console.log("Model:", model.id);

  console.log(
    "Auth configurada:",
    services.modelRuntime.hasConfiguredAuth(
      model.provider
    )
  );

  console.log(
    "OAuth:",
    services.modelRuntime.isUsingOAuth(
      model.provider
    )
  );

  const result =
    await createAgentSession({
      cwd: process.cwd(),
      modelRuntime: services.modelRuntime,
      model,
      noTools: "all",
      thinkingLevel: "off",
    });

  const session = result.session;

  await session.prompt(
    "Responda somente: JARVIS PI CLAUDE REAL ONLINE"
  );

  const lastAssistant =
    [...session.agent.state.messages]
      .reverse()
      .find(
        (message) =>
          message.role === "assistant"
      );

  if (!lastAssistant) {
    throw new Error(
      "Nenhuma resposta assistant encontrada."
    );
  }

  if (lastAssistant.stopReason === "error") {
    throw new Error(
      lastAssistant.errorMessage ??
        "Erro desconhecido do provider."
    );
  }

  const text =
    lastAssistant.content
      .filter(
        (part) => part.type === "text"
      )
      .map(
        (part) => part.text
      )
      .join("")
      .trim();

  console.log("\n=== RESPOSTA ===");
  console.log(text);

  if (
    text !==
    "JARVIS PI CLAUDE REAL ONLINE"
  ) {
    throw new Error(
      `Resposta inesperada: ${text}`
    );
  }

  console.log(
    "\nCLAUDE REAL VIA PI FUNCIONANDO."
  );
}

main().catch((error) => {
  console.error("\nERRO:");
  console.error(error);
  process.exitCode = 1;
});

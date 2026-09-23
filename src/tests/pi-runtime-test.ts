import {
  createFauxCore,
  fauxAssistantMessage,
} from "@earendil-works/pi-ai";

import { PiRuntime } from "../runtimes/PiRuntime.js";

async function main() {
  console.log("\n=== JARVIS → PI RUNTIME ===");

  const faux = createFauxCore({});

  faux.setResponses([
    fauxAssistantMessage(
      "JARVIS PI RUNTIME ONLINE"
    ),
  ]);

  const model = faux.getModel();

  if (!model) {
    throw new Error(
      "Faux provider não retornou um modelo."
    );
  }

  const runtime = new PiRuntime({
    streamFn: faux.stream,
    model,
  });

  console.log("Runtime:", runtime.name);

  const online = await runtime.status();

  console.log(
    "Status:",
    online ? "ONLINE" : "OFFLINE"
  );

  const result = await runtime.ask(
    "Responda somente: JARVIS PI RUNTIME ONLINE",
    {
      cwd: process.cwd(),
      readOnly: true,
    }
  );

  console.log("\n=== RESULTADO ===");
  console.log("Texto:", result.text);
  console.log("Provider:", result.provider);
  console.log("Model:", result.model);

  if (
    result.text !==
    "JARVIS PI RUNTIME ONLINE"
  ) {
    throw new Error(
      `Resposta inesperada: ${result.text}`
    );
  }

  console.log(
    "\nJARVIS → PI RUNTIME FUNCIONANDO."
  );
}

main().catch((error) => {
  console.error("\nERRO:");
  console.error(error);

  process.exitCode = 1;
});

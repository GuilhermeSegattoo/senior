import {
  mkdtemp,
  mkdir,
  readFile,
  rm,
} from "node:fs/promises";

import os from "node:os";
import path from "node:path";

import { PiRuntime } from "../runtimes/PiRuntime.js";

const workspace = await mkdtemp(
  path.join(os.tmpdir(), "senior-pi-write-")
);

try {
  await mkdir(
    path.join(workspace, "src"),
    { recursive: true }
  );

  console.log(
    "=== SENIOR → PI → GPT → SAFE WRITE TOOL ==="
  );

  console.log("Workspace:", workspace);

  const runtime = new PiRuntime({
    provider: "openai-codex",
    modelName: "gpt-6-astra",
  });

  const result = await runtime.ask(
    [
      "Use obrigatoriamente a ferramenta write_project_file.",
      "Crie o arquivo src/pi-created.txt.",
      "O conteúdo do arquivo deve ser exatamente:",
      "SENIOR PI SAFE WRITE OK",
      "Não use nenhuma outra forma de escrita.",
      "Depois responda apenas: ARQUIVO CRIADO",
    ].join("\n"),
    {
      cwd: workspace,
      readOnly: false,
    }
  );

  console.log("\n=== RESPOSTA DO AGENTE ===");
  console.log(result.text);

  const target =
    path.join(
      workspace,
      "src",
      "pi-created.txt"
    );

  const content =
    await readFile(target, "utf8");

  console.log("\n=== ARQUIVO ===");
  console.log(content);

  if (
    content !==
    "SENIOR PI SAFE WRITE OK"
  ) {
    throw new Error(
      "O conteúdo criado pelo Pi está incorreto."
    );
  }

  console.log(
    "\nPI SAFE WRITE FUNCIONANDO."
  );
} finally {
  await rm(
    workspace,
    {
      recursive: true,
      force: true,
    }
  );
}

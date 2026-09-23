import {
  mkdtemp,
  mkdir,
  readFile,
  realpath,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";

import os from "node:os";
import path from "node:path";

import { PiRuntime } from "../runtimes/PiRuntime.js";

const workspace = await mkdtemp(
  path.join(
    os.tmpdir(),
    "senior-pi-check-"
  )
);

try {
  await mkdir(
    path.join(workspace, "src"),
    {
      recursive: true,
    }
  );

  await writeFile(
    path.join(
      workspace,
      "tsconfig.json"
    ),
    JSON.stringify(
      {
        compilerOptions: {
          strict: true,
          noEmit: true,
          target: "ES2022",
          module: "NodeNext",
          moduleResolution: "NodeNext",
        },

        include: [
          "src/**/*.ts",
        ],
      },
      null,
      2
    ),
    "utf8"
  );

  await writeFile(
    path.join(
      workspace,
      "src",
      "index.ts"
    ),
    [
      "const message: string = 'SENIOR';",
      "console.log(message);",
      "",
    ].join("\n"),
    "utf8"
  );

  /*
   * O workspace temporário precisa ter acesso
   * às dependências já instaladas no Senior.
   *
   * Não instalamos nada da internet.
   */
  const seniorRoot =
    await realpath(
      path.resolve(
        import.meta.dirname,
        "../.."
      )
    );

  const seniorNodeModules =
    path.join(
      seniorRoot,
      "node_modules"
    );

  const workspaceNodeModules =
    path.join(
      workspace,
      "node_modules"
    );

  await symlink(
    seniorNodeModules,
    workspaceNodeModules,
    "dir"
  );

  console.log(
    "=== SENIOR → PI → GPT → SAFE PROJECT CHECK ==="
  );

  console.log(
    "Workspace:",
    workspace
  );

  const runtime =
    new PiRuntime({
      provider:
        "openai-codex",

      modelName:
        "gpt-6-astra",
    });

  const result =
    await runtime.ask(
      [
        "Use obrigatoriamente a ferramenta run_project_check.",
        'Execute exatamente o check "typecheck".',
        "Não altere nenhum arquivo.",
        "Analise o resultado real da ferramenta.",

        "Se o typecheck passar, responda somente:",
        "TYPECHECK APROVADO",

        "Se falhar, responda somente:",
        "TYPECHECK REPROVADO",
      ].join("\n"),

      {
        cwd: workspace,
        readOnly: true,
      }
    );

  console.log(
    "\n=== RESPOSTA DO AGENTE ==="
  );

  console.log(
    result.text
  );

  if (
    result.text.trim() !==
    "TYPECHECK APROVADO"
  ) {
    throw new Error(
      `Resultado inesperado do agente: ${result.text}`
    );
  }

  /*
   * Confirma também que o agente
   * não alterou o arquivo.
   */
  const source =
    await readFile(
      path.join(
        workspace,
        "src",
        "index.ts"
      ),
      "utf8"
    );

  if (
    !source.includes(
      "const message: string = 'SENIOR';"
    )
  ) {
    throw new Error(
      "O arquivo do projeto foi alterado."
    );
  }

  console.log(
    "\nPI SAFE PROJECT CHECK FUNCIONANDO."
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

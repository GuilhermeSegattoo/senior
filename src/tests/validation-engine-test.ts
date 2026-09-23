import {
  mkdtemp,
  mkdir,
  realpath,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";

import os from "node:os";
import path from "node:path";

import {
  ValidationEngine,
} from "../core/ValidationEngine.js";

import {
  ValidationManager,
} from "../core/ValidationManager.js";

import type {
  ManagedTask,
} from "../types/Task.js";

const workspace =
  await mkdtemp(
    path.join(
      os.tmpdir(),
      "jarvis-validation-engine-"
    )
  );

try {
  console.log(
    "\n=== JARVIS VALIDATION ENGINE ==="
  );

  console.log(
    `Workspace: ${workspace}`
  );

  await mkdir(
    path.join(workspace, "src"),
    {
      recursive: true,
    }
  );

  await writeFile(
    path.join(
      workspace,
      "src",
      "index.ts"
    ),
    [
      "export function sum(",
      "  a: number,",
      "  b: number",
      "): number {",
      "  return a + b;",
      "}",
      "",
    ].join("\n"),
    "utf8"
  );

  await writeFile(
    path.join(
      workspace,
      "tsconfig.json"
    ),
    JSON.stringify(
      {
        compilerOptions: {
          target: "ES2022",
          module: "NodeNext",
          moduleResolution:
            "NodeNext",
          strict: true,
          noEmit: true,
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

  /*
   * O workspace temporário não possui
   * dependências próprias.
   *
   * Para este teste usamos o
   * node_modules já instalado no Jarvis.
   */
  const jarvisRoot =
    path.resolve(
      import.meta.dirname,
      "../.."
    );

  const jarvisNodeModules =
    await realpath(
      path.join(
        jarvisRoot,
        "node_modules"
      )
    );

  await symlink(
    jarvisNodeModules,
    path.join(
      workspace,
      "node_modules"
    ),
    "dir"
  );

  const task: ManagedTask = {
    id: "validation-engine-001",

    agent: "backend",

    task:
      "Validar projeto TypeScript.",

    dependsOn: [],

    status: "DONE",

    requiredChecks: [
      "typecheck",
    ],
  };

  const manager =
    new ValidationManager();

  const validation =
    manager.initialize(task);

  const engine =
    new ValidationEngine();

  const result =
    await engine.runChecks(
      workspace,
      validation
    );

  if (!result.passed) {
    throw new Error(
      "ValidationEngine deveria aprovar o workspace."
    );
  }

  if (
    result.validation.status !==
    "PASSED"
  ) {
    throw new Error(
      `Status esperado PASSED, recebido ${result.validation.status}`
    );
  }

  const check =
    result.attempt.checks.find(
      (item) =>
        item.check ===
        "typecheck"
    );

  if (!check) {
    throw new Error(
      "Evidência do typecheck não encontrada."
    );
  }

  if (
    check.status !== "PASSED"
  ) {
    throw new Error(
      `Typecheck deveria estar PASSED, recebido ${check.status}`
    );
  }

  if (!check.evidence) {
    throw new Error(
      "O check deveria possuir evidência."
    );
  }

  console.log(
    "\n=== EVIDÊNCIA ==="
  );

  console.log(
    `Tipo: ${check.evidence.type}`
  );

  console.log(
    `Fonte: ${check.evidence.source}`
  );

  console.log(
    `Status: ${check.status}`
  );

  console.log(
    "\nVALIDATION ENGINE FUNCIONANDO."
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

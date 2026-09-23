import {
  mkdtemp,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises";

import os from "node:os";
import path from "node:path";

import { ProjectMemory } from "../core/ProjectMemory.js";

async function main() {
  console.log(
    "\n=== SENIOR PROJECT MEMORY (.senior/) ===\n"
  );

  const projectPath =
    await mkdtemp(
      path.join(
        os.tmpdir(),
        "senior-project-memory-"
      )
    );

  try {
    const memory =
      new ProjectMemory();

    await memory.ensureStructure(
      projectPath
    );

    const projectMd =
      await readFile(
        path.join(
          projectPath,
          ".senior",
          "PROJECT.md"
        ),
        "utf8"
      );

    if (
      !projectMd.includes(
        "PROJECT.md"
      )
    ) {
      throw new Error(
        "PROJECT.md padrão não foi criado corretamente."
      );
    }

    console.log(
      "OK: ensureStructure cria .senior/ com os arquivos padrão."
    );

    // -------------------------------------------------------
    // Não deve sobrescrever conteúdo já existente (curado por
    // humanos/agentes).
    // -------------------------------------------------------

    await writeFile(
      path.join(
        projectPath,
        ".senior",
        "PROJECT.md"
      ),
      "# Meu projeto customizado\n\nConteúdo escrito por um humano.",
      "utf8"
    );

    await memory.ensureStructure(
      projectPath
    );

    const projectMdAfter =
      await readFile(
        path.join(
          projectPath,
          ".senior",
          "PROJECT.md"
        ),
        "utf8"
      );

    if (
      !projectMdAfter.includes(
        "Meu projeto customizado"
      )
    ) {
      throw new Error(
        "ensureStructure sobrescreveu conteúdo curado por humano — isso não pode acontecer."
      );
    }

    console.log(
      "OK: ensureStructure nunca sobrescreve conteúdo já existente."
    );

    // -------------------------------------------------------
    // recordTaskDecision + readContext
    // -------------------------------------------------------

    await memory.recordTaskDecision(
      projectPath,
      {
        taskId: "task-1",
        agent: "backend",
        objective:
          "Testar memória de projeto.",
        task: "Implementar endpoint X.",
        result:
          "Endpoint X implementado e testado.",
        status: "VALIDATED",
        commit: "abc123",
        headCommit: "abc123",
      }
    );

    const context =
      await memory.readContext(
        projectPath
      );

    if (
      !context.includes(
        "Meu projeto customizado"
      )
    ) {
      throw new Error(
        "readContext não incluiu o PROJECT.md customizado."
      );
    }

    if (
      !context.includes(
        "task-1"
      ) ||
      !context.includes(
        "Endpoint X implementado"
      )
    ) {
      throw new Error(
        `readContext não incluiu a decisão registrada: ${context}`
      );
    }

    console.log(
      "OK: recordTaskDecision persiste e readContext inclui a decisão."
    );

    console.log(
      "\nPROJECT MEMORY FUNCIONANDO."
    );
  } finally {
    await rm(projectPath, {
      recursive: true,
      force: true,
    });
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

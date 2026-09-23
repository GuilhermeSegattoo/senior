import {
  mkdtemp,
  rm,
  writeFile,
} from "node:fs/promises";

import { execFile } from "node:child_process";
import { promisify } from "node:util";
import os from "node:os";
import path from "node:path";

import { GitStatusTool } from "../tools/GitStatusTool.js";
import { GitDiffTool } from "../tools/GitDiffTool.js";
import { SearchProjectFilesTool } from "../tools/SearchProjectFilesTool.js";
import { EditProjectFileTool } from "../tools/EditProjectFileTool.js";
import { InspectPackageJsonTool } from "../tools/InspectPackageJsonTool.js";
import { RunProjectCheckTool } from "../tools/RunProjectCheckTool.js";

const execFileAsync =
  promisify(execFile);

async function git(
  cwd: string,
  args: string[]
): Promise<void> {
  await execFileAsync(
    "git",
    args,
    { cwd }
  );
}

async function main() {
  console.log(
    "\n=== SENIOR FASE B — FERRAMENTAS SEGURAS ===\n"
  );

  const workspace =
    await mkdtemp(
      path.join(
        os.tmpdir(),
        "senior-fase-b-"
      )
    );

  try {
    await git(workspace, [
      "init",
      "-b",
      "main",
    ]);

    await git(workspace, [
      "config",
      "user.name",
      "Senior Test",
    ]);

    await git(workspace, [
      "config",
      "user.email",
      "test@local",
    ]);

    await writeFile(
      path.join(
        workspace,
        "hello.txt"
      ),
      "ola mundo\nlinha dois\n",
      "utf8"
    );

    await writeFile(
      path.join(
        workspace,
        "package.json"
      ),
      JSON.stringify(
        {
          name: "fase-b-test",
          version: "1.0.0",
          scripts: {
            build: "echo build",
          },
          dependencies: {
            "left-pad": "^1.0.0",
          },
          devDependencies: {
            typescript: "^5.0.0",
          },
        },
        null,
        2
      ),
      "utf8"
    );

    await git(workspace, [
      "add",
      "--all",
    ]);

    await git(workspace, [
      "commit",
      "-m",
      "commit inicial",
    ]);

    // -------------------------------------------------------
    // GitStatusTool
    // -------------------------------------------------------

    const statusTool =
      new GitStatusTool(workspace);

    const cleanStatus =
      await statusTool.execute();

    if (!cleanStatus.clean) {
      throw new Error(
        `Esperado workspace limpo logo após o commit, obtido: ${cleanStatus.status}`
      );
    }

    await writeFile(
      path.join(
        workspace,
        "hello.txt"
      ),
      "ola mundo alterado\nlinha dois\n",
      "utf8"
    );

    const dirtyStatus =
      await statusTool.execute();

    if (dirtyStatus.clean) {
      throw new Error(
        "Esperado workspace sujo após alterar hello.txt."
      );
    }

    console.log(
      "OK: git_status detecta workspace limpo e sujo."
    );

    // -------------------------------------------------------
    // GitDiffTool
    // -------------------------------------------------------

    const diffTool =
      new GitDiffTool(workspace);

    const diff =
      await diffTool.execute();

    if (
      !diff.diff.includes(
        "ola mundo alterado"
      )
    ) {
      throw new Error(
        `git_diff não capturou a alteração esperada. Diff: ${diff.diff}`
      );
    }

    console.log(
      "OK: git_diff mostra a alteração não commitada."
    );

    // -------------------------------------------------------
    // SearchProjectFilesTool
    // -------------------------------------------------------

    const searchTool =
      new SearchProjectFilesTool(
        workspace
      );

    const searchResult =
      await searchTool.execute(
        "linha dois"
      );

    if (
      searchResult.matches
        .length !== 1 ||
      searchResult.matches[0]
        .path !== "hello.txt"
    ) {
      throw new Error(
        `Busca não encontrou a linha esperada: ${JSON.stringify(searchResult)}`
      );
    }

    console.log(
      "OK: search_project_files encontra o trecho esperado."
    );

    // -------------------------------------------------------
    // EditProjectFileTool
    // -------------------------------------------------------

    const editTool =
      new EditProjectFileTool(
        workspace
      );

    const editResult =
      await editTool.execute(
        "hello.txt",
        "ola mundo alterado",
        "ola mundo editado"
      );

    if (
      editResult.occurrences !== 1
    ) {
      throw new Error(
        `Esperada 1 ocorrência editada, obtido ${editResult.occurrences}`
      );
    }

    let editThrew = false;

    try {
      await editTool.execute(
        "hello.txt",
        "texto que não existe",
        "novo texto"
      );
    } catch {
      editThrew = true;
    }

    if (!editThrew) {
      throw new Error(
        "edit_project_file deveria falhar quando oldString não existe."
      );
    }

    console.log(
      "OK: edit_project_file substitui o trecho e rejeita trechos inexistentes."
    );

    // -------------------------------------------------------
    // InspectPackageJsonTool
    // -------------------------------------------------------

    const inspectorTool =
      new InspectPackageJsonTool(
        workspace
      );

    const summary =
      await inspectorTool.execute();

    if (
      summary.name !==
        "fase-b-test" ||
      !summary.dependencies.includes(
        "left-pad"
      ) ||
      !summary.devDependencies.includes(
        "typescript"
      ) ||
      summary.scripts.build !==
        "echo build"
    ) {
      throw new Error(
        `Resumo do package.json incorreto: ${JSON.stringify(summary)}`
      );
    }

    console.log(
      "OK: inspect_package_json resume nome, scripts e dependências corretamente."
    );

    // -------------------------------------------------------
    // RunProjectCheckTool — script não configurado
    // -------------------------------------------------------

    const checkTool =
      new RunProjectCheckTool(
        workspace
      );

    const lintResult =
      await checkTool.execute(
        "lint"
      );

    if (!lintResult.success) {
      throw new Error(
        `Check "lint" sem script configurado deveria ser tratado como sem pendências. Resultado: ${JSON.stringify(lintResult)}`
      );
    }

    if (
      !lintResult.output.includes(
        "Nenhum script"
      )
    ) {
      throw new Error(
        `Esperada mensagem de script não configurado, obtido: ${lintResult.output}`
      );
    }

    console.log(
      "OK: run_project_check reporta claramente um script não configurado em vez de falhar."
    );

    console.log(
      "\nFASE B — FERRAMENTAS SEGURAS FUNCIONANDO."
    );
  } finally {
    await rm(workspace, {
      recursive: true,
      force: true,
    });
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

import {
  mkdir,
  mkdtemp,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises";

import os from "node:os";
import path from "node:path";

import { ProjectManager } from "../core/ProjectManager.js";
import { GitManager } from "../core/GitManager.js";

/*
 * Evita depender de rede real (clonar do GitHub de verdade) para
 * testar importGithub(): substitui só o clone, o resto do fluxo
 * (parse da URL, criação do registro do projeto) roda de verdade.
 */
class FakeGitManager extends GitManager {
  async cloneRepository(
    _url: string,
    destPath: string
  ): Promise<{
    defaultBranch: string;
  }> {
    await mkdir(destPath, {
      recursive: true,
    });

    await writeFile(
      path.join(
        destPath,
        "README.md"
      ),
      "clonado (fake)",
      "utf8"
    );

    return { defaultBranch: "main" };
  }
}

async function cleanupProject(
  projectId: string
): Promise<void> {
  const projectsFile = path.join(
    process.cwd(),
    "data",
    "projects.json"
  );

  try {
    const content =
      await readFile(
        projectsFile,
        "utf8"
      );

    const projects = JSON.parse(
      content
    ) as Array<{ id: string }>;

    const remaining =
      projects.filter(
        (project) =>
          project.id !== projectId
      );

    await writeFile(
      projectsFile,
      JSON.stringify(
        remaining,
        null,
        2
      ),
      "utf8"
    );
  } catch {
    // Sem projects.json para limpar.
  }
}

async function main() {
  console.log(
    "\n=== SENIOR PROJECT IMPORT (pasta local + GitHub) ===\n"
  );

  const externalFolder =
    await mkdtemp(
      path.join(
        os.tmpdir(),
        "senior-import-local-"
      )
    );

  try {
    await writeFile(
      path.join(
        externalFolder,
        "package.json"
      ),
      JSON.stringify({
        name: "projeto-externo",
      }),
      "utf8"
    );

    const projectManager =
      new ProjectManager();

    // -------------------------------------------------------
    // importLocal
    // -------------------------------------------------------

    const imported =
      await projectManager.importLocal(
        { path: externalFolder }
      );

    try {
      if (
        path.resolve(
          imported.path
        ) !==
        path.resolve(
          externalFolder
        )
      ) {
        throw new Error(
          `importLocal deveria apontar direto pra pasta externa, apontou para ${imported.path}`
        );
      }

      console.log(
        "OK: importLocal() aponta o projeto direto pra pasta existente (sem copiar)."
      );

      let duplicateThrew = false;

      try {
        await projectManager.importLocal(
          {
            path: externalFolder,
          }
        );
      } catch {
        duplicateThrew = true;
      }

      if (!duplicateThrew) {
        throw new Error(
          "importLocal() deveria rejeitar a mesma pasta importada duas vezes."
        );
      }

      console.log(
        "OK: importLocal() rejeita a mesma pasta já registrada."
      );
    } finally {
      await cleanupProject(
        imported.id
      );
    }

    // -------------------------------------------------------
    // importGithub (com clone falso)
    // -------------------------------------------------------

    const fakeGitProjectManager =
      new ProjectManager(
        new FakeGitManager()
      );

    const githubProject =
      await fakeGitProjectManager.importGithub(
        {
          url: "https://github.com/exemplo/meu-repo",
        }
      );

    try {
      if (
        githubProject.repository
          ?.owner !== "exemplo" ||
        githubProject.repository
          ?.name !== "meu-repo"
      ) {
        throw new Error(
          `URL do GitHub não foi parseada corretamente: ${JSON.stringify(githubProject.repository)}`
        );
      }

      if (
        githubProject.repository
          .defaultBranch !== "main"
      ) {
        throw new Error(
          "defaultBranch não veio do clone (fake) corretamente."
        );
      }

      const readmePath = path.join(
        githubProject.path,
        "README.md"
      );

      const readme = await readFile(
        readmePath,
        "utf8"
      );

      if (
        readme !== "clonado (fake)"
      ) {
        throw new Error(
          "Clone (fake) não escreveu o arquivo esperado."
        );
      }

      console.log(
        "OK: importGithub() faz parse da URL, chama o clone e persiste repository."
      );

      let invalidUrlThrew = false;

      try {
        await fakeGitProjectManager.importGithub(
          {
            url: "https://gitlab.com/exemplo/nao-e-github",
          }
        );
      } catch {
        invalidUrlThrew = true;
      }

      if (!invalidUrlThrew) {
        throw new Error(
          "importGithub() deveria rejeitar URLs que não são do GitHub."
        );
      }

      console.log(
        "OK: importGithub() rejeita URLs que não são do GitHub."
      );
    } finally {
      await rm(
        githubProject.path,
        {
          recursive: true,
          force: true,
        }
      );

      await cleanupProject(
        githubProject.id
      );
    }

    console.log(
      "\nPROJECT IMPORT FUNCIONANDO."
    );
  } finally {
    await rm(externalFolder, {
      recursive: true,
      force: true,
    });
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

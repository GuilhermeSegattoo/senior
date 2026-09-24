import {
  mkdir,
  mkdtemp,
  rm,
} from "node:fs/promises";

import os from "node:os";
import path from "node:path";

import { FilesystemBrowser } from "../core/FilesystemBrowser.js";

async function main() {
  console.log(
    "\n=== SENIOR FILESYSTEM BROWSER ===\n"
  );

  const root = await mkdtemp(
    path.join(
      os.tmpdir(),
      "senior-fs-browser-"
    )
  );

  try {
    await mkdir(
      path.join(root, "ProjetoA"),
      { recursive: true }
    );

    await mkdir(
      path.join(root, "ProjetoB"),
      { recursive: true }
    );

    await mkdir(
      path.join(root, ".git"),
      { recursive: true }
    );

    const browser =
      new FilesystemBrowser();

    const result =
      await browser.browse(root);

    if (result.path !== root) {
      throw new Error(
        `path incorreto: ${result.path}`
      );
    }

    if (
      result.parent !==
      path.dirname(root)
    ) {
      throw new Error(
        `parent incorreto: ${result.parent}`
      );
    }

    const names =
      result.directories.map(
        (entry) => entry.name
      );

    if (
      !names.includes("ProjetoA") ||
      !names.includes("ProjetoB")
    ) {
      throw new Error(
        `Diretórios esperados não encontrados: ${names.join(", ")}`
      );
    }

    if (names.includes(".git")) {
      throw new Error(
        "Pastas ocultas não deveriam aparecer na listagem."
      );
    }

    console.log(
      "OK: browse() lista subpastas, expõe o parent e ignora pastas ocultas."
    );

    const sub =
      await browser.browse(
        path.join(root, "ProjetoA")
      );

    if (sub.parent !== root) {
      throw new Error(
        `Esperado parent=${root}, obtido ${sub.parent}`
      );
    }

    if (sub.directories.length !== 0) {
      throw new Error(
        "ProjetoA deveria estar vazio."
      );
    }

    console.log(
      "OK: browse() de uma subpasta aponta o parent corretamente."
    );

    let threw = false;

    try {
      await browser.browse(
        path.join(
          root,
          "nao-existe"
        )
      );
    } catch {
      threw = true;
    }

    if (!threw) {
      throw new Error(
        "browse() deveria falhar para um caminho inexistente."
      );
    }

    console.log(
      "OK: browse() rejeita caminho inexistente."
    );

    console.log(
      "\nFILESYSTEM BROWSER FUNCIONANDO."
    );
  } finally {
    await rm(root, {
      recursive: true,
      force: true,
    });
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

import {
  readdir,
  stat,
} from "node:fs/promises";

import type { Dirent } from "node:fs";

import os from "node:os";
import path from "node:path";

export interface FilesystemEntry {
  name: string;
  path: string;
}

export interface FilesystemBrowseResult {
  path: string;
  parent: string | null;
  directories: FilesystemEntry[];
}

/*
 * Navegador de pastas do disco local, usado pelo fluxo de "importar
 * projeto de uma pasta" no frontend. Só existe porque o navegador
 * não devolve caminho absoluto de pastas escolhidas via picker
 * nativo (File System Access API) — aqui quem lista é o Node, que
 * tem acesso real ao filesystem, então o resultado é um caminho
 * absoluto de verdade.
 *
 * Só lista diretórios (não arquivos) e ignora pastas ocultas
 * (começando com ".") — é um seletor de pasta de projeto, não um
 * explorador de arquivos completo.
 */
export class FilesystemBrowser {
  async browse(
    requestedPath?: string
  ): Promise<FilesystemBrowseResult> {
    const target = requestedPath
      ? path.resolve(requestedPath)
      : os.homedir();

    const info = await stat(
      target
    ).catch(() => null);

    if (!info || !info.isDirectory()) {
      throw new Error(
        `Caminho inválido ou não é uma pasta: ${target}`
      );
    }

    const parent = path.dirname(
      target
    );

    const hasParent =
      parent !== target;

    let entries: Dirent[];

    try {
      entries = await readdir(
        target,
        {
          withFileTypes: true,
          encoding: "utf8",
        }
      );
    } catch (error) {
      throw new Error(
        `Não foi possível listar ${target}: ${
          error instanceof Error
            ? error.message
            : String(error)
        }`
      );
    }

    const directories = entries
      .filter(
        (entry) =>
          entry.isDirectory() &&
          !entry.name.startsWith(".")
      )
      .map((entry) => ({
        name: entry.name,
        path: path.join(
          target,
          entry.name
        ),
      }))
      .sort((a, b) =>
        a.name.localeCompare(b.name)
      );

    return {
      path: target,
      parent: hasParent
        ? parent
        : null,
      directories,
    };
  }
}

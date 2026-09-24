import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync =
  promisify(execFile);

export interface ResolvedCliCommand {
  command: string;
  prefixArgs: string[];
}

const cache = new Map<
  string,
  ResolvedCliCommand
>();

/*
 * Resolve o executável real por trás de um binário global instalado
 * via "npm install -g" (codex, claude, e futuramente grok).
 *
 * No Windows, o comando que fica na PATH é sempre um shim .cmd, e
 * child_process.spawn() não consegue executá-lo sem shell:true — e
 * shell:true não é seguro aqui porque o prompt do usuário vira um
 * dos argumentos, e Node não escapa argumentos com segurança quando
 * combinado com shell:true (é por isso que existe o aviso de
 * depreciação DEP0190 para essa combinação).
 *
 * A saída real: usar "where <comando>" pra achar o .cmd, e a partir
 * do diretório dele, montar o caminho pro executável de verdade que
 * o próprio shim invoca internamente (confirmado lendo o conteúdo de
 * cada shim: às vezes é um .js rodado via node, às vezes é um .exe
 * nativo compilado — daí a checagem de extensão abaixo). Em POSIX o
 * shim já é diretamente executável, então isso é só um fallback pro
 * comando original.
 */
export async function resolveGlobalCli(
  command: string,
  entryRelativePath: string[]
): Promise<ResolvedCliCommand> {
  const cacheKey = `${command}:${entryRelativePath.join(
    "/"
  )}`;

  const cached =
    cache.get(cacheKey);

  if (cached) {
    return cached;
  }

  if (
    process.platform === "win32"
  ) {
    try {
      const { stdout } =
        await execFileAsync(
          "where",
          [command]
        );

      const shimPath = stdout
        .split(/\r?\n/)
        .map((line) =>
          line.trim()
        )
        .find((line) =>
          line
            .toLowerCase()
            .endsWith(".cmd")
        );

      if (shimPath) {
        const entry = path.join(
          path.dirname(shimPath),
          ...entryRelativePath
        );

        if (existsSync(entry)) {
          const isNodeScript =
            entry
              .toLowerCase()
              .endsWith(".js") ||
            entry
              .toLowerCase()
              .endsWith(".mjs");

          const resolved: ResolvedCliCommand =
            isNodeScript
              ? {
                  command:
                    process.execPath,
                  prefixArgs: [
                    entry,
                  ],
                }
              : {
                  command: entry,
                  prefixArgs: [],
                };

          cache.set(
            cacheKey,
            resolved
          );

          return resolved;
        }
      }
    } catch {
      // Cai para o fallback abaixo.
    }
  }

  const fallback: ResolvedCliCommand =
    {
      command,
      prefixArgs: [],
    };

  cache.set(cacheKey, fallback);
  return fallback;
}

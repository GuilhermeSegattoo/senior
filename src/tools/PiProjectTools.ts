import { Type } from "@earendil-works/pi-ai";

import { ListProjectFilesTool } from "./ListProjectFilesTool.js";
import { ReadProjectFileTool } from "./ReadProjectFileTool.js";
import { WriteProjectFileTool } from "./WriteProjectFileTool.js";
import { EditProjectFileTool } from "./EditProjectFileTool.js";
import { RunProjectCheckTool } from "./RunProjectCheckTool.js";
import { GitStatusTool } from "./GitStatusTool.js";
import { GitDiffTool } from "./GitDiffTool.js";
import { SearchProjectFilesTool } from "./SearchProjectFilesTool.js";
import { InspectPackageJsonTool } from "./InspectPackageJsonTool.js";

export function createPiProjectTools(
  workspace: string,
  readOnly = false
) {
  const lister =
    new ListProjectFilesTool(workspace);

  const reader =
    new ReadProjectFileTool(workspace);

  const writer =
    new WriteProjectFileTool(workspace);

  const editor =
    new EditProjectFileTool(workspace);

  const checker =
    new RunProjectCheckTool(workspace);

  const gitStatus =
    new GitStatusTool(workspace);

  const gitDiff =
    new GitDiffTool(workspace);

  const searcher =
    new SearchProjectFilesTool(
      workspace
    );

  const packageInspector =
    new InspectPackageJsonTool(
      workspace
    );

  const listTool = {
    name: "list_project_files",
    label: "Listar arquivos do projeto",

    description:
      "Lista arquivos dentro do workspace autorizado do projeto, ignorando diretórios gerados e symlinks.",

    parameters: Type.Object({
      path: Type.Optional(
        Type.String({
          description:
            "Diretório relativo ao workspace. Use . para listar o projeto inteiro.",
        })
      ),
    }),

    async execute(
      _toolCallId: string,
      params: { path?: string }
    ) {
      const result =
        await lister.execute(
          params.path ?? "."
        );

      return {
        content: [
          {
            type: "text" as const,
            text:
              result.files.length > 0
                ? result.files.join("\n")
                : "Nenhum arquivo encontrado.",
          },
        ],

        details: {
          total: result.total,
          truncated: result.truncated,
        },
      };
    },
  };

  const readTool = {
    name: "read_project_file",
    label: "Ler arquivo do projeto",

    description:
      "Lê um arquivo de texto dentro do workspace autorizado do projeto.",

    parameters: Type.Object({
      path: Type.String({
        description:
          "Caminho relativo ao workspace, por exemplo src/index.ts.",
      }),
    }),

    async execute(
      _toolCallId: string,
      params: { path: string }
    ) {
      const result =
        await reader.execute(params.path);

      return {
        content: [
          {
            type: "text" as const,
            text: result.content,
          },
        ],

        details: {
          path: result.path,
          bytes: result.bytes,
        },
      };
    },
  };

  const writeTool = {
    name: "write_project_file",
    label: "Escrever arquivo do projeto",

    description:
      "Cria ou sobrescreve um arquivo de texto dentro do workspace autorizado do projeto.",

    parameters: Type.Object({
      path: Type.String({
        description:
          "Caminho relativo ao workspace.",
      }),

      content: Type.String({
        description:
          "Conteúdo completo que será gravado no arquivo.",
      }),
    }),

    async execute(
      _toolCallId: string,
      params: {
        path: string;
        content: string;
      }
    ) {
      if (readOnly) {
        throw new Error(
          "Este agente está em modo somente leitura."
        );
      }

      const result =
        await writer.execute(
          params.path,
          params.content
        );

      return {
        content: [
          {
            type: "text" as const,
            text:
              `Arquivo gravado com sucesso: ${result.path}`,
          },
        ],

        details: {
          path: result.path,
          bytes: result.bytes,
        },
      };
    },
  };

  const checkTool = {
  name: "run_project_check",
  label: "Executar validação do projeto",

  description:
    "Executa uma validação segura e pré-autorizada no projeto. Não permite comandos arbitrários.",

  parameters: Type.Object({
    check: Type.Union([
      Type.Literal("typecheck"),
      Type.Literal("test"),
      Type.Literal("lint"),
      Type.Literal("build"),
    ]),
  }),

  async execute(
    _toolCallId: string,
    params: {
      check:
        | "typecheck"
        | "test"
        | "lint"
        | "build";
    }
  ) {
    const result =
      await checker.execute(
        params.check
      );

    return {
      content: [
        {
          type: "text" as const,
          text: [
            `Check: ${result.check}`,
            `Comando: ${result.command}`,
            `Exit code: ${result.exitCode}`,
            `Success: ${result.success}`,
            "",
            result.output ||
              "Comando concluído sem saída.",
          ].join("\n"),
        },
      ],

      details: {
        check: result.check,
        exitCode: result.exitCode,
        success: result.success,
      },
    };
  },
};

  const editTool = {
    name: "edit_project_file",
    label: "Editar arquivo do projeto",

    description:
      "Substitui um trecho exato de um arquivo do workspace por outro, sem precisar reescrever o arquivo inteiro.",

    parameters: Type.Object({
      path: Type.String({
        description:
          "Caminho relativo ao workspace.",
      }),

      oldString: Type.String({
        description:
          "Trecho exato a ser substituído. Deve existir literalmente no arquivo.",
      }),

      newString: Type.String({
        description:
          "Texto que substitui oldString.",
      }),

      replaceAll: Type.Optional(
        Type.Boolean({
          description:
            "Substitui todas as ocorrências de oldString em vez de exigir uma única ocorrência.",
        })
      ),
    }),

    async execute(
      _toolCallId: string,
      params: {
        path: string;
        oldString: string;
        newString: string;
        replaceAll?: boolean;
      }
    ) {
      if (readOnly) {
        throw new Error(
          "Este agente está em modo somente leitura."
        );
      }

      const result =
        await editor.execute(
          params.path,
          params.oldString,
          params.newString,
          params.replaceAll ?? false
        );

      return {
        content: [
          {
            type: "text" as const,
            text: `Arquivo editado com sucesso: ${result.path} (${result.occurrences} ocorrência(s)).`,
          },
        ],

        details: {
          path: result.path,
          bytes: result.bytes,
          occurrences:
            result.occurrences,
        },
      };
    },
  };

  const gitStatusTool = {
    name: "git_status",
    label: "Ver status do git",

    description:
      "Mostra os arquivos alterados/não commitados no workspace da tarefa (git status --short).",

    parameters: Type.Object({}),

    async execute() {
      const result =
        await gitStatus.execute();

      return {
        content: [
          {
            type: "text" as const,
            text:
              result.status ||
              "Nenhuma alteração pendente.",
          },
        ],

        details: {
          clean: result.clean,
        },
      };
    },
  };

  const gitDiffTool = {
    name: "git_diff",
    label: "Ver diff do git",

    description:
      "Mostra o diff (contra HEAD) das alterações no workspace da tarefa, opcionalmente restrito a um caminho.",

    parameters: Type.Object({
      path: Type.Optional(
        Type.String({
          description:
            "Caminho relativo ao workspace para restringir o diff.",
        })
      ),
    }),

    async execute(
      _toolCallId: string,
      params: { path?: string }
    ) {
      const result =
        await gitDiff.execute(
          params.path
        );

      return {
        content: [
          {
            type: "text" as const,
            text:
              result.diff ||
              "Nenhuma diferença encontrada.",
          },
        ],

        details: {
          truncated:
            result.truncated,
        },
      };
    },
  };

  const searchTool = {
    name: "search_project_files",
    label: "Buscar texto no projeto",

    description:
      "Busca um trecho de texto nos arquivos do workspace autorizado, ignorando diretórios gerados.",

    parameters: Type.Object({
      query: Type.String({
        description:
          "Texto a ser buscado (correspondência literal, não regex).",
      }),

      path: Type.Optional(
        Type.String({
          description:
            "Diretório relativo ao workspace para restringir a busca.",
        })
      ),

      caseSensitive: Type.Optional(
        Type.Boolean({
          description:
            "Se true, diferencia maiúsculas de minúsculas. Padrão: false.",
        })
      ),
    }),

    async execute(
      _toolCallId: string,
      params: {
        query: string;
        path?: string;
        caseSensitive?: boolean;
      }
    ) {
      const result =
        await searcher.execute(
          params.query,
          {
            path: params.path,
            caseSensitive:
              params.caseSensitive,
          }
        );

      const text =
        result.matches.length > 0
          ? result.matches
              .map(
                (match) =>
                  `${match.path}:${match.line}: ${match.text}`
              )
              .join("\n")
          : "Nenhuma correspondência encontrada.";

      return {
        content: [
          {
            type: "text" as const,
            text,
          },
        ],

        details: {
          total:
            result.matches.length,
          truncated:
            result.truncated,
        },
      };
    },
  };

  const inspectPackageJsonTool = {
    name: "inspect_package_json",
    label: "Inspecionar package.json",

    description:
      "Retorna um resumo estruturado do package.json do workspace: nome, versão, scripts e dependências.",

    parameters: Type.Object({}),

    async execute() {
      const result =
        await packageInspector.execute();

      const lines = [
        `Nome: ${result.name ?? "(sem nome)"}`,
        `Versão: ${result.version ?? "(sem versão)"}`,
        "",
        "Scripts:",
        ...Object.entries(
          result.scripts
        ).map(
          ([name, command]) =>
            `  ${name}: ${command}`
        ),
        "",
        `Dependencies (${result.dependencies.length}): ${result.dependencies.join(", ") || "nenhuma"}`,
        `DevDependencies (${result.devDependencies.length}): ${result.devDependencies.join(", ") || "nenhuma"}`,
      ];

      return {
        content: [
          {
            type: "text" as const,
            text: lines.join("\n"),
          },
        ],

        details: result,
      };
    },
  };

  const readOnlyTools = [
    listTool,
    readTool,
    checkTool,
    gitStatusTool,
    gitDiffTool,
    searchTool,
    inspectPackageJsonTool,
  ];

  return readOnly
    ? readOnlyTools
    : [
        ...readOnlyTools,
        writeTool,
        editTool,
      ];
}

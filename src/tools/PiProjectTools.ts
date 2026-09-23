import { Type } from "@earendil-works/pi-ai";

import { ListProjectFilesTool } from "./ListProjectFilesTool.js";
import { ReadProjectFileTool } from "./ReadProjectFileTool.js";
import { WriteProjectFileTool } from "./WriteProjectFileTool.js";
import { RunProjectCheckTool } from "./RunProjectCheckTool.js";

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

  const checker =
    new RunProjectCheckTool(workspace);

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

  return readOnly
  ? [
      listTool,
      readTool,
      checkTool,
    ]
  : [
      listTool,
      readTool,
      writeTool,
      checkTool,
    ];
}

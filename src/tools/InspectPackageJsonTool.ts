import { ReadProjectFileTool } from "./ReadProjectFileTool.js";

export interface PackageJsonSummary {
  name?: string;
  version?: string;
  scripts: Record<string, string>;
  dependencies: string[];
  devDependencies: string[];
}

/*
 * Resumo estruturado do package.json do workspace, para o agente
 * descobrir scripts/dependências disponíveis sem precisar ler (e
 * gastar contexto com) o arquivo inteiro — que em projetos reais
 * cresce muito por causa das dependências.
 */
export class InspectPackageJsonTool {
  private readonly reader: ReadProjectFileTool;

  constructor(
    workspace: string
  ) {
    this.reader =
      new ReadProjectFileTool(
        workspace
      );
  }

  async execute(): Promise<PackageJsonSummary> {
    const file =
      await this.reader.execute(
        "package.json"
      );

    let parsed: unknown;

    try {
      parsed = JSON.parse(
        file.content
      );
    } catch (error) {
      throw new Error(
        `package.json inválido: ${
          error instanceof Error
            ? error.message
            : String(error)
        }`
      );
    }

    const record =
      parsed as {
        name?: unknown;
        version?: unknown;
        scripts?: unknown;
        dependencies?: unknown;
        devDependencies?: unknown;
      };

    return {
      name:
        typeof record.name ===
        "string"
          ? record.name
          : undefined,

      version:
        typeof record.version ===
        "string"
          ? record.version
          : undefined,

      scripts:
        this.isStringRecord(
          record.scripts
        )
          ? record.scripts
          : {},

      dependencies:
        this.isStringRecord(
          record.dependencies
        )
          ? Object.keys(
              record.dependencies
            )
          : [],

      devDependencies:
        this.isStringRecord(
          record.devDependencies
        )
          ? Object.keys(
              record.devDependencies
            )
          : [],
    };
  }

  private isStringRecord(
    value: unknown
  ): value is Record<
    string,
    string
  > {
    return (
      typeof value === "object" &&
      value !== null &&
      !Array.isArray(value)
    );
  }
}

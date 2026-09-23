import { ReadProjectFileTool } from "./ReadProjectFileTool.js";
import { WriteProjectFileTool } from "./WriteProjectFileTool.js";

export interface EditProjectFileResult {
  path: string;
  bytes: number;
  occurrences: number;
}

/*
 * Edição estruturada: em vez de reescrever o arquivo inteiro (como
 * write_project_file exige), o agente troca um trecho exato por
 * outro. Reduz o risco de reescrever partes do arquivo que não
 * deveriam mudar. Reaproveita as mesmas proteções de
 * Read/WriteProjectFileTool (workspace, symlink, tamanho).
 */
export class EditProjectFileTool {
  private readonly reader: ReadProjectFileTool;
  private readonly writer: WriteProjectFileTool;

  constructor(
    workspace: string
  ) {
    this.reader =
      new ReadProjectFileTool(
        workspace
      );

    this.writer =
      new WriteProjectFileTool(
        workspace
      );
  }

  async execute(
    requestedPath: string,
    oldString: string,
    newString: string,
    replaceAll = false
  ): Promise<EditProjectFileResult> {
    if (!oldString) {
      throw new Error(
        "oldString não pode ser vazio."
      );
    }

    if (oldString === newString) {
      throw new Error(
        "oldString e newString são idênticos; nada para editar."
      );
    }

    const current =
      await this.reader.execute(
        requestedPath
      );

    const occurrences =
      current.content.split(
        oldString
      ).length - 1;

    if (occurrences === 0) {
      throw new Error(
        `Trecho não encontrado em ${requestedPath}.`
      );
    }

    if (
      occurrences > 1 &&
      !replaceAll
    ) {
      throw new Error(
        `O trecho aparece ${occurrences} vezes em ${requestedPath}. Use replaceAll ou forneça um trecho mais específico.`
      );
    }

    const updated =
      replaceAll
        ? current.content.split(
            oldString
          ).join(newString)
        : current.content.replace(
            oldString,
            newString
          );

    const result =
      await this.writer.execute(
        requestedPath,
        updated
      );

    return {
      path: result.path,
      bytes: result.bytes,
      occurrences,
    };
  }
}

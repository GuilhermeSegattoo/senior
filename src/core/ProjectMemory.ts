import {
  access,
  mkdir,
  readdir,
  readFile,
  writeFile,
} from "node:fs/promises";

import path from "node:path";

/*
 * Memória de projeto (seção 14 do SENIOR_MASTER_PLAN.md).
 *
 * Vive em `.senior/` dentro do repositório PRINCIPAL do projeto
 * (project.path) — não no worktree isolado de uma tarefa. Isso é
 * proposital: agentes não têm acesso de filesystem a project.path
 * (só ao seu próprio worktree), então a memória é sempre injetada
 * como texto no prompt em vez de exposta como ferramenta de
 * leitura/escrita direta. Isso evita abrir uma porta de escrita fora
 * do workspace autorizado da tarefa.
 *
 * PROJECT.md / ARCHITECTURE.md / CONVENTIONS.md são documentos
 * curados por humanos (ou por agentes, fora do fluxo automático) —
 * o Senior nunca sobrescreve o que já existe neles. `decisions/` é a
 * única coisa que o próprio Orchestrator popula automaticamente,
 * um registro histórico de tarefas concluídas com sucesso.
 */

const DEFAULT_PROJECT_MD = `# PROJECT.md

Visão geral do projeto: o que ele faz, para quem, e por quê.

Este arquivo é curado por humanos/agentes. O Senior nunca o
sobrescreve automaticamente.
`;

const DEFAULT_ARCHITECTURE_MD = `# ARCHITECTURE.md

Decisões de arquitetura relevantes para quem for trabalhar neste
projeto: estrutura de pastas, camadas, integrações externas,
trade-offs conhecidos.

Este arquivo é curado por humanos/agentes. O Senior nunca o
sobrescreve automaticamente.
`;

const DEFAULT_CONVENTIONS_MD = `# CONVENTIONS.md

Convenções de código adotadas neste projeto: estilo, nomenclatura,
padrões de teste, o que evitar.

Este arquivo é curado por humanos/agentes. O Senior nunca o
sobrescreve automaticamente.
`;

const MAX_CONTEXT_CHARS = 12_000;
const MAX_ENTRY_CHARS = 2_000;
const DEFAULT_RECENT_DECISIONS = 5;
const DEFAULT_RECENT_KNOWLEDGE = 5;

export interface TaskDecisionEntry {
  taskId: string;
  agent: string;
  objective: string;
  task: string;
  result: string;
  status: string;
  commit?: string;
  headCommit?: string;
}

export class ProjectMemory {
  private memoryDir(
    projectPath: string
  ): string {
    return path.join(
      projectPath,
      ".senior"
    );
  }

  private decisionsDir(
    projectPath: string
  ): string {
    return path.join(
      this.memoryDir(projectPath),
      "decisions"
    );
  }

  private knowledgeDir(
    projectPath: string
  ): string {
    return path.join(
      this.memoryDir(projectPath),
      "knowledge"
    );
  }

  async ensureStructure(
    projectPath: string
  ): Promise<void> {
    await mkdir(
      this.decisionsDir(
        projectPath
      ),
      { recursive: true }
    );

    await mkdir(
      this.knowledgeDir(
        projectPath
      ),
      { recursive: true }
    );

    await this.ensureFile(
      path.join(
        this.memoryDir(projectPath),
        "PROJECT.md"
      ),
      DEFAULT_PROJECT_MD
    );

    await this.ensureFile(
      path.join(
        this.memoryDir(projectPath),
        "ARCHITECTURE.md"
      ),
      DEFAULT_ARCHITECTURE_MD
    );

    await this.ensureFile(
      path.join(
        this.memoryDir(projectPath),
        "CONVENTIONS.md"
      ),
      DEFAULT_CONVENTIONS_MD
    );
  }

  /*
   * Texto pronto para ser injetado no prompt do agente executor.
   * Trunca para não dominar o contexto do prompt em projetos com
   * muito histórico.
   */
  async readContext(
    projectPath: string
  ): Promise<string> {
    await this.ensureStructure(
      projectPath
    );

    const [
      projectMd,
      architectureMd,
      conventionsMd,
      decisions,
      knowledge,
    ] = await Promise.all([
      this.readFileOrEmpty(
        path.join(
          this.memoryDir(
            projectPath
          ),
          "PROJECT.md"
        )
      ),
      this.readFileOrEmpty(
        path.join(
          this.memoryDir(
            projectPath
          ),
          "ARCHITECTURE.md"
        )
      ),
      this.readFileOrEmpty(
        path.join(
          this.memoryDir(
            projectPath
          ),
          "CONVENTIONS.md"
        )
      ),
      this.readRecentEntries(
        this.decisionsDir(
          projectPath
        ),
        DEFAULT_RECENT_DECISIONS
      ),
      this.readRecentEntries(
        this.knowledgeDir(
          projectPath
        ),
        DEFAULT_RECENT_KNOWLEDGE
      ),
    ]);

    const sections = [
      `## PROJECT.md\n\n${projectMd.trim() || "(vazio)"}`,
      `## ARCHITECTURE.md\n\n${architectureMd.trim() || "(vazio)"}`,
      `## CONVENTIONS.md\n\n${conventionsMd.trim() || "(vazio)"}`,
      `## Decisões recentes\n\n${
        decisions.length > 0
          ? decisions.join("\n\n---\n\n")
          : "Nenhuma tarefa registrada ainda."
      }`,
      `## Conhecimento registrado\n\n${
        knowledge.length > 0
          ? knowledge.join("\n\n---\n\n")
          : "Nenhum registro ainda."
      }`,
    ];

    const full = sections.join(
      "\n\n"
    );

    return full.length >
      MAX_CONTEXT_CHARS
      ? `${full.slice(
          0,
          MAX_CONTEXT_CHARS
        )}\n\n... (memória truncada)`
      : full;
  }

  /*
   * Registra automaticamente uma tarefa concluída com sucesso
   * (DONE sem validação, ou VALIDATED). É o único conteúdo que o
   * Senior escreve sozinho em .senior/ — não tenta extrair
   * "decisões" do texto livre do agente, isso seria frágil.
   */
  async recordTaskDecision(
    projectPath: string,
    entry: TaskDecisionEntry
  ): Promise<string> {
    await this.ensureStructure(
      projectPath
    );

    const timestamp =
      new Date()
        .toISOString()
        .replace(/[:.]/g, "-");

    const fileName = `${timestamp}-${entry.taskId}.md`;

    const filePath = path.join(
      this.decisionsDir(
        projectPath
      ),
      fileName
    );

    const content = [
      `# ${entry.taskId} (${entry.agent}) — ${entry.status}`,
      "",
      `Objetivo do plano: ${entry.objective}`,
      "",
      `Tarefa: ${entry.task}`,
      "",
      `Commit: ${
        entry.commit ?? "nenhum"
      }`,
      `Head commit: ${
        entry.headCommit ?? "N/A"
      }`,
      "",
      "## Resultado relatado pelo agente",
      "",
      entry.result.slice(
        0,
        MAX_ENTRY_CHARS
      ),
    ].join("\n");

    await writeFile(
      filePath,
      content,
      "utf8"
    );

    return filePath;
  }

  private async ensureFile(
    filePath: string,
    defaultContent: string
  ): Promise<void> {
    try {
      await access(filePath);
    } catch {
      await writeFile(
        filePath,
        defaultContent,
        "utf8"
      );
    }
  }

  private async readFileOrEmpty(
    filePath: string
  ): Promise<string> {
    try {
      return await readFile(
        filePath,
        "utf8"
      );
    } catch {
      return "";
    }
  }

  private async readRecentEntries(
    directory: string,
    limit: number
  ): Promise<string[]> {
    let fileNames: string[];

    try {
      fileNames = (
        await readdir(directory)
      ).filter((name) =>
        name.endsWith(".md")
      );
    } catch {
      return [];
    }

    fileNames.sort();

    const recent = fileNames.slice(
      -limit
    );

    const contents =
      await Promise.all(
        recent.map((name) =>
          this.readFileOrEmpty(
            path.join(
              directory,
              name
            )
          )
        )
      );

    return contents.map(
      (content) =>
        content
          .trim()
          .slice(
            0,
            MAX_ENTRY_CHARS
          )
    );
  }
}

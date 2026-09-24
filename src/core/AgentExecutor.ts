import { readFile } from "node:fs/promises";
import path from "node:path";

import { RuntimeManager } from "../runtimes/RuntimeManager.js";

import type {
  AgentRuntime,
} from "../runtimes/AgentRuntime.js";

import { TaskManager } from "./TaskManager.js";
import { ProjectManager } from "./ProjectManager.js";
import { ProjectMemory } from "./ProjectMemory.js";

import type {
  AgentRole,
  ManagedTask,
} from "../types/Task.js";

export interface AgentExecutionOptions {
  workspacePath: string;
  branch: string;

  /*
   * Sobrescreve o runtime padrão só para esta execução (seleção
   * manual de provedor/modelo por tarefa, na hora de disparar).
   */
  runtime?: AgentRuntime;
}

export class AgentExecutor {
  private readonly runtime: AgentRuntime;
  private readonly taskManager = new TaskManager();
  private readonly projectManager = new ProjectManager();
  private readonly projectMemory = new ProjectMemory();

  constructor(
    runtime?: AgentRuntime
  ) {
    this.runtime =
      runtime ??
      new RuntimeManager().fromEnvironment();
  }

  private isReadOnlyAgent(
    agent: AgentRole
  ): boolean {
    switch (agent) {
      case "architect":
      case "reviewer":
        return true;

      case "frontend":
      case "backend":
      case "qa":
      case "devops":
        return false;

      default:
        return true;
    }
  }

  private async getDependencyContext(
    projectId: string,
    task: ManagedTask
  ): Promise<string> {
    if (task.dependsOn.length === 0) {
      return "Esta tarefa não possui dependências anteriores.";
    }

    const plan =
      await this.taskManager.getPlan(
        projectId
      );

    if (!plan) {
      throw new Error(
        `Nenhum plano encontrado para o projeto ${projectId}.`
      );
    }

    const contexts: string[] = [];

    for (const dependencyId of task.dependsOn) {
      const dependency =
        plan.tasks.find(
          (item) =>
            item.id === dependencyId
        );

      if (!dependency) {
        throw new Error(
          `Dependência ${dependencyId} não encontrada.`
        );
      }

      if (
        dependency.status !== "DONE" &&
        dependency.status !== "VALIDATED"
      ) {
        throw new Error(
          `Dependência ${dependencyId} ainda não foi concluída.`
        );
      }

      contexts.push(`
========================================
DEPENDÊNCIA: ${dependency.id}
AGENTE: ${dependency.agent.toUpperCase()}
STATUS: ${dependency.status}
BRANCH: ${dependency.branch ?? "N/A"}
COMMIT: ${dependency.commit ?? "N/A"}
HEAD COMMIT: ${dependency.headCommit ?? "N/A"}
========================================

${dependency.result ?? "Nenhum resultado registrado."}
`);
    }

    return contexts.join("\n");
  }

  async execute(
    projectId: string,
    task: ManagedTask,
    options: AgentExecutionOptions,
    correctionContext?: string
  ): Promise<string> {
    const project =
      await this.projectManager.getById(
        projectId
      );

    if (!project) {
      throw new Error(
        `Projeto ${projectId} não encontrado.`
      );
    }

    if (project.status !== "ACTIVE") {
      throw new Error(
        `Projeto ${projectId} não está ativo.`
      );
    }

    const plan =
      await this.taskManager.getPlan(
        projectId
      );

    if (!plan) {
      throw new Error(
        `Nenhum plano encontrado para o projeto ${projectId}.`
      );
    }

    const agentPath = path.join(
      process.cwd(),
      "agents",
      task.agent,
      "AGENT.md"
    );

    const instructions =
      await readFile(
        agentPath,
        "utf8"
      );

    const dependencyContext =
      await this.getDependencyContext(
        projectId,
        task
      );

    const readOnly =
      this.isReadOnlyAgent(
        task.agent
      );

    const repositoryContext =
      project.repository
        ? `${project.repository.owner}/${project.repository.name}`
        : "Nenhum repositório GitHub associado.";

    /*
     * Memória do projeto vive em project.path (.senior/), fora do
     * worktree isolado da tarefa — por isso é injetada como texto
     * em vez de exposta como ferramenta de leitura direta.
     */
    const projectMemoryContext =
      await this.projectMemory.readContext(
        project.path
      );

    const prompt = `
${instructions}

# PROJETO

Nome: ${project.name}
ID: ${project.id}

# MEMÓRIA DO PROJETO

${projectMemoryContext}

# REPOSITÓRIO

${repositoryContext}

# WORKSPACE ISOLADO AUTORIZADO

${options.workspacePath}

# BRANCH DA TAREFA

${options.branch}

Você está trabalhando exclusivamente neste worktree.

Não altere arquivos fora deste workspace.

# OBJETIVO DO PROJETO

${plan.objective}

# SUA TAREFA

ID: ${task.id}
Agente: ${task.agent}

${task.task}
${
  correctionContext
    ? `\n# CONTEXTO DE CORREÇÃO\n\n${correctionContext}\n`
    : ""
}
# DEPENDÊNCIAS CONCLUÍDAS

${dependencyContext}

# REGRAS DE EXECUÇÃO

Execute somente a tarefa delegada.

Trabalhe exclusivamente dentro do workspace autorizado.

Não altere o código-fonte do SENIOR.

Não altere outros projetos.

Não faça checkout ou troca de branch.

Não crie outro worktree.

Não execute git commit.

Não execute git push.

Não faça merge.

O SENIOR é responsável pelo controle Git.

Use o trabalho das dependências como contexto técnico.

Não refaça decisões anteriores sem justificativa técnica.

Não utilize ou exponha secrets, tokens ou credenciais.

Não faça deploy em produção.

Não execute operações destrutivas.

Execute testes locais pertinentes quando possível.

Se uma ação exigir autorização superior,
registre isso no resultado em vez de executá-la.

Ao terminar, informe:

- o que foi realizado;
- arquivos criados ou modificados;
- testes executados;
- decisões tomadas;
- riscos ou pendências.
`;

    const runtime =
      options.runtime ??
      this.runtime;

    const result =
      await runtime.ask(
        prompt,
        {
          cwd: options.workspacePath,
          readOnly,
        }
      );

    return result.text;
  }
}

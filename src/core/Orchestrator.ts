import { readFile } from "node:fs/promises";
import path from "node:path";

import { CodexAdapter } from "../adapters/CodexAdapter.js";
import { TaskManager } from "./TaskManager.js";
import { AgentExecutor } from "./AgentExecutor.js";
import { ProjectManager } from "./ProjectManager.js";
import { IntegrationManager } from "./IntegrationManager.js";
import { GitManager } from "./GitManager.js";
import { ValidationEngine } from "./ValidationEngine.js";

import type { ExecutionPlan } from "../types/Task.js";

export class Orchestrator {
  private codex = new CodexAdapter();
  private taskManager = new TaskManager();
  private agentExecutor = new AgentExecutor();
  private projectManager = new ProjectManager();
  private integrationManager =
    new IntegrationManager();
  private gitManager = new GitManager();
private validationEngine = new ValidationEngine();

  // =========================================================
  // CHIEF
  // =========================================================

  private async getChiefInstructions(): Promise<string> {
    const chiefPath = path.join(
      process.cwd(),
      "agents",
      "chief",
      "AGENT.md"
    );

    return readFile(
      chiefPath,
      "utf8"
    );
  }

  async talkToChief(
    message: string
  ): Promise<string> {
    const instructions =
      await this.getChiefInstructions();

    const prompt = `
${instructions}

# Solicitação do usuário

${message}

Responda como JARVIS.
`;

    return this.codex.ask(prompt);
  }

  // =========================================================
  // PROJETOS
  // =========================================================

  async createProject(name: string) {
    return this.projectManager.create({
      name,
    });
  }

  async listProjects() {
    return this.projectManager.list();
  }

  async getProject(projectId: string) {
    return this.projectManager.getById(
      projectId
    );
  }

  // =========================================================
  // INTEGRAÇÕES
  // =========================================================

  async githubStatus() {
    return this.integrationManager.githubStatus();
  }

  // =========================================================
  // PLANEJAMENTO
  // =========================================================

  async createPlan(
    projectId: string,
    objective: string
  ): Promise<ExecutionPlan> {
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
        `O projeto ${projectId} não está ativo.`
      );
    }

    const instructions =
      await this.getChiefInstructions();

    const prompt = `
${instructions}

Você está no modo PLANEJAMENTO.

# PROJETO

Nome: ${project.name}
ID: ${project.id}
Workspace: ${project.path}

# OBJETIVO

${objective}

Crie um plano de execução para sua equipe.

Agentes disponíveis:

- architect
- frontend
- backend
- reviewer
- qa
- devops

Retorne SOMENTE JSON válido.

Formato obrigatório:

{
  "objective": "objetivo",
  "tasks": [
    {
      "id": "task-1",
      "agent": "architect",
      "task": "descrição da tarefa",
      "dependsOn": []
    }
  ]
}

Regras:

- IDs devem ser únicos.
- dependsOn deve conter IDs de tarefas.
- Use apenas os agentes disponíveis.
- Identifique tarefas que podem executar em paralelo.
- Reviewer deve revisar implementação quando necessário.
- QA deve validar funcionalidades quando necessário.
- DevOps só deve aparecer quando houver necessidade de infraestrutura/deploy.
- Todo o plano pertence exclusivamente ao projeto informado.
- Não inclua markdown.
- Não inclua texto antes ou depois do JSON.
`;

    const response =
      await this.codex.ask(prompt);

    const generated =
      JSON.parse(response) as Omit<
        ExecutionPlan,
        "projectId"
      >;

    const plan: ExecutionPlan = {
      projectId,
      objective:
        generated.objective,
      tasks:
        generated.tasks,
    };

    await this.taskManager.savePlan(
      plan
    );

    return plan;
  }

  // =========================================================
  // TAREFAS
  // =========================================================

  async getTasks(
    projectId: string
  ) {
    return this.taskManager.getPlan(
      projectId
    );
  }

  async completeTask(
    projectId: string,
    taskId: string
  ) {
    return this.taskManager.updateTaskStatus(
      projectId,
      taskId,
      "DONE"
    );
  }

  async retryTask(
    projectId: string,
    taskId: string
  ) {
    return this.taskManager.retryTask(
      projectId,
      taskId
    );
  }

  // =========================================================
  // EXECUÇÃO
  // =========================================================

  async executeTask(
    projectId: string,
    taskId: string
  ) {
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

    const task =
      plan.tasks.find(
        (item) =>
          item.id === taskId
      );

    if (!task) {
      throw new Error(
        `Tarefa ${taskId} não encontrada no projeto ${projectId}.`
      );
    }

    if (task.status !== "READY") {
      throw new Error(
        `A tarefa ${taskId} não está pronta. Estado atual: ${task.status}`
      );
    }

    // =======================================================
    // LINHAGEM DE CÓDIGO DAS DEPENDÊNCIAS
    // =======================================================

    /*
     * headCommit é a fonte oficial.
     *
     * O fallback para commit existe porque temos tarefas
     * antigas criadas antes da introdução de headCommit.
     */
    const dependencyCommits =
      task.dependsOn
        .map((dependencyId) => {
          const dependency =
            plan.tasks.find(
              (item) =>
                item.id ===
                dependencyId
            );

          return (
            dependency?.headCommit ??
            dependency?.commit
          );
        })
        .filter(
          (commit): commit is string =>
            Boolean(commit)
        );

    // =======================================================
    // PREPARAR WORKTREE ISOLADO
    // =======================================================

    const workspace =
      await this.gitManager.prepareTaskWorkspace(
        projectId,
        project.path,
        taskId,
        dependencyCommits
      );

    await this.taskManager.setTaskGitMetadata(
      projectId,
      taskId,
      {
        branch:
          workspace.branch,

        workspacePath:
          workspace.path,
      }
    );

    await this.taskManager.startTask(
      projectId,
      taskId
    );

    try {
      // =====================================================
      // EXECUTAR AGENTE
      // =====================================================

      const result =
        await this.agentExecutor.execute(
          projectId,
          task,
          {
            workspacePath:
              workspace.path,

            branch:
              workspace.branch,
          }
        );

      // =====================================================
      // COMMIT / HEAD FINAL
      // =====================================================

      const commitResult =
        await this.gitManager.commitTask(
          workspace.path,
          taskId
        );

      // =====================================================
// VALIDATION LOOP — CHECKS DETERMINÍSTICOS
// =====================================================

let validationResult = undefined;

const hasValidation =
  Boolean(
    task.businessRules?.length ||
    task.acceptanceCriteria?.length ||
    task.requiredChecks?.length
  );

if (hasValidation) {
  const validation =
    task.validation ??
    {
      status: "PENDING" as const,

      businessRules:
        task.businessRules ?? [],

      acceptanceCriteria:
        task.acceptanceCriteria ?? [],

      requiredChecks:
        task.requiredChecks ?? [],

      attempts: [],

      maxAttempts: 5,
    };

  validationResult =
    await this.validationEngine.runChecks(
      workspace.path,
      validation
    );
}

      /*
       * Mesmo quando nenhum arquivo foi alterado,
       * commitResult.headCommit representa exatamente
       * o código analisado pela tarefa.
       */
      await this.taskManager.finishTask(
        projectId,
        taskId,
        result,
        {
          branch:
            workspace.branch,

          workspacePath:
            workspace.path,

          commit:
            commitResult.commit ??
            undefined,

          headCommit:
            commitResult.headCommit,
        }
      );

      return {
        project,
        task,
        result,

        git: {
          branch:
            workspace.branch,

          workspacePath:
            workspace.path,

          baseCommit:
            workspace.baseCommit,

          dependencyCommits:
            workspace.dependencyCommits,

          changed:
            commitResult.changed,

          commit:
            commitResult.commit,

          headCommit:
            commitResult.headCommit,

          statusBeforeCommit:
            commitResult.status,
        },
      };
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : String(error);

      await this.taskManager.failTask(
        projectId,
        taskId,
        message
      );

      throw error;
    }
  }

  // =========================================================
  // EXECUÇÃO AUTÔNOMA DO PROJETO
  // =========================================================

  async runProject(
    projectId: string
  ) {
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

    const executions: Array<{
      taskId: string;
      agent: string;
      status: "DONE" | "FAILED";
      commit?: string;
      headCommit?: string;
      error?: string;
    }> = [];

    while (true) {
      const plan =
        await this.taskManager.getPlan(
          projectId
        );

      if (!plan) {
        throw new Error(
          `Nenhum plano encontrado para o projeto ${projectId}.`
        );
      }

      // -------------------------------------------------------
      // SEGURANÇA: se houver falha, não seguimos cegamente.
      // -------------------------------------------------------

      const failedTasks =
        plan.tasks.filter(
          (task) =>
            task.status === "FAILED"
        );

      if (failedTasks.length > 0) {
        return {
          projectId,
          status: "FAILED" as const,
          executions,
          failedTasks: failedTasks.map(
            (task) => ({
              id: task.id,
              agent: task.agent,
              error: task.error,
            })
          ),
        };
      }

      // -------------------------------------------------------
      // TERMINOU
      // -------------------------------------------------------

      const allDone =
        plan.tasks.every(
          (task) =>
            task.status === "DONE"
        );

      if (allDone) {
        return {
          projectId,
          status: "DONE" as const,
          executions,
        };
      }

      // -------------------------------------------------------
      // PEGAR PRÓXIMA READY
      //
      // Por enquanto executamos sequencialmente.
      // Isso é proposital:
      // - mais previsível
      // - mais fácil de depurar
      // - evita concorrência no estado
      //
      // Paralelismo vem depois.
      // -------------------------------------------------------

      const nextTask =
        plan.tasks.find(
          (task) =>
            task.status === "READY"
        );

      if (!nextTask) {
        const runningTasks =
          plan.tasks.filter(
            (task) =>
              task.status === "RUNNING"
          );

        const waitingTasks =
          plan.tasks.filter(
            (task) =>
              task.status === "WAITING"
          );

        return {
          projectId,
          status: "BLOCKED" as const,
          executions,

          runningTasks:
            runningTasks.map(
              (task) => task.id
            ),

          waitingTasks:
            waitingTasks.map(
              (task) => ({
                id: task.id,
                dependsOn:
                  task.dependsOn,
              })
            ),
        };
      }

      console.log(
        `\n[JARVIS] Executando ${nextTask.id} (${nextTask.agent})...`
      );

      try {
        const execution =
          await this.executeTask(
            projectId,
            nextTask.id
          );

        executions.push({
          taskId:
            nextTask.id,

          agent:
            nextTask.agent,

          status:
            "DONE",

          commit:
            execution.git.commit ??
            undefined,

          headCommit:
            execution.git.headCommit,
        });

        console.log(
          `[JARVIS] ${nextTask.id} concluída.`
        );

        console.log(
          `[JARVIS] HEAD: ${execution.git.headCommit}`
        );
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : String(error);

        executions.push({
          taskId:
            nextTask.id,

          agent:
            nextTask.agent,

          status:
            "FAILED",

          error:
            message,
        });

        console.error(
          `[JARVIS] ${nextTask.id} falhou: ${message}`
        );

        /*
         * Nunca continuamos automaticamente
         * depois de uma falha.
         */
        return {
          projectId,
          status: "FAILED" as const,
          executions,
          failedTasks: [
            {
              id:
                nextTask.id,

              agent:
                nextTask.agent,

              error:
                message,
            },
          ],
        };
      }
    }
  }

  // =========================================================
  // STATUS
  // =========================================================

  async status() {
    const codex =
      await this.codex.status();

    const github =
      await this.integrationManager.githubStatus();

    return {
      codex,
      github,
    };
  }
}

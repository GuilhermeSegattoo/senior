import { readFile } from "node:fs/promises";
import path from "node:path";

import { CodexAdapter } from "../adapters/CodexAdapter.js";
import { TaskManager } from "./TaskManager.js";
import { AgentExecutor } from "./AgentExecutor.js";
import { ProjectManager } from "./ProjectManager.js";
import { IntegrationManager } from "./IntegrationManager.js";
import { GitManager } from "./GitManager.js";
import { ValidationEngine } from "./ValidationEngine.js";
import { SemanticValidator } from "./SemanticValidator.js";
import { PlanValidator } from "./PlanValidator.js";
import { ProjectMemory } from "./ProjectMemory.js";

import type {
  ExecutionPlan,
  ManagedTask,
} from "../types/Task.js";

import type {
  TaskValidation,
} from "../types/Validation.js";

import type {
  Project,
} from "../types/Project.js";

export class Orchestrator {
  private codex = new CodexAdapter();
  private taskManager = new TaskManager();
  private projectManager = new ProjectManager();
  private integrationManager =
    new IntegrationManager();
  private gitManager = new GitManager();
private validationEngine = new ValidationEngine();
private projectMemory = new ProjectMemory();

/*
 * Não privados de propósito: testes de integração injetam
 * runtimes falsos aqui (ex.: orchestrator.agentExecutor =
 * new AgentExecutor(fakeRuntime)) para exercitar o Validation
 * Loop real sem depender de um provedor de LLM externo.
 */
agentExecutor = new AgentExecutor();
semanticValidator = new SemanticValidator();
planValidator = new PlanValidator();

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

Responda como SENIOR.
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
      "dependsOn": [],
      "businessRules": [
        { "id": "BR-01", "description": "...", "required": true }
      ],
      "acceptanceCriteria": [
        { "id": "AC-01", "description": "..." }
      ],
      "requiredChecks": ["typecheck", "test"]
    }
  ]
}

Regras:

- IDs devem ser únicos.
- dependsOn deve conter IDs de tarefas.
- Use apenas os agentes disponíveis.
- Identifique tarefas que podem executar em paralelo.
- Reviewer deve revisar implementação quando necessário, dependendo (dependsOn) da tarefa que revisa.
- QA deve validar funcionalidades quando necessário, dependendo (dependsOn) da tarefa que valida.
- DevOps só deve aparecer quando houver necessidade de infraestrutura/deploy.
- businessRules, acceptanceCriteria e requiredChecks são OPCIONAIS: inclua-os apenas em tarefas de backend/frontend/devops que produzem código verificável. Arquiteto e Reviewer normalmente não precisam.
- acceptanceCriteria deve conter apenas "id" e "description" (o restante é preenchido em runtime).
- requiredChecks só deve conter checks que o projeto realmente suporta (typecheck, test, lint, build).
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
        generated.tasks.map(
          (task) => ({
            ...task,

            acceptanceCriteria:
              task.acceptanceCriteria?.map(
                (criterion) => ({
                  id: criterion.id,
                  description:
                    criterion.description,
                  status:
                    criterion.status ??
                    "PENDING",
                  evidence:
                    criterion.evidence ??
                    [],
                })
              ),
          })
        ),
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

      // =====================================================
      // VALIDATION LOOP
      // =====================================================

      const validationOutcome =
        await this.runValidationLoop({
          projectId,
          taskId,
          task,
          objective:
            plan.objective,
          agentResult: result,
          workspacePath:
            workspace.path,
          fromCommit:
            workspace.baseCommit,
          toCommit:
            commitResult.headCommit,
        });

      await this.maybeRecordDecision(
        {
          project,
          task,
          result,
          objective:
            plan.objective,
          validationOutcome,
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

        validation:
          validationOutcome ??
          undefined,

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
  // CORREÇÃO (Correction Loop)
  // =========================================================

  async correctTask(
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

    if (
      task.status !==
      "CORRECTION_REQUIRED"
    ) {
      throw new Error(
        `A tarefa ${taskId} não está aguardando correção. Estado atual: ${task.status}`
      );
    }

    if (
      !task.workspacePath ||
      !task.branch
    ) {
      throw new Error(
        `A tarefa ${taskId} não possui workspace registrado para correção.`
      );
    }

    await this.taskManager.startCorrection(
      projectId,
      taskId
    );

    try {
      const correctionContext =
        this.buildCorrectionContext(
          task
        );

      const result =
        await this.agentExecutor.execute(
          projectId,
          task,
          {
            workspacePath:
              task.workspacePath,

            branch:
              task.branch,
          },
          correctionContext
        );

      const previousHeadCommit =
        task.headCommit ??
        task.commit;

      const commitResult =
        await this.gitManager.commitTask(
          task.workspacePath,
          taskId
        );

      await this.taskManager.finishTask(
        projectId,
        taskId,
        result,
        {
          branch:
            task.branch,

          workspacePath:
            task.workspacePath,

          commit:
            commitResult.commit ??
            undefined,

          headCommit:
            commitResult.headCommit,
        }
      );

      const validationOutcome =
        await this.runValidationLoop({
          projectId,
          taskId,
          task,
          objective:
            plan.objective,
          agentResult: result,
          workspacePath:
            task.workspacePath,
          fromCommit:
            previousHeadCommit ??
            commitResult.headCommit,
          toCommit:
            commitResult.headCommit,
        });

      await this.maybeRecordDecision(
        {
          project,
          task,
          result,
          objective:
            plan.objective,
          validationOutcome,
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
        validation:
          validationOutcome ??
          undefined,

        git: {
          branch:
            task.branch,

          workspacePath:
            task.workspacePath,

          changed:
            commitResult.changed,

          commit:
            commitResult.commit,

          headCommit:
            commitResult.headCommit,
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

  /*
   * Registra automaticamente a tarefa em .senior/decisions/ quando
   * ela termina em um estado de sucesso real: DONE (sem requisitos
   * de validação) ou VALIDATED. CORRECTION_REQUIRED e BLOCKED não
   * geram registro — o histórico de tentativas já vive em
   * task.validation, memória não deve duplicar isso.
   */
  private async maybeRecordDecision(
    params: {
      project: Project;
      task: ManagedTask;
      result: string;
      objective: string;
      validationOutcome:
        | {
            status:
              | "VALIDATED"
              | "CORRECTION_REQUIRED"
              | "BLOCKED";
            validation: TaskValidation;
          }
        | null;
      commit?: string;
      headCommit?: string;
    }
  ): Promise<void> {
    const status =
      params.validationOutcome
        ?.status ?? "DONE";

    if (
      status !== "DONE" &&
      status !== "VALIDATED"
    ) {
      return;
    }

    await this.projectMemory.recordTaskDecision(
      params.project.path,
      {
        taskId: params.task.id,
        agent: params.task.agent,
        objective:
          params.objective,
        task: params.task.task,
        result: params.result,
        status,
        commit: params.commit,
        headCommit:
          params.headCommit,
      }
    );
  }

  private buildCorrectionContext(
    task: ManagedTask
  ): string {
    const attempt =
      task.validation?.attempts.at(-1);

    if (!attempt) {
      return "Esta é uma tentativa de correção, mas nenhuma tentativa anterior foi encontrada.";
    }

    const failedChecks =
      attempt.checks.filter(
        (check) =>
          check.status === "FAILED"
      );

    const failedCriteria =
      attempt.criteria.filter(
        (criterion) =>
          criterion.status ===
          "FAILED"
      );

    const lines: string[] = [
      `Esta é uma tentativa de CORREÇÃO (tentativa anterior: ${attempt.attempt} de ${
        task.validation?.maxAttempts ??
        "?"
      }).`,
      "",
      "A tentativa anterior FALHOU na validação. Corrija SOMENTE o necessário para atender aos itens abaixo. Não refaça trabalho que já está correto.",
      "",
    ];

    if (failedChecks.length > 0) {
      lines.push(
        "## Checks que falharam",
        ""
      );

      for (const check of failedChecks) {
        lines.push(
          `- ${check.check}: ${
            check.failureReason ??
            "sem detalhes"
          }`
        );

        if (check.evidence?.output) {
          lines.push(
            "```",
            check.evidence.output.slice(
              0,
              2000
            ),
            "```"
          );
        }
      }

      lines.push("");
    }

    if (failedCriteria.length > 0) {
      lines.push(
        "## Critérios de aceite não atendidos",
        ""
      );

      for (const criterion of failedCriteria) {
        lines.push(
          `- [${criterion.id}] ${criterion.description}`,
          `  Motivo: ${
            criterion.failureReason ??
            "sem detalhes"
          }`
        );
      }

      lines.push("");
    }

    if (attempt.diagnosis) {
      lines.push(
        "## Diagnóstico",
        "",
        attempt.diagnosis
      );
    }

    return lines.join("\n");
  }

  // =========================================================
  // VALIDATION LOOP (compartilhado entre execução e correção)
  // =========================================================

  private async runValidationLoop(
    params: {
      projectId: string;
      taskId: string;
      task: ManagedTask;
      objective: string;
      agentResult: string;
      workspacePath: string;
      fromCommit: string;
      toCommit: string;
    }
  ): Promise<
    | {
        status:
          | "VALIDATED"
          | "CORRECTION_REQUIRED"
          | "BLOCKED";
        validation: TaskValidation;
      }
    | null
  > {
    if (
      !this.taskManager.hasValidationRequirements(
        params.task
      )
    ) {
      return null;
    }

    /*
     * Estado intermediário visível: se o processo cair no meio da
     * validação, o plano fica com VALIDATING (evidência de que a
     * checagem estava em andamento) em vez de preso em DONE sem
     * explicação.
     */
    await this.taskManager.updateTaskStatus(
      params.projectId,
      params.taskId,
      "VALIDATING"
    );

    const validation: TaskValidation =
      params.task.validation ?? {
        status: "PENDING",

        businessRules:
          params.task.businessRules ??
          [],

        acceptanceCriteria:
          (
            params.task
              .acceptanceCriteria ??
            []
          ).map((criterion) => ({
            id: criterion.id,
            description:
              criterion.description,
            status:
              criterion.status ??
              "PENDING",
            evidence:
              criterion.evidence ??
              [],
          })),

        requiredChecks:
          params.task.requiredChecks ??
          [],

        attempts: [],

        maxAttempts: 5,
      };

    const validationResult =
      await this.validationEngine.runChecks(
        params.workspacePath,
        validation
      );

    if (
      validationResult.attempt.criteria
        .length > 0
    ) {
      const checksFailed =
        validationResult.attempt.checks.some(
          (check) =>
            check.status === "FAILED"
        );

      if (checksFailed) {
        for (const criterion of validationResult
          .attempt.criteria) {
          this.validationEngine.failCriterion(
            validationResult.attempt,
            criterion.id,
            "Checks determinísticos falharam nesta tentativa; critério não avaliado."
          );
        }
      } else {
        const diff =
          await this.gitManager.getCommitDiff(
            params.workspacePath,
            params.fromCommit,
            params.toCommit
          );

        const outcomes =
          await this.semanticValidator.evaluate(
            {
              task: params.task,
              objective:
                params.objective,
              agentResult:
                params.agentResult,
              diff,
              workspacePath:
                params.workspacePath,
            }
          );

        for (const outcome of outcomes) {
          if (outcome.passed) {
            this.validationEngine.passCriterion(
              validationResult.attempt,
              outcome.id,
              {
                type: "AGENT",
                description:
                  outcome.reason,
                source:
                  "semantic-validator",
              }
            );
          } else {
            this.validationEngine.failCriterion(
              validationResult.attempt,
              outcome.id,
              outcome.reason
            );
          }
        }
      }

      this.validationEngine.completeSemanticValidation(
        validation,
        validationResult.attempt
      );
    }

    let status:
      | "VALIDATED"
      | "CORRECTION_REQUIRED"
      | "BLOCKED" =
      validation.status === "PASSED"
        ? "VALIDATED"
        : validation.status ===
          "BLOCKED"
        ? "BLOCKED"
        : "CORRECTION_REQUIRED";

    if (status === "CORRECTION_REQUIRED") {
      const failedChecks =
        validationResult.attempt.checks.filter(
          (check) =>
            check.status === "FAILED"
        );

      const failedCriteria =
        validationResult.attempt.criteria.filter(
          (criterion) =>
            criterion.status ===
            "FAILED"
        );

      const diagnosisLines = [
        ...failedChecks.map(
          (check) =>
            `Check ${check.check} falhou: ${
              check.failureReason ??
              "sem detalhes"
            }`
        ),
        ...failedCriteria.map(
          (criterion) =>
            `Critério ${criterion.id} não atendido: ${
              criterion.failureReason ??
              "sem detalhes"
            }`
        ),
      ];

      const diagnosis =
        diagnosisLines.length > 0
          ? diagnosisLines.join("\n")
          : "Validação falhou sem detalhamento.";

      this.validationEngine.setDiagnosis(
        validationResult.attempt,
        diagnosis,
        "Corrigir os itens listados no diagnóstico sem refazer trabalho já correto, depois reexecutar os checks."
      );

      /*
       * Item 11: detecção de estagnação. Se duas tentativas
       * seguidas falham pelo exato mesmo motivo, mais tentativas
       * não vão ajudar — bloqueia para intervenção humana em vez
       * de desperdiçar o restante do orçamento de tentativas.
       */
      if (validation.attempts.length >= 2) {
        const previous =
          validation.attempts.at(-2);

        if (
          previous?.diagnosis &&
          previous.diagnosis ===
            diagnosis
        ) {
          validation.status =
            "BLOCKED";

          validation.blockedReason =
            "Estagnação detectada: duas tentativas seguidas falharam pelo mesmo motivo.";

          status = "BLOCKED";
        }
      }
    }

    await this.taskManager.applyValidationResult(
      params.projectId,
      params.taskId,
      status,
      validation
    );

    return {
      status,
      validation,
    };
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
      status:
        | "DONE"
        | "VALIDATED"
        | "CORRECTION_REQUIRED"
        | "BLOCKED"
        | "FAILED";
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
      // TAREFAS BLOQUEADAS PRECISAM DE HUMANO
      //
      // Item 12 do plano: BLOCKED / NEEDS_HUMAN. Diferente de
      // FAILED (erro de execução), BLOCKED significa que a
      // validação esgotou as tentativas ou detectou estagnação.
      // -------------------------------------------------------

      const blockedTasks =
        plan.tasks.filter(
          (task) =>
            task.status === "BLOCKED"
        );

      if (blockedTasks.length > 0) {
        return {
          projectId,
          status: "NEEDS_HUMAN" as const,
          executions,
          blockedTasks: blockedTasks.map(
            (task) => ({
              id: task.id,
              agent: task.agent,
              blockedReason:
                task.validation
                  ?.blockedReason ??
                "Motivo não registrado.",
              lastDiagnosis:
                task.validation?.attempts.at(
                  -1
                )?.diagnosis,
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
            task.status === "DONE" ||
            task.status === "VALIDATED"
        );

      if (allDone) {
        console.log(
          "\n[SENIOR] Todas as tarefas concluídas. Validando o objetivo do plano...\n"
        );

        const planValidation =
          await this.planValidator.validateObjective(
            plan,
            project.path
          );

        await this.taskManager.setPlanValidation(
          projectId,
          planValidation
        );

        return {
          projectId,
          status:
            planValidation.status ===
            "PASSED"
              ? ("DONE" as const)
              : ("OBJECTIVE_NOT_MET" as const),
          executions,
          planValidation,
        };
      }

      // -------------------------------------------------------
      // PEGAR PRÓXIMA READY OU CORRECTION_REQUIRED
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
            task.status === "READY" ||
            task.status ===
              "CORRECTION_REQUIRED"
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

      const isCorrection =
        nextTask.status ===
        "CORRECTION_REQUIRED";

      console.log(
        `\n[SENIOR] ${
          isCorrection
            ? "Corrigindo"
            : "Executando"
        } ${nextTask.id} (${nextTask.agent})...`
      );

      try {
        const execution =
          isCorrection
            ? await this.correctTask(
                projectId,
                nextTask.id
              )
            : await this.executeTask(
                projectId,
                nextTask.id
              );

        const finalStatus =
          execution.validation
            ?.status ?? "DONE";

        executions.push({
          taskId:
            nextTask.id,

          agent:
            nextTask.agent,

          status:
            finalStatus,

          commit:
            execution.git.commit ??
            undefined,

          headCommit:
            execution.git.headCommit,
        });

        console.log(
          `[SENIOR] ${nextTask.id} -> ${finalStatus}.`
        );

        console.log(
          `[SENIOR] HEAD: ${execution.git.headCommit}`
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
          `[SENIOR] ${nextTask.id} falhou: ${message}`
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

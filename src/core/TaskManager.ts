import { atomicWrite as writeFile } from "./AtomicFile.js";
import { withStateLock } from "./StateLock.js";
import {
  mkdir,
  readFile,
} from "node:fs/promises";

import path from "node:path";

import type {
  ExecutionPlan,
  ManagedPlan,
  ManagedTask,
  TaskStatus,
} from "../types/Task.js";

import type {
  PlanValidation,
  TaskValidation,
} from "../types/Validation.js";

import { EventBus } from "./EventBus.js";

export interface TaskGitMetadata {
  branch?: string;
  workspacePath?: string;
  commit?: string;
  headCommit?: string;
}

export class TaskManager {
  private readonly eventBus =
    new EventBus();

  private dataDir = path.join(
    process.cwd(),
    "data",
    "projects"
  );

  private getProjectDir(
    projectId: string
  ): string {
    return path.join(
      this.dataDir,
      projectId
    );
  }

  private getPlanFile(
    projectId: string
  ): string {
    return path.join(
      this.getProjectDir(projectId),
      "plan.json"
    );
  }

  private async savePlanUnlocked(
    plan: ExecutionPlan
  ): Promise<ManagedPlan> {
    const tasks: ManagedTask[] =
      plan.tasks.map((task) => ({
        ...task,
        status:
          task.dependsOn.length === 0
            ? "READY"
            : "WAITING",
      }));

    const managedPlan: ManagedPlan = {
      projectId: plan.projectId,
      objective: plan.objective,
      createdAt:
        new Date().toISOString(),
      tasks,
    };

    await this.writePlan(
      managedPlan
    );

    return managedPlan;
  }

  async getPlan(
    projectId: string
  ): Promise<ManagedPlan | null> {
    try {
      const content =
        await readFile(
          this.getPlanFile(projectId),
          "utf8"
        );

      return JSON.parse(
        content
      ) as ManagedPlan;
    } catch (error) {
      const nodeError =
        error as NodeJS.ErrnoException;

      if (
        nodeError.code === "ENOENT"
      ) {
        return null;
      }

      throw error;
    }
  }

  private async startTaskUnlocked(
    projectId: string,
    taskId: string
  ): Promise<ManagedPlan> {
    const plan =
      await this.requirePlan(
        projectId
      );

    const task =
      this.requireTask(
        plan,
        taskId
      );

    if (
      task.status !== "READY"
    ) {
      throw new Error(
        `A tarefa ${taskId} não está pronta para execução. Estado atual: ${task.status}`
      );
    }

    task.status = "RUNNING";
    task.startedAt =
      new Date().toISOString();

    task.completedAt =
      undefined;

    task.error =
      undefined;

    await this.writePlan(plan);

    await this.eventBus.emit({
      type: "task.started",
      projectId,
      taskId,
      data: {
        agent: task.agent,
      },
    });

    return plan;
  }

  private async retryTaskUnlocked(
    projectId: string,
    taskId: string
  ): Promise<ManagedPlan> {
    const plan =
      await this.requirePlan(
        projectId
      );

    const task =
      this.requireTask(
        plan,
        taskId
      );

    if (
      task.status !== "FAILED"
    ) {
      throw new Error(
        `A tarefa ${taskId} não está em estado FAILED. Estado atual: ${task.status}`
      );
    }

    const dependenciesCompleted =
      task.dependsOn.every(
        (dependencyId) =>
          this.isDependencySatisfied(
            plan.tasks.find(
              (item) =>
                item.id ===
                dependencyId
            )
          )
      );

    if (
      !dependenciesCompleted
    ) {
      throw new Error(
        `A tarefa ${taskId} possui dependências não concluídas.`
      );
    }

    task.status = "READY";
    task.startedAt = undefined;
    task.completedAt = undefined;
    task.error = undefined;
    task.result = undefined;

    await this.writePlan(plan);

    return plan;
  }

  private async setTaskGitMetadataUnlocked(
    projectId: string,
    taskId: string,
    metadata: TaskGitMetadata
  ): Promise<ManagedPlan> {
    const plan =
      await this.requirePlan(
        projectId
      );

    const task =
      this.requireTask(
        plan,
        taskId
      );

    this.applyGitMetadata(
      task,
      metadata
    );

    await this.writePlan(plan);

    return plan;
  }

  private async setTaskValidationUnlocked(
    projectId: string,
    taskId: string,
    validation: TaskValidation
  ): Promise<ManagedPlan> {
    const plan =
      await this.requirePlan(
        projectId
      );

    const task =
      this.requireTask(
        plan,
        taskId
      );

    task.validation =
      validation;

    await this.writePlan(
      plan
    );

    return plan;
  }

  private async finishTaskUnlocked(
    projectId: string,
    taskId: string,
    result: string,
    metadata?: TaskGitMetadata
  ): Promise<ManagedPlan> {
    const plan =
      await this.requirePlan(
        projectId
      );

    const task =
      this.requireTask(
        plan,
        taskId
      );

    if (
      task.status !== "RUNNING"
    ) {
      throw new Error(
        `A tarefa ${taskId} não está em execução. Estado atual: ${task.status}`
      );
    }

    task.status = "DONE";
    task.completedAt =
      new Date().toISOString();

    task.result = result;
    task.error = undefined;

    if (metadata) {
      this.applyGitMetadata(
        task,
        metadata
      );
    }

    /*
     * Tarefas com requisitos de validação não liberam
     * dependentes ainda: o Orchestrator chama
     * applyValidationResult() em seguida, e só então
     * (se VALIDATED) os dependentes são liberados.
     */
    if (!this.hasValidationRequirements(task)) {
      await this.releaseReadyTasks(
        plan
      );
    }

    await this.writePlan(plan);

    return plan;
  }

  hasValidationRequirements(
    task: ManagedTask
  ): boolean {
    return Boolean(
      task.businessRules?.length ||
      task.acceptanceCriteria?.length ||
      task.requiredChecks?.length
    );
  }

  private async startCorrectionUnlocked(
    projectId: string,
    taskId: string
  ): Promise<ManagedPlan> {
    const plan =
      await this.requirePlan(
        projectId
      );

    const task =
      this.requireTask(
        plan,
        taskId
      );

    if (
      task.status !== "CORRECTION_REQUIRED"
    ) {
      throw new Error(
        `A tarefa ${taskId} não está aguardando correção. Estado atual: ${task.status}`
      );
    }

    task.status = "RUNNING";
    task.error = undefined;

    await this.writePlan(plan);

    await this.eventBus.emit({
      type: "task.started",
      projectId,
      taskId,
      data: {
        agent: task.agent,
        correction: true,
      },
    });

    return plan;
  }

  private async applyValidationResultUnlocked(
    projectId: string,
    taskId: string,
    status:
      | "VALIDATED"
      | "CORRECTION_REQUIRED"
      | "BLOCKED",
    validation: TaskValidation
  ): Promise<ManagedPlan> {
    const plan =
      await this.requirePlan(
        projectId
      );

    const task =
      this.requireTask(
        plan,
        taskId
      );

    task.validation = validation;
    task.status = status;

    if (status === "VALIDATED") {
      task.completedAt =
        new Date().toISOString();

      await this.releaseReadyTasks(
        plan
      );
    }

    await this.writePlan(plan);

    if (
      status === "VALIDATED" ||
      status === "BLOCKED"
    ) {
      await this.eventBus.emit({
        type:
          status === "VALIDATED"
            ? "task.validated"
            : "task.blocked",
        projectId,
        taskId,
        data: {
          agent: task.agent,
          blockedReason:
            validation.blockedReason,
        },
      });
    }

    return plan;
  }

  private async setPlanValidationUnlocked(
    projectId: string,
    validation: PlanValidation
  ): Promise<ManagedPlan> {
    const plan =
      await this.requirePlan(
        projectId
      );

    plan.validation = validation;

    await this.writePlan(plan);

    return plan;
  }

  private async failTaskUnlocked(
    projectId: string,
    taskId: string,
    error: string
  ): Promise<ManagedPlan> {
    const plan =
      await this.requirePlan(
        projectId
      );

    const task =
      this.requireTask(
        plan,
        taskId
      );

    task.status = "FAILED";
    task.completedAt =
      new Date().toISOString();

    task.error = error;

    await this.writePlan(plan);

    return plan;
  }

  private async updateTaskStatusUnlocked(
    projectId: string,
    taskId: string,
    status: TaskStatus
  ): Promise<ManagedPlan> {
    const plan =
      await this.requirePlan(
        projectId
      );

    const task =
      this.requireTask(
        plan,
        taskId
      );

    task.status = status;

    if (
      status === "DONE" ||
      status === "VALIDATED"
    ) {
      task.completedAt =
        new Date().toISOString();

      await this.releaseReadyTasks(
        plan
      );
    }

    await this.writePlan(plan);

    return plan;
  }

  private applyGitMetadata(
    task: ManagedTask,
    metadata: TaskGitMetadata
  ): void {
    if (
      metadata.branch !== undefined
    ) {
      task.branch =
        metadata.branch;
    }

    if (
      metadata.workspacePath !==
      undefined
    ) {
      task.workspacePath =
        metadata.workspacePath;
    }

    if (
      metadata.commit !== undefined
    ) {
      task.commit =
        metadata.commit;
    }

    if (
      metadata.headCommit !==
      undefined
    ) {
      task.headCommit =
        metadata.headCommit;
    }
  }

  private async requirePlan(
    projectId: string
  ): Promise<ManagedPlan> {
    const plan =
      await this.getPlan(
        projectId
      );

    if (!plan) {
      throw new Error(
        `Nenhum plano encontrado para o projeto ${projectId}.`
      );
    }

    return plan;
  }

  private requireTask(
    plan: ManagedPlan,
    taskId: string
  ): ManagedTask {
    const task =
      plan.tasks.find(
        (item) =>
          item.id === taskId
      );

    if (!task) {
      throw new Error(
        `Tarefa ${taskId} não encontrada no projeto ${plan.projectId}.`
      );
    }

    return task;
  }

  private async writePlan(
    plan: ManagedPlan
  ): Promise<void> {
    const projectDir =
      this.getProjectDir(
        plan.projectId
      );

    await mkdir(
      projectDir,
      {
        recursive: true,
      }
    );

    await writeFile(
      this.getPlanFile(
        plan.projectId
      ),
      JSON.stringify(
        plan,
        null,
        2
      ),
      "utf8"
    );
  }

  /*
   * Uma dependência só libera trabalho dependente quando está
   * DONE (sem requisitos de validação) ou VALIDATED (passou pelo
   * Validation Loop). Isso implementa a regra da seção 7 do
   * SENIOR_MASTER_PLAN.md: "não liberar dependências antes de
   * VALIDATED".
   */
  private isDependencySatisfied(
    dependency: ManagedTask | undefined
  ): boolean {
    return (
      dependency?.status === "DONE" ||
      dependency?.status === "VALIDATED"
    );
  }

  private async releaseReadyTasks(
    plan: ManagedPlan
  ): Promise<void> {
    for (
      const task of plan.tasks
    ) {
      if (
        task.status !== "WAITING"
      ) {
        continue;
      }

      const dependenciesCompleted =
        task.dependsOn.every(
          (dependencyId) =>
            this.isDependencySatisfied(
              plan.tasks.find(
                (item) =>
                  item.id ===
                  dependencyId
              )
            )
        );

      if (
        dependenciesCompleted
      ) {
        task.status = "READY";

        await this.eventBus.emit(
          {
            type: "task.ready",
            projectId:
              plan.projectId,
            taskId: task.id,
            data: {
              agent: task.agent,
            },
          }
        );
      }
    }
  }
  async savePlan(...args: Parameters<TaskManager["savePlanUnlocked"]>): ReturnType<TaskManager["savePlanUnlocked"]> {
    return withStateLock(`plan:${args[0].projectId}`, () => this.savePlanUnlocked(...args));
  }

  async startTask(...args: Parameters<TaskManager["startTaskUnlocked"]>): ReturnType<TaskManager["startTaskUnlocked"]> {
    return withStateLock(`plan:${args[0]}`, () => this.startTaskUnlocked(...args));
  }

  async retryTask(...args: Parameters<TaskManager["retryTaskUnlocked"]>): ReturnType<TaskManager["retryTaskUnlocked"]> {
    return withStateLock(`plan:${args[0]}`, () => this.retryTaskUnlocked(...args));
  }

  async setTaskGitMetadata(...args: Parameters<TaskManager["setTaskGitMetadataUnlocked"]>): ReturnType<TaskManager["setTaskGitMetadataUnlocked"]> {
    return withStateLock(`plan:${args[0]}`, () => this.setTaskGitMetadataUnlocked(...args));
  }

  async setTaskValidation(...args: Parameters<TaskManager["setTaskValidationUnlocked"]>): ReturnType<TaskManager["setTaskValidationUnlocked"]> {
    return withStateLock(`plan:${args[0]}`, () => this.setTaskValidationUnlocked(...args));
  }

  async finishTask(...args: Parameters<TaskManager["finishTaskUnlocked"]>): ReturnType<TaskManager["finishTaskUnlocked"]> {
    return withStateLock(`plan:${args[0]}`, () => this.finishTaskUnlocked(...args));
  }

  async startCorrection(...args: Parameters<TaskManager["startCorrectionUnlocked"]>): ReturnType<TaskManager["startCorrectionUnlocked"]> {
    return withStateLock(`plan:${args[0]}`, () => this.startCorrectionUnlocked(...args));
  }

  async applyValidationResult(...args: Parameters<TaskManager["applyValidationResultUnlocked"]>): ReturnType<TaskManager["applyValidationResultUnlocked"]> {
    return withStateLock(`plan:${args[0]}`, () => this.applyValidationResultUnlocked(...args));
  }

  async setPlanValidation(...args: Parameters<TaskManager["setPlanValidationUnlocked"]>): ReturnType<TaskManager["setPlanValidationUnlocked"]> {
    return withStateLock(`plan:${args[0]}`, () => this.setPlanValidationUnlocked(...args));
  }

  async failTask(...args: Parameters<TaskManager["failTaskUnlocked"]>): ReturnType<TaskManager["failTaskUnlocked"]> {
    return withStateLock(`plan:${args[0]}`, () => this.failTaskUnlocked(...args));
  }

  async updateTaskStatus(...args: Parameters<TaskManager["updateTaskStatusUnlocked"]>): ReturnType<TaskManager["updateTaskStatusUnlocked"]> {
    return withStateLock(`plan:${args[0]}`, () => this.updateTaskStatusUnlocked(...args));
  }

  async markInterrupted(projectId: string, reason: string) {
    return withStateLock(`plan:${projectId}`, async () => {
      const plan = await this.getPlan(projectId);
      if (!plan) return;
      for (const task of plan.tasks) {
        if (["RUNNING", "VALIDATING"].includes(task.status) || (task.status === "DONE" && this.hasValidationRequirements(task))) {
          task.status = "FAILED"; task.error = reason; task.completedAt = new Date().toISOString();
        }
      }
      await this.writePlan(plan);
    });
  }

}

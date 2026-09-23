import {
  mkdir,
  readFile,
  writeFile,
} from "node:fs/promises";

import path from "node:path";

import type {
  ExecutionPlan,
  ManagedPlan,
  ManagedTask,
  TaskStatus,
} from "../types/Task.js";

import type {
  TaskValidation,
} from "../types/Validation.js";

export interface TaskGitMetadata {
  branch?: string;
  workspacePath?: string;
  commit?: string;
  headCommit?: string;
}

export class TaskManager {
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

  async savePlan(
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

  async startTask(
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

    return plan;
  }

  async retryTask(
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
        (dependencyId) => {
          const dependency =
            plan.tasks.find(
              (item) =>
                item.id ===
                dependencyId
            );

          return (
            dependency?.status ===
            "DONE"
          );
        }
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

  async setTaskGitMetadata(
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

  async setTaskValidation(
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

  async finishTask(
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

    this.releaseReadyTasks(
      plan
    );

    await this.writePlan(plan);

    return plan;
  }

  async failTask(
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

  async updateTaskStatus(
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
      status === "DONE"
    ) {
      task.completedAt =
        new Date().toISOString();

      this.releaseReadyTasks(
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

  private releaseReadyTasks(
    plan: ManagedPlan
  ): void {
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
          (dependencyId) => {
            const dependency =
              plan.tasks.find(
                (item) =>
                  item.id ===
                  dependencyId
              );

            return (
              dependency?.status ===
              "DONE"
            );
          }
        );

      if (
        dependenciesCompleted
      ) {
        task.status = "READY";
      }
    }
  }
}

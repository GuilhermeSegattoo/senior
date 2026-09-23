import {
  readFile,
  rm,
  writeFile,
} from "node:fs/promises";

import path from "node:path";

import { Orchestrator } from "../core/Orchestrator.js";
import { AgentExecutor } from "../core/AgentExecutor.js";
import { SemanticValidator } from "../core/SemanticValidator.js";
import { TaskManager } from "../core/TaskManager.js";
import { EventBus } from "../core/EventBus.js";

import type {
  AgentRuntime,
  AgentRuntimeOptions,
  AgentRuntimeResult,
} from "../runtimes/AgentRuntime.js";

import type {
  ExecutionPlan,
} from "../types/Task.js";

import type {
  SeniorEventType,
} from "../types/Event.js";

/*
 * Simula o agente executor: em vez de chamar um provedor de LLM
 * real, escreve diretamente o arquivo esperado no workspace. Isso
 * permite testar a integração Orchestrator + Validation Loop sem
 * depender de rede/credenciais.
 */
class FakeCoderRuntime implements AgentRuntime {
  readonly name = "fake-coder";

  async status(): Promise<boolean> {
    return true;
  }

  async ask(
    _prompt: string,
    options: AgentRuntimeOptions
  ): Promise<AgentRuntimeResult> {
    await writeFile(
      path.join(
        options.cwd,
        "hello.txt"
      ),
      "SENIOR VALIDATION TEST OK",
      "utf8"
    );

    return {
      text: "Criei hello.txt com o conteúdo esperado.",
      provider: "fake",
      model: "fake-coder",
    };
  }
}

/*
 * Simula o avaliador semântico: reprova a primeira tentativa e
 * aprova a segunda, para exercitar o Correction Loop de ponta a
 * ponta (CORRECTION_REQUIRED -> correctTask -> VALIDATED).
 */
class FakeEvaluatorRuntime implements AgentRuntime {
  readonly name = "fake-evaluator";

  private calls = 0;

  async status(): Promise<boolean> {
    return true;
  }

  async ask(): Promise<AgentRuntimeResult> {
    this.calls += 1;

    const passed = this.calls >= 2;

    return {
      text: JSON.stringify([
        {
          id: "AC-01",
          passed,
          reason: passed
            ? "hello.txt contém o conteúdo esperado."
            : "Conteúdo ainda não confere com o critério (reprovação simulada).",
        },
      ]),
      provider: "fake",
      model: "fake-evaluator",
    };
  }
}

async function cleanup(
  projectId: string,
  projectPath: string
): Promise<void> {
  await rm(projectPath, {
    recursive: true,
    force: true,
  });

  await rm(
    path.join(
      process.cwd(),
      "data",
      "projects",
      projectId
    ),
    {
      recursive: true,
      force: true,
    }
  );

  await rm(
    path.join(
      process.cwd(),
      "data",
      "worktrees",
      projectId
    ),
    {
      recursive: true,
      force: true,
    }
  );

  await rm(
    path.join(
      process.cwd(),
      "data",
      "events",
      `${projectId}.jsonl`
    ),
    {
      force: true,
    }
  );

  const projectsFile = path.join(
    process.cwd(),
    "data",
    "projects.json"
  );

  try {
    const content =
      await readFile(
        projectsFile,
        "utf8"
      );

    const projects =
      JSON.parse(content) as Array<{
        id: string;
      }>;

    const remaining =
      projects.filter(
        (project) =>
          project.id !== projectId
      );

    await writeFile(
      projectsFile,
      JSON.stringify(
        remaining,
        null,
        2
      ),
      "utf8"
    );
  } catch {
    // Sem projects.json para limpar.
  }
}

async function main() {
  console.log(
    "\n=== SENIOR ORCHESTRATOR + VALIDATION LOOP (INTEGRAÇÃO) ===\n"
  );

  const orchestrator =
    new Orchestrator();

  orchestrator.agentExecutor =
    new AgentExecutor(
      new FakeCoderRuntime()
    );

  orchestrator.semanticValidator =
    new SemanticValidator(
      new FakeEvaluatorRuntime()
    );

  const project =
    await orchestrator.createProject(
      `validation-loop-test-${Date.now()}`
    );

  try {
    const taskManager =
      new TaskManager();

    const plan: ExecutionPlan = {
      projectId: project.id,
      objective:
        "Criar hello.txt com o conteúdo correto.",
      tasks: [
        {
          id: "task-1",
          agent: "backend",
          task: "Criar hello.txt com o conteúdo correto.",
          dependsOn: [],
          businessRules: [],
          requiredChecks: [],
          acceptanceCriteria: [
            {
              id: "AC-01",
              description:
                "hello.txt existe com o conteúdo esperado.",
              status: "PENDING",
              evidence: [],
            },
          ],
        },
        {
          id: "task-2",
          agent: "reviewer",
          task: "Revisar o hello.txt criado.",
          dependsOn: ["task-1"],
        },
      ],
    };

    await taskManager.savePlan(
      plan
    );

    // -------------------------------------------------------
    // 1ª tentativa: avaliador semântico reprova (simulado).
    // -------------------------------------------------------

    const firstExecution =
      await orchestrator.executeTask(
        project.id,
        "task-1"
      );

    if (
      firstExecution.validation
        ?.status !==
      "CORRECTION_REQUIRED"
    ) {
      throw new Error(
        `Esperado CORRECTION_REQUIRED na primeira tentativa, obtido: ${firstExecution.validation?.status}`
      );
    }

    const planAfterFirst =
      await taskManager.getPlan(
        project.id
      );

    const task1AfterFirst =
      planAfterFirst?.tasks.find(
        (item) =>
          item.id === "task-1"
      );

    const task2AfterFirst =
      planAfterFirst?.tasks.find(
        (item) =>
          item.id === "task-2"
      );

    if (
      task1AfterFirst?.status !==
      "CORRECTION_REQUIRED"
    ) {
      throw new Error(
        `task-1 deveria estar CORRECTION_REQUIRED, está ${task1AfterFirst?.status}`
      );
    }

    if (
      task2AfterFirst?.status !==
      "WAITING"
    ) {
      throw new Error(
        `FALHA: task-2 foi liberada antes de task-1 estar VALIDATED (item 7 do Validation Loop). Status: ${task2AfterFirst?.status}`
      );
    }

    console.log(
      "OK: dependente permanece WAITING enquanto task-1 aguarda correção."
    );

    // -------------------------------------------------------
    // Correção: avaliador semântico aprova.
    // -------------------------------------------------------

    const correction =
      await orchestrator.correctTask(
        project.id,
        "task-1"
      );

    if (
      correction.validation
        ?.status !== "VALIDATED"
    ) {
      throw new Error(
        `Esperado VALIDATED após correção, obtido: ${correction.validation?.status}`
      );
    }

    const planAfterCorrection =
      await taskManager.getPlan(
        project.id
      );

    const task1Final =
      planAfterCorrection?.tasks.find(
        (item) =>
          item.id === "task-1"
      );

    const task2Final =
      planAfterCorrection?.tasks.find(
        (item) =>
          item.id === "task-2"
      );

    if (
      task1Final?.status !==
      "VALIDATED"
    ) {
      throw new Error(
        `task-1 deveria estar VALIDATED, está ${task1Final?.status}`
      );
    }

    if (
      task1Final?.validation
        ?.attempts.length !== 2
    ) {
      throw new Error(
        `Esperado 2 tentativas de validação registradas, encontrado: ${task1Final?.validation?.attempts.length}`
      );
    }

    if (
      task2Final?.status !== "READY"
    ) {
      throw new Error(
        `FALHA: task-2 não foi liberada depois de task-1 VALIDATED. Status: ${task2Final?.status}`
      );
    }

    console.log(
      "OK: dependente liberada somente após VALIDATED, com histórico de 2 tentativas."
    );

    // -------------------------------------------------------
    // task-2 não tem requisitos de validação: comportamento
    // tradicional (DONE + liberação imediata) precisa continuar
    // funcionando sem alterações (compatibilidade).
    // -------------------------------------------------------

    const secondExecution =
      await orchestrator.executeTask(
        project.id,
        "task-2"
      );

    if (
      secondExecution.validation !==
      undefined
    ) {
      throw new Error(
        "task-2 não deveria ter passado pelo Validation Loop (não possui requisitos)."
      );
    }

    const finalPlan =
      await taskManager.getPlan(
        project.id
      );

    const finalTask2 =
      finalPlan?.tasks.find(
        (item) =>
          item.id === "task-2"
      );

    if (
      finalTask2?.status !== "DONE"
    ) {
      throw new Error(
        `task-2 deveria continuar usando o fluxo DONE tradicional. Status: ${finalTask2?.status}`
      );
    }

    console.log(
      "OK: tarefa sem requisitos de validação preserva o comportamento DONE tradicional."
    );

    // -------------------------------------------------------
    // Event Bus (Fase E): o fluxo inteiro acima deveria ter
    // deixado um rastro de eventos estruturados persistido.
    // -------------------------------------------------------

    const events =
      await new EventBus().list(
        project.id
      );

    const eventTypes = events.map(
      (event) => event.type
    );

    /*
     * "plan.created" fica de fora: este teste monta o plano
     * diretamente via TaskManager.savePlan() (não passa por
     * Orchestrator.createPlan(), que dependeria do Chief/LLM).
     */
    const expectedTypes: SeniorEventType[] =
      [
        "project.created",
        "task.started",
        "agent.started",
        "agent.message",
        "validation.started",
        "validation.failed",
        "validation.passed",
        "task.validated",
        "task.ready",
      ];

    const missing =
      expectedTypes.filter(
        (type) =>
          !eventTypes.includes(
            type
          )
      );

    if (missing.length > 0) {
      throw new Error(
        `Eventos esperados não foram emitidos: ${missing.join(", ")}. Emitidos: ${eventTypes.join(", ")}`
      );
    }

    console.log(
      "OK: o fluxo completo emite todos os eventos estruturados esperados (Event Bus)."
    );

    console.log(
      "\nORCHESTRATOR + VALIDATION LOOP FUNCIONANDO."
    );
  } finally {
    await cleanup(
      project.id,
      project.path
    );
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

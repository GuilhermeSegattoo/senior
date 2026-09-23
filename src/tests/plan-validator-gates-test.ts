import { PlanValidator } from "../core/PlanValidator.js";

import type {
  ManagedPlan,
} from "../types/Task.js";

function main() {
  console.log(
    "\n=== PLAN VALIDATOR — REVIEWER/QA GATES ===\n"
  );

  const plan: ManagedPlan = {
    projectId: "gate-test",
    objective: "Testar detecção de gates.",
    createdAt:
      new Date().toISOString(),
    tasks: [
      {
        id: "task-1",
        agent: "backend",
        task: "Implementar endpoint sem revisão.",
        dependsOn: [],
        status: "DONE",
      },
      {
        id: "task-2",
        agent: "frontend",
        task: "Implementar tela com QA associado.",
        dependsOn: [],
        status: "DONE",
      },
      {
        id: "task-3",
        agent: "qa",
        task: "Validar a tela.",
        dependsOn: ["task-2"],
        status: "DONE",
      },
      {
        id: "task-4",
        agent: "architect",
        task: "Desenhar arquitetura (não é gate-alvo).",
        dependsOn: [],
        status: "DONE",
      },
    ],
  };

  const validator =
    new PlanValidator();

  const warnings =
    validator.checkReviewerQaGates(
      plan
    );

  if (warnings.length !== 1) {
    throw new Error(
      `Esperado exatamente 1 alerta, encontrado ${warnings.length}: ${JSON.stringify(warnings)}`
    );
  }

  if (
    warnings[0].taskId !== "task-1"
  ) {
    throw new Error(
      `Esperado alerta para task-1, encontrado: ${warnings[0].taskId}`
    );
  }

  console.log(
    "OK: task-1 (backend sem reviewer/qa) gerou alerta."
  );

  console.log(
    "OK: task-2 (frontend com qa dependente) não gerou alerta."
  );

  console.log(
    "\nPLAN VALIDATOR GATES FUNCIONANDO."
  );
}

try {
  main();
} catch (error) {
  console.error(error);
  process.exitCode = 1;
}

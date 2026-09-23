import { RuntimeManager } from "../runtimes/RuntimeManager.js";

import type {
  AgentRuntime,
} from "../runtimes/AgentRuntime.js";

import type {
  ManagedPlan,
} from "../types/Task.js";

import type {
  PlanGateWarning,
  PlanValidation,
} from "../types/Validation.js";

const IMPLEMENTATION_AGENTS =
  ["backend", "frontend"] as const;

/*
 * Validação de nível de plano (seção 11 do SENIOR_MASTER_PLAN.md).
 *
 * 10 tarefas individualmente corretas != objetivo geral
 * necessariamente correto. Este validador roda depois que todas as
 * tarefas do plano estão DONE/VALIDATED.
 */
export class PlanValidator {
  private readonly runtime: AgentRuntime;

  constructor(
    runtime?: AgentRuntime
  ) {
    this.runtime =
      runtime ??
      new RuntimeManager().fromEnvironment();
  }

  /*
   * Item 13 do plano: Reviewer/QA como gates.
   *
   * Verificação estrutural (advisory): toda tarefa de
   * implementação (backend/frontend) deveria ter pelo menos uma
   * tarefa reviewer/qa dependendo dela. Isso não bloqueia a
   * execução (o Chief já é instruído a criar essas tarefas quando
   * necessário), mas alimenta a validação final do plano.
   */
  checkReviewerQaGates(
    plan: ManagedPlan
  ): PlanGateWarning[] {
    const warnings: PlanGateWarning[] = [];

    for (const task of plan.tasks) {
      if (
        !IMPLEMENTATION_AGENTS.includes(
          task.agent as (typeof IMPLEMENTATION_AGENTS)[number]
        )
      ) {
        continue;
      }

      const hasGate =
        plan.tasks.some(
          (other) =>
            (other.agent === "reviewer" ||
              other.agent === "qa") &&
            other.dependsOn.includes(
              task.id
            )
        );

      if (!hasGate) {
        warnings.push({
          taskId: task.id,
          message: `Tarefa ${task.id} (${task.agent}) não possui Reviewer nem QA revisando o resultado.`,
        });
      }
    }

    return warnings;
  }

  async validateObjective(
    plan: ManagedPlan,
    workspacePath: string
  ): Promise<PlanValidation> {
    const gateWarnings =
      this.checkReviewerQaGates(
        plan
      );

    const tasksSummary =
      plan.tasks
        .map(
          (task) =>
            `- [${task.status}] ${task.id} (${task.agent}): ${task.task}\n  Resultado: ${
              task.result ??
              "sem resultado registrado"
            }`
        )
        .join("\n\n");

    const prompt = `
Você é o validador final do SENIOR.

O plano abaixo teve todas as suas tarefas concluídas individualmente.
Sua função é verificar se o OBJETIVO ORIGINAL do usuário foi
realmente atendido no conjunto, não apenas cada tarefa isolada.

# OBJETIVO ORIGINAL

${plan.objective}

# TAREFAS EXECUTADAS

${tasksSummary}

# ALERTAS ESTRUTURAIS

${
  gateWarnings.length > 0
    ? gateWarnings
        .map(
          (warning) =>
            `- ${warning.message}`
        )
        .join("\n")
    : "Nenhum."
}

Responda SOMENTE com um JSON válido, sem markdown, no formato:

{
  "passed": true,
  "reasoning": "..."
}

"passed" deve ser false se houver qualquer lacuna entre o objetivo e
o que foi de fato entregue pelas tarefas, mesmo que cada tarefa
isoladamente pareça correta.
`;

    const response =
      await this.runtime.ask(
        prompt,
        {
          cwd: workspacePath,
          readOnly: true,
        }
      );

    const parsed =
      this.parseResponse(
        response.text
      );

    return {
      status:
        parsed.passed
          ? "PASSED"
          : "FAILED",

      objective: plan.objective,

      reasoning: parsed.reasoning,

      gateWarnings,

      validatedAt:
        new Date().toISOString(),
    };
  }

  private parseResponse(
    text: string
  ): {
    passed: boolean;
    reasoning: string;
  } {
    const cleaned =
      text
        .trim()
        .replace(/^```(json)?/i, "")
        .replace(/```$/, "")
        .trim();

    let parsed: unknown;

    try {
      parsed = JSON.parse(cleaned);
    } catch (error) {
      throw new Error(
        `Falha ao interpretar resposta da validação final do plano: ${
          error instanceof Error
            ? error.message
            : String(error)
        }`
      );
    }

    const record =
      parsed as {
        passed?: unknown;
        reasoning?: unknown;
      };

    return {
      passed: Boolean(
        record.passed
      ),

      reasoning: String(
        record.reasoning ??
          "Sem justificativa."
      ),
    };
  }
}

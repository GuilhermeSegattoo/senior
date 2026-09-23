import { RuntimeManager } from "../runtimes/RuntimeManager.js";

import type {
  AgentRuntime,
} from "../runtimes/AgentRuntime.js";

import type {
  ManagedTask,
} from "../types/Task.js";

export interface SemanticCriterionOutcome {
  id: string;
  passed: boolean;
  reason: string;
}

export interface SemanticEvaluationInput {
  task: ManagedTask;
  objective: string;
  agentResult: string;
  diff: string;
  workspacePath: string;
}

const MAX_DIFF_CHARS = 20_000;

/*
 * Avalia critérios de aceite que não são reduzíveis a
 * typecheck/test/lint/build.
 *
 * Diferente do ValidationEngine (checks determinísticos), aqui um
 * agente read-only julga o diff real produzido contra os critérios
 * de aceite e regras de negócio da tarefa. O relatório do agente
 * executor NUNCA é aceito sozinho como prova (seção 12 do
 * SENIOR_MASTER_PLAN.md: "não basta um agente dizer que funciona").
 */
export class SemanticValidator {
  private readonly runtime: AgentRuntime;

  constructor(
    runtime?: AgentRuntime
  ) {
    this.runtime =
      runtime ??
      new RuntimeManager().fromEnvironment();
  }

  async evaluate(
    input: SemanticEvaluationInput
  ): Promise<SemanticCriterionOutcome[]> {
    const criteria =
      input.task.acceptanceCriteria ?? [];

    if (criteria.length === 0) {
      return [];
    }

    const businessRules =
      input.task.businessRules ?? [];

    const truncatedDiff =
      input.diff.length > MAX_DIFF_CHARS
        ? `${input.diff.slice(0, MAX_DIFF_CHARS)}\n... (diff truncado)`
        : input.diff ||
          "(nenhuma alteração de arquivo detectada)";

    const rulesText =
      businessRules.length > 0
        ? businessRules
            .map(
              (rule) =>
                `- [${rule.id}]${
                  rule.required
                    ? " (obrigatória)"
                    : ""
                } ${rule.description}`
            )
            .join("\n")
        : "Nenhuma regra de negócio explícita.";

    const criteriaText =
      criteria
        .map(
          (criterion) =>
            `- [${criterion.id}] ${criterion.description}`
        )
        .join("\n");

    const prompt = `
Você é o avaliador de QA do SENIOR.

Sua única função é julgar, com rigor técnico, se os critérios de
aceite abaixo foram REALMENTE satisfeitos pela implementação. Não
confie apenas no que o agente executor relatou: baseie seu
julgamento no diff real produzido.

# OBJETIVO DO PROJETO

${input.objective}

# TAREFA

${input.task.task}

# REGRAS DE NEGÓCIO

${rulesText}

# CRITÉRIOS DE ACEITE

${criteriaText}

# RELATÓRIO DO AGENTE EXECUTOR

${input.agentResult}

# DIFF REAL PRODUZIDO PELA TAREFA

\`\`\`diff
${truncatedDiff}
\`\`\`

Retorne SOMENTE um JSON válido, sem markdown, no formato:

[
  { "id": "AC-01", "passed": true, "reason": "..." }
]

Regras:

- Um item por critério de aceite listado acima.
- "passed" deve ser false havendo qualquer dúvida razoável.
- "reason" deve citar evidência concreta do diff, não opinião.
- Não inclua texto antes ou depois do JSON.
`;

    const response =
      await this.runtime.ask(
        prompt,
        {
          cwd: input.workspacePath,
          readOnly: true,
        }
      );

    const parsed =
      this.parseResponse(
        response.text
      );

    return criteria.map(
      (criterion) => {
        const outcome =
          parsed.find(
            (item) =>
              item.id === criterion.id
          );

        if (!outcome) {
          return {
            id: criterion.id,
            passed: false,
            reason:
              "O avaliador semântico não retornou um veredito para este critério.",
          };
        }

        return outcome;
      }
    );
  }

  private parseResponse(
    text: string
  ): SemanticCriterionOutcome[] {
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
        `Falha ao interpretar resposta do avaliador semântico: ${
          error instanceof Error
            ? error.message
            : String(error)
        }`
      );
    }

    if (!Array.isArray(parsed)) {
      throw new Error(
        "Resposta do avaliador semântico não é uma lista JSON."
      );
    }

    return parsed.map(
      (item) => ({
        id: String(
          (item as { id: unknown }).id
        ),

        passed: Boolean(
          (item as { passed: unknown })
            .passed
        ),

        reason: String(
          (item as { reason?: unknown })
            .reason ??
            "Sem justificativa."
        ),
      })
    );
  }
}

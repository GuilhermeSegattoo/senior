import type {
  CheckValidation,
  RequiredCheck,
  TaskValidation,
  ValidationAttempt,
  ValidationEvidence,
} from "../types/Validation.js";

import {
  RunProjectCheckTool,
} from "../tools/RunProjectCheckTool.js";

import {
  ValidationManager,
} from "./ValidationManager.js";

export interface ValidationEngineResult {
  passed: boolean;

  validation: TaskValidation;

  attempt: ValidationAttempt;
}

export class ValidationEngine {
  private readonly manager =
    new ValidationManager();

  async runChecks(
    workspace: string,
    validation: TaskValidation
  ): Promise<ValidationEngineResult> {
    const attempt =
      this.manager.startAttempt(
        validation
      );

    const checker =
      new RunProjectCheckTool(
        workspace
      );

    for (
      const check of
      validation.requiredChecks
    ) {
      await this.runCheck(
        checker,
        attempt,
        check
      );
    }

    /*
     * Por enquanto este Engine é
     * responsável apenas pelos checks
     * determinísticos.
     *
     * Os critérios semânticos serão
     * avaliados posteriormente pelo
     * Validator/QA.
     *
     * Se não existem critérios de
     * aceite, os checks são suficientes
     * para concluir esta tentativa.
     */
    if (
      attempt.criteria.length === 0
    ) {
      const passed =
        this.manager.completeAttempt(
          validation,
          attempt
        );

      return {
        passed,
        validation,
        attempt,
      };
    }

    /*
     * Existem critérios de aceite.
     * Portanto ainda não podemos marcar
     * a validação como PASSED.
     */
    return {
      passed: false,
      validation,
      attempt,
    };
  }

  completeSemanticValidation(
    validation: TaskValidation,
    attempt: ValidationAttempt
  ): boolean {
    return this.manager.completeAttempt(
      validation,
      attempt
    );
  }

  passCriterion(
    attempt: ValidationAttempt,
    criterionId: string,
    evidence: ValidationEvidence
  ): void {
    this.manager.passCriterion(
      attempt,
      criterionId,
      evidence
    );
  }

  failCriterion(
    attempt: ValidationAttempt,
    criterionId: string,
    reason: string,
    evidence?: ValidationEvidence
  ): void {
    this.manager.failCriterion(
      attempt,
      criterionId,
      reason,
      evidence
    );
  }

  setDiagnosis(
    attempt: ValidationAttempt,
    diagnosis: string,
    correctionPlan?: string
  ): void {
    this.manager.setDiagnosis(
      attempt,
      diagnosis,
      correctionPlan
    );
  }

  private async runCheck(
    checker: RunProjectCheckTool,
    attempt: ValidationAttempt,
    check: RequiredCheck
  ): Promise<void> {
    try {
      const result =
        await checker.execute(
          check
        );

      const evidence =
        this.createCheckEvidence(
          check,
          result.command,
          result.output
        );

      this.manager.recordCheck(
        attempt,
        check,
        result.success,
        evidence,
        result.success
          ? undefined
          : `${check} terminou com código ${result.exitCode}.`
      );
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : String(error);

      this.manager.recordCheck(
        attempt,
        check,
        false,
        this.createCheckEvidence(
          check,
          check,
          message
        ),
        message
      );
    }
  }

  private createCheckEvidence(
    check: RequiredCheck,
    command: string,
    output: string
  ): ValidationEvidence {
    const typeMap: Record<
      RequiredCheck,
      ValidationEvidence["type"]
    > = {
      typecheck: "TYPECHECK",
      test: "TEST",
      lint: "LINT",
      build: "BUILD",
    };

    return {
      type: typeMap[check],

      description:
        `Check ${check} executado pelo Senior.`,

      source: command,

      output:
        output ||
        "(sem saída)",
    };
  }
}

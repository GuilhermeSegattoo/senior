import type {
  AcceptanceCriterion,
  CheckValidation,
  TaskValidation,
  ValidationAttempt,
  ValidationEvidence,
} from "../types/Validation.js";

import type {
  ManagedTask,
} from "../types/Task.js";

export class ValidationManager {
  initialize(
    task: ManagedTask
  ): TaskValidation {
    const acceptanceCriteria =
      this.cloneCriteria(
        task.acceptanceCriteria ?? []
      );

    const requiredChecks =
      task.requiredChecks ?? [];

    return {
      status: "PENDING",

      businessRules:
        task.businessRules ?? [],

      acceptanceCriteria,

      requiredChecks,

      attempts: [],

      maxAttempts: 5,
    };
  }

  startAttempt(
    validation: TaskValidation
  ): ValidationAttempt {
    if (
      validation.status === "PASSED"
    ) {
      throw new Error(
        "A validação já foi concluída com sucesso."
      );
    }

    if (
      validation.status === "BLOCKED"
    ) {
      throw new Error(
        "A validação está bloqueada."
      );
    }

    if (
      validation.attempts.length >=
      validation.maxAttempts
    ) {
      validation.status = "BLOCKED";

      validation.blockedReason =
        "Número máximo de tentativas de validação atingido.";

      throw new Error(
        validation.blockedReason
      );
    }

    const attemptNumber =
      validation.attempts.length + 1;

    const attempt: ValidationAttempt = {
      attempt: attemptNumber,

      startedAt:
        new Date().toISOString(),

      status: "RUNNING",

      criteria:
        this.cloneCriteria(
          validation.acceptanceCriteria
        ),

      checks:
        validation.requiredChecks.map(
          (check): CheckValidation => ({
            check,
            status: "PENDING",
          })
        ),
    };

    validation.status = "RUNNING";

    validation.attempts.push(
      attempt
    );

    return attempt;
  }

  passCriterion(
    attempt: ValidationAttempt,
    criterionId: string,
    evidence: ValidationEvidence
  ): void {
    const criterion =
      this.getCriterion(
        attempt,
        criterionId
      );

    criterion.status = "PASSED";

    criterion.failureReason =
      undefined;

    criterion.evidence.push(
      evidence
    );
  }

  failCriterion(
    attempt: ValidationAttempt,
    criterionId: string,
    reason: string,
    evidence?: ValidationEvidence
  ): void {
    const criterion =
      this.getCriterion(
        attempt,
        criterionId
      );

    criterion.status = "FAILED";

    criterion.failureReason =
      reason;

    if (evidence) {
      criterion.evidence.push(
        evidence
      );
    }
  }

  recordCheck(
    attempt: ValidationAttempt,
    check: CheckValidation["check"],
    passed: boolean,
    evidence: ValidationEvidence,
    failureReason?: string
  ): void {
    const target =
      attempt.checks.find(
        (item) =>
          item.check === check
      );

    if (!target) {
      throw new Error(
        `Check não esperado nesta validação: ${check}`
      );
    }

    target.status =
      passed
        ? "PASSED"
        : "FAILED";

    target.evidence =
      evidence;

    target.failureReason =
      passed
        ? undefined
        : failureReason ??
          `Check ${check} falhou.`;
  }

  completeAttempt(
    validation: TaskValidation,
    attempt: ValidationAttempt
  ): boolean {
    const criteriaPassed =
      attempt.criteria.every(
        (criterion) =>
          criterion.status ===
          "PASSED"
      );

    const checksPassed =
      attempt.checks.every(
        (check) =>
          check.status ===
          "PASSED"
      );

    attempt.completedAt =
      new Date().toISOString();

    if (
      criteriaPassed &&
      checksPassed
    ) {
      attempt.status = "PASSED";

      validation.status =
        "PASSED";

      validation.validatedAt =
        attempt.completedAt;

      validation.acceptanceCriteria =
        this.cloneCriteria(
          attempt.criteria
        );

      return true;
    }

    attempt.status = "FAILED";

    validation.status =
      validation.attempts.length >=
      validation.maxAttempts
        ? "BLOCKED"
        : "FAILED";

    if (
      validation.status === "BLOCKED"
    ) {
      validation.blockedReason =
        "A tarefa não foi validada dentro do limite de tentativas.";
    }

    validation.acceptanceCriteria =
      this.cloneCriteria(
        attempt.criteria
      );

    return false;
  }

  setDiagnosis(
    attempt: ValidationAttempt,
    diagnosis: string,
    correctionPlan?: string
  ): void {
    attempt.diagnosis =
      diagnosis;

    attempt.correctionPlan =
      correctionPlan;
  }

  private getCriterion(
    attempt: ValidationAttempt,
    criterionId: string
  ): AcceptanceCriterion {
    const criterion =
      attempt.criteria.find(
        (item) =>
          item.id === criterionId
      );

    if (!criterion) {
      throw new Error(
        `Critério de aceite não encontrado: ${criterionId}`
      );
    }

    return criterion;
  }

  private cloneCriteria(
    criteria: AcceptanceCriterion[]
  ): AcceptanceCriterion[] {
    return criteria.map(
      (criterion) => ({
        ...criterion,

        evidence:
          criterion.evidence.map(
            (evidence) => ({
              ...evidence,
            })
          ),
      })
    );
  }
}

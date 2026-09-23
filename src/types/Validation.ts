export type ValidationStatus =
  | "PENDING"
  | "RUNNING"
  | "PASSED"
  | "FAILED"
  | "BLOCKED";

export type ValidationEvidenceType =
  | "TEST"
  | "TYPECHECK"
  | "LINT"
  | "BUILD"
  | "FILE"
  | "REVIEW"
  | "QA"
  | "AGENT";

export interface ValidationEvidence {
  type: ValidationEvidenceType;

  description: string;

  source?: string;

  output?: string;
}

export interface BusinessRule {
  id: string;

  description: string;

  required: boolean;
}

export interface AcceptanceCriterion {
  id: string;

  description: string;

  status: ValidationStatus;

  evidence: ValidationEvidence[];

  failureReason?: string;
}

export type RequiredCheck =
  | "typecheck"
  | "test"
  | "lint"
  | "build";

export interface CheckValidation {
  check: RequiredCheck;

  status: ValidationStatus;

  evidence?: ValidationEvidence;

  failureReason?: string;
}

export interface ValidationAttempt {
  attempt: number;

  startedAt: string;

  completedAt?: string;

  status: ValidationStatus;

  criteria: AcceptanceCriterion[];

  checks: CheckValidation[];

  diagnosis?: string;

  correctionPlan?: string;
}

export interface TaskValidation {
  status: ValidationStatus;

  businessRules: BusinessRule[];

  acceptanceCriteria: AcceptanceCriterion[];

  requiredChecks: RequiredCheck[];

  attempts: ValidationAttempt[];

  maxAttempts: number;

  validatedAt?: string;

  blockedReason?: string;
}

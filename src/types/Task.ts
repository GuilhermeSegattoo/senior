import type {
  AcceptanceCriterion,
  BusinessRule,
  PlanValidation,
  RequiredCheck,
  TaskValidation,
} from "./Validation.js";

export type AgentRole =
  | "architect"
  | "frontend"
  | "backend"
  | "reviewer"
  | "qa"
  | "devops";

export type TaskStatus =
  | "WAITING"
  | "READY"
  | "RUNNING"
  | "VALIDATING"
  | "CORRECTION_REQUIRED"
  | "VALIDATED"
  | "DONE"
  | "FAILED"
  | "BLOCKED";

export interface PlannedTask {
  id: string;
  agent: AgentRole;
  task: string;
  dependsOn: string[];
  businessRules?: BusinessRule[];
  acceptanceCriteria?: AcceptanceCriterion[];
  requiredChecks?: RequiredCheck[];
}

export interface ExecutionPlan {
  projectId: string;
  objective: string;
  tasks: PlannedTask[];
}

export interface ManagedTask
  extends PlannedTask {
  status: TaskStatus;
  validation?: TaskValidation;

  startedAt?: string;
  completedAt?: string;

  result?: string;
  error?: string;

  /*
   * Branch utilizada pela tarefa.
   */
  branch?: string;

  /*
   * Worktree isolado da tarefa.
   */
  workspacePath?: string;

  /*
   * Novo commit criado especificamente
   * pela tarefa.
   *
   * Pode não existir em agentes read-only,
   * como Architect e Reviewer.
   */
  commit?: string;

  /*
   * Commit exato que representa o estado
   * final do código visto pela tarefa.
   *
   * Diferente de "commit":
   *
   * commit     = alteração criada pela tarefa
   * headCommit = código final que ela enxergou
   *
   * Exemplo:
   *
   * task-2 Backend:
   * commit     = e7951e6
   * headCommit = e7951e6
   *
   * task-4 Reviewer:
   * commit     = undefined
   * headCommit = e7951e6
   */
  headCommit?: string;
}

export interface ManagedPlan {
  projectId: string;
  objective: string;
  createdAt: string;
  tasks: ManagedTask[];
  validation?: PlanValidation;
}

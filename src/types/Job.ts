export type JobStatus =
  | "PENDING"
  | "RUNNING"
  | "DONE"
  | "OBJECTIVE_NOT_MET"
  | "FAILED"
  | "NEEDS_HUMAN"
  | "BLOCKED";

export interface Job {
  id: string;
  projectId: string;
  status: JobStatus;

  createdAt: string;
  startedAt?: string;
  completedAt?: string;

  /*
   * PID do processo destacado que está executando o job. Usado
   * para detectar jobs que morreram sem atualizar o status
   * (crash) — ver JobManager.reconcile().
   */
  pid?: number;

  logFile: string;

  result?: unknown;
  error?: string;
}

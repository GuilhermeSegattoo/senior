/*
 * Subconjunto da lista de eventos da seção 16 do
 * SENIOR_MASTER_PLAN.md que o Senior consegue emitir honestamente
 * hoje, a partir de transições de estado reais.
 *
 * Deliberadamente FORA por enquanto (exigiriam instrumentação que
 * ainda não existe):
 * - tool.started / tool.completed: o loop de ferramentas roda dentro
 *   do PiRuntime/Codex; o Orchestrator não vê chamadas individuais.
 * - file.changed: exigiria diff por arquivo, não só por commit.
 * - approval.required: não existe mecanismo de approvals ainda.
 */
export type SeniorEventType =
  | "project.created"
  | "plan.created"
  | "task.ready"
  | "task.started"
  | "agent.started"
  | "agent.message"
  | "validation.started"
  | "validation.failed"
  | "validation.passed"
  | "task.blocked"
  | "task.validated"
  | "commit.created"
  | "job.completed";

export interface SeniorEvent {
  id: string;
  type: SeniorEventType;
  projectId: string;
  taskId?: string;
  jobId?: string;
  createdAt: string;
  data: Record<string, unknown>;
}

export type SeniorEventInput = Omit<
  SeniorEvent,
  "id" | "createdAt"
>;

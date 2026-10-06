import type { ExecutionPlan, PlannedTask } from "../types/Task.js";

export function parsePlan(value: unknown, projectId: string, objective: string): ExecutionPlan {
  if (!value || typeof value !== "object") throw new Error("Plano inválido.");
  const record = value as Record<string, unknown>;
  if (!Array.isArray(record.tasks) || !record.tasks.length || record.tasks.length > 50) throw new Error("Plano deve conter de 1 a 50 tarefas.");
  const ids = new Set<string>();
  const tasks: PlannedTask[] = record.tasks.map((item: unknown) => {
    if (!item || typeof item !== "object") throw new Error("Tarefa inválida.");
    const task = item as Record<string, unknown>;
    if (typeof task.id !== "string" || !/^[a-zA-Z0-9_-]{1,100}$/.test(task.id) || ids.has(task.id)) throw new Error("ID de tarefa inválido/duplicado.");
    ids.add(task.id);
    if (!["architect", "backend", "frontend", "reviewer", "qa", "devops"].includes(String(task.agent))) throw new Error("Papel de agente inválido.");
    if (typeof task.task !== "string" || !task.task.trim() || task.task.length > 16000) throw new Error("Descrição inválida.");
    if (!Array.isArray(task.dependsOn) || task.dependsOn.some(x => typeof x !== "string")) throw new Error("Dependências inválidas.");
    for (const field of ["acceptanceCriteria", "businessRules"] as const) {
      if (task[field] !== undefined) {
        if (!Array.isArray(task[field]) || task[field].length > 30) throw new Error(`Campo inválido: ${field}`);
        const criteriaIds = new Set();
        for (const entry of task[field]) {
          if (!entry || typeof entry.id !== "string" || typeof entry.description !== "string" || !entry.description.trim() || criteriaIds.has(entry.id)) throw new Error(`Item inválido: ${field}`);
          if (field === "businessRules" && typeof entry.required !== "boolean") throw new Error("Regra de negócio exige required booleano.");
          criteriaIds.add(entry.id);
        }
      }
    }
    if (task.requiredChecks !== undefined && (!Array.isArray(task.requiredChecks) || task.requiredChecks.some(x => !["typecheck", "test", "lint", "build"].includes(x)))) throw new Error("Checks inválidos.");
    if (["backend", "frontend", "devops"].includes(String(task.agent)) && !(task.acceptanceCriteria as unknown[] | undefined)?.length) throw new Error("Tarefa de implementação exige critérios de aceite.");
    // Whitelist fields. Model output may not inject status, paths or Git metadata.
    return { id: task.id, agent: task.agent as PlannedTask["agent"], task: task.task, dependsOn: task.dependsOn,
      businessRules: task.businessRules as PlannedTask["businessRules"],
      acceptanceCriteria: (task.acceptanceCriteria as Array<{ id: string; description: string }> | undefined)?.map(x => ({ id: x.id, description: x.description, status: "PENDING", evidence: [] })),
      requiredChecks: task.requiredChecks as PlannedTask["requiredChecks"] };
  });
  const visited = new Set<string>(), visiting = new Set<string>();
  const visit = (id: string) => {
    if (visiting.has(id)) throw new Error("Plano contém ciclo.");
    if (visited.has(id)) return;
    const task = tasks.find(x => x.id === id);
    if (!task) throw new Error(`Dependência desconhecida: ${id}`);
    visiting.add(id); task.dependsOn.forEach(visit); visiting.delete(id); visited.add(id);
  };
  tasks.forEach(task => visit(task.id));
  for (const task of tasks.filter(x => ["backend", "frontend", "devops"].includes(x.agent))) {
    if (!tasks.some(x => ["reviewer", "qa"].includes(x.agent) && x.dependsOn.includes(task.id))) throw new Error(`Tarefa ${task.id} exige Reviewer/QA dependente.`);
  }
  return { projectId, objective, tasks };
}

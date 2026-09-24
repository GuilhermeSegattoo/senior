import type {
  ManagedTask,
  TaskStatus,
} from "@/lib/api";
import { AGENT_LABEL } from "@/components/TaskNode";

interface Column {
  statuses: TaskStatus[];
  label: string;
}

/*
 * Colunas do Kanban (seção 3.3 do SENIOR_MASTER_PLAN.md: "WAITING |
 * READY | RUNNING | VALIDATING | CORRECTION | VALIDATED | BLOCKED").
 * DONE e VALIDATED viram uma coluna só ("concluída") — são o mesmo
 * resultado final (sucesso), a diferença é só se a tarefa tinha
 * requisitos de validação ou não (seção 13 do doc).
 */
const COLUMNS: Column[] = [
  {
    statuses: ["WAITING"],
    label: "aguardando",
  },
  {
    statuses: ["READY"],
    label: "pronta",
  },
  {
    statuses: ["RUNNING"],
    label: "em execução",
  },
  {
    statuses: ["VALIDATING"],
    label: "validando",
  },
  {
    statuses: [
      "CORRECTION_REQUIRED",
    ],
    label: "corrigindo",
  },
  {
    statuses: ["DONE", "VALIDATED"],
    label: "concluída",
  },
  {
    statuses: ["FAILED"],
    label: "falhou",
  },
  {
    statuses: ["BLOCKED"],
    label: "bloqueada",
  },
];

export function KanbanBoard({
  tasks,
  onSelectTask,
}: {
  tasks: ManagedTask[];
  onSelectTask: (
    taskId: string
  ) => void;
}) {
  return (
    <div className="flex h-full gap-3 overflow-x-auto p-6">
      {COLUMNS.map((column) => {
        const columnTasks =
          tasks.filter((task) =>
            column.statuses.includes(
              task.status
            )
          );

        return (
          <div
            key={column.label}
            className="flex w-64 shrink-0 flex-col rounded-lg border border-line bg-panel"
          >
            <div className="flex items-center justify-between border-b border-line px-3 py-2">
              <span className="font-mono text-[11px] uppercase tracking-wider text-mute">
                {column.label}
              </span>

              <span className="font-mono text-[11px] text-mute">
                {columnTasks.length}
              </span>
            </div>

            <div className="flex-1 space-y-2 overflow-y-auto p-2">
              {columnTasks.map(
                (task) => (
                  <button
                    key={task.id}
                    type="button"
                    onClick={() =>
                      onSelectTask(
                        task.id
                      )
                    }
                    className="w-full rounded-md border border-line bg-panel-raised p-3 text-left transition-colors hover:border-signal/50"
                  >
                    <div className="mb-1 flex items-center justify-between">
                      <span className="font-mono text-[10px] uppercase tracking-wider text-mute">
                        {AGENT_LABEL[
                          task.agent
                        ] ??
                          task.agent.toUpperCase()}
                      </span>

                      <span className="font-mono text-[10px] text-mute">
                        {task.id}
                      </span>
                    </div>

                    <p className="line-clamp-3 text-xs text-paper">
                      {task.task}
                    </p>
                  </button>
                )
              )}

              {columnTasks.length ===
                0 && (
                <p className="px-1 py-2 font-mono text-[11px] text-mute">
                  vazio
                </p>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

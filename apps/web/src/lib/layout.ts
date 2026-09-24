import type { ManagedTask } from "@/lib/api";

export interface TaskPosition {
  x: number;
  y: number;
}

const COLUMN_WIDTH = 280;
const ROW_HEIGHT = 140;

/*
 * Layout determinístico simples: posição de cada tarefa vem da
 * profundidade dela no DAG de dependsOn (uma tarefa sem
 * dependências fica na coluna 0; uma tarefa fica sempre à direita
 * de tudo que ela depende). Dentro de uma coluna, tarefas ficam
 * empilhadas na ordem em que aparecem no plano.
 *
 * Não tenta ser um layout de grafo sofisticado (sem minimizar
 * cruzamento de arestas) — é o suficiente para visualizar um DAG de
 * tarefas real sem precisar de uma biblioteca de layout dedicada.
 */
export function layoutTasks(
  tasks: ManagedTask[]
): Record<string, TaskPosition> {
  const taskById = new Map(
    tasks.map((task) => [
      task.id,
      task,
    ])
  );

  const depthCache = new Map<
    string,
    number
  >();

  function depthOf(
    taskId: string,
    trail: Set<string> = new Set()
  ): number {
    const cached =
      depthCache.get(taskId);

    if (cached !== undefined) {
      return cached;
    }

    if (trail.has(taskId)) {
      // Dependência circular: não deveria acontecer, mas não trava o layout.
      return 0;
    }

    const task = taskById.get(
      taskId
    );

    if (
      !task ||
      task.dependsOn.length === 0
    ) {
      depthCache.set(taskId, 0);
      return 0;
    }

    const nextTrail = new Set(
      trail
    );

    nextTrail.add(taskId);

    const depth =
      1 +
      Math.max(
        ...task.dependsOn.map(
          (dependencyId) =>
            depthOf(
              dependencyId,
              nextTrail
            )
        )
      );

    depthCache.set(taskId, depth);
    return depth;
  }

  const columns = new Map<
    number,
    string[]
  >();

  for (const task of tasks) {
    const depth = depthOf(task.id);
    const column =
      columns.get(depth) ?? [];

    column.push(task.id);
    columns.set(depth, column);
  }

  const positions: Record<
    string,
    TaskPosition
  > = {};

  for (const [
    depth,
    taskIds,
  ] of columns) {
    taskIds.forEach(
      (taskId, index) => {
        positions[taskId] = {
          x:
            depth * COLUMN_WIDTH,
          y:
            index * ROW_HEIGHT,
        };
      }
    );
  }

  return positions;
}

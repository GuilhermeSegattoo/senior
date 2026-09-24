import type { ManagedTask } from "@/lib/api";

export interface TaskPosition {
  x: number;
  y: number;
}

export interface AgentLane {
  agent: string;
  y: number;
}

const COLUMN_WIDTH = 280;
const ROW_HEIGHT = 180;
const STACK_OFFSET = 48;

/*
 * Ordem fixa das raias — mesma ordem em que os papéis aparecem no
 * resto do produto (CLI, AGENT.md). Papéis fora dessa lista (não
 * deveria acontecer, mas não trava o layout) vão para o final.
 */
const AGENT_ORDER = [
  "architect",
  "backend",
  "frontend",
  "reviewer",
  "qa",
  "devops",
];

function agentRow(
  agent: string
): number {
  const index =
    AGENT_ORDER.indexOf(agent);

  return index === -1
    ? AGENT_ORDER.length
    : index;
}

/*
 * Layout em raias (swim lanes): uma linha horizontal por agente —
 * "backend" numa raia, "frontend" em outra — para o usuário
 * enxergar de relance quem está trabalhando em quê, em vez de um
 * grafo genérico. Dentro de uma raia, a posição horizontal ainda
 * vem da profundidade no DAG de dependsOn (uma tarefa sem
 * dependências fica na coluna 0; sempre à direita de tudo que ela
 * depende).
 *
 * Não tenta ser um layout de grafo sofisticado (sem minimizar
 * cruzamento de arestas) — é o suficiente para ler um DAG real sem
 * precisar de uma biblioteca de layout dedicada.
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

  const positions: Record<
    string,
    TaskPosition
  > = {};

  const cellOccupancy = new Map<
    string,
    number
  >();

  for (const task of tasks) {
    const depth = depthOf(task.id);
    const row = agentRow(
      task.agent
    );

    const cellKey = `${row}:${depth}`;

    const stackIndex =
      cellOccupancy.get(cellKey) ??
      0;

    cellOccupancy.set(
      cellKey,
      stackIndex + 1
    );

    positions[task.id] = {
      x: depth * COLUMN_WIDTH,
      y:
        row * ROW_HEIGHT +
        stackIndex * STACK_OFFSET,
    };
  }

  return positions;
}

/*
 * Raias realmente usadas no plano (só os agentes presentes), na
 * ordem fixa de AGENT_ORDER — para desenhar os rótulos das raias no
 * canvas.
 */
export function getAgentLanes(
  tasks: ManagedTask[]
): AgentLane[] {
  const agentsPresent = new Set(
    tasks.map((task) => task.agent)
  );

  return Array.from(agentsPresent)
    .sort(
      (a, b) =>
        agentRow(a) - agentRow(b)
    )
    .map((agent) => ({
      agent,
      y: agentRow(agent) * ROW_HEIGHT,
    }));
}

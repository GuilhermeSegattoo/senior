"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  ReactFlow,
  Background,
  Controls,
  type Edge,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";

import {
  createPlan,
  fetchJob,
  fetchPlan,
  fetchProject,
  startJob,
  type Job,
  type ManagedPlan,
  type Project,
} from "@/lib/api";
import {
  getAgentLanes,
  layoutTasks,
} from "@/lib/layout";
import {
  TaskNode,
  LaneLabelNode,
  type TaskFlowNode,
  type LaneLabelFlowNode,
} from "@/components/TaskNode";
import { TaskDetailPanel } from "@/components/TaskDetailPanel";

const nodeTypes = {
  task: TaskNode,
  lane: LaneLabelNode,
};

const LANE_LABEL_X = -260;
const POLL_INTERVAL_MS = 3000;

type Loadable<T> =
  | "loading"
  | T
  | null;

export function ProjectWorkspace({
  projectId,
}: {
  projectId: string;
}) {
  const [project, setProject] =
    useState<Loadable<Project>>(
      "loading"
    );

  const [plan, setPlan] =
    useState<Loadable<ManagedPlan>>(
      "loading"
    );

  const [objective, setObjective] =
    useState("");

  const [creatingPlan, setCreatingPlan] =
    useState(false);

  const [actionError, setActionError] =
    useState<string | null>(null);

  const [job, setJob] =
    useState<Job | null>(null);

  const [startingJob, setStartingJob] =
    useState(false);

  const [
    selectedTaskId,
    setSelectedTaskId,
  ] = useState<string | null>(
    null
  );

  useEffect(() => {
    let cancelled = false;

    fetchProject(projectId).then(
      (data) => {
        if (!cancelled)
          setProject(data);
      }
    );

    return () => {
      cancelled = true;
    };
  }, [projectId]);

  useEffect(() => {
    let cancelled = false;

    async function poll() {
      const data = await fetchPlan(
        projectId
      ).catch(() => null);

      if (!cancelled) {
        setPlan(data);
      }
    }

    poll();

    const interval = setInterval(
      poll,
      POLL_INTERVAL_MS
    );

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [projectId]);

  useEffect(() => {
    if (
      !job ||
      (job.status !== "RUNNING" &&
        job.status !== "PENDING")
    ) {
      return;
    }

    let cancelled = false;

    const interval = setInterval(
      async () => {
        const data = await fetchJob(
          job.id
        ).catch(() => null);

        if (data && !cancelled) {
          setJob(data);
        }
      },
      POLL_INTERVAL_MS
    );

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [job]);

  const { nodes, edges } =
    useMemo(() => {
      if (
        !plan ||
        plan === "loading"
      ) {
        return {
          nodes: [] as (
            | TaskFlowNode
            | LaneLabelFlowNode
          )[],
          edges: [] as Edge[],
        };
      }

      const positions =
        layoutTasks(plan.tasks);

      const taskNodes: TaskFlowNode[] =
        plan.tasks.map((task) => ({
          id: task.id,
          type: "task" as const,
          position:
            positions[task.id] ?? {
              x: 0,
              y: 0,
            },
          data: {
            taskId: task.id,
            agent: task.agent,
            task: task.task,
            status: task.status,
          },
        }));

      const laneNodes: LaneLabelFlowNode[] =
        getAgentLanes(
          plan.tasks
        ).map((lane) => ({
          id: `lane-${lane.agent}`,
          type: "lane" as const,
          position: {
            x: LANE_LABEL_X,
            y: lane.y,
          },
          draggable: false,
          selectable: false,
          data: {
            agent: lane.agent,
          },
        }));

      const nodes = [
        ...laneNodes,
        ...taskNodes,
      ];

      const edges: Edge[] =
        plan.tasks.flatMap(
          (task) =>
            task.dependsOn.map(
              (dependencyId) => ({
                id: `${dependencyId}->${task.id}`,
                source:
                  dependencyId,
                target: task.id,
                style: {
                  stroke:
                    "#26324A",
                },
              })
            )
        );

      return { nodes, edges };
    }, [plan]);

  async function handleCreatePlan(
    event: React.FormEvent
  ) {
    event.preventDefault();

    const trimmed =
      objective.trim();

    if (!trimmed) {
      setActionError(
        "Descreva o objetivo."
      );

      return;
    }

    setCreatingPlan(true);
    setActionError(null);

    try {
      const created =
        await createPlan(
          projectId,
          trimmed
        );

      setPlan(created);
    } catch (error) {
      setActionError(
        error instanceof Error
          ? error.message
          : "Não foi possível criar o plano."
      );
    } finally {
      setCreatingPlan(false);
    }
  }

  async function handleStartJob() {
    setStartingJob(true);
    setActionError(null);

    try {
      const created = await startJob(
        projectId
      );

      setJob(created);
    } catch (error) {
      setActionError(
        error instanceof Error
          ? error.message
          : "Não foi possível iniciar o job."
      );
    } finally {
      setStartingJob(false);
    }
  }

  const selectedTask =
    plan &&
    plan !== "loading" &&
    selectedTaskId
      ? (plan.tasks.find(
          (task) =>
            task.id ===
            selectedTaskId
        ) ?? null)
      : null;

  if (project === "loading") {
    return (
      <div className="p-8 font-mono text-sm text-mute">
        carregando…
      </div>
    );
  }

  if (project === null) {
    return (
      <div className="p-8">
        <p className="text-sm text-paper">
          Projeto não encontrado.
        </p>

        <Link
          href="/"
          className="mt-2 inline-block text-sm text-signal hover:underline"
        >
          ← voltar
        </Link>
      </div>
    );
  }

  const jobBusy =
    job?.status === "RUNNING" ||
    job?.status === "PENDING";

  return (
    <div className="flex h-full flex-col">
      <div className="flex shrink-0 items-center justify-between border-b border-line bg-panel/40 px-6 py-3">
        <div>
          <Link
            href="/"
            className="font-mono text-[11px] uppercase tracking-wider text-mute hover:text-signal"
          >
            ← projetos
          </Link>

          <h1 className="font-display text-xl font-medium text-paper">
            {project.name}
          </h1>
        </div>

        {plan &&
          plan !== "loading" && (
            <div className="flex items-center gap-3">
              {job && (
                <span className="font-mono text-xs text-mute">
                  job:{" "}
                  {job.status.toLowerCase()}
                </span>
              )}

              <button
                type="button"
                onClick={
                  handleStartJob
                }
                disabled={
                  startingJob ||
                  jobBusy
                }
                className="rounded-md bg-signal px-4 py-2 text-sm font-medium text-ink transition-opacity hover:opacity-90 disabled:opacity-50"
              >
                {startingJob
                  ? "iniciando…"
                  : "Executar automaticamente"}
              </button>
            </div>
          )}
      </div>

      {actionError && (
        <p className="shrink-0 border-b border-line bg-panel px-6 py-2 text-xs text-danger">
          {actionError}
        </p>
      )}

      <div className="relative flex-1">
        {plan === "loading" && (
          <p className="p-8 font-mono text-sm text-mute">
            carregando plano…
          </p>
        )}

        {plan === null && (
          <div className="mx-auto mt-16 max-w-lg px-6">
            <form
              onSubmit={
                handleCreatePlan
              }
              className="rounded-lg border border-line bg-panel-raised p-5"
            >
              <label
                htmlFor="objective"
                className="mb-1.5 block font-mono text-[11px] uppercase tracking-wider text-mute"
              >
                Qual é o objetivo?
              </label>

              <textarea
                id="objective"
                value={objective}
                onChange={(
                  event
                ) =>
                  setObjective(
                    event.target
                      .value
                  )
                }
                rows={3}
                placeholder="ex: Adicionar login com Google"
                autoFocus
                className="w-full rounded-md border border-line bg-ink px-3 py-2 text-sm text-paper outline-none placeholder:text-mute focus:border-signal"
              />

              <button
                type="submit"
                disabled={
                  creatingPlan
                }
                className="mt-3 rounded-md bg-signal px-4 py-2 text-sm font-medium text-ink transition-opacity hover:opacity-90 disabled:opacity-50"
              >
                {creatingPlan
                  ? "criando plano…"
                  : "Criar plano"}
              </button>
            </form>
          </div>
        )}

        {plan &&
          plan !== "loading" && (
            <ReactFlow
              nodes={nodes}
              edges={edges}
              nodeTypes={nodeTypes}
              onNodeClick={(
                _event,
                node
              ) => {
                if (
                  node.type ===
                  "task"
                ) {
                  setSelectedTaskId(
                    node.id
                  );
                }
              }}
              fitView
              proOptions={{
                hideAttribution:
                  true,
              }}
            >
              <Background
                color="#22304A"
                gap={32}
              />

              <Controls />
            </ReactFlow>
          )}
      </div>

      {selectedTask && (
        <TaskDetailPanel
          projectId={projectId}
          task={selectedTask}
          onClose={() =>
            setSelectedTaskId(null)
          }
          onChanged={() =>
            setSelectedTaskId(null)
          }
        />
      )}
    </div>
  );
}

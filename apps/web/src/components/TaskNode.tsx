import {
  Handle,
  Position,
  type Node,
  type NodeProps,
} from "@xyflow/react";
import type { TaskStatus } from "@/lib/api";

export const AGENT_LABEL: Record<
  string,
  string
> = {
  architect: "ARQUITETO",
  frontend: "FRONTEND",
  backend: "BACKEND",
  reviewer: "REVISOR",
  qa: "QA",
  devops: "DEVOPS",
};

const STATUS_STYLE: Record<
  TaskStatus,
  { label: string; dot: string; pulse?: boolean }
> = {
  WAITING: {
    label: "aguardando",
    dot: "bg-mute",
  },
  READY: {
    label: "pronta",
    dot: "bg-signal",
  },
  RUNNING: {
    label: "em execução",
    dot: "bg-signal",
    pulse: true,
  },
  VALIDATING: {
    label: "validando",
    dot: "bg-ok",
    pulse: true,
  },
  CORRECTION_REQUIRED: {
    label: "corrigindo",
    dot: "bg-signal",
    pulse: true,
  },
  VALIDATED: {
    label: "validada",
    dot: "bg-ok",
  },
  DONE: {
    label: "concluída",
    dot: "bg-ok",
  },
  FAILED: {
    label: "falhou",
    dot: "bg-danger",
  },
  BLOCKED: {
    label: "bloqueada",
    dot: "bg-danger",
  },
};

export interface TaskNodeData
  extends Record<
    string,
    unknown
  > {
  taskId: string;
  agent: string;
  task: string;
  status: TaskStatus;
}

export type TaskFlowNode = Node<
  TaskNodeData,
  "task"
>;

export function TaskNode({
  data,
}: NodeProps<TaskFlowNode>) {
  const style =
    STATUS_STYLE[data.status];

  return (
    <div className="w-64 rounded-lg border border-line bg-panel p-4 shadow-lg">
      <Handle
        type="target"
        position={Position.Left}
        className="!bg-line"
      />

      <Handle
        type="source"
        position={Position.Right}
        className="!bg-line"
      />

      <div className="mb-2 flex items-center justify-between">
        <span className="font-mono text-[10px] uppercase tracking-wider text-mute">
          {AGENT_LABEL[
            data.agent
          ] ??
            data.agent.toUpperCase()}
        </span>

        <span className="font-mono text-[10px] text-mute">
          {data.taskId}
        </span>
      </div>

      <p className="mb-3 line-clamp-3 text-sm text-paper">
        {data.task}
      </p>

      <div className="flex items-center gap-1.5">
        <span
          className={`h-1.5 w-1.5 rounded-full ${
            style.dot
          } ${
            style.pulse
              ? "pulse-dot"
              : ""
          }`}
          aria-hidden="true"
        />

        <span className="font-mono text-[10px] uppercase tracking-wider text-mute">
          {style.label}
        </span>
      </div>
    </div>
  );
}

export interface LaneLabelData
  extends Record<
    string,
    unknown
  > {
  agent: string;
}

export type LaneLabelFlowNode =
  Node<LaneLabelData, "lane">;

/*
 * Rótulo de raia (ex.: "BACKEND", "FRONTEND") fixado à esquerda do
 * canvas, alinhado com a linha daquele agente — não é arrastável
 * nem clicável, só orientação visual.
 */
export function LaneLabelNode({
  data,
}: NodeProps<LaneLabelFlowNode>) {
  return (
    <div className="w-40 select-none font-mono text-xs uppercase tracking-wider text-mute">
      {AGENT_LABEL[data.agent] ??
        data.agent.toUpperCase()}
    </div>
  );
}

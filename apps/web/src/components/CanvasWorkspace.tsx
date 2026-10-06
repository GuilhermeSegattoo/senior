"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  applyNodeChanges,
  Background,
  Controls,
  MiniMap,
  Panel,
  ReactFlow,
  type NodeChange,
  type Viewport,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { CanvasActionsContext, type CanvasActions } from "@/components/canvas-actions";
import { CanvasCardNode, type CanvasFlowNode } from "@/components/CanvasCards";
import {
  CANVAS_STORAGE_KEY,
  CARD_LIMIT,
  CARD_SIZE,
  createCard,
  loadCanvasLayout,
  updateCard,
  type CanvasCard,
  type CanvasCardKind,
} from "@/lib/canvas-layout";

const nodeTypes = { card: CanvasCardNode };

function toNode(card: CanvasCard): CanvasFlowNode {
  const size = CARD_SIZE[card.kind];
  return {
    id: card.id,
    type: "card",
    position: { x: card.x, y: card.y },
    data: card,
    dragHandle: ".canvas-drag",
    style: { width: size.width, height: size.height },
  };
}

export function CanvasWorkspace() {
  const [nodes, setNodes] = useState<CanvasFlowNode[] | null>(null);
  const [initialViewport, setInitialViewport] = useState<Viewport>({ x: 40, y: 20, zoom: 1 });
  const viewport = useRef<Viewport>(initialViewport);

  useEffect(() => {
    const layout = loadCanvasLayout(window.localStorage);
    viewport.current = layout.viewport;
    // localStorage exists only after mount. The first paint stays on the loading line so server and client match.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setInitialViewport(layout.viewport);
    setNodes(layout.cards.map(toNode));
  }, []);

  const persist = useCallback((next: CanvasFlowNode[]) => {
    const cards = next.map((node) => ({ ...node.data, x: node.position.x, y: node.position.y }));
    window.localStorage.setItem(CANVAS_STORAGE_KEY, JSON.stringify({ cards, viewport: viewport.current }));
  }, []);

  useEffect(() => {
    if (!nodes) return;
    persist(nodes);
  }, [nodes, persist]);

  const close = useCallback((id: string) => setNodes((current) => current?.filter((node) => node.id !== id) ?? current), []);
  const patch = useCallback((id: string, partial: Parameters<CanvasActions["patch"]>[1]) => {
    setNodes((current) => current?.map((node) => {
      if (node.id !== id) return node;
      const [next] = updateCard([node.data], id, partial);
      return { ...node, data: { ...next, x: node.position.x, y: node.position.y } };
    }) ?? current);
  }, []);
  const actions = useMemo(() => ({ close, patch }), [close, patch]);

  const add = useCallback((kind: CanvasCardKind) => {
    setNodes((current) => {
      if (!current || current.length >= CARD_LIMIT) return current;
      const cards: CanvasCard[] = current.map((node) => ({ ...node.data, x: node.position.x, y: node.position.y }));
      return [...current, toNode(createCard(cards, kind, crypto.randomUUID()))];
    });
  }, []);

  const onNodesChange = useCallback((changes: NodeChange<CanvasFlowNode>[]) => {
    setNodes((current) => current ? applyNodeChanges(changes, current) : current);
  }, []);

  if (!nodes) {
    return <p className="p-8 font-mono text-sm text-mute">Abrindo o quadro…</p>;
  }

  return (
    <CanvasActionsContext.Provider value={actions}>
      <div className="senior-canvas h-full min-h-0">
        <ReactFlow
          nodes={nodes}
          edges={[]}
          nodeTypes={nodeTypes}
          onNodesChange={onNodesChange}
          defaultViewport={initialViewport}
          onMoveEnd={(_event, next) => { viewport.current = next; persist(nodes); }}
          nodesConnectable={false}
          deleteKeyCode={null}
          minZoom={0.25}
          maxZoom={1.6}
          colorMode="dark"
          proOptions={{ hideAttribution: true }}
          fitView={false}
        >
          <Background color="#22304a" gap={28} />
          <Controls showInteractive={false} />
          <MiniMap
            pannable
            zoomable
            bgColor="#101a2e"
            maskColor="rgba(11, 18, 32, 0.72)"
            nodeColor={(node) => {
              const kind = String(node.data.kind ?? "");
              if (kind === "conversation") return "#ff8a3d";
              if (kind === "note") return "#4fd1c5";
              return "#7c8aa8";
            }}
          />
          <Panel position="top-left">
            <div className="flex flex-wrap items-center gap-2 rounded-xl border border-line bg-panel/95 p-2 shadow-lg">
              <span className="px-1 font-mono text-[10px] uppercase tracking-[.18em] text-mute">Quadro</span>
              <button type="button" onClick={() => add("conversation")} className="rounded-lg bg-signal px-3 py-1.5 text-sm text-ink">+ Conversa</button>
              <button type="button" onClick={() => add("note")} className="rounded-lg border border-line px-3 py-1.5 text-sm text-paper">+ Nota</button>
              <button type="button" onClick={() => add("agent")} className="rounded-lg border border-line px-3 py-1.5 text-sm text-paper">+ Agente</button>
            </div>
          </Panel>
          {nodes.length === 0 && (
            <Panel position="top-center">
              <p className="mt-16 max-w-sm rounded-xl border border-dashed border-line bg-panel/95 p-4 text-sm leading-6 text-mute">
                O quadro está vazio. Crie uma conversa, uma nota ou um agente e arraste pelo título.
              </p>
            </Panel>
          )}
        </ReactFlow>
      </div>
    </CanvasActionsContext.Provider>
  );
}

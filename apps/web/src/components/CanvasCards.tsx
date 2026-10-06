"use client";

import { useCallback, useContext, useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import Link from "next/link";
import { type Node, type NodeProps } from "@xyflow/react";
import {
  ApiError,
  cancelBrainRun,
  createBrainSession,
  fetchBrainSession,
  fetchCapabilities,
  getApiUrl,
  sendBrainMessage,
  type BrainRun,
  type BrainSessionDetail,
  type Provider,
} from "@/lib/api";
import type { CanvasCard } from "@/lib/canvas-layout";
import { CanvasActionsContext } from "@/components/canvas-actions";

const providers: Array<{ id: Provider; label: string }> = [
  { id: "pi", label: "Pi (ChatGPT)" },
  { id: "claude", label: "Claude Code" },
  { id: "codex", label: "Codex" },
  { id: "openai", label: "OpenAI API" },
  { id: "anthropic", label: "Claude API" },
  { id: "grok", label: "Grok API" },
];

const active = (status?: string) => status === "QUEUED" || status === "RUNNING";

export type CanvasFlowNode = Node<CanvasCard, "card">;

function useActions() {
  const actions = useContext(CanvasActionsContext);
  if (!actions) throw new Error("Ações do quadro indisponíveis.");
  return actions;
}

function CardShell({ card, children }: { card: CanvasCard; children: ReactNode }) {
  const { close } = useActions();
  const label = card.kind === "conversation" ? "Conversa" : card.kind === "note" ? "Nota" : "Agente";
  return (
    <article className="flex h-full w-full flex-col overflow-hidden rounded-xl border border-line bg-panel shadow-xl">
      <header className="flex items-center gap-2 border-b border-line bg-panel-raised/80 px-3 py-2">
        <div className="canvas-drag min-w-0 flex-1 cursor-grab active:cursor-grabbing">
          <p className="font-mono text-[10px] uppercase tracking-[.18em] text-signal">{label}</p>
          <p className="truncate text-sm text-paper">{card.title}</p>
        </div>
        <button
          type="button"
          className="nodrag rounded border border-line px-2 py-1 font-mono text-[10px] uppercase tracking-wider text-mute hover:text-danger"
          onPointerDown={(event) => event.stopPropagation()}
          onClick={() => close(card.id)}
        >
          Fechar
        </button>
      </header>
      <div className="nodrag nowheel min-h-0 flex-1">{children}</div>
    </article>
  );
}

function ConversationPane({ card }: { card: CanvasCard }) {
  const { patch } = useActions();
  const [detail, setDetail] = useState<BrainSessionDetail | null>(null);
  const [input, setInput] = useState("");
  const [provider, setProvider] = useState<Provider>("pi");
  const [model, setModel] = useState("");
  const [error, setError] = useState("");
  const [loginNeeded, setLoginNeeded] = useState(false);
  const [busy, setBusy] = useState(false);
  const end = useRef<HTMLDivElement>(null);
  const pending = useRef<{ requestId: string; sessionId: string; message: string } | null>(null);
  const sessionId = card.sessionId;
  const latestRun: BrainRun | undefined = detail?.runs[0];
  const runId = latestRun?.id;
  const runStatus = latestRun?.status;
  const running = active(runStatus);

  const report = useCallback((err: unknown) => {
    setError(err instanceof Error ? err.message : "Não foi possível concluir a ação.");
    if (err instanceof ApiError && err.status === 401) setLoginNeeded(true);
  }, []);

  useEffect(() => {
    let live = true;
    fetchCapabilities().then((caps) => { if (live) setProvider(caps.defaultRuntime); }).catch(() => undefined);
    return () => { live = false; };
  }, []);

  const refresh = useCallback(async (id: string) => {
    const value = await fetchBrainSession(id);
    setDetail(value);
  }, []);

  useEffect(() => {
    if (!sessionId) return;
    let live = true;
    fetchBrainSession(sessionId).then((value) => { if (live) setDetail(value); }).catch(report);
    return () => { live = false; };
  }, [sessionId, report]);

  useEffect(() => {
    if (!sessionId || !runId || !active(runStatus)) return;
    const stream = new EventSource(`${getApiUrl()}/brain/runs/${runId}/stream`);
    stream.onmessage = () => { void refresh(sessionId).catch(report); };
    const poll = setInterval(() => { void refresh(sessionId).catch(report); }, 3000);
    return () => { stream.close(); clearInterval(poll); };
  }, [sessionId, runId, runStatus, refresh, report]);

  useEffect(() => { end.current?.scrollIntoView({ block: "nearest" }); }, [detail?.messages.length]);

  async function send(event: FormEvent) {
    event.preventDefault();
    const message = input.trim();
    if (!message || busy || running) return;
    setBusy(true);
    setError("");
    try {
      let id = sessionId;
      if (!id) {
        const created = await createBrainSession(message.slice(0, 60));
        id = created.session.id;
        patch(card.id, { sessionId: id, title: created.session.title || card.title });
      }
      if (!pending.current || pending.current.sessionId !== id || pending.current.message !== message) {
        pending.current = { requestId: crypto.randomUUID(), sessionId: id, message };
      }
      await sendBrainMessage(id, pending.current.message, pending.current.requestId, {
        provider,
        ...(model.trim() ? { model: model.trim() } : {}),
      }, []);
      pending.current = null;
      setInput("");
      await refresh(id);
    } catch (err) {
      report(err);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex h-full flex-col">
      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-3" aria-live="polite">
        {!detail?.messages.length && (
          <p className="text-sm leading-6 text-mute">
            Converse aqui, ao lado das suas notas. O histórico fica no Senior. A assinatura do ChatGPT entra pelo Pi; o Claude Code entra pelo CLI. Nenhuma chave de API é necessária.
          </p>
        )}
        {detail?.messages.map((message) => (
          <article key={message.id} className={`rounded-lg p-3 text-sm leading-6 ${message.role === "user" ? "ml-6 bg-panel-raised" : "bg-ink/40"}`}>
            <p className="mb-1 font-mono text-[10px] uppercase tracking-widest text-mute">{message.role === "user" ? "Você" : "Senior"}</p>
            <p className="whitespace-pre-wrap break-words">{message.text}</p>
          </article>
        ))}
        {running && <p className="font-mono text-xs text-ok">● Senior está respondendo</p>}
        {latestRun?.error && <p className="rounded border border-danger/40 p-2 text-sm text-danger">{latestRun.error}</p>}
        <div ref={end} />
      </div>
      <form onSubmit={send} className="border-t border-line p-3">
        {error && <p role="alert" className="mb-2 text-xs text-danger">{error} {loginNeeded && <Link href="/login" className="underline">Entrar</Link>}</p>}
        <textarea
          aria-label="Mensagem ao Senior"
          value={input}
          onChange={(event) => setInput(event.target.value)}
          rows={3}
          maxLength={20000}
          placeholder="Fale com o Senior…"
          className="w-full resize-none rounded-lg border border-line bg-ink px-3 py-2 text-sm outline-none focus:border-signal"
        />
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <select aria-label="Motor da conversa" value={provider} onChange={(event) => setProvider(event.target.value as Provider)} className="rounded border border-line bg-ink px-2 py-1 text-xs">
            {providers.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
          </select>
          <input aria-label="Modelo opcional" value={model} onChange={(event) => setModel(event.target.value)} placeholder="Modelo, se precisar" className="min-w-0 flex-1 rounded border border-line bg-ink px-2 py-1 text-xs" />
          {running ? (
            <button type="button" className="rounded border border-danger px-3 py-1 text-xs text-danger" onClick={() => { if (latestRun && sessionId) void cancelBrainRun(latestRun.id).then(() => refresh(sessionId)).catch(report); }}>Cancelar</button>
          ) : (
            <button disabled={busy || !input.trim()} className="rounded-lg bg-signal px-3 py-1.5 text-sm text-ink disabled:opacity-40">{busy ? "Enviando…" : "Enviar"}</button>
          )}
        </div>
        <p className="mt-2 text-[11px] text-mute">
          <Link href="/assistant" className="text-ok">Abrir o assistente completo</Link>
        </p>
      </form>
    </div>
  );
}

function NotePane({ card }: { card: CanvasCard }) {
  const { patch } = useActions();
  return (
    <textarea
      aria-label="Texto da nota"
      value={card.note ?? ""}
      onChange={(event) => patch(card.id, { note: event.target.value })}
      placeholder="Escreva uma nota. Ela fica neste navegador."
      className="h-full w-full resize-none bg-transparent p-3 text-sm leading-6 outline-none placeholder:text-mute"
    />
  );
}

function AgentPane() {
  return (
    <div className="flex h-full flex-col bg-ink font-mono text-xs leading-5">
      <div className="min-h-0 flex-1 overflow-y-auto p-3">
        <p className="text-ok">senior@local — agente</p>
        <p className="mt-3 text-mute">Este cartão reserva o lugar do terminal ao lado da conversa.</p>
        <p className="mt-2 text-paper">Nenhum comando é executado daqui.</p>
        <p className="mt-2 text-mute">A execução de código no servidor de produção continua desligada.</p>
        <p className="mt-4 text-signal">$ aguardando um agente</p>
      </div>
      <p className="border-t border-line px-3 py-2 text-[10px] uppercase tracking-wider text-mute">somente leitura</p>
    </div>
  );
}

export function CanvasCardNode({ data }: NodeProps<CanvasFlowNode>) {
  return (
    <CardShell card={data}>
      {data.kind === "conversation" && <ConversationPane card={data} />}
      {data.kind === "note" && <NotePane card={data} />}
      {data.kind === "agent" && <AgentPane />}
    </CardShell>
  );
}

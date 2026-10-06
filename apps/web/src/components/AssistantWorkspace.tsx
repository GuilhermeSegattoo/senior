"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ApiError, fetchBrainSessions, fetchBrainSession, createBrainSession, sendBrainMessage,
  cancelBrainRun, fetchBrainMemory, saveBrainMemory, forgetBrainMemory, fetchProjects,
  createPlan, startJob, getApiUrl, fetchCapabilities, type BrainSession, type BrainSessionDetail, type BrainMemory,
  type Provider, type Project, type ModelSelection } from "@/lib/api";

const providers: Array<{ id: Provider; label: string }> = [
  { id: "codex", label: "Codex" }, { id: "claude", label: "Claude Code" }, { id: "pi", label: "Pi" },
  { id: "openai", label: "OpenAI API" }, { id: "anthropic", label: "Claude API" }, { id: "grok", label: "Grok API" },
];
const control = "w-full rounded-lg border border-line bg-ink px-3 py-2 text-sm outline-none focus:border-signal";
const active = (status?: string) => status === "QUEUED" || status === "RUNNING";

export function AssistantWorkspace() {
  const [sessions, setSessions] = useState<BrainSession[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [detail, setDetail] = useState<BrainSessionDetail | null>(null);
  const [projectId, setProjectId] = useState("");
  const [input, setInput] = useState("");
  const [provider, setProvider] = useState<Provider>("codex");
  const [model, setModel] = useState("");
  const [team, setTeam] = useState<Provider[]>([]);
  const [tab, setTab] = useState<"conversation" | "memory">("conversation");
  const [memories, setMemories] = useState<BrainMemory[]>([]);
  const [memoryText, setMemoryText] = useState("");
  const [editingMemory, setEditingMemory] = useState<string | undefined>();
  const [error, setError] = useState("");
  const [loginNeeded, setLoginNeeded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [activity, setActivity] = useState("Pronto para conversar");
  const [notice, setNotice] = useState("");
  const end = useRef<HTMLDivElement>(null);
  const pendingSend = useRef<{ requestId: string; sessionId: string; message: string; selection: ModelSelection; team: ModelSelection[] } | null>(null);
  const currentSession = useRef<string | null>(null);
  useEffect(() => { currentSession.current = sessionId; }, [sessionId]);
  const scope = sessions.find(x => x.id === sessionId)?.projectId || detail?.session.projectId || "personal";
  const latestRun = detail?.runs[0];
  const running = active(latestRun?.status);
  const runId = latestRun?.id;
  const runStatus = latestRun?.status;

  const reportError = useCallback((err: unknown) => {
    setError(err instanceof Error ? err.message : "Não foi possível concluir a ação.");
    if (err instanceof ApiError && err.status === 401) setLoginNeeded(true);
  }, []);
  const refresh = useCallback(async (id: string) => {
    const value = await fetchBrainSession(id);
    if (currentSession.current === id) setDetail(value);
  }, []);

  useEffect(() => {
    let live = true;
    Promise.all([fetchBrainSessions(), fetchProjects(), fetchCapabilities()]).then(([value, list, capabilities]) => {
      if (!live) return;
      setSessions(value.sessions); setProjects(list); setProvider(capabilities.defaultRuntime);
      const saved = localStorage.getItem("senior.session");
      const selected = value.sessions.find(x => x.id === saved)?.id || value.sessions[0]?.id;
      if (selected) setSessionId(selected);
    }).catch(reportError);
    return () => { live = false; };
  }, [reportError]);

  useEffect(() => {
    if (!sessionId) return;
    localStorage.setItem("senior.session", sessionId);
    let live = true;
    fetchBrainSession(sessionId).then(value => { if (live) { setDetail(value); setProjectId(value.session.projectId || ""); } }).catch(reportError);
    return () => { live = false; };
  }, [sessionId, reportError]);

  useEffect(() => {
    let live = true;
    fetchBrainMemory(scope).then(value => { if (live) setMemories(value.memories); }).catch(reportError);
    return () => { live = false; };
  }, [scope, reportError]);

  useEffect(() => {
    if (!runId || !active(runStatus) || !sessionId) return;
    const stream = new EventSource(`${getApiUrl()}/brain/runs/${runId}/stream`);
    stream.onmessage = event => {
      try {
        const value = JSON.parse(event.data) as { type: string; data: string };
        const data = JSON.parse(value.data) as { provider?: string };
        setActivity(value.type.startsWith("agent.") ? `${data.provider || "Especialista"}: ${value.type.endsWith("started") ? "analisando" : "contribuição registrada"}` : value.type === "chief.started" ? "Senior consolidando a resposta" : value.type);
        void refresh(sessionId).catch(reportError);
      } catch { /* Polling also reconciles the persisted state. */ }
    };
    const poll = setInterval(() => { void refresh(sessionId).catch(reportError); }, 3000);
    return () => { stream.close(); clearInterval(poll); };
  }, [runId, runStatus, sessionId, refresh, reportError]);

  useEffect(() => { end.current?.scrollIntoView({ block: "nearest" }); }, [detail?.messages.length]);

  async function newSession() {
    setBusy(true); setError("");
    try {
      const { session } = await createBrainSession(projectId ? projects.find(x => x.id === projectId)?.name || "Projeto" : "Conversa pessoal", projectId || undefined);
      setSessions(current => [session, ...current]); setDetail(null); setSessionId(session.id); pendingSend.current = null;
    } catch (err) { reportError(err); }
    finally { setBusy(false); }
  }
  async function send(event: React.FormEvent) {
    event.preventDefault();
    if (!input.trim() || busy || running) return;
    setBusy(true); setError(""); setNotice("");
    try {
      let id = sessionId;
      if (!id) {
        const { session } = await createBrainSession(input.trim().slice(0, 60), projectId || undefined);
        id = session.id; setSessions(current => [session, ...current]); setSessionId(id); currentSession.current = id;
      }
      const selection: ModelSelection = { provider, ...(model.trim() ? { model: model.trim() } : {}) };
      const members = team.filter(x => x !== provider).map(x => ({ provider: x }));
      // Reuse the exact envelope after an uncertain network result. A retry must
      // not launch another paid run or silently switch its provider.
      if (!pendingSend.current || pendingSend.current.sessionId !== id || pendingSend.current.message !== input.trim()) {
        pendingSend.current = { requestId: crypto.randomUUID(), sessionId: id, message: input.trim(), selection, team: members };
      }
      const pending = pendingSend.current;
      await sendBrainMessage(id, pending.message, pending.requestId, pending.selection, pending.team);
      pendingSend.current = null; setInput(""); await refresh(id);
    } catch (err) { reportError(err); }
    finally { setBusy(false); }
  }
  async function remember(event: React.FormEvent) {
    event.preventDefault(); setBusy(true); setError("");
    try { await saveBrainMemory(memoryText, scope, editingMemory); setMemories((await fetchBrainMemory(scope)).memories); setMemoryText(""); setEditingMemory(undefined); }
    catch (err) { reportError(err); } finally { setBusy(false); }
  }
  async function planFromConversation() {
    if (!detail?.session.projectId || !input.trim()) return;
    setBusy(true); setError("");
    try { await createPlan(detail.session.projectId, input.trim(), { provider, model: model || undefined }); setNotice("Plano criado. Abra o workspace para revisar as tarefas antes de iniciar."); }
    catch (err) { reportError(err); } finally { setBusy(false); }
  }

  return <div className="mx-auto flex h-full max-w-[1600px] flex-col p-3 md:p-6">
    <div className="mb-4 flex items-center justify-between gap-3">
      <div><p className="font-mono text-[10px] uppercase tracking-[.22em] text-signal">Uma conversa. Todos os seus projetos.</p><h1 className="mt-1 font-display text-2xl md:text-3xl">Seu Senior</h1></div>
      <div className="flex gap-2"><Link href="/canvas" className="rounded-lg border border-line px-3 py-2 text-xs text-mute hover:text-paper">Quadro</Link><Link href="/settings" className="rounded-lg border border-line px-3 py-2 text-xs text-mute hover:text-paper">Conexões</Link></div>
    </div>
    {error && <div role="alert" className="mb-3 rounded-lg border border-danger/40 bg-danger/10 p-3 text-sm text-danger">{error} {loginNeeded && <Link href="/login" className="underline">Entrar</Link>}</div>}
    {notice && <p className="mb-3 rounded-lg border border-ok/40 p-3 text-sm text-ok">{notice}</p>}
    <div className="grid min-h-0 flex-1 grid-cols-1 gap-3 lg:grid-cols-[230px_minmax(0,1fr)_260px]">
      <aside className="flex flex-col gap-3 rounded-xl border border-line bg-panel/90 p-3 lg:overflow-y-auto">
        <div className="flex gap-2 lg:flex-col"><select aria-label="Projeto da nova conversa" value={projectId} onChange={e => setProjectId(e.target.value)} className={control}><option value="">Pessoal</option>{projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select><button onClick={newSession} disabled={busy} className="shrink-0 rounded-lg bg-signal px-3 py-2 text-sm text-ink">Nova conversa</button></div>
        <div className="flex gap-2 overflow-x-auto lg:flex-col lg:overflow-x-visible">
          {sessions.map(session => <button key={session.id} onClick={() => { setDetail(null); setSessionId(session.id); setError(""); }} className={`min-w-36 rounded-lg border p-3 text-left text-sm lg:min-w-0 ${sessionId === session.id ? "border-signal/50 bg-signal/10" : "border-line hover:bg-panel-raised"}`}><span className="block truncate">{session.title}</span><span className="mt-1 block font-mono text-[10px] text-mute">{session.projectId ? "projeto" : "pessoal"}</span></button>)}
        </div>
      </aside>
      <section className="flex min-h-[420px] min-w-0 flex-col overflow-hidden rounded-xl border border-line bg-panel/90 lg:min-h-0">
        <div className="flex items-center justify-between border-b border-line px-4 py-3">
          <div className="flex gap-4"><button onClick={() => setTab("conversation")} className={`text-sm ${tab === "conversation" ? "text-signal" : "text-mute"}`}>Conversa</button><button onClick={() => setTab("memory")} className={`text-sm ${tab === "memory" ? "text-signal" : "text-mute"}`}>Memória</button></div>
          {detail?.session.projectId && <Link className="text-xs text-ok" href={`/projects/${detail.session.projectId}`}>Abrir workspace ↗</Link>}
        </div>
        {tab === "conversation" ? <>
          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4 md:p-6" aria-live="polite">
            {!detail?.messages.length && <div className="mx-auto my-12 max-w-md text-center"><span className="font-mono text-xs text-signal">SENIOR / ONLINE WORKSPACE</span><h2 className="my-4 font-display text-2xl">O que vamos resolver?</h2><p className="text-sm leading-6 text-mute">Converse sobre uma ideia, acompanhe seus projetos ou peça uma análise. Salve decisões na memória para retomá-las depois.</p></div>}
            {detail?.messages.map(message => <article key={message.id} className={`${message.role === "user" ? "ml-auto max-w-[90%] bg-panel-raised" : message.role === "agent" ? "border-l-2 border-ok bg-ink/50" : "bg-ink/30"} rounded-lg p-4`}><p className="mb-2 font-mono text-[10px] uppercase tracking-widest text-mute">{message.role === "user" ? "Você" : message.role === "agent" ? `Especialista · ${message.provider}` : "Senior"}</p><p className="whitespace-pre-wrap break-words text-sm leading-6">{message.text}</p></article>)}
            {running && <p className="font-mono text-xs text-ok">● {activity}</p>}
            {latestRun?.error && <p className="rounded border border-danger/40 p-3 text-sm text-danger">{latestRun.error}</p>}
            <div ref={end} />
          </div>
          <form onSubmit={send} className="border-t border-line p-3 md:p-4">
            <textarea aria-label="Mensagem ao Senior" value={input} onChange={e => setInput(e.target.value)} placeholder="Fale com o Senior…" rows={3} maxLength={20000} className={`${control} resize-none`} />
            <div className="mt-2 flex flex-wrap items-center justify-between gap-2"><span className="text-[11px] text-mute">{detail?.session.projectId ? `Contexto: ${detail.session.projectId}` : "Contexto pessoal"}</span><div className="flex gap-2">{detail?.session.projectId && <button type="button" onClick={planFromConversation} disabled={busy || running || !input.trim()} className="rounded border border-line px-3 py-2 text-xs disabled:opacity-40">Gerar plano</button>}{running ? <button type="button" onClick={() => { void cancelBrainRun(latestRun!.id).then(() => refresh(sessionId!)).catch(reportError); }} className="rounded border border-danger px-3 py-2 text-xs text-danger">Cancelar</button> : <button disabled={busy || !input.trim()} className="rounded-lg bg-signal px-5 py-2 text-sm font-medium text-ink disabled:opacity-40">{busy ? "Enviando…" : "Enviar"}</button>}</div></div>
          </form>
        </> : <div className="flex-1 overflow-y-auto p-4"><p className="mb-4 text-sm text-mute">Informações confirmadas por você. Escopo: {scope === "personal" ? "pessoal" : scope}. Edite ou exclua quando necessário.</p><form onSubmit={remember} className="mb-5 space-y-2"><textarea aria-label="Informação a memorizar" value={memoryText} onChange={e => setMemoryText(e.target.value)} maxLength={4000} required rows={3} className={control} placeholder="Uma preferência ou decisão que o Senior deve lembrar…" /><button disabled={busy} className="rounded bg-signal px-4 py-2 text-sm text-ink">{editingMemory ? "Salvar correção" : "Confirmar memória"}</button>{editingMemory && <button type="button" onClick={() => { setEditingMemory(undefined); setMemoryText(""); }} className="ml-3 text-sm text-mute">Cancelar edição</button>}</form>{memories.map(memory => <article key={memory.id} className="mb-3 rounded-lg border border-line p-4"><p className="whitespace-pre-wrap text-sm">{memory.text}</p><p className="mt-2 text-[10px] text-mute">Confirmada em {new Date(memory.updatedAt).toLocaleDateString("pt-BR")}</p><div className="mt-3 flex gap-4 text-xs"><button onClick={() => { setEditingMemory(memory.id); setMemoryText(memory.text); }} className="text-ok">Editar</button><button onClick={() => { void forgetBrainMemory(memory.id, scope).then(() => fetchBrainMemory(scope)).then(value => setMemories(value.memories)).catch(reportError); }} className="text-danger">Esquecer</button></div></article>)}</div>}
      </section>
      <aside className="space-y-5 overflow-y-auto rounded-xl border border-line bg-panel/90 p-4">
        <div><p className="mb-3 font-mono text-[10px] uppercase tracking-widest text-mute">Coordenação</p><select aria-label="Motor do Senior" value={provider} onChange={e => setProvider(e.target.value as Provider)} className={control}>{providers.map(p => <option key={p.id} value={p.id}>{p.label}</option>)}</select><input aria-label="Modelo opcional" value={model} onChange={e => setModel(e.target.value)} placeholder="Modelo padrão do servidor" className={`${control} mt-2`} /></div>
        <div><p className="mb-3 font-mono text-[10px] uppercase tracking-widest text-mute">Especialistas</p><p className="mb-3 text-xs leading-5 text-mute">Até dois agentes contribuem antes de o Senior consolidar a resposta. Isso pode gerar cobranças adicionais.</p>{providers.filter(p => p.id !== provider).map(p => <label key={p.id} className="mb-2 flex items-center gap-2 text-sm"><input type="checkbox" checked={team.includes(p.id)} disabled={!team.includes(p.id) && team.length >= 2} onChange={e => setTeam(current => e.target.checked ? [...current, p.id] : current.filter(x => x !== p.id))} />{p.label}</label>)}</div>
        <div className="border-t border-line pt-4"><p className="text-sm">Continuidade ativa</p><p className="mt-2 text-xs leading-5 text-mute">Histórico salvo no servidor. Memórias pessoais e de projeto têm escopos separados. Trabalho de código aparece no workspace com revisão e evidências.</p></div>
        {detail?.session.projectId && <button disabled={busy || running} onClick={() => { setBusy(true); void startJob(detail.session.projectId!, { provider, model: model || undefined }).then(() => setNotice("Execução iniciada. Acompanhe no workspace do projeto.")).catch(reportError).finally(() => setBusy(false)); }} className="w-full rounded-lg border border-ok/50 px-3 py-3 text-sm text-ok disabled:opacity-40">Executar plano revisado</button>}
      </aside>
    </div>
  </div>;
}

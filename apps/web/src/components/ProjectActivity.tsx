"use client";
import { useEffect, useState } from "react";
import { fetchProjectEvents } from "@/lib/api";

export function ProjectActivity({ projectId }: { projectId: string }) {
  const [events, setEvents] = useState<Array<{ id: string; type: string; createdAt: string; taskId?: string; data: Record<string, unknown> }>>([]);
  const [error, setError] = useState("");
  useEffect(() => {
    let live = true;
    const poll = () => { void fetchProjectEvents(projectId).then(value => { if (live) { setEvents(value.events); setError(""); } }).catch(err => { if (live) setError(err instanceof Error ? err.message : "Falha ao carregar atividade."); }); };
    poll(); const timer = setInterval(poll, 2000);
    return () => { live = false; clearInterval(timer); };
  }, [projectId]);
  return <details className="shrink-0 border-t border-line bg-ink p-3"><summary className="cursor-pointer font-mono text-xs text-ok">Atividade real dos agentes · {events.length} eventos</summary>
    {error && <p className="text-xs text-danger">{error}</p>}
    <div className="mt-3 max-h-56 overflow-y-auto font-mono text-[11px]">{events.length === 0 && <p className="text-mute">Sem eventos registrados.</p>}{events.map(event => <div key={event.id} className="mb-2 border-b border-line/50 pb-2"><span className="text-mute">{new Date(event.createdAt).toLocaleTimeString("pt-BR")} </span><span className="text-signal">{event.type}</span> {event.taskId}<pre className="mt-1 whitespace-pre-wrap break-words text-mute">{JSON.stringify(event.data, null, 2)}</pre></div>)}</div>
  </details>;
}

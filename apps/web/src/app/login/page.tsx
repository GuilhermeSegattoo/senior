"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const router = useRouter();
  async function submit(event: React.FormEvent) {
    event.preventDefault(); setBusy(true); setError("");
    try {
      const response = await fetch("/api/auth", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ password }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      setPassword(""); router.push("/canvas"); router.refresh();
    } catch (err) { setError(err instanceof Error ? err.message : "Não foi possível entrar."); }
    finally { setBusy(false); }
  }
  return <div className="mx-auto mt-16 max-w-md rounded-xl border border-line bg-panel p-6">
    <p className="font-mono text-xs uppercase tracking-widest text-signal">Seu workspace pessoal</p>
    <h1 className="my-3 font-display text-3xl">Entre no Senior</h1>
    <form onSubmit={submit} className="space-y-4">
      <label className="block text-sm">Senha<input type="password" autoComplete="current-password" value={password} onChange={e => setPassword(e.target.value)} required className="mt-2 w-full rounded border border-line bg-ink p-3" /></label>
      {error && <p role="alert" className="text-sm text-danger">{error}</p>}
      <button disabled={busy} className="w-full rounded bg-signal p-3 text-ink disabled:opacity-50">{busy ? "Entrando…" : "Entrar"}</button>
    </form>
    <button className="mt-4 text-sm text-mute" onClick={async () => { await fetch("/api/auth", { method: "DELETE" }); router.refresh(); setError("Sessão encerrada."); }}>Encerrar sessão atual</button>
  </div>;
}

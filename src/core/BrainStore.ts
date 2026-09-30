import { processIdentity, processOwnerAlive } from "./ProcessIdentity.js";
import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";

export interface BrainSession { id: string; title: string; projectId: string | null; createdAt: string; updatedAt: string }
export interface BrainMessage { id: number; sessionId: string; role: string; text: string; provider: string | null; createdAt: string }
export interface BrainMemory { id: string; scope: string; text: string; source: string; createdAt: string; updatedAt: string }
export interface BrainRun { id: string; sessionId: string; requestId: string; status: string; input: string; selection: string; team: string; error: string | null; createdAt: string; completedAt: string | null; pid: number | null; bootId: string | null; startedAt: string | null; processStart: string | null }

export class BrainStore {
  readonly db: DatabaseSync;
  constructor(filename = process.env.SENIOR_BRAIN_DB || path.join(process.cwd(), "data", "brain.sqlite")) {
    if (filename !== ":memory:") mkdirSync(path.dirname(filename), { recursive: true, mode: 0o700 });
    this.db = new DatabaseSync(filename, { timeout: 5000 });
    this.db.exec(`PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;
      CREATE TABLE IF NOT EXISTS sessions (id TEXT PRIMARY KEY, title TEXT NOT NULL, projectId TEXT, createdAt TEXT NOT NULL, updatedAt TEXT NOT NULL) STRICT;
      CREATE TABLE IF NOT EXISTS messages (id INTEGER PRIMARY KEY AUTOINCREMENT, sessionId TEXT NOT NULL REFERENCES sessions(id), role TEXT NOT NULL, text TEXT NOT NULL, provider TEXT, createdAt TEXT NOT NULL) STRICT;
      CREATE TABLE IF NOT EXISTS memories (id TEXT PRIMARY KEY, scope TEXT NOT NULL, text TEXT NOT NULL, source TEXT NOT NULL, createdAt TEXT NOT NULL, updatedAt TEXT NOT NULL) STRICT;
      CREATE TABLE IF NOT EXISTS brain_runs (id TEXT PRIMARY KEY, sessionId TEXT NOT NULL REFERENCES sessions(id), requestId TEXT NOT NULL UNIQUE, status TEXT NOT NULL, input TEXT NOT NULL, selection TEXT NOT NULL, team TEXT NOT NULL, error TEXT, createdAt TEXT NOT NULL, completedAt TEXT, pid INTEGER) STRICT;
      CREATE TABLE IF NOT EXISTS brain_events (id INTEGER PRIMARY KEY AUTOINCREMENT, runId TEXT NOT NULL REFERENCES brain_runs(id), type TEXT NOT NULL, data TEXT NOT NULL, createdAt TEXT NOT NULL) STRICT;
      CREATE INDEX IF NOT EXISTS messages_session ON messages(sessionId, id);
      CREATE INDEX IF NOT EXISTS memories_scope ON memories(scope);
      CREATE UNIQUE INDEX IF NOT EXISTS one_active_session_run ON brain_runs(sessionId) WHERE status IN ('QUEUED','RUNNING');
      `);
    this.transaction(() => {
      const columns = new Set(this.db.prepare("PRAGMA table_info(brain_runs)").all().map(row => String(row.name)));
      for (const column of ["bootId", "startedAt", "processStart"]) {
        if (!columns.has(column)) this.db.exec(`ALTER TABLE brain_runs ADD COLUMN ${column} TEXT`);
      }
      this.db.exec("PRAGMA user_version=2");
    });
  }

  transaction<T>(fn: () => T): T {
    this.db.exec("BEGIN IMMEDIATE");
    try { const result = fn(); this.db.exec("COMMIT"); return result; }
    catch (error) { this.db.exec("ROLLBACK"); throw error; }
  }
  close() { this.db.close(); }
  createSession(title: string, projectId?: string): BrainSession {
    const now = new Date().toISOString(), id = randomUUID();
    this.db.prepare("INSERT INTO sessions VALUES (?,?,?,?,?)").run(id, title, projectId || null, now, now);
    return this.session(id)!;
  }
  session(id: string) { return this.db.prepare("SELECT * FROM sessions WHERE id=?").get(id) as unknown as BrainSession | undefined; }
  sessions() { return this.db.prepare("SELECT * FROM sessions ORDER BY updatedAt DESC").all() as unknown as BrainSession[]; }
  messages(id: string, limit = 200) {
    return this.db.prepare("SELECT * FROM (SELECT * FROM messages WHERE sessionId=? ORDER BY id DESC LIMIT ?) ORDER BY id").all(id, limit) as unknown as BrainMessage[];
  }
  message(sessionId: string, role: string, text: string, provider?: string) {
    const now = new Date().toISOString();
    this.db.prepare("INSERT INTO messages(sessionId,role,text,provider,createdAt) VALUES (?,?,?,?,?)").run(sessionId, role, text.slice(0, 50000), provider || null, now);
    this.db.prepare("UPDATE sessions SET updatedAt=? WHERE id=?").run(now, sessionId);
  }
  memories(scope: string, query = "") {
    return this.db.prepare("SELECT * FROM memories WHERE scope=? AND instr(lower(text),lower(?))>0 ORDER BY updatedAt DESC LIMIT 100").all(scope, query) as unknown as BrainMemory[];
  }
  remember(scope: string, text: string, source: string, id?: string): BrainMemory {
    const now = new Date().toISOString();
    if (id) {
      const result = this.db.prepare("UPDATE memories SET text=?, source=?, updatedAt=? WHERE id=? AND scope=?").run(text, source, now, id, scope);
      if (!result.changes) throw new Error("Memória não encontrada neste escopo.");
    } else {
      id = randomUUID(); this.db.prepare("INSERT INTO memories VALUES (?,?,?,?,?,?)").run(id, scope, text, source, now, now);
    }
    return this.db.prepare("SELECT * FROM memories WHERE id=?").get(id) as unknown as BrainMemory;
  }
  forget(scope: string, id: string) { return this.db.prepare("DELETE FROM memories WHERE scope=? AND id=?").run(scope, id).changes > 0; }
  run(id: string) { return this.db.prepare("SELECT * FROM brain_runs WHERE id=?").get(id) as unknown as BrainRun | undefined; }
  runs(sessionId: string) { return this.db.prepare("SELECT * FROM brain_runs WHERE sessionId=? ORDER BY createdAt DESC LIMIT 30").all(sessionId) as unknown as BrainRun[]; }
  enqueue(sessionId: string, requestId: string, input: string, selection: unknown, team: unknown): BrainRun {
    return this.transaction(() => {
      const existing = this.db.prepare("SELECT * FROM brain_runs WHERE requestId=?").get(requestId) as unknown as BrainRun | undefined;
      if (existing) {
        if (existing.sessionId !== sessionId || existing.input !== input || existing.selection !== JSON.stringify(selection) || existing.team !== JSON.stringify(team)) throw new Error("Identificador já usado para outra solicitação.");
        return existing;
      }
      if (this.db.prepare("SELECT id FROM brain_runs WHERE sessionId=? AND status IN ('QUEUED','RUNNING')").get(sessionId)) throw new Error("A sessão já tem uma execução ativa.");
      const count = this.db.prepare("SELECT COUNT(*) AS count FROM brain_runs WHERE createdAt>=?").get(new Date(Date.now()-3600000).toISOString())!;
      if (Number(count.count) >= Number(process.env.SENIOR_MAX_RUNS_PER_HOUR || 20)) throw new Error("Limite de execuções por hora atingido.");
      const id = randomUUID();
      this.db.prepare("INSERT INTO brain_runs(id,sessionId,requestId,status,input,selection,team,error,createdAt,completedAt,pid) VALUES (?,?,?,'QUEUED',?,?,?,NULL,?,NULL,NULL)").run(id, sessionId, requestId, input, JSON.stringify(selection), JSON.stringify(team), new Date().toISOString());
      this.message(sessionId, "user", input);
      this.event(id, "run.queued", {});
      return this.run(id)!;
    });
  }
  claim(): BrainRun | undefined {
    return this.transaction(() => {
      const next = this.db.prepare("SELECT * FROM brain_runs WHERE status='QUEUED' ORDER BY createdAt LIMIT 1").get() as unknown as BrainRun | undefined;
      if (!next) return;
      this.db.prepare("UPDATE brain_runs SET status='RUNNING',pid=?,bootId=?,startedAt=?,processStart=? WHERE id=?").run(processIdentity.pid, processIdentity.bootId, processIdentity.startedAt, processIdentity.processStart, next.id);
      this.event(next.id, "run.started", {});
      return this.run(next.id);
    });
  }
  complete(id: string, text: string, provider?: string): boolean {
    return this.transaction(() => {
      const run = this.run(id);
      if (run?.status !== "RUNNING") return false;
      this.message(run.sessionId, "assistant", text, provider);
      this.finish(id, "COMPLETED");
      return true;
    });
  }
  finish(id: string, status: string, error?: string) {
    const result = this.db.prepare("UPDATE brain_runs SET status=?,error=?,completedAt=? WHERE id=? AND status IN ('QUEUED','RUNNING')").run(status, error || null, new Date().toISOString(), id);
    if (result.changes) this.event(id, `run.${status.toLowerCase()}`, { error });
  }
  reconcile() {
    const runs = this.db.prepare("SELECT * FROM brain_runs WHERE status='RUNNING'").all() as unknown as BrainRun[];
    for (const run of runs) {
      if (!processOwnerAlive(run)) this.finish(run.id, "INTERRUPTED", "Servidor reiniciou durante a execução. Revise o histórico antes de enviar novamente.");
    }
  }
  event(runId: string, type: string, data: unknown) {
    this.db.prepare("INSERT INTO brain_events(runId,type,data,createdAt) VALUES (?,?,?,?)").run(runId, type, JSON.stringify(data), new Date().toISOString());
  }
  events(runId: string, after = 0) { return this.db.prepare("SELECT * FROM brain_events WHERE runId=? AND id>? ORDER BY id LIMIT 200").all(runId, after); }
}

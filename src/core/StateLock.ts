import { processIdentity, processOwnerAlive, type ProcessOwner } from "./ProcessIdentity.js";
import { AsyncLocalStorage } from "node:async_hooks";
import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";

const activeOwners = new Set<string>();
const held = new AsyncLocalStorage<ReadonlySet<string>>();

// Single-host process lock. SQLite owns arbitration, including processes
// spawned by JobManager. Nested orchestrator calls reuse the same lock.
export async function withStateLock<T>(scope: string, fn: () => Promise<T>): Promise<T> {
  const filename = path.join(process.cwd(), "data", "locks.sqlite");
  const key = `${filename}:${scope}`;
  if (held.getStore()?.has(key)) return fn();
  mkdirSync(path.dirname(filename), { recursive: true });
  const db = new DatabaseSync(filename, { timeout: 5000 });
  db.exec("CREATE TABLE IF NOT EXISTS locks (scope TEXT PRIMARY KEY, owner TEXT NOT NULL, pid INTEGER NOT NULL) STRICT");
  db.exec("BEGIN IMMEDIATE");
  try {
    const columns = new Set(db.prepare("PRAGMA table_info(locks)").all().map(row => String(row.name)));
    for (const column of ["bootId", "startedAt", "processStart"]) {
      if (!columns.has(column)) db.exec(`ALTER TABLE locks ADD COLUMN ${column} TEXT`);
    }
    db.exec("COMMIT");
  } catch (error) { db.exec("ROLLBACK"); db.close(); throw error; }
  const owner = randomUUID();
  const deadline = Date.now() + 10_000;
  let acquired = false;
  try {
    while (!acquired) {
      const result = db.prepare("INSERT OR IGNORE INTO locks(scope,owner,pid,bootId,startedAt,processStart) VALUES (?,?,?,?,?,?)").run(scope, owner, processIdentity.pid, processIdentity.bootId, processIdentity.startedAt, processIdentity.processStart);
      acquired = Boolean(result.changes);
      if (acquired) { activeOwners.add(owner); break; }
      const current = db.prepare("SELECT * FROM locks WHERE scope=?").get(scope);
      if (current) {
        const alive = processOwnerAlive(current as unknown as ProcessOwner, activeOwners.has(String(current.owner)));
        if (!alive) { db.prepare("DELETE FROM locks WHERE scope=? AND owner=?").run(scope, String(current.owner)); continue; }
      }
      if (Date.now() >= deadline) throw new Error("Projeto ocupado por outra operação. Aguarde sua conclusão.");
      await delay(100);
    }
    return await held.run(new Set([...(held.getStore() || []), key]), fn);
  } finally {
    activeOwners.delete(owner);
    if (acquired) db.prepare("DELETE FROM locks WHERE scope=? AND owner=?").run(scope, owner);
    db.close();
  }
}

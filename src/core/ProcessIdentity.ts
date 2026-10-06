import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";

function kernelStart(pid: number): string | null {
  try {
    const stat = readFileSync(`/proc/${pid}/stat`, "utf8");
    const startTicks = stat.slice(stat.lastIndexOf(")") + 2).split(" ")[19];
    return `${readFileSync("/proc/sys/kernel/random/boot_id", "utf8").trim()}:${startTicks}`;
  } catch { return null; }
}
export const processIdentity = Object.freeze({
  pid: process.pid, bootId: randomUUID(),
  startedAt: new Date(Date.now() - process.uptime() * 1000).toISOString(),
  processStart: kernelStart(process.pid),
});
export interface ProcessOwner { pid: number | null; bootId?: string | null; startedAt?: string | null; processStart?: string | null }

// Reconciliation runs at startup. A row with our PID belongs to the previous
// container, unless StateLock explicitly recognizes a currently held owner.
export function processOwnerAlive(owner: ProcessOwner, currentOwnerActive = false) {
  if (!owner.pid || !owner.bootId || !owner.startedAt) return false;
  if (owner.pid === process.pid) return currentOwnerActive && owner.bootId === processIdentity.bootId && owner.startedAt === processIdentity.startedAt;
  try { process.kill(owner.pid, 0); }
  catch (error) { if ((error as NodeJS.ErrnoException).code === "ESRCH") return false; }
  const actual = kernelStart(owner.pid);
  // On Linux, compare boot + kernel process start to detect reuse of another PID.
  return actual !== null ? actual === owner.processStart : owner.processStart == null;
}

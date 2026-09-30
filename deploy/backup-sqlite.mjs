import { DatabaseSync } from 'node:sqlite';
import { mkdir, access, chmod, link, unlink, rm, readdir } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import path from 'node:path';

process.umask(0o077);
async function snapshot(source, target) {
  if (source === target) throw new Error('Origem e destino devem ser diferentes.');
  await access(source);
  await mkdir(path.dirname(target), { recursive: true, mode: 0o700 });
  const temporary = path.join(path.dirname(target), `.backup-${randomUUID()}.sqlite`);
  let db;
  try {
    db = new DatabaseSync(source, { readOnly: true, timeout: 10_000 });
    db.prepare('VACUUM INTO ?').run(temporary);
    db.close(); db = undefined;
    await chmod(temporary, 0o600);
    const check = new DatabaseSync(temporary, { readOnly: true });
    try { if (check.prepare('PRAGMA integrity_check').get().integrity_check !== 'ok') throw new Error('Backup inválido.'); }
    finally { check.close(); }
    await link(temporary, target); // Atomic, refuses overwrite.
    await unlink(temporary);
  } finally { db?.close(); await rm(temporary, { force: true }); }
}

async function daily(source, directory, keep) {
  if (!/^[1-9]\d{0,3}$/.test(keep) || Number(keep) > 3650) throw new Error('Retenção deve ser um inteiro entre 1 e 3650.');
  await access(source);
  await mkdir(directory, { recursive: true, mode: 0o700 });
  // SQLite releases this lock on crash; serialize snapshot + retention across
  // overlapping schedules without stale PID files or deleting each other's backup.
  const lock = new DatabaseSync(path.join(directory, '.backup-lock.sqlite'), { timeout: 10_000 });
  try {
    lock.exec('BEGIN IMMEDIATE');
    const date = new Date().toISOString().replaceAll(':', '-');
    const target = path.join(directory, `brain-${date}-${randomUUID()}.sqlite`);
    await snapshot(source, target);
    const candidates = (await readdir(directory, { withFileTypes: true }))
      .filter(entry => entry.isFile() && /^brain-\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}\.\d{3}Z-[a-f0-9-]{36}\.sqlite$/.test(entry.name))
      .map(entry => path.join(directory, entry.name))
      .filter(file => file !== target && file !== source).sort().reverse();
    // Prune only after a new verified snapshot has been committed.
    for (const file of candidates.slice(Number(keep) - 1)) await unlink(file);
    lock.exec('COMMIT');
    return target;
  } finally { lock.close(); }
}

try {
  const args = process.argv.slice(2);
  if (args[0] === '--daily') {
    if (!args[1] || !args[2] || args.length > 4) throw new Error('Uso: --daily <banco.sqlite> <diretório> [N]');
    const target = await daily(path.resolve(args[1]), path.resolve(args[2]), args[3] ?? process.env.SENIOR_BACKUP_KEEP ?? '14');
    console.log(`Snapshot diário criado: ${path.basename(target)}`);
  } else {
    if (args.length !== 2) throw new Error('Uso: node deploy/backup-sqlite.mjs <banco.sqlite> <backup.sqlite>');
    await snapshot(path.resolve(args[0]), path.resolve(args[1]));
    console.log('Backup consistente criado; valide a restauração antes de depender dele.');
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : 'Backup falhou.');
  process.exitCode = 1;
}

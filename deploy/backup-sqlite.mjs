import { DatabaseSync } from 'node:sqlite';
import { mkdir, access, chmod, link, unlink, rm } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import path from 'node:path';

const [sourceArg, targetArg] = process.argv.slice(2);
if (!sourceArg || !targetArg) {
  console.error('Uso: node deploy/backup-sqlite.mjs <banco.sqlite> <backup.sqlite>');
  process.exit(1);
}
const source = path.resolve(sourceArg), target = path.resolve(targetArg);
const temporary = path.join(path.dirname(target), `.backup-${randomUUID()}.sqlite`);
let db;
try {
  if (source === target) throw new Error('Origem e destino devem ser diferentes.');
  await access(source);
  await mkdir(path.dirname(target), { recursive: true, mode: 0o700 });
  db = new DatabaseSync(source, { readOnly: true, timeout: 10_000 });
  // VACUUM INTO takes a consistent snapshot, including committed WAL data.
  // Parameter binding prevents filenames from becoming SQL. Refuse overwrite.
  db.prepare('VACUUM INTO ?').run(temporary);
  db.close(); db = undefined;
  await chmod(temporary, 0o600);
  const check = new DatabaseSync(temporary, { readOnly: true });
  try { if (check.prepare('PRAGMA integrity_check').get().integrity_check !== 'ok') throw new Error('Backup inválido.'); }
  finally { check.close(); }
  await link(temporary, target);
  await unlink(temporary);
  console.log('Backup consistente criado; valide a restauração antes de depender dele.');
} catch (error) {
  db?.close(); await rm(temporary, { force: true });
  console.error(error instanceof Error ? error.message : 'Backup falhou.');
  process.exitCode = 1;
}

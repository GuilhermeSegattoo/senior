import { writeFile, rename, rm } from "node:fs/promises";
import { randomUUID } from "node:crypto";

export async function atomicWrite(filename: string, content: string, _encoding: string = "utf8") {
  const temporary = `${filename}.tmp-${randomUUID()}`;
  try { await writeFile(temporary, content, { encoding: "utf8", mode: 0o600 }); await rename(temporary, filename); }
  finally { await rm(temporary, { force: true }); }
}

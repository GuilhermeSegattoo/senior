import { constants } from "node:fs";
import { open, opendir, realpath } from "node:fs/promises";
import path from "node:path";

export const summaryLimits = { entries: 200, scanned: 1000, depth: 5, treeChars: 4000, readmeBytes: 4000, totalBytes: 12000 };
const ignored = new Set(["node_modules", "dist", "build", "coverage", "vendor"]);
const sensitiveName = /^(?:auth|credentials?|secrets?)(?:[._-]|$)|\.(?:pem|key|p12|pfx)$/i;

// Context is data, never authorization. Read only a bounded README, not arbitrary
// file contents. Skip dotfiles, credential names, symlinks, build output and FIFOs.
export async function summarizeProject(workspace: string) {
  const root = await realpath(workspace);
  const files: string[] = [];
  let scanned = 0, treeChars = 0, truncated = false, readmeName: string | undefined;
  const walk = async (directory: string, depth: number): Promise<void> => {
    const canonical = await realpath(directory);
    if (canonical !== root && !canonical.startsWith(root + path.sep)) return;
    const dir = await opendir(directory);
    try {
      for await (const entry of dir) {
        if (++scanned > summaryLimits.scanned || files.length >= summaryLimits.entries) { truncated = true; break; }
        if (entry.name.startsWith(".") || ignored.has(entry.name) || sensitiveName.test(entry.name) || entry.isSymbolicLink()) continue;
        const relative = path.relative(root, path.join(directory, entry.name));
        if (entry.isFile() || entry.isDirectory()) {
          const display = relative.slice(0, 240) + (entry.isDirectory() ? "/" : "");
          if (treeChars + display.length > summaryLimits.treeChars) { truncated = true; break; }
          files.push(display); treeChars += display.length;
          if (depth === 0 && entry.isFile() && /^readme(?:\.(?:md|txt))?$/i.test(entry.name)) readmeName ||= entry.name;
        }
        if (entry.isDirectory()) {
          if (depth < summaryLimits.depth) await walk(path.join(directory, entry.name), depth + 1); else truncated = true;
        }
      }
    } catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
  };
  await walk(root, 0);
  let readme = "", readmeTruncated = false;
  // A huge tree must not hide a top-level README. Selection itself is bounded.
  if (!readmeName) {
    const dir = await opendir(root); let count = 0;
    for await (const entry of dir) {
      if (++count > summaryLimits.scanned) break;
      if (entry.isFile() && /^readme(?:\.(?:md|txt))?$/i.test(entry.name)) { readmeName = entry.name; break; }
    }
  }
  if (readmeName) {
    const handle = await open(path.join(root, readmeName), constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
    try {
      const info = await handle.stat();
      if (info.isFile()) {
        const bytes = Buffer.alloc(summaryLimits.readmeBytes);
        const { bytesRead } = await handle.read(bytes, 0, bytes.length, 0);
        readme = bytes.subarray(0, bytesRead).toString("utf8");
        readmeTruncated = info.size > bytes.length;
        if (readme.includes("\0")) readme = "[README binário omitido]";
        readme = readme.replace(/^.*\b(?:[A-Z_]*API_KEY|PASSWORD|SECRET|ACCESS_TOKEN|AUTHORIZATION)\s*[:=].*$/gim, "[Linha de credencial omitida]")
          .replace(/\b(?:sk-[a-zA-Z0-9_-]{16,}|gh[pousr]_[a-zA-Z0-9]{20,})\b/g, "[Token omitido]");
      }
    } finally { await handle.close(); }
  }
  const summary = { files: files.sort(), truncated, readme, readmeTruncated };
  while (Buffer.byteLength(JSON.stringify(summary)) > summaryLimits.totalBytes) {
    if (summary.readme.length) { summary.readme = summary.readme.slice(0, Math.max(0, summary.readme.length - 500)); summary.readmeTruncated = true; }
    else { summary.files.pop(); summary.truncated = true; }
  }
  return summary;
}

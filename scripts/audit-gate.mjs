import { readFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

// Mandatory npm audit gate. High and critical advisories fail the build.
// The allowlist is only for a dev-only advisory that has no published patch.
const ALLOWED = new Set([
  "GHSA-vfj7-8cjw-p6xm",
]);

export function blockingAdvisories(report, allowed = ALLOWED) {
  const vulnerabilities = report?.vulnerabilities;
  if (!vulnerabilities || typeof vulnerabilities !== "object") {
    throw new Error("Relatório de audit inválido.");
  }
  const names = Object.keys(vulnerabilities);
  const allowedName = (name, seen = new Set()) => {
    if (seen.has(name)) return true;
    seen.add(name);
    const entry = vulnerabilities[name];
    if (!entry || (entry.severity !== "high" && entry.severity !== "critical")) return true;
    const via = Array.isArray(entry.via) ? entry.via : [];
    if (!via.length) return false;
    return via.every((item) => {
      if (typeof item === "string") return names.includes(item) && allowedName(item, seen);
      const id = String(item?.url || "").match(/GHSA-[0-9a-z-]+/i)?.[0];
      return Boolean(id && allowed.has(id));
    });
  };
  return names.filter((name) => {
    const entry = vulnerabilities[name];
    return (entry.severity === "high" || entry.severity === "critical") && !allowedName(name);
  });
}

function isDirectRun() {
  const entry = process.argv[1];
  if (!entry) return false;
  return import.meta.url === pathToFileURL(path.resolve(entry)).href;
}

if (isDirectRun()) {
  try {
    const file = process.argv[2];
    if (!file) throw new Error("Informe o arquivo JSON do npm audit.");
    const blocking = blockingAdvisories(JSON.parse(readFileSync(file, "utf8")));
    if (blocking.length) {
      console.error(`npm audit bloqueou: ${blocking.join(", ")}`);
      process.exit(1);
    }
    console.log("npm audit sem achados high/critical bloqueantes.");
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  }
}

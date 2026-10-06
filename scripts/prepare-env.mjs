import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

export const SECRET_KEYS = ["SENIOR_GATEWAY_TOKEN", "SENIOR_WEB_PASSWORD", "SENIOR_SESSION_SECRET"];

export function parseEnv(text) {
  const values = {};
  for (const line of text.split("\n")) {
    const match = /^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/.exec(line);
    if (match) values[match[1]] = match[2];
  }
  return values;
}

export function upsertEnv(text, key, value, onlyIfEmpty) {
  const lines = text.split("\n");
  let found = false;
  const next = lines.map((line) => {
    if (!line.startsWith(`${key}=`)) return line;
    found = true;
    const current = line.slice(key.length + 1);
    if (onlyIfEmpty && current.length > 0) return line;
    return `${key}=${value}`;
  });
  if (!found) {
    if (next.at(-1) === "") next.pop();
    next.push(`${key}=${value}`);
  }
  return `${next.join("\n").replace(/\n*$/, "")}\n`;
}

export function fillSecrets(text, generate) {
  let next = text;
  for (const key of SECRET_KEYS) {
    if ((parseEnv(next)[key] || "").length > 0) continue;
    next = upsertEnv(next, key, generate(key), true);
  }
  if (!(parseEnv(next).SENIOR_AGENT_RUNTIME || "").length) {
    next = upsertEnv(next, "SENIOR_AGENT_RUNTIME", "pi", true);
  }
  return next;
}

export function syncWebEnv(text, rootValues) {
  let next = text;
  for (const key of SECRET_KEYS) {
    if (!rootValues[key]) throw new Error(`Segredo ausente no .env da raiz: ${key}`);
    next = upsertEnv(next, key, rootValues[key], false);
  }
  if (!(parseEnv(next).SENIOR_API_URL || "").length) {
    next = upsertEnv(next, "SENIOR_API_URL", "http://127.0.0.1:4000", true);
  }
  if (!(parseEnv(next).SENIOR_COOKIE_SECURE || "").length) {
    next = upsertEnv(next, "SENIOR_COOKIE_SECURE", "false", true);
  }
  return next;
}

function opensslHex() {
  return execFileSync("openssl", ["rand", "-hex", "32"], { encoding: "utf8" }).trim();
}

export function prepareLocalEnv(root, generate = () => opensslHex()) {
  const example = path.join(root, ".env.example");
  const rootFile = path.join(root, ".env");
  if (!existsSync(example)) throw new Error(`Arquivo ausente: ${example}`);
  if (!existsSync(rootFile)) writeFileSync(rootFile, readFileSync(example, "utf8"));
  const filled = fillSecrets(readFileSync(rootFile, "utf8"), generate);
  writeFileSync(rootFile, filled);
  const rootValues = parseEnv(filled);
  const webExample = path.join(root, "apps", "web", ".env.example");
  const webFile = path.join(root, "apps", "web", ".env");
  if (!existsSync(webExample)) throw new Error(`Arquivo ausente: ${webExample}`);
  if (!existsSync(webFile)) writeFileSync(webFile, readFileSync(webExample, "utf8"));
  writeFileSync(webFile, syncWebEnv(readFileSync(webFile, "utf8"), rootValues));
  const warnings = [];
  if ((rootValues.SENIOR_WEB_PASSWORD || "").length < 16) warnings.push("SENIOR_WEB_PASSWORD precisa de pelo menos 16 caracteres.");
  if ((rootValues.SENIOR_GATEWAY_TOKEN || "").length < 32) warnings.push("SENIOR_GATEWAY_TOKEN precisa de pelo menos 32 caracteres.");
  if ((rootValues.SENIOR_SESSION_SECRET || "").length < 32) warnings.push("SENIOR_SESSION_SECRET precisa de pelo menos 32 caracteres.");
  return {
    runtime: rootValues.SENIOR_AGENT_RUNTIME || "",
    password: rootValues.SENIOR_WEB_PASSWORD || "",
    piProvider: rootValues.SENIOR_PI_PROVIDER || "",
    piModel: rootValues.SENIOR_PI_MODEL || "",
    warnings,
  };
}

export function formatBanner(info) {
  const lines = [
    "Senior no ar.",
    "",
    "Abra:  http://localhost:3000/canvas",
    `Senha: ${info.password}`,
    "",
  ];
  if (info.runtime === "claude") {
    lines.push("Motor: claude — Claude Code já autenticado nesta máquina. Não precisa de ANTHROPIC_API_KEY.");
    lines.push("Para o ChatGPT via Pi, use SENIOR_AGENT_RUNTIME=pi e SENIOR_PI_PROVIDER=openai-codex.");
  } else if (info.runtime === "pi") {
    lines.push("Motor: pi — assinatura do ChatGPT pelo Pi (SENIOR_PI_PROVIDER=openai-codex). Não precisa de OPENAI_API_KEY.");
    lines.push(info.piModel
      ? `Modelo do Pi: ${info.piModel}`
      : "Modelo do Pi: vazio. Preencha SENIOR_PI_MODEL com um id da sua conta, ou digite o modelo no cartão de conversa.");
    lines.push("Para Claude Code, troque SENIOR_AGENT_RUNTIME=claude no .env e rode ./start de novo. Não precisa de ANTHROPIC_API_KEY.");
  } else {
    lines.push(`Motor: ${info.runtime}. Para usar só a assinatura, prefira SENIOR_AGENT_RUNTIME=pi (ChatGPT via Pi) ou claude (Claude Code).`);
  }
  lines.push("", "Assistente clássico: http://localhost:3000/assistant", "Ctrl+C encerra a API e o site.");
  if (info.warnings?.length) lines.push("", ...info.warnings);
  return lines.join("\n");
}

function isDirectRun() {
  const entry = process.argv[1];
  if (!entry) return false;
  return import.meta.url === pathToFileURL(path.resolve(entry)).href;
}

if (isDirectRun()) {
  const info = prepareLocalEnv(process.cwd());
  if (!process.argv.includes("--quiet")) process.stdout.write(`${formatBanner(info)}\n`);
}

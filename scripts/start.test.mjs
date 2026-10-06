import test from "node:test";
import assert from "node:assert/strict";
import { access, mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { constants } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { formatBanner, parseEnv, prepareLocalEnv, upsertEnv } from "./prepare-env.mjs";

function commentsMarkEveryKey(text) {
  const lines = text.split("\n");
  const keys = [];
  for (let index = 0; index < lines.length; index += 1) {
    const match = /^([A-Z0-9_]+)=/.exec(lines[index]);
    if (!match) continue;
    keys.push(match[1]);
    const previous = [...lines.slice(0, index)].reverse().find((line) => line.trim() !== "");
    assert.equal(previous?.startsWith("#"), true, match[1]);
    assert.match(previous, /Obrigat|Opcional/, match[1]);
  }
  return keys;
}

test("env examples explain every variable in Portuguese", async () => {
  const root = await readFile(".env.example", "utf8");
  const web = await readFile("apps/web/.env.example", "utf8");
  const rootKeys = commentsMarkEveryKey(root);
  const webKeys = commentsMarkEveryKey(web);
  for (const key of ["SENIOR_AGENT_RUNTIME", "SENIOR_WEB_PASSWORD", "SENIOR_GATEWAY_TOKEN", "SENIOR_SESSION_SECRET", "SENIOR_PI_PROVIDER", "OPENAI_API_KEY"]) {
    assert.ok(rootKeys.includes(key), key);
  }
  assert.match(root, /SENIOR_AGENT_RUNTIME=pi/);
  assert.match(root, /SENIOR_PI_PROVIDER=openai-codex/);
  assert.match(root, /SENIOR_ENABLE_CODE_EXECUTION=false/);
  assert.ok(webKeys.includes("SENIOR_WEB_PASSWORD"));
});

test("upsert fills only empty keys and keeps comments", () => {
  const text = "# Obrigatória para entrar.\nSENIOR_WEB_PASSWORD=\nSENIOR_GATEWAY_TOKEN=ja-definido\n";
  const once = upsertEnv(text, "SENIOR_WEB_PASSWORD", "nova-senha", true);
  assert.match(once, /# Obrigatória para entrar/);
  assert.match(once, /SENIOR_WEB_PASSWORD=nova-senha/);
  assert.match(upsertEnv(once, "SENIOR_WEB_PASSWORD", "outra", true), /SENIOR_WEB_PASSWORD=nova-senha/);
  assert.match(upsertEnv(text, "SENIOR_GATEWAY_TOKEN", "x", true), /SENIOR_GATEWAY_TOKEN=ja-definido/);
});

test("prepare creates env files with openssl secrets and does not rotate them", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "senior-start-"));
  try {
    await mkdir(path.join(dir, "apps/web"), { recursive: true });
    await writeFile(path.join(dir, ".env.example"), await readFile(".env.example"));
    await writeFile(path.join(dir, "apps/web/.env.example"), await readFile("apps/web/.env.example"));
    const first = prepareLocalEnv(dir);
    assert.equal(first.runtime, "pi");
    assert.equal(first.piProvider, "openai-codex");
    assert.match(first.password, /^[a-f0-9]{64}$/);
    const root = parseEnv(await readFile(path.join(dir, ".env"), "utf8"));
    const web = parseEnv(await readFile(path.join(dir, "apps/web/.env"), "utf8"));
    assert.equal(root.SENIOR_GATEWAY_TOKEN.length, 64);
    assert.equal(root.SENIOR_SESSION_SECRET.length, 64);
    assert.equal(web.SENIOR_WEB_PASSWORD, root.SENIOR_WEB_PASSWORD);
    assert.equal(web.SENIOR_GATEWAY_TOKEN, root.SENIOR_GATEWAY_TOKEN);
    assert.equal(web.SENIOR_SESSION_SECRET, root.SENIOR_SESSION_SECRET);
    assert.equal(root.SENIOR_ENABLE_CODE_EXECUTION, "false");
    assert.match(await readFile(path.join(dir, ".env"), "utf8"), /Obrigatória para conversar/);
    const second = prepareLocalEnv(dir);
    assert.equal(second.password, first.password);
    assert.equal(second.runtime, "pi");
    const banner = formatBanner(first);
    assert.match(banner, /http:\/\/localhost:3000\/canvas/);
    assert.match(banner, new RegExp(first.password));
    assert.match(banner, /Não precisa de OPENAI_API_KEY/);
    assert.match(banner, /SENIOR_AGENT_RUNTIME=claude/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("an existing claude runtime and secrets stay in place", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "senior-start-keep-"));
  try {
    await mkdir(path.join(dir, "apps/web"), { recursive: true });
    await writeFile(path.join(dir, ".env.example"), await readFile(".env.example"));
    await writeFile(path.join(dir, "apps/web/.env.example"), await readFile("apps/web/.env.example"));
    const kept = {
      token: ["gateway", "fixture"].join("-"),
      password: ["web", "fixture"].join("-"),
      session: ["session", "fixture"].join("-"),
    };
    await writeFile(path.join(dir, ".env"), [
      "SENIOR_AGENT_RUNTIME=claude",
      `SENIOR_GATEWAY_TOKEN=${kept.token}`,
      `SENIOR_WEB_PASSWORD=${kept.password}`,
      `SENIOR_SESSION_SECRET=${kept.session}`,
      "",
    ].join("\n"));
    const info = prepareLocalEnv(dir, () => { throw new Error("não deveria gerar"); });
    assert.equal(info.runtime, "claude");
    assert.equal(info.password, kept.password);
    assert.match(formatBanner(info), /Não precisa de ANTHROPIC_API_KEY/);
    const web = parseEnv(await readFile(path.join(dir, "apps/web/.env"), "utf8"));
    assert.equal(web.SENIOR_WEB_PASSWORD, kept.password);
    assert.equal(web.SENIOR_SESSION_SECRET, kept.session);
    assert.equal(web.SENIOR_GATEWAY_TOKEN, kept.token);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("start help is executable and documents the local url", async () => {
  await access("start", constants.X_OK);
  const result = spawnSync("./start", ["--help"], { encoding: "utf8" });
  assert.equal(result.status, 0);
  assert.match(result.stdout, /--docker/);
  assert.match(result.stdout, /canvas|site|npm/);
});

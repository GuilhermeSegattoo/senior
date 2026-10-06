import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, readFile, symlink, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { BrainStore } from "../core/BrainStore.js";
import { Brain, parseSelection } from "../core/Brain.js";
import { Orchestrator } from "../core/Orchestrator.js";
import type { AgentRuntime } from "../runtimes/AgentRuntime.js";
import { SemanticValidator } from "../core/SemanticValidator.js";
import { PlanValidator } from "../core/PlanValidator.js";
import { parsePlan } from "../core/PlanSchema.js";
import { RunProjectCheckTool } from "../tools/RunProjectCheckTool.js";
import { WriteProjectFileTool } from "../tools/WriteProjectFileTool.js";
import { ProjectManager } from "../core/ProjectManager.js";
import { GitManager } from "../core/GitManager.js";
import { ProviderAuthManager } from "../core/ProviderAuthManager.js";
import type { LoginHandle } from "../adapters/ProviderAuth.js";

test("SQLite preserves sessions and idempotent requests across connections", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "senior-brain-"));
  const filename = path.join(directory, "brain.sqlite");
  const a = new BrainStore(filename), b = new BrainStore(filename);
  try {
    const session = a.createSession("Pessoal");
    a.remember("personal", "Prefiro respostas curtas", "user-confirmed");
    const run = a.enqueue(session.id, "request-1", "Oi", {}, []);
    assert.equal(b.enqueue(session.id, "request-1", "Oi", {}, []).id, run.id);
    assert.equal(b.messages(session.id).length, 1);
    assert.throws(() => b.enqueue(session.id, "request-1", "Outra mensagem", {}, []));
    assert.throws(() => b.enqueue(session.id, "request-2", "Oi", {}, []));
    assert.equal(b.claim()!.id, run.id);
    assert.equal(a.claim(), undefined);
    b.complete(run.id, "Olá");
    assert.equal(a.run(run.id)!.status, "COMPLETED");
    assert.equal(a.messages(session.id).length, 2);
    assert.equal(a.memories("personal").length, 1);
    assert.equal(a.memories("thumdra").length, 0);
  } finally { a.close(); b.close(); await rm(directory, { recursive: true, force: true }); }
});

test("specialists communicate through persisted context and Chief consolidates", async () => {
  const store = new BrainStore(":memory:");
  const prompts: string[] = [];
  const brain = new Brain(store, {} as Orchestrator, selection => ({ name: selection.provider || "fake", status: async () => true,
    ask: async (prompt, options) => { prompts.push(prompt); assert.equal(options.readOnly, true); assert.equal(options.conversationOnly, true); return { text: `Contribuição ${selection.provider}`, model: "fake" }; } }));
  try {
    const session = store.createSession("Pessoal");
    const memory = store.remember("personal", "Prefiro respostas longas", "user-confirmed");
    store.remember("personal", "Prefiro respostas curtas", "user-confirmed", memory.id);
    store.remember("other-project", "SEGREDO DE OUTRO PROJETO", "user-confirmed");
    const run = store.enqueue(session.id, "team-run", "Avalie uma ideia", { provider: "codex" }, [{ provider: "claude" }, { provider: "grok" }]);
    await brain.tick();
    assert.equal(store.run(run.id)!.status, "COMPLETED");
    assert.equal(prompts.length, 3);
    assert.match(prompts[1], /Contribuição claude/);
    assert.match(prompts[2], /Contribuição grok/);
    assert.match(prompts[0], /respostas curtas/);
    assert.doesNotMatch(prompts[0], /respostas longas|SEGREDO DE OUTRO PROJETO/);
    assert.deepEqual(store.messages(session.id).map(x => x.role), ["user", "agent", "agent", "assistant"]);
  } finally { brain.stop(); store.close(); }
});

test("cancelled calls cannot append late final responses; dead processes are interrupted", async () => {
  const store = new BrainStore(":memory:");
  let release!: () => void, started!: () => void;
  const entered = new Promise<void>(resolve => { started = resolve; });
  const brain = new Brain(store, {} as Orchestrator, () => ({ name: "fake", status: async () => true, ask: async () => {
    started(); await new Promise<void>(resolve => { release = resolve; }); return { text: "Resposta tardia" };
  } }));
  try {
    const session = store.createSession("Cancelar");
    const run = store.enqueue(session.id, "cancel", "Oi", {}, []);
    const work = brain.tick(); await entered; brain.cancel(run.id); release(); await work;
    assert.equal(store.run(run.id)!.status, "CANCELLED");
    assert.equal(store.messages(session.id).length, 1);
    const next = store.enqueue(session.id, "recover", "De novo", {}, []);
    store.claim(); store.db.prepare("UPDATE brain_runs SET pid=99999999 WHERE id=?").run(next.id);
    store.reconcile(); assert.equal(store.run(next.id)!.status, "INTERRUPTED");
  } finally { brain.stop(); store.close(); }
});

test("malformed model approvals and invalid plans never pass", async () => {
  const runtime = (text: string): AgentRuntime => ({ name: "fake", status: async () => true, ask: async () => ({ text }) });
  const plan = { projectId: "demo", objective: "Objetivo", createdAt: "now", tasks: [] };
  await assert.rejects(new PlanValidator(runtime('{"passed":"false","reasoning":"não"}')).validateObjective(plan, process.cwd()));
  const valid = await new PlanValidator(runtime('{"passed":false,"reasoning":"não atende"}')).validateObjective(plan, process.cwd());
  assert.equal(valid.status, "FAILED");
  await assert.rejects(new SemanticValidator(runtime('[{"id":"AC","passed":"false","reason":"não"}]')).evaluate({ task: { id: "t", agent: "backend", task: "T", status: "READY", dependsOn: [], acceptanceCriteria: [{ id: "AC", description: "Critério", status: "PENDING", evidence: [] }] }, objective: "O", agentResult: "R", diff: "D", workspacePath: process.cwd() }));
  assert.throws(() => parseSelection({ provider: "bogus" }));
  assert.throws(() => parseSelection({ model: 'x"\nmalicious=true' }));
  assert.throws(() => parsePlan({ tasks: [{ id: "../../outside", agent: "backend", task: "T", dependsOn: [] }] }, "p", "O"));
  assert.throws(() => parsePlan({ tasks: [{ id: "a", agent: "architect", task: "T", dependsOn: ["b"] }, { id: "b", agent: "architect", task: "T", dependsOn: ["a"] }] }, "p", "O"));
  assert.throws(() => parsePlan({ tasks: [{ id: "a", agent: "backend", task: "T", dependsOn: [] }] }, "p", "O"));
});

test("missing checks fail, nested writes work and symlink escapes remain blocked", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "senior-tools-"));
  const outside = await mkdtemp(path.join(os.tmpdir(), "senior-outside-"));
  try {
    await writeFile(path.join(directory, "package.json"), "{}");
    assert.equal((await new RunProjectCheckTool(directory).execute("test")).success, false);
    await new WriteProjectFileTool(directory).execute("new/nested/file.txt", "ok");
    assert.equal(await readFile(path.join(directory, "new/nested/file.txt"), "utf8"), "ok");
    await symlink(outside, path.join(directory, "escape"));
    await assert.rejects(new WriteProjectFileTool(directory).execute("escape/blocked/file.txt", "no"));
  } finally { await rm(directory, { recursive: true, force: true }); await rm(outside, { recursive: true, force: true }); }
});

test("late login URLs arrive and cancel allows a fresh attempt", async () => {
  let onUrl: ((url: string) => void) | undefined, onExit: ((success: boolean, message: string) => void) | undefined, killed = false;
  const handle: LoginHandle = { waitForUrl: async () => null, onUrl: callback => { onUrl = callback; }, onExit: callback => { onExit = callback; }, kill: () => { killed = true; } };
  const manager = new ProviderAuthManager({ codex: { authStatus: async () => ({ loggedIn: false, reliable: false, detail: "fake" }), login: () => handle } });
  try {
    assert.equal((await manager.startLogin("codex")).status, "pending_url");
    onUrl!("https://example.com/auth"); assert.equal(manager.getSession("codex")!.url, "https://example.com/auth");
    manager.cancelLogin("codex"); assert.equal(killed, true);
    assert.equal(manager.getSession("codex")!.status, "cancelled");
    const oldExit = onExit!;
    await manager.startLogin("codex"); oldExit(true, "old");
    assert.equal(manager.getSession("codex")!.status, "pending_url");
  } finally { manager.dispose(); }
});

test("concurrent project creation has no lost updates; final integration includes both branches", async () => {
  const original = process.cwd();
  const directory = await mkdtemp(path.join(os.tmpdir(), "senior-integration-"));
  try {
    process.chdir(directory);
    const a = new ProjectManager(), b = new ProjectManager();
    await Promise.all(Array.from({ length: 8 }, (_, i) => (i % 2 ? a : b).create({ name: `Project ${i}` })));
    assert.equal((await a.list()).length, 8);
    const repository = path.join(directory, "repo"); await mkdir(repository);
    const git = (args: string[]) => execFileSync("git", args, { cwd: repository, encoding: "utf8" }).trim();
    git(["init", "-b", "main"]); git(["config", "user.name", "Test"]); git(["config", "user.email", "test@example.com"]);
    git(["commit", "--allow-empty", "-m", "base"]);
    git(["checkout", "-b", "one"]); await writeFile(path.join(repository, "one.txt"), "one"); git(["add", "."]); git(["commit", "-m", "one"]); const one = git(["rev-parse", "HEAD"]);
    git(["checkout", "main"]); git(["checkout", "-b", "two"]); await writeFile(path.join(repository, "two.txt"), "two"); git(["add", "."]); git(["commit", "-m", "two"]); const two = git(["rev-parse", "HEAD"]); git(["checkout", "main"]);
    const result = await new GitManager().preparePlanIntegration("demo", repository, [one, two]);
    assert.equal(await readFile(path.join(result.path, "one.txt"), "utf8"), "one");
    assert.equal(await readFile(path.join(result.path, "two.txt"), "utf8"), "two");
    assert.equal(git(["branch", "--show-current"]), "main");
  } finally { process.chdir(original); await rm(directory, { recursive: true, force: true }); }
});

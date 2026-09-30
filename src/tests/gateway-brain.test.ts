import test from "node:test";
import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import { BrainStore } from "../core/BrainStore.js";
import { Brain } from "../core/Brain.js";
import { Orchestrator } from "../core/Orchestrator.js";
import { createGatewayServer } from "../gateway/server.js";
import { ApiRuntime } from "../runtimes/ApiRuntime.js";

test("authenticated gateway validates bodies, preserves history and replays SSE events", async () => {
  const previous = process.env.SENIOR_GATEWAY_TOKEN;
  process.env.SENIOR_GATEWAY_TOKEN = "test-only-not-a-real-credential";
  const orchestrator = new Orchestrator(), store = new BrainStore(":memory:");
  const brain = new Brain(store, orchestrator, () => ({ name: "fake", status: async () => true, ask: async () => ({ text: "Olá do Senior" }) }));
  const server = createGatewayServer({ orchestrator, brain });
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const headers = { authorization: `Bearer ${process.env.SENIOR_GATEWAY_TOKEN}`, "content-type": "application/json" };
  try {
    assert.equal((await fetch(`${base}/health`)).status, 200);
    assert.equal((await fetch(`${base}/brain/sessions`)).status, 401);
    assert.equal((await fetch(`${base}/brain/sessions`, { method: "POST", headers, body: "{broken" })).status, 400);
    assert.equal((await fetch(`${base}/brain/sessions`, { method: "POST", headers, body: JSON.stringify({ title: 5 }) })).status, 400);
    assert.equal((await fetch(`${base}/brain/sessions`, { method: "POST", headers, body: "a".repeat(270000) })).status, 413);
    assert.equal((await fetch(`${base}/jobs/%2e%2e%2foutside`, { headers })).status, 400);
    const response = await fetch(`${base}/brain/sessions`, { method: "POST", headers, body: JSON.stringify({ title: "Teste" }) });
    assert.equal(response.status, 201);
    const { session } = await response.json() as { session: { id: string } };
    const send = () => fetch(`${base}/brain/sessions/${session.id}/messages`, { method: "POST", headers, body: JSON.stringify({ message: "Oi", requestId: "same-request" }) });
    const first = await (await send()).json() as { run: { id: string } };
    const second = await (await send()).json() as { run: { id: string } };
    assert.equal(first.run.id, second.run.id);
    for (let i = 0; i < 30 && store.run(first.run.id)?.status !== "COMPLETED"; i++) await new Promise(resolve => setTimeout(resolve, 50));
    assert.equal(store.run(first.run.id)?.status, "COMPLETED");
    const detail = await (await fetch(`${base}/brain/sessions/${session.id}`, { headers })).json() as { messages: Array<{ text: string }> };
    assert.deepEqual(detail.messages.map(x => x.text), ["Oi", "Olá do Senior"]);
    const events = await (await fetch(`${base}/brain/runs/${first.run.id}/stream`, { headers })).text();
    assert.match(events, /run.completed/);
    const cursor = Number(store.events(first.run.id)[0].id);
    const replay = await (await fetch(`${base}/brain/runs/${first.run.id}/stream`, { headers: { ...headers, "last-event-id": String(cursor) } })).text();
    assert.doesNotMatch(replay, /run.queued/);
  } finally {
    if (previous === undefined) delete process.env.SENIOR_GATEWAY_TOKEN; else process.env.SENIOR_GATEWAY_TOKEN = previous;
    await new Promise<void>(resolve => server.close(() => resolve()));
  }
});

test("API adapters send selected model, reject write tasks and hide sensitive errors", async () => {
  const key = process.env.XAI_API_KEY, model = process.env.SENIOR_XAI_MODEL;
  process.env.XAI_API_KEY = "test-only-secret"; process.env.SENIOR_XAI_MODEL = "test-model";
  try {
    let received: Record<string, unknown> | undefined;
    const fetcher: typeof fetch = async (_url, options) => {
      received = JSON.parse(String(options?.body));
      return Response.json({ choices: [{ message: { content: "Resposta Grok" } }] });
    };
    const runtime = new ApiRuntime("grok", "explicit-model", fetcher);
    assert.equal((await runtime.ask("Oi", { cwd: process.cwd(), readOnly: true })).text, "Resposta Grok");
    assert.equal(received!.model, "explicit-model");
    await assert.rejects(runtime.ask("Escreva", { cwd: process.cwd(), readOnly: false }));
    const failing = new ApiRuntime("grok", "test-model", async () => new Response("test-only-secret", { status: 401 }));
    await assert.rejects(failing.ask("Oi", { cwd: process.cwd(), readOnly: true }), error => error instanceof Error && !error.message.includes("test-only-secret") && error.message.includes("401"));
  } finally {
    if (key === undefined) delete process.env.XAI_API_KEY; else process.env.XAI_API_KEY = key;
    if (model === undefined) delete process.env.SENIOR_XAI_MODEL; else process.env.SENIOR_XAI_MODEL = model;
  }
});

import test from "node:test";
import assert from "node:assert/strict";
import {
  CARD_LIMIT,
  CANVAS_STORAGE_KEY,
  createCard,
  defaultCanvasLayout,
  loadCanvasLayout,
  moveCards,
  parseCanvasLayout,
  removeCard,
  updateCard,
} from "../src/lib/canvas-layout.js";

test("default canvas opens with conversation, note and agent", () => {
  const layout = defaultCanvasLayout();
  assert.deepEqual(layout.cards.map((card) => card.kind), ["conversation", "note", "agent"]);
  assert.equal(CANVAS_STORAGE_KEY, "senior.canvas.v1");
});

test("stored layout keeps positions, notes and session ids and drops junk", () => {
  const raw = JSON.stringify({
    viewport: { x: 10, y: -4, zoom: 8 },
    cards: [
      { id: "a", kind: "note", title: "Ideia", x: 12, y: 20, note: "lembrar" },
      { id: "a", kind: "note", title: "duplicada", x: 1, y: 1, note: "nao" },
      { id: "b", kind: "conversation", title: "Chat", x: 30, y: 40, sessionId: "sessao-1" },
      { id: "c", kind: "terminal", title: "ruim", x: 1, y: 1 },
      { id: "", kind: "agent", x: 1, y: 1 },
    ],
  });
  const layout = parseCanvasLayout(raw);
  assert.ok(layout);
  assert.deepEqual(layout.cards.map((card) => card.id), ["a", "b"]);
  assert.equal(layout.cards[0].note, "lembrar");
  assert.equal(layout.cards[1].sessionId, "sessao-1");
  assert.equal(layout.viewport.zoom, 2);
  assert.equal(parseCanvasLayout("nao-json"), null);
  assert.equal(parseCanvasLayout("[]")?.cards.length, 0);
});

test("cards can be created, moved, edited and closed without passing the limit", () => {
  const first = createCard([], "conversation", "novo");
  const second = createCard([first], "note", "nota");
  assert.ok(second.x > first.x);
  assert.equal(second.note, "");
  const moved = moveCards([first, second], [{ id: "nota", x: 9, y: 8 }, { id: "ausente", x: 1, y: 1 }]);
  assert.equal(moved[1].x, 9);
  assert.equal(moved[0].x, first.x);
  const edited = updateCard(moved, "nota", { note: "texto", sessionId: "ignorado" });
  assert.equal(edited[1].note, "texto");
  assert.equal(edited[1].sessionId, undefined);
  const bound = updateCard(edited, "novo", { sessionId: "s1", note: "nao-entra" });
  assert.equal(bound[0].sessionId, "s1");
  assert.equal(bound[0].note, undefined);
  assert.deepEqual(removeCard(bound, "novo").map((card) => card.id), ["nota"]);
  const many = Array.from({ length: CARD_LIMIT }, (_, index) => createCard([], "agent", `id-${index}`));
  assert.equal(many.length, CARD_LIMIT);
});

test("load falls back when storage is empty or corrupt", () => {
  const storage = { value: null as string | null, getItem: () => storage.value };
  assert.equal(loadCanvasLayout(storage).cards.length, 3);
  storage.value = "{";
  assert.equal(loadCanvasLayout(storage).cards[0].kind, "conversation");
  storage.value = JSON.stringify({ cards: [{ id: "z", kind: "agent", title: "Agente", x: 3, y: 4 }] });
  assert.equal(loadCanvasLayout(storage).cards[0].id, "z");
  assert.equal(loadCanvasLayout(null).cards.length, 3);
});

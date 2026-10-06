export type CanvasCardKind = "conversation" | "note" | "agent";

export interface CanvasCard extends Record<string, unknown> {
  id: string;
  kind: CanvasCardKind;
  title: string;
  x: number;
  y: number;
  note?: string;
  sessionId?: string;
}

export interface CanvasViewport {
  x: number;
  y: number;
  zoom: number;
}

export interface CanvasLayout {
  cards: CanvasCard[];
  viewport: CanvasViewport;
}

export const CANVAS_STORAGE_KEY = "senior.canvas.v1";
export const CARD_LIMIT = 40;
const NOTE_LIMIT = 20_000;

export const CARD_SIZE: Record<CanvasCardKind, { width: number; height: number }> = {
  conversation: { width: 440, height: 540 },
  note: { width: 320, height: 380 },
  agent: { width: 400, height: 300 },
};

const KINDS = new Set<CanvasCardKind>(["conversation", "note", "agent"]);
const TITLES: Record<CanvasCardKind, string> = {
  conversation: "Conversa",
  note: "Nota",
  agent: "Agente",
};

function finite(value: unknown, fallback: number, min: number, max: number) {
  const number = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(max, Math.max(min, number));
}

export function defaultCanvasLayout(): CanvasLayout {
  return {
    viewport: { x: 40, y: 20, zoom: 1 },
    cards: [
      { id: "conversa-inicial", kind: "conversation", title: "Conversa", x: 48, y: 48 },
      { id: "nota-inicial", kind: "note", title: "Nota", x: 540, y: 88, note: "" },
      { id: "agente-inicial", kind: "agent", title: "Agente", x: 920, y: 48 },
    ],
  };
}

function parseCard(value: unknown): CanvasCard | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  if (typeof record.id !== "string" || !record.id.trim()) return null;
  if (!KINDS.has(record.kind as CanvasCardKind)) return null;
  const kind = record.kind as CanvasCardKind;
  const card: CanvasCard = {
    id: record.id.slice(0, 80),
    kind,
    title: typeof record.title === "string" && record.title.trim() ? record.title.slice(0, 80) : TITLES[kind],
    x: finite(record.x, 48, -20_000, 20_000),
    y: finite(record.y, 48, -20_000, 20_000),
  };
  if (kind === "note") card.note = typeof record.note === "string" ? record.note.slice(0, NOTE_LIMIT) : "";
  if (kind === "conversation" && typeof record.sessionId === "string" && record.sessionId.trim()) {
    card.sessionId = record.sessionId.slice(0, 80);
  }
  return card;
}

export function parseCanvasLayout(raw: string): CanvasLayout | null {
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return null;
  }
  const source = Array.isArray(value) ? { cards: value } : value;
  if (!source || typeof source !== "object" || !Array.isArray((source as { cards?: unknown }).cards)) return null;
  const record = source as { cards: unknown[]; viewport?: unknown };
  const seen = new Set<string>();
  const cards: CanvasCard[] = [];
  for (const item of record.cards) {
    const card = parseCard(item);
    if (!card || seen.has(card.id)) continue;
    seen.add(card.id);
    cards.push(card);
    if (cards.length >= CARD_LIMIT) break;
  }
  const viewport = record.viewport && typeof record.viewport === "object" ? record.viewport as Record<string, unknown> : {};
  return {
    cards,
    viewport: {
      x: finite(viewport.x, 0, -20_000, 20_000),
      y: finite(viewport.y, 0, -20_000, 20_000),
      zoom: finite(viewport.zoom, 1, 0.2, 2),
    },
  };
}

export function loadCanvasLayout(storage: { getItem(key: string): string | null } | null): CanvasLayout {
  const raw = storage?.getItem(CANVAS_STORAGE_KEY);
  if (!raw) return defaultCanvasLayout();
  return parseCanvasLayout(raw) ?? defaultCanvasLayout();
}

export function createCard(cards: CanvasCard[], kind: CanvasCardKind, id: string): CanvasCard {
  const count = cards.filter((card) => card.kind === kind).length + 1;
  const right = cards.reduce((max, card) => Math.max(max, card.x + CARD_SIZE[card.kind].width), 0);
  const card: CanvasCard = {
    id,
    kind,
    title: `${TITLES[kind]} ${count}`,
    x: cards.length ? right + 48 : 48,
    y: 48 + (count % 4) * 28,
  };
  if (kind === "note") card.note = "";
  return card;
}

export function moveCards(cards: CanvasCard[], updates: Array<{ id: string; x: number; y: number }>): CanvasCard[] {
  const byId = new Map(updates.map((update) => [update.id, update]));
  return cards.map((card) => {
    const next = byId.get(card.id);
    if (!next || !Number.isFinite(next.x) || !Number.isFinite(next.y)) return card;
    return { ...card, x: next.x, y: next.y };
  });
}

export function updateCard(
  cards: CanvasCard[],
  id: string,
  partial: Partial<Pick<CanvasCard, "title" | "note" | "sessionId">>,
): CanvasCard[] {
  return cards.map((card) => {
    if (card.id !== id) return card;
    const next = { ...card };
    if (typeof partial.title === "string") next.title = partial.title.slice(0, 80);
    if (card.kind === "note" && typeof partial.note === "string") next.note = partial.note.slice(0, NOTE_LIMIT);
    if (card.kind === "conversation" && typeof partial.sessionId === "string") next.sessionId = partial.sessionId.slice(0, 80);
    return next;
  });
}

export function removeCard(cards: CanvasCard[], id: string) {
  return cards.filter((card) => card.id !== id);
}

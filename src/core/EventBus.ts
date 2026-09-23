import {
  appendFile,
  mkdir,
  readFile,
} from "node:fs/promises";

import { EventEmitter } from "node:events";
import { randomUUID } from "node:crypto";
import path from "node:path";

import type {
  SeniorEvent,
  SeniorEventInput,
  SeniorEventType,
} from "../types/Event.js";

/*
 * Event system (seção 16 do SENIOR_MASTER_PLAN.md).
 *
 * "O frontend não deve depender de scraping de terminal. O backend
 * deve emitir eventos estruturados."
 *
 * Cada evento é: (1) persistido em data/events/<projectId>.jsonl —
 * append-only, para consumidores futuros (API, UI, timeline) lerem
 * depois, inclusive de outro processo; (2) emitido num
 * EventEmitter em memória, para quem estiver escutando no MESMO
 * processo em tempo real.
 *
 * A persistência entre processos (ex.: um job rodando em processo
 * destacado) é só o arquivo — não há pub/sub entre processos aqui.
 * Isso é suficiente para "recuperar" o histórico (via `senior
 * events`) mesmo que ninguém estivesse "escutando" quando o evento
 * aconteceu; um event bus cross-process de verdade fica para a Fase
 * F (API/Gateway), quando fizer sentido expor isso via WebSocket/SSE.
 */
export class EventBus {
  private readonly emitter =
    new EventEmitter();

  private readonly eventsDir =
    path.join(
      process.cwd(),
      "data",
      "events"
    );

  constructor() {
    this.emitter.setMaxListeners(
      50
    );
  }

  async emit(
    input: SeniorEventInput
  ): Promise<SeniorEvent> {
    const event: SeniorEvent = {
      id: randomUUID(),
      createdAt:
        new Date().toISOString(),
      ...input,
    };

    await this.persist(event);

    this.emitter.emit(
      event.type,
      event
    );

    this.emitter.emit(
      "*",
      event
    );

    return event;
  }

  on(
    type: SeniorEventType | "*",
    listener: (
      event: SeniorEvent
    ) => void
  ): void {
    this.emitter.on(
      type,
      listener
    );
  }

  off(
    type: SeniorEventType | "*",
    listener: (
      event: SeniorEvent
    ) => void
  ): void {
    this.emitter.off(
      type,
      listener
    );
  }

  async list(
    projectId: string,
    options?: {
      since?: string;
      limit?: number;
    }
  ): Promise<SeniorEvent[]> {
    let lines: string[];

    try {
      const content =
        await readFile(
          this.eventFile(
            projectId
          ),
          "utf8"
        );

      lines = content
        .split("\n")
        .filter(Boolean);
    } catch {
      return [];
    }

    let events = lines.map(
      (line) =>
        JSON.parse(
          line
        ) as SeniorEvent
    );

    if (options?.since) {
      const since =
        options.since;

      events = events.filter(
        (event) =>
          event.createdAt > since
      );
    }

    if (options?.limit) {
      events = events.slice(
        -options.limit
      );
    }

    return events;
  }

  private eventFile(
    projectId: string
  ): string {
    return path.join(
      this.eventsDir,
      `${projectId}.jsonl`
    );
  }

  private async persist(
    event: SeniorEvent
  ): Promise<void> {
    await mkdir(this.eventsDir, {
      recursive: true,
    });

    await appendFile(
      this.eventFile(
        event.projectId
      ),
      `${JSON.stringify(event)}\n`,
      "utf8"
    );
  }
}

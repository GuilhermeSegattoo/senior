import { rm } from "node:fs/promises";
import path from "node:path";

import { EventBus } from "../core/EventBus.js";

import type {
  SeniorEvent,
} from "../types/Event.js";

async function main() {
  console.log(
    "\n=== SENIOR EVENT BUS ===\n"
  );

  const projectId = `event-bus-test-${Date.now()}`;

  try {
    const bus = new EventBus();

    const received: SeniorEvent[] =
      [];

    const listener = (
      event: SeniorEvent
    ) => {
      received.push(event);
    };

    bus.on("task.started", listener);

    await bus.emit({
      type: "project.created",
      projectId,
      data: { name: "Teste" },
    });

    await bus.emit({
      type: "task.started",
      projectId,
      taskId: "task-1",
      data: { agent: "backend" },
    });

    await bus.emit({
      type: "task.validated",
      projectId,
      taskId: "task-1",
      data: {},
    });

    if (received.length !== 1) {
      throw new Error(
        `Listener deveria ter recebido 1 evento de task.started, recebeu ${received.length}`
      );
    }

    console.log(
      "OK: on() só recebe eventos do tipo assinado."
    );

    bus.off("task.started", listener);

    await bus.emit({
      type: "task.started",
      projectId,
      taskId: "task-2",
      data: { agent: "frontend" },
    });

    if (received.length !== 1) {
      throw new Error(
        "off() não removeu o listener corretamente."
      );
    }

    console.log(
      "OK: off() remove o listener."
    );

    // -------------------------------------------------------
    // Persistência: uma NOVA instância de EventBus (simula outro
    // processo) precisa conseguir ler os eventos já gravados.
    // -------------------------------------------------------

    const otherBus = new EventBus();

    const all = await otherBus.list(
      projectId
    );

    if (all.length !== 4) {
      throw new Error(
        `Esperado 4 eventos persistidos, encontrado ${all.length}`
      );
    }

    console.log(
      "OK: eventos persistem em disco e são lidos por outra instância."
    );

    const limited =
      await otherBus.list(
        projectId,
        { limit: 2 }
      );

    if (
      limited.length !== 2 ||
      limited[1].type !==
        "task.started"
    ) {
      throw new Error(
        `list() com limit não retornou os últimos 2 eventos corretamente: ${JSON.stringify(limited)}`
      );
    }

    console.log(
      "OK: list() com limit retorna os eventos mais recentes."
    );

    const since = all[1].createdAt;

    const afterSince =
      await otherBus.list(
        projectId,
        { since }
      );

    if (
      afterSince.some(
        (event) =>
          event.createdAt <= since
      )
    ) {
      throw new Error(
        "list() com since retornou eventos antigos demais."
      );
    }

    console.log(
      "OK: list() com since filtra eventos anteriores."
    );

    console.log(
      "\nEVENT BUS FUNCIONANDO."
    );
  } finally {
    await rm(
      path.join(
        process.cwd(),
        "data",
        "events",
        `${projectId}.jsonl`
      ),
      { force: true }
    );
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

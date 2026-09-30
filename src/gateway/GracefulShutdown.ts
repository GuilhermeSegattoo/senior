import type { Server } from "node:http";
import type { EventEmitter } from "node:events";

export function installGracefulShutdown(server: Server, stop: () => void, signals: EventEmitter = process) {
  let closing = false;
  let deadline: NodeJS.Timeout | undefined;
  const shutdown = () => {
    if (closing) return;
    closing = true;
    // Persist interruption and abort calls before closing HTTP/SSE connections.
    stop();
    server.close();
    server.closeIdleConnections();
    deadline = setTimeout(() => server.closeAllConnections(), 10_000);
    deadline.unref();
  };
  signals.on("SIGTERM", shutdown); signals.on("SIGINT", shutdown);
  server.once("close", () => {
    if (deadline) clearTimeout(deadline);
    signals.off("SIGTERM", shutdown); signals.off("SIGINT", shutdown);
  });
  return shutdown;
}

import { timingSafeEqual } from "node:crypto";
import { BrainStore } from "../core/BrainStore.js";
import { Brain, parseSelection } from "../core/Brain.js";
import { RuntimeManager } from "../runtimes/RuntimeManager.js";
import {
  createServer,
  IncomingMessage,
  ServerResponse,
} from "node:http";

import {
  readdir,
  readFile,
} from "node:fs/promises";

import path from "node:path";

import { Orchestrator } from "../core/Orchestrator.js";
import { JobManager } from "../core/JobManager.js";
import { EventBus } from "../core/EventBus.js";
import { ProjectMemory } from "../core/ProjectMemory.js";
import { FilesystemBrowser } from "../core/FilesystemBrowser.js";
import { ProviderAuthManager } from "../core/ProviderAuthManager.js";

import type {
  RuntimeName,
} from "../runtimes/RuntimeManager.js";

import type {
  AuthProviderName,
} from "../core/ProviderAuthManager.js";

/*
 * API / Gateway (seção 24, Fase F, e seção 5 do
 * SENIOR_MASTER_PLAN.md).
 *
 * Expõe via HTTP o que já existe no core: projetos, planos/tarefas,
 * jobs, eventos, memória de projeto e os papéis de agente
 * disponíveis. Implementado com node:http puro (sem framework) —
 * a superfície é pequena o suficiente para não justificar uma nova
 * dependência ainda.
 *
 * Deliberadamente fora: "approvals" (seção 19) não existe como
 * mecanismo no core ainda, então não há endpoint para isso —
 * expor uma rota falsa seria pior que não expor nada.
 *
 * Sem autenticação: pensado para rodar em localhost, como
 * ferramenta de desenvolvimento local. Ver seção 24 (Fase F) do
 * documento — autenticação/hardening não fazem parte do escopo
 * descrito para esta fase.
 */

export interface GatewayDependencies {
  orchestrator?: Orchestrator;
  brain?: Brain;
  jobManager?: JobManager;
  eventBus?: EventBus;
  projectMemory?: ProjectMemory;
  filesystemBrowser?: FilesystemBrowser;
  providerAuthManager?: ProviderAuthManager;
}

type RouteHandler = (
  req: IncomingMessage,
  res: ServerResponse,
  params: Record<string, string>,
  query: URLSearchParams
) => Promise<void>;

interface Route {
  method: string;
  pattern: RegExp;
  paramNames: string[];
  handler: RouteHandler;
}

function compileRoute(
  routePath: string
): {
  pattern: RegExp;
  paramNames: string[];
} {
  const paramNames: string[] = [];

  const pattern = routePath
    .split("/")
    .map((segment) => {
      if (segment.startsWith(":")) {
        paramNames.push(
          segment.slice(1)
        );

        return "([^/]+)";
      }

      return segment.replace(
        /[.*+?^${}()|[\]\\]/g,
        "\\$&"
      );
    })
    .join("/");

  return {
    pattern: new RegExp(
      `^${pattern}$`
    ),
    paramNames,
  };
}

class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string
  ) {
    super(message);
  }
}

/*
 * Sem isso, um fetch() sem header explícito (Content-Type vira
 * "text/plain" por padrão) escaparia da checagem de CORS — texto
 * simples não dispara preflight — e ainda assim conteria JSON
 * válido que JSON.parse() aceitaria de qualquer forma. Exigir
 * application/json de propósito força o navegador a fazer preflight
 * em qualquer POST de outra origem, o que a allowlist de origem
 * abaixo então bloqueia.
 */
async function readJsonBody(
  req: IncomingMessage
): Promise<unknown> {
  const chunks: Buffer[] = [];
  let bytes = 0;

  for await (const chunk of req) {
    bytes += Buffer.byteLength(chunk);
    if (bytes > 256 * 1024) throw new HttpError(413, "Corpo excede 256 KiB.");
    chunks.push(chunk as Buffer);
  }

  if (chunks.length === 0) {
    return {};
  }

  const contentType = (
    req.headers["content-type"] ??
    ""
  ).toLowerCase();

  if (
    !contentType.includes(
      "application/json"
    )
  ) {
    throw new HttpError(
      415,
      "Content-Type deve ser application/json."
    );
  }

  const raw = Buffer.concat(
    chunks
  ).toString("utf8");

  if (!raw.trim()) {
    return {};
  }

  try {
    const value: unknown = JSON.parse(raw);
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error();
    const body = value as Record<string, unknown>;
    for (const field of ["message", "objective", "name", "path", "url", "title", "text", "scope", "requestId", "projectId"]) {
      if (body[field] !== undefined && (typeof body[field] !== "string" || !(body[field] as string).trim() || (body[field] as string).length > 20000)) throw new HttpError(400, `Campo inválido: ${field}`);
    }
    if (body.provider !== undefined || body.model !== undefined) {
      try { parseSelection({provider: body.provider, model: body.model}); } catch { throw new HttpError(400, "Provedor/modelo inválido."); }
    }
    return body;
  } catch (error) {
    if (error instanceof HttpError) throw error;
    throw new HttpError(400, "JSON inválido.");
  }
}

function sendJson(
  res: ServerResponse,
  status: number,
  body: unknown
): void {
  res.writeHead(status, {
    "Content-Type":
      "application/json",
  });

  res.end(JSON.stringify(body));
}

/*
 * Allowlist de origem para CORS. "Access-Control-Allow-Origin: *"
 * numa API que cria projetos, importa repositórios e dispara jobs
 * (que rodam agentes tocando git/filesystem) permite que QUALQUER
 * site que o usuário visite dispare essas ações silenciosamente
 * via fetch() do navegador, e ainda leia os dados de resposta —
 * um CSRF/drive-by clássico contra ferramentas locais. Só refletimos
 * a origem de volta quando ela está na allowlist; caso contrário,
 * nenhum header de CORS é enviado (o navegador bloqueia por padrão).
 */
function resolveAllowedOrigin(
  req: IncomingMessage
): string | null {
  const origin = req.headers.origin;

  if (!origin) {
    return null;
  }

  const configured =
    process.env
      .SENIOR_GATEWAY_ALLOWED_ORIGINS;

  const allowed = configured
    ? configured
        .split(",")
        .map((value) =>
          value.trim()
        )
    : [
        "http://localhost:3000",
        "http://127.0.0.1:3000",
      ];

  return allowed.includes(origin)
    ? origin
    : null;
}

export function createGatewayServer(
  deps: GatewayDependencies = {}
) {
  const orchestrator =
    deps.orchestrator ??
    new Orchestrator();

  const jobManager =
    deps.jobManager ??
    new JobManager();

  const eventBus =
    deps.eventBus ??
    new EventBus();

  const projectMemory =
    deps.projectMemory ??
    new ProjectMemory();

  const filesystemBrowser =
    deps.filesystemBrowser ??
    new FilesystemBrowser();

  const providerAuthManager =
    deps.providerAuthManager ??
    new ProviderAuthManager();

  const store = deps.brain?.store ?? new BrainStore();
  const brain = deps.brain ?? new Brain(store, orchestrator);
  let work: Promise<void> = Promise.resolve();
  const worker = setInterval(() => { work = brain.tick().catch(() => undefined); }, 200);
  worker.unref();

  const routes: Route[] = [];

  function route(
    method: string,
    routePath: string,
    handler: RouteHandler
  ): void {
    const { pattern, paramNames } =
      compileRoute(routePath);

    routes.push({
      method,
      pattern,
      paramNames,
      handler,
    });
  }

  route("GET", "/brain/sessions", async (_req, res) => sendJson(res, 200, { sessions: store.sessions() }));
  route("POST", "/brain/sessions", async (req, res) => {
    const body = await readJsonBody(req) as { title?: string; projectId?: string };
    if (body.projectId && !(await orchestrator.getProject(body.projectId))) throw new HttpError(404, "Projeto não encontrado.");
    sendJson(res, 201, { session: store.createSession(body.title || "Nova conversa", body.projectId) });
  });
  route("GET", "/brain/sessions/:sessionId", async (_req, res, params) => {
    const session = store.session(params.sessionId);
    if (!session) throw new HttpError(404, "Sessão não encontrada.");
    sendJson(res, 200, { session, messages: store.messages(session.id), runs: store.runs(session.id) });
  });
  route("POST", "/brain/sessions/:sessionId/messages", async (req, res, params) => {
    if (!store.session(params.sessionId)) throw new HttpError(404, "Sessão não encontrada.");
    const body = await readJsonBody(req) as { message?: string; requestId?: string; selection?: unknown; team?: unknown };
    if (!body.message || !body.requestId || !/^[a-zA-Z0-9_-]{1,100}$/.test(body.requestId)) throw new HttpError(400, "Informe message e requestId válido.");
    try {
      const selection = parseSelection(body.selection || {});
      const team = body.team === undefined ? [] : body.team;
      if (!Array.isArray(team) || team.length > 2) throw new HttpError(400, "Equipe aceita no máximo dois especialistas.");
      const run = store.enqueue(params.sessionId, body.requestId, body.message, selection, team.map(parseSelection));
      sendJson(res, 202, { run });
    } catch (error) { if (error instanceof HttpError) throw error; throw new HttpError(409, error instanceof Error ? error.message : "Execução não criada."); }
  });
  route("GET", "/brain/runs/:runId/stream", async (req, res, params, query) => {
    if (!store.run(params.runId)) throw new HttpError(404, "Execução não encontrada.");
    let cursor = Number(req.headers["last-event-id"] || query.get("after")) || 0;
    res.writeHead(200, { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", "Connection": "keep-alive", "X-Accel-Buffering": "no" });
    const flush = () => {
      for (const event of store.events(params.runId, cursor)) {
        cursor = Number(event.id);
        res.write(`id: ${event.id}\ndata: ${JSON.stringify(event)}\n\n`);
      }
      const run = store.run(params.runId);
      if (run && !["QUEUED", "RUNNING"].includes(run.status)) { clearInterval(timer); res.end(); }
      else res.write(": heartbeat\n\n");
    };
    const timer = setInterval(flush, 1000);
    timer.unref();
    res.on("close", () => clearInterval(timer));
    flush();
  });
  route("POST", "/brain/runs/:runId/cancel", async (_req, res, params) => {
    if (!store.run(params.runId)) throw new HttpError(404, "Execução não encontrada.");
    brain.cancel(params.runId); sendJson(res, 200, { run: store.run(params.runId) });
  });
  route("GET", "/brain/runs/:runId/events", async (_req, res, params, query) => {
    if (!store.run(params.runId)) throw new HttpError(404, "Execução não encontrada.");
    sendJson(res, 200, { events: store.events(params.runId, Number(query.get("after")) || 0) });
  });
  route("GET", "/brain/memory", async (_req, res, _params, query) => {
    sendJson(res, 200, { memories: store.memories(query.get("scope") || "personal", query.get("q") || "") });
  });
  route("POST", "/brain/memory", async (req, res) => {
    const body = await readJsonBody(req) as { text?: string; scope?: string; id?: string };
    if (!body.text || body.text.length > 4000) throw new HttpError(400, "Memória deve conter de 1 a 4000 caracteres.");
    const scope = body.scope || "personal";
    if (scope !== "personal" && !(await orchestrator.getProject(scope))) throw new HttpError(404, "Escopo de projeto inválido.");
    sendJson(res, 201, { memory: store.remember(scope, body.text, "user-confirmed", body.id) });
  });
  route("POST", "/brain/memory/:memoryId/forget", async (req, res, params) => {
    const body = await readJsonBody(req) as { scope?: string };
    sendJson(res, 200, { deleted: store.forget(body.scope || "personal", params.memoryId) });
  });
  route("GET", "/providers/capabilities", async (_req, res) => {
    const manager = new RuntimeManager();
    const apis = await Promise.all((["openai", "anthropic", "grok"] as const).map(async name => ({ name, configured: await manager.create(name).status(), mode: "api", coding: false })));
    sendJson(res, 200, { defaultRuntime: manager.defaultName(), providers: [
      { name: "codex", mode: "cli", coding: true }, { name: "claude", mode: "cli", coding: true },
      { name: "pi", mode: "runtime", coding: true, configured: await manager.create("pi").status() }, ...apis
    ] });
  });

  // =========================================================
  // HEALTH
  // =========================================================

  route(
    "GET",
    "/health",
    async (_req, res) => {
      sendJson(res, 200, {
        status: "ok",
      });
    }
  );

  // =========================================================
  // CHIEF (chat central, cross-project)
  // =========================================================

  route(
    "POST",
    "/chief/ask",
    async (req, res) => {
      const body =
        (await readJsonBody(
          req
        )) as {
          message?: string;
          provider?: RuntimeName;
          model?: string;
        };

      if (!body.message) {
        sendJson(res, 400, {
          error:
            "Campo obrigatório: message",
        });

        return;
      }

      const response =
        await orchestrator.talkToChief(
          body.message,
          {
            provider:
              body.provider,
            model: body.model,
          }
        );

      sendJson(res, 200, {
        response,
      });
    }
  );

  // =========================================================
  // FILESYSTEM (para o fluxo de importar projeto de uma pasta)
  // =========================================================

  route(
    "GET",
    "/fs/browse",
    async (
      _req,
      res,
      _params,
      query
    ) => {
      const requestedPath =
        query.get("path") ??
        undefined;

      const result =
        await filesystemBrowser.browse(
          requestedPath
        );

      sendJson(res, 200, result);
    }
  );

  // =========================================================
  // IMPORTAR PROJETO
  // =========================================================

  route(
    "POST",
    "/projects/import/local",
    async (req, res) => {
      const body =
        (await readJsonBody(
          req
        )) as {
          path?: string;
          name?: string;
        };

      if (!body.path) {
        sendJson(res, 400, {
          error:
            "Campo obrigatório: path",
        });

        return;
      }

      const project =
        await orchestrator.importLocalProject(
          {
            path: body.path,
            name: body.name,
          }
        );

      sendJson(res, 201, {
        project,
      });
    }
  );

  route(
    "POST",
    "/projects/import/github",
    async (req, res) => {
      const body =
        (await readJsonBody(
          req
        )) as {
          url?: string;
          name?: string;
        };

      if (!body.url) {
        sendJson(res, 400, {
          error:
            "Campo obrigatório: url",
        });

        return;
      }

      const project =
        await orchestrator.importGithubProject(
          {
            url: body.url,
            name: body.name,
          }
        );

      sendJson(res, 201, {
        project,
      });
    }
  );

  // =========================================================
  // PROJETOS
  // =========================================================

  route(
    "POST",
    "/projects",
    async (req, res) => {
      const body =
        (await readJsonBody(
          req
        )) as { name?: string };

      if (!body.name) {
        sendJson(res, 400, {
          error:
            "Campo obrigatório: name",
        });

        return;
      }

      const project =
        await orchestrator.createProject(
          body.name
        );

      sendJson(res, 201, {
        project,
      });
    }
  );

  route(
    "GET",
    "/projects",
    async (_req, res) => {
      const projects =
        await orchestrator.listProjects();

      sendJson(res, 200, {
        projects,
      });
    }
  );

  route(
    "GET",
    "/projects/:id",
    async (_req, res, params) => {
      const project =
        await orchestrator.getProject(
          params.id
        );

      if (!project) {
        sendJson(res, 404, {
          error: `Projeto ${params.id} não encontrado.`,
        });

        return;
      }

      sendJson(res, 200, {
        project,
      });
    }
  );

  // =========================================================
  // PLANO / TAREFAS
  // =========================================================

  route(
    "GET",
    "/projects/:id/plan",
    async (_req, res, params) => {
      const plan =
        await orchestrator.getTasks(
          params.id
        );

      if (!plan) {
        sendJson(res, 404, {
          error: `Nenhum plano encontrado para ${params.id}.`,
        });

        return;
      }

      sendJson(res, 200, {
        plan,
      });
    }
  );

  route(
    "POST",
    "/projects/:id/plan",
    async (req, res, params) => {
      const body =
        (await readJsonBody(
          req
        )) as {
          objective?: string;
          provider?: RuntimeName;
          model?: string;
        };

      if (!body.objective) {
        sendJson(res, 400, {
          error:
            "Campo obrigatório: objective",
        });

        return;
      }

      const plan =
        await orchestrator.createPlan(
          params.id,
          body.objective,
          {
            provider:
              body.provider,
            model: body.model,
          }
        );

      sendJson(res, 201, {
        plan,
      });
    }
  );

  route(
    "POST",
    "/projects/:id/tasks/:taskId/execute",
    async (req, res, params) => {
      const body =
        (await readJsonBody(
          req
        )) as {
          provider?: RuntimeName;
          model?: string;
        };

      const execution =
        await orchestrator.executeTask(
          params.id,
          params.taskId,
          {
            provider:
              body.provider,
            model: body.model,
          }
        );

      sendJson(res, 200, {
        execution,
      });
    }
  );

  route(
    "POST",
    "/projects/:id/tasks/:taskId/correct",
    async (req, res, params) => {
      const body =
        (await readJsonBody(
          req
        )) as {
          provider?: RuntimeName;
          model?: string;
        };

      const execution =
        await orchestrator.correctTask(
          params.id,
          params.taskId,
          {
            provider:
              body.provider,
            model: body.model,
          }
        );

      sendJson(res, 200, {
        execution,
      });
    }
  );

  route("POST", "/projects/:id/tasks/:taskId/retry", async (_req, res, params) => {
    sendJson(res, 200, { plan: await orchestrator.retryTask(params.id, params.taskId) });
  });

  // =========================================================
  // JOBS
  // =========================================================

  route(
    "POST",
    "/projects/:id/jobs",
    async (req, res, params) => {
      if (!(await orchestrator.getProject(params.id))) throw new HttpError(404, "Projeto não encontrado.");
      if (!(await orchestrator.getTasks(params.id))) throw new HttpError(409, "Crie e revise um plano antes de executar.");
      const selection = parseSelection(await readJsonBody(req));
      if (["grok", "openai", "anthropic"].includes(selection.provider || new RuntimeManager().defaultName())) throw new HttpError(400, "Execução de código exige Pi, Codex ou Claude Code.");
      const job =
        await jobManager.start(
          params.id, selection
        );

      sendJson(res, 202, {
        job,
      });
    }
  );

  route(
    "GET",
    "/jobs",
    async (
      _req,
      res,
      _params,
      query
    ) => {
      const projectId =
        query.get(
          "projectId"
        ) ?? undefined;

      const jobs =
        await jobManager.list(
          projectId
        );

      sendJson(res, 200, {
        jobs,
      });
    }
  );

  route(
    "GET",
    "/jobs/:jobId",
    async (_req, res, params) => {
      await jobManager.reconcile();

      const job =
        await jobManager.get(
          params.jobId
        );

      if (!job) {
        sendJson(res, 404, {
          error: `Job ${params.jobId} não encontrado.`,
        });

        return;
      }

      sendJson(res, 200, {
        job,
      });
    }
  );

  route("POST", "/jobs/:jobId/cancel", async (_req, res, params) => {
    if (!(await jobManager.get(params.jobId))) throw new HttpError(404, "Job não encontrado.");
    sendJson(res, 200, { job: await jobManager.cancel(params.jobId) });
  });

  route(
    "GET",
    "/jobs/:jobId/logs",
    async (_req, res, params) => {
      const log =
        await jobManager.readLog(
          params.jobId
        );

      res.writeHead(200, {
        "Content-Type":
          "text/plain; charset=utf-8",
      });

      res.end(log);
    }
  );

  // =========================================================
  // EVENTOS
  // =========================================================

  route(
    "GET",
    "/projects/:id/events",
    async (
      _req,
      res,
      params,
      query
    ) => {
      const since =
        query.get("since") ??
        undefined;

      const limitParam =
        query.get("limit");

      const events =
        await eventBus.list(
          params.id,
          {
            since,
            limit: limitParam
              ? Number(
                  limitParam
                )
              : undefined,
          }
        );

      sendJson(res, 200, {
        events,
      });
    }
  );

  // =========================================================
  // MEMÓRIA
  // =========================================================

  route(
    "GET",
    "/projects/:id/memory",
    async (_req, res, params) => {
      const project =
        await orchestrator.getProject(
          params.id
        );

      if (!project) {
        sendJson(res, 404, {
          error: `Projeto ${params.id} não encontrado.`,
        });

        return;
      }

      const context =
        await projectMemory.readContext(
          project.path
        );

      sendJson(res, 200, {
        context,
      });
    }
  );

  // =========================================================
  // AGENTES
  // =========================================================

  route(
    "GET",
    "/agents",
    async (_req, res) => {
      const agentsDir = path.join(
        process.cwd(),
        "agents"
      );

      let roleDirs: string[] = [];

      try {
        roleDirs = (
          await readdir(
            agentsDir,
            {
              withFileTypes: true,
            }
          )
        )
          .filter((entry) =>
            entry.isDirectory()
          )
          .map(
            (entry) => entry.name
          );
      } catch {
        roleDirs = [];
      }

      const agents =
        await Promise.all(
          roleDirs.map(
            async (role) => {
              try {
                const content =
                  await readFile(
                    path.join(
                      agentsDir,
                      role,
                      "AGENT.md"
                    ),
                    "utf8"
                  );

                const firstLine =
                  content
                    .split("\n")
                    .find(
                      (line) =>
                        line.trim()
                          .length >
                        0
                    ) ?? "";

                return {
                  role,
                  summary:
                    firstLine.replace(
                      /^#+\s*/,
                      ""
                    ),
                };
              } catch {
                return {
                  role,
                  summary: "",
                };
              }
            }
          )
        );

      sendJson(res, 200, {
        agents,
      });
    }
  );

  // =========================================================
  // PROVEDORES (status e login das assinaturas Codex/Claude)
  // =========================================================

  function isKnownProvider(
    value: string
  ): value is AuthProviderName {
    return (
      value === "codex" ||
      value === "claude"
    );
  }

  route(
    "GET",
    "/providers/status",
    async (_req, res) => {
      const providers =
        await providerAuthManager.status();

      sendJson(res, 200, {
        providers,
      });
    }
  );

  route(
    "POST",
    "/providers/:provider/login",
    async (_req, res, params) => {
      if (
        !isKnownProvider(
          params.provider
        )
      ) {
        sendJson(res, 400, {
          error: `Provedor desconhecido: ${params.provider}`,
        });

        return;
      }

      const session =
        await providerAuthManager.startLogin(
          params.provider
        );

      sendJson(res, 202, {
        session,
      });
    }
  );

  route("POST", "/providers/:provider/login/cancel", async (_req, res, params) => {
    if (!isKnownProvider(params.provider)) throw new HttpError(400, "Provedor desconhecido.");
    sendJson(res, 200, { session: providerAuthManager.cancelLogin(params.provider) });
  });

  route(
    "GET",
    "/providers/:provider/login",
    async (_req, res, params) => {
      if (
        !isKnownProvider(
          params.provider
        )
      ) {
        sendJson(res, 400, {
          error: `Provedor desconhecido: ${params.provider}`,
        });

        return;
      }

      const session =
        providerAuthManager.getSession(
          params.provider
        );

      if (!session) {
        sendJson(res, 404, {
          error:
            "Nenhuma tentativa de login em andamento para este provedor.",
        });

        return;
      }

      sendJson(res, 200, {
        session,
      });
    }
  );

  const server = createServer(
    async (req, res) => {
      const allowedOrigin =
        resolveAllowedOrigin(req);

      if (allowedOrigin) {
        res.setHeader(
          "Access-Control-Allow-Origin",
          allowedOrigin
        );

        res.setHeader(
          "Vary",
          "Origin"
        );
      }

      try {
        if (
          req.method === "OPTIONS"
        ) {
          res.writeHead(
            204,
            allowedOrigin
              ? {
                  "Access-Control-Allow-Methods":
                    "GET,POST,OPTIONS",
                  "Access-Control-Allow-Headers":
                    "Content-Type, Authorization",
                }
              : {}
          );

          res.end();
          return;
        }

        const url = new URL(
          req.url ?? "/",
          "http://localhost"
        );

        const method =
          req.method ?? "GET";
        const token = process.env.SENIOR_GATEWAY_TOKEN;
        if (url.pathname !== "/health") {
          if (token) {
            const supplied = req.headers.authorization || "";
            const expected = `Bearer ${token}`;
            if (Buffer.byteLength(supplied) !== Buffer.byteLength(expected) || !timingSafeEqual(Buffer.from(supplied), Buffer.from(expected))) throw new HttpError(401, "Autenticação necessária.");
          } else {
            const remote = req.socket.remoteAddress;
            if (!["127.0.0.1", "::1", "::ffff:127.0.0.1"].includes(remote || "")) throw new HttpError(403, "Configure autenticação para acesso remoto.");
          }
        }


        for (const candidate of routes) {
          if (
            candidate.method !==
            method
          ) {
            continue;
          }

          const match =
            candidate.pattern.exec(
              url.pathname
            );

          if (!match) {
            continue;
          }

          const params: Record<
            string,
            string
          > = {};

          candidate.paramNames.forEach(
            (name, index) => {
              params[name] =
                decodeURIComponent(match[index + 1]);
            }
          );

          for (const [name, value] of Object.entries(params)) {
            if (!/^[a-zA-Z0-9_-]{1,120}$/.test(value)) throw new HttpError(400, `Identificador inválido: ${name}`);
          }

          if (process.env.NODE_ENV === "production" && process.env.SENIOR_ENABLE_CODE_EXECUTION !== "true" &&
              (url.pathname.endsWith("/execute") || url.pathname.endsWith("/correct") || (method === "POST" && url.pathname.endsWith("/jobs")))) {
            throw new HttpError(403, "Execução de código ainda desabilitada neste servidor. Configure um ambiente de execução isolado antes de habilitar.");
          }

          await candidate.handler(
            req,
            res,
            params,
            url.searchParams
          );

          return;
        }

        sendJson(res, 404, {
          error: `Rota não encontrada: ${method} ${url.pathname}`,
        });
      } catch (error) {
        if (
          error instanceof HttpError
        ) {
          sendJson(
            res,
            error.status,
            { error: error.message }
          );

          return;
        }

        const message =
          error instanceof Error
            ? error.message
            : String(error);

        sendJson(res, 500, {
          error: message,
        });
      }
    }
  );
  server.on("close", () => { clearInterval(worker); brain.stop(); providerAuthManager.dispose(); void work.finally(() => store.close()); });
  return server;
}

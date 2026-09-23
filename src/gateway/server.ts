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
  jobManager?: JobManager;
  eventBus?: EventBus;
  projectMemory?: ProjectMemory;
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

async function readJsonBody(
  req: IncomingMessage
): Promise<unknown> {
  const chunks: Buffer[] = [];

  for await (const chunk of req) {
    chunks.push(chunk as Buffer);
  }

  if (chunks.length === 0) {
    return {};
  }

  const raw = Buffer.concat(
    chunks
  ).toString("utf8");

  if (!raw.trim()) {
    return {};
  }

  return JSON.parse(raw);
}

function sendJson(
  res: ServerResponse,
  status: number,
  body: unknown
): void {
  res.writeHead(status, {
    "Content-Type":
      "application/json",
    "Access-Control-Allow-Origin":
      "*",
  });

  res.end(JSON.stringify(body));
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
          body.objective
        );

      sendJson(res, 201, {
        plan,
      });
    }
  );

  route(
    "POST",
    "/projects/:id/tasks/:taskId/execute",
    async (_req, res, params) => {
      const execution =
        await orchestrator.executeTask(
          params.id,
          params.taskId
        );

      sendJson(res, 200, {
        execution,
      });
    }
  );

  route(
    "POST",
    "/projects/:id/tasks/:taskId/correct",
    async (_req, res, params) => {
      const execution =
        await orchestrator.correctTask(
          params.id,
          params.taskId
        );

      sendJson(res, 200, {
        execution,
      });
    }
  );

  // =========================================================
  // JOBS
  // =========================================================

  route(
    "POST",
    "/projects/:id/jobs",
    async (_req, res, params) => {
      const job =
        await jobManager.start(
          params.id
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
        "Access-Control-Allow-Origin":
          "*",
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

  return createServer(
    async (req, res) => {
      try {
        if (
          req.method === "OPTIONS"
        ) {
          res.writeHead(204, {
            "Access-Control-Allow-Origin":
              "*",
            "Access-Control-Allow-Methods":
              "GET,POST,OPTIONS",
            "Access-Control-Allow-Headers":
              "Content-Type",
          });

          res.end();
          return;
        }

        const url = new URL(
          req.url ?? "/",
          "http://localhost"
        );

        const method =
          req.method ?? "GET";

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
                decodeURIComponent(
                  match[
                    index + 1
                  ]
                );
            }
          );

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
}

import { readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";

import type { AddressInfo } from "node:net";

import { createGatewayServer } from "../gateway/server.js";
import { JobManager } from "../core/JobManager.js";

import type { Job } from "../types/Job.js";

async function waitForTerminalStatus(
  baseUrl: string,
  jobId: string,
  timeoutMs = 15_000
): Promise<Job> {
  const start = Date.now();

  while (
    Date.now() - start <
    timeoutMs
  ) {
    const response = await fetch(
      `${baseUrl}/jobs/${jobId}`
    );

    const body =
      (await response.json()) as {
        job?: Job;
      };

    if (
      body.job &&
      body.job.status !==
        "PENDING" &&
      body.job.status !== "RUNNING"
    ) {
      return body.job;
    }

    await new Promise((resolve) =>
      setTimeout(resolve, 100)
    );
  }

  throw new Error(
    `Job ${jobId} não terminou dentro do timeout.`
  );
}

async function cleanupProject(
  projectId: string,
  projectPath: string
): Promise<void> {
  await rm(projectPath, {
    recursive: true,
    force: true,
  });

  await rm(
    path.join(
      process.cwd(),
      "data",
      "projects",
      projectId
    ),
    { recursive: true, force: true }
  );

  await rm(
    path.join(
      process.cwd(),
      "data",
      "events",
      `${projectId}.jsonl`
    ),
    { force: true }
  );

  const projectsFile = path.join(
    process.cwd(),
    "data",
    "projects.json"
  );

  try {
    const content =
      await readFile(
        projectsFile,
        "utf8"
      );

    const projects =
      JSON.parse(content) as Array<{
        id: string;
      }>;

    const remaining =
      projects.filter(
        (project) =>
          project.id !== projectId
      );

    await writeFile(
      projectsFile,
      JSON.stringify(
        remaining,
        null,
        2
      ),
      "utf8"
    );
  } catch {
    // Sem projects.json para limpar.
  }
}

async function main() {
  console.log(
    "\n=== SENIOR GATEWAY (API HTTP) ===\n"
  );

  const jobManager = new JobManager(
    {
      command: process.execPath,
      args: (jobId) => [
        path.join(
          process.cwd(),
          "node_modules",
          "tsx",
          "dist",
          "cli.mjs"
        ),
        path.join(
          "src",
          "tests",
          "fixtures",
          "fake-job-runner.ts"
        ),
        jobId,
      ],
    }
  );

  const server =
    createGatewayServer({
      jobManager,
    });

  await new Promise<void>(
    (resolve) => {
      server.listen(0, resolve);
    }
  );

  const address =
    server.address() as AddressInfo;

  const baseUrl = `http://127.0.0.1:${address.port}`;

  let projectId: string | null =
    null;
  let projectPath: string | null =
    null;

  try {
    // -------------------------------------------------------
    // POST /projects
    // -------------------------------------------------------

    const createResponse =
      await fetch(
        `${baseUrl}/projects`,
        {
          method: "POST",
          headers: {
            "Content-Type":
              "application/json",
          },
          body: JSON.stringify({
            name: `gateway-test-${Date.now()}`,
          }),
        }
      );

    if (
      createResponse.status !== 201
    ) {
      throw new Error(
        `POST /projects deveria retornar 201, retornou ${createResponse.status}`
      );
    }

    const created =
      (await createResponse.json()) as {
        project: {
          id: string;
          path: string;
        };
      };

    projectId = created.project.id;
    projectPath =
      created.project.path;

    console.log(
      "OK: POST /projects cria o projeto e retorna 201."
    );

    // -------------------------------------------------------
    // GET /projects
    // -------------------------------------------------------

    const listResponse =
      await fetch(
        `${baseUrl}/projects`
      );

    const listed =
      (await listResponse.json()) as {
        projects: Array<{
          id: string;
        }>;
      };

    if (
      !listed.projects.some(
        (project) =>
          project.id === projectId
      )
    ) {
      throw new Error(
        "GET /projects não retornou o projeto criado."
      );
    }

    console.log(
      "OK: GET /projects lista o projeto criado."
    );

    // -------------------------------------------------------
    // GET /projects/:id (404 e 200)
    // -------------------------------------------------------

    const notFound = await fetch(
      `${baseUrl}/projects/projeto-que-nao-existe`
    );

    if (notFound.status !== 404) {
      throw new Error(
        `Esperado 404 para projeto inexistente, obtido ${notFound.status}`
      );
    }

    const getResponse = await fetch(
      `${baseUrl}/projects/${projectId}`
    );

    if (getResponse.status !== 200) {
      throw new Error(
        `GET /projects/:id deveria retornar 200, retornou ${getResponse.status}`
      );
    }

    console.log(
      "OK: GET /projects/:id retorna 404 para inexistente e 200 para existente."
    );

    // -------------------------------------------------------
    // GET /projects/:id/events — já deve ter project.created
    // -------------------------------------------------------

    const eventsResponse =
      await fetch(
        `${baseUrl}/projects/${projectId}/events`
      );

    const eventsBody =
      (await eventsResponse.json()) as {
        events: Array<{
          type: string;
        }>;
      };

    if (
      !eventsBody.events.some(
        (event) =>
          event.type ===
          "project.created"
      )
    ) {
      throw new Error(
        `Esperado evento project.created, obtido: ${JSON.stringify(eventsBody.events)}`
      );
    }

    console.log(
      "OK: GET /projects/:id/events reflete o project.created emitido pelo core."
    );

    // -------------------------------------------------------
    // GET /projects/:id/memory
    // -------------------------------------------------------

    const memoryResponse =
      await fetch(
        `${baseUrl}/projects/${projectId}/memory`
      );

    const memoryBody =
      (await memoryResponse.json()) as {
        context: string;
      };

    if (
      !memoryBody.context.includes(
        "PROJECT.md"
      )
    ) {
      throw new Error(
        `Memória do projeto não veio como esperado: ${memoryBody.context}`
      );
    }

    console.log(
      "OK: GET /projects/:id/memory retorna o contexto de .senior/."
    );

    // -------------------------------------------------------
    // GET /agents
    // -------------------------------------------------------

    const agentsResponse =
      await fetch(
        `${baseUrl}/agents`
      );

    const agentsBody =
      (await agentsResponse.json()) as {
        agents: Array<{
          role: string;
        }>;
      };

    if (
      !agentsBody.agents.some(
        (agent) =>
          agent.role === "backend"
      )
    ) {
      throw new Error(
        `Esperado o papel "backend" entre os agentes: ${JSON.stringify(agentsBody.agents)}`
      );
    }

    console.log(
      "OK: GET /agents lista os papéis definidos em agents/."
    );

    // -------------------------------------------------------
    // GET /fs/browse + POST /projects/import/local
    // -------------------------------------------------------

    const os = await import(
      "node:os"
    );

    const {
      mkdtemp: mkdtempFs,
    } = await import(
      "node:fs/promises"
    );

    const externalFolder =
      await mkdtempFs(
        path.join(
          os.tmpdir(),
          "gateway-import-test-"
        )
      );

    const browseResponse =
      await fetch(
        `${baseUrl}/fs/browse?path=${encodeURIComponent(
          path.dirname(
            externalFolder
          )
        )}`
      );

    const browseBody =
      (await browseResponse.json()) as {
        directories: Array<{
          name: string;
        }>;
      };

    if (
      !browseBody.directories.some(
        (entry) =>
          externalFolder.endsWith(
            entry.name
          )
      )
    ) {
      throw new Error(
        `GET /fs/browse não listou a pasta temporária criada: ${JSON.stringify(browseBody.directories)}`
      );
    }

    console.log(
      "OK: GET /fs/browse lista subpastas reais do disco."
    );

    const importResponse =
      await fetch(
        `${baseUrl}/projects/import/local`,
        {
          method: "POST",
          headers: {
            "Content-Type":
              "application/json",
          },
          body: JSON.stringify({
            path: externalFolder,
          }),
        }
      );

    if (
      importResponse.status !== 201
    ) {
      throw new Error(
        `POST /projects/import/local deveria retornar 201, retornou ${importResponse.status}`
      );
    }

    const importedBody =
      (await importResponse.json()) as {
        project: {
          id: string;
          path: string;
        };
      };

    if (
      path.resolve(
        importedBody.project.path
      ) !==
      path.resolve(externalFolder)
    ) {
      throw new Error(
        "Projeto importado não apontou pra pasta externa real."
      );
    }

    console.log(
      "OK: POST /projects/import/local importa uma pasta existente sem copiar."
    );

    await cleanupProject(
      importedBody.project.id,
      externalFolder
    );

    // -------------------------------------------------------
    // POST /projects/:id/jobs + GET /jobs/:jobId (+ logs)
    // -------------------------------------------------------

    const jobResponse = await fetch(
      `${baseUrl}/projects/${projectId}/jobs`,
      { method: "POST" }
    );

    if (jobResponse.status !== 202) {
      throw new Error(
        `POST /projects/:id/jobs deveria retornar 202, retornou ${jobResponse.status}`
      );
    }

    const jobBody =
      (await jobResponse.json()) as {
        job: Job;
      };

    const finishedJob =
      await waitForTerminalStatus(
        baseUrl,
        jobBody.job.id
      );

    if (finishedJob.status !== "DONE") {
      throw new Error(
        `Esperado job DONE via API, obtido ${finishedJob.status}`
      );
    }

    console.log(
      "OK: POST /projects/:id/jobs dispara o job e GET /jobs/:jobId acompanha até concluir."
    );

    const logsResponse = await fetch(
      `${baseUrl}/jobs/${jobBody.job.id}/logs`
    );

    const logsText =
      await logsResponse.text();

    if (
      !logsText.includes(
        "FAKE JOB RUNNER"
      )
    ) {
      throw new Error(
        `GET /jobs/:jobId/logs não trouxe a saída esperada: ${logsText}`
      );
    }

    console.log(
      "OK: GET /jobs/:jobId/logs retorna a saída capturada do job."
    );

    await rm(
      path.join(
        process.cwd(),
        "data",
        "jobs",
        `${jobBody.job.id}.json`
      ),
      { force: true }
    );

    await rm(finishedJob.logFile, {
      force: true,
    });

    console.log(
      "\nGATEWAY FUNCIONANDO."
    );
  } finally {
    await new Promise<void>(
      (resolve, reject) => {
        server.close((error) =>
          error
            ? reject(error)
            : resolve()
        );
      }
    );

    if (projectId && projectPath) {
      await cleanupProject(
        projectId,
        projectPath
      );
    }
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

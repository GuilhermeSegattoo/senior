import {
  mkdir,
  open,
  readdir,
  readFile,
  rename,
  writeFile,
} from "node:fs/promises";

import {
  spawn,
} from "node:child_process";

import { randomUUID } from "node:crypto";
import path from "node:path";

import type {
  Job,
  JobStatus,
} from "../types/Job.js";

export interface JobRunnerCommand {
  command: string;
  args: (jobId: string) => string[];
}

/*
 * Invoca "node <tsx/dist/cli.mjs> <script> <jobId>" diretamente, em
 * vez de "npx tsx ...". No Windows, npx é um shim .cmd que
 * spawn()/child_process não resolve sem shell:true — e shell:true
 * traz um risco real de escaping (Node emite DEP0190 por isso).
 * Invocar o .mjs do tsx diretamente com o binário do node é
 * multiplataforma e não precisa de shell.
 */
const DEFAULT_RUNNER: JobRunnerCommand =
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
        "jobs",
        "runJob.ts"
      ),
      jobId,
    ],
  };

/*
 * Jobs persistentes (seção 15 do SENIOR_MASTER_PLAN.md).
 *
 * start() dispara um processo Node destacado (spawn com
 * detached+unref) que roda Orchestrator.runProject() de forma
 * independente — a CLI/chamador não fica bloqueado e pode até ser
 * fechado que a execução continua. O processo destacado atualiza o
 * próprio registro do job (markRunning/markCompleted/markFailed)
 * conforme progride.
 *
 * Um arquivo por job (em vez de um jobs.json único compartilhado):
 * o processo pai e o processo destacado do job escrevem ao mesmo
 * tempo, e um array único sofria corrupção de leitura/escrita
 * concorrente (JSON.parse em conteúdo parcialmente escrito). Cada
 * job tem seu próprio arquivo, e toda escrita é atômica via
 * write-then-rename — um leitor nunca vê um arquivo pela metade.
 *
 * "Recuperar após falhas": reconcile() detecta jobs marcados como
 * RUNNING cujo processo (pid) não existe mais — o processo morreu
 * sem conseguir marcar o resultado final (crash, kill -9, etc.) — e
 * os marca como FAILED com um motivo claro, em vez de deixá-los
 * presos em RUNNING para sempre.
 */
export class JobManager {
  private readonly dataDir = path.join(
    process.cwd(),
    "data"
  );

  private readonly jobsDir = path.join(
    this.dataDir,
    "jobs"
  );

  private readonly logsDir = path.join(
    this.jobsDir,
    "logs"
  );

  constructor(
    private readonly runner: JobRunnerCommand = DEFAULT_RUNNER
  ) {}

  async start(
    projectId: string
  ): Promise<Job> {
    await this.ensureStructure();

    const id = randomUUID();

    const job: Job = {
      id,
      projectId,
      status: "PENDING",
      createdAt:
        new Date().toISOString(),
      logFile: path.join(
        this.logsDir,
        `${id}.log`
      ),
    };

    await this.writeJob(job);

    const logHandle =
      await open(
        job.logFile,
        "a"
      );

    const child = spawn(
      this.runner.command,
      this.runner.args(job.id),
      {
        cwd: process.cwd(),
        detached: true,
        stdio: [
          "ignore",
          logHandle.fd,
          logHandle.fd,
        ],
      }
    );

    /*
     * Sem este handler, uma falha ao iniciar o processo (binário
     * ausente, permissão negada) derruba quem chamou start() com um
     * "Unhandled 'error' event" em vez de simplesmente marcar o job
     * como FAILED.
     */
    child.on(
      "error",
      (error) => {
        void this.markFailed(
          job.id,
          `Falha ao iniciar o processo do job: ${error.message}`
        );
      }
    );

    child.unref();

    await logHandle.close();

    return job;
  }

  async get(
    jobId: string
  ): Promise<Job | null> {
    try {
      const content =
        await readFile(
          this.jobFile(jobId),
          "utf8"
        );

      return JSON.parse(
        content
      ) as Job;
    } catch (error) {
      const nodeError =
        error as NodeJS.ErrnoException;

      if (
        nodeError.code === "ENOENT"
      ) {
        return null;
      }

      throw error;
    }
  }

  async list(
    projectId?: string
  ): Promise<Job[]> {
    await this.ensureStructure();

    let fileNames: string[];

    try {
      fileNames = (
        await readdir(this.jobsDir)
      ).filter((name) =>
        name.endsWith(".json")
      );
    } catch {
      fileNames = [];
    }

    const jobs = (
      await Promise.all(
        fileNames.map((name) =>
          this.get(
            path.basename(
              name,
              ".json"
            )
          )
        )
      )
    ).filter(
      (job): job is Job =>
        job !== null
    );

    const filtered = projectId
      ? jobs.filter(
          (job) =>
            job.projectId ===
            projectId
        )
      : jobs;

    return filtered.sort(
      (a, b) =>
        b.createdAt.localeCompare(
          a.createdAt
        )
    );
  }

  async markRunning(
    jobId: string,
    pid: number
  ): Promise<Job> {
    return this.update(
      jobId,
      (job) => {
        job.status = "RUNNING";
        job.pid = pid;
        job.startedAt =
          new Date().toISOString();
      }
    );
  }

  async markCompleted(
    jobId: string,
    result: {
      status: JobStatus;
      [key: string]: unknown;
    }
  ): Promise<Job> {
    return this.update(
      jobId,
      (job) => {
        job.status = result.status;
        job.result = result;
        job.completedAt =
          new Date().toISOString();
      }
    );
  }

  async markFailed(
    jobId: string,
    error: string
  ): Promise<Job> {
    return this.update(
      jobId,
      (job) => {
        job.status = "FAILED";
        job.error = error;
        job.completedAt =
          new Date().toISOString();
      }
    );
  }

  async readLog(
    jobId: string
  ): Promise<string> {
    const job = await this.get(
      jobId
    );

    if (!job) {
      throw new Error(
        `Job ${jobId} não encontrado.`
      );
    }

    try {
      return await readFile(
        job.logFile,
        "utf8"
      );
    } catch {
      return "";
    }
  }

  /*
   * Detecta jobs presos em RUNNING cujo processo já morreu (crash,
   * reinício da máquina, kill externo) e os marca como FAILED com
   * um motivo explícito, em vez de deixá-los "rodando" para sempre.
   */
  async reconcile(): Promise<
    Job[]
  > {
    const jobs = await this.list();

    const stale = jobs.filter(
      (job) =>
        job.status === "RUNNING" &&
        !this.isAlive(job.pid)
    );

    for (const job of stale) {
      await this.update(
        job.id,
        (target) => {
          target.status = "FAILED";
          target.error =
            "Processo do job não está mais em execução (encerrado inesperadamente).";
          target.completedAt =
            new Date().toISOString();
        }
      );
    }

    return stale;
  }

  private isAlive(
    pid?: number
  ): boolean {
    if (!pid) {
      return false;
    }

    try {
      // Sinal 0: não mata o processo, só verifica se existe.
      process.kill(pid, 0);
      return true;
    } catch {
      return false;
    }
  }

  private async update(
    jobId: string,
    mutate: (job: Job) => void
  ): Promise<Job> {
    const job = await this.get(
      jobId
    );

    if (!job) {
      throw new Error(
        `Job ${jobId} não encontrado.`
      );
    }

    mutate(job);

    await this.writeJob(job);

    return job;
  }

  private jobFile(
    jobId: string
  ): string {
    return path.join(
      this.jobsDir,
      `${jobId}.json`
    );
  }

  private async ensureStructure(): Promise<void> {
    await mkdir(this.jobsDir, {
      recursive: true,
    });

    await mkdir(this.logsDir, {
      recursive: true,
    });
  }

  /*
   * Escrita atômica: grava num arquivo temporário e renomeia por
   * cima do destino. rename() é atômico no mesmo filesystem — um
   * leitor concorrente sempre vê a versão antiga completa ou a
   * versão nova completa, nunca um JSON pela metade.
   */
  private async writeJob(
    job: Job
  ): Promise<void> {
    await this.ensureStructure();

    const finalPath = this.jobFile(
      job.id
    );

    const tmpPath = `${finalPath}.tmp-${randomUUID()}`;

    await writeFile(
      tmpPath,
      JSON.stringify(job, null, 2),
      "utf8"
    );

    await rename(
      tmpPath,
      finalPath
    );
  }
}

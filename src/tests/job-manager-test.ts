import { rm } from "node:fs/promises";

import path from "node:path";

import { JobManager } from "../core/JobManager.js";

import type { Job } from "../types/Job.js";

async function waitForTerminalStatus(
  jobManager: JobManager,
  jobId: string,
  timeoutMs = 15_000
): Promise<Job> {
  const start = Date.now();

  while (
    Date.now() - start <
    timeoutMs
  ) {
    const job = await jobManager.get(
      jobId
    );

    if (
      job &&
      job.status !== "PENDING" &&
      job.status !== "RUNNING"
    ) {
      return job;
    }

    await new Promise((resolve) =>
      setTimeout(resolve, 100)
    );
  }

  throw new Error(
    `Job ${jobId} não terminou dentro do timeout.`
  );
}

async function removeJobRecord(
  jobId: string
): Promise<void> {
  await rm(
    path.join(
      process.cwd(),
      "data",
      "jobs",
      `${jobId}.json`
    ),
    { force: true }
  );
}

async function main() {
  console.log(
    "\n=== SENIOR JOB MANAGER ===\n"
  );

  const tsxCli = path.join(
    process.cwd(),
    "node_modules",
    "tsx",
    "dist",
    "cli.mjs"
  );

  const jobManager = new JobManager(
    {
      command: process.execPath,
      args: (jobId) => [
        tsxCli,
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

  const job = await jobManager.start(
    "job-manager-test-project"
  );

  try {
    if (job.status !== "PENDING") {
      throw new Error(
        `Job deveria nascer PENDING, veio ${job.status}`
      );
    }

    console.log(
      "OK: start() cria o job como PENDING e retorna imediatamente."
    );

    const finished =
      await waitForTerminalStatus(
        jobManager,
        job.id
      );

    if (finished.status !== "DONE") {
      throw new Error(
        `Esperado DONE, obtido ${finished.status}. Erro: ${finished.error}`
      );
    }

    if (!finished.pid) {
      throw new Error(
        "Job concluído sem pid registrado."
      );
    }

    if (
      !finished.result ||
      (
        finished.result as {
          status?: string;
        }
      ).status !== "DONE"
    ) {
      throw new Error(
        `Resultado do job incorreto: ${JSON.stringify(finished.result)}`
      );
    }

    console.log(
      "OK: processo destacado roda de forma independente e persiste o resultado."
    );

    const log =
      await jobManager.readLog(
        job.id
      );

    if (
      !log.includes(
        "FAKE JOB RUNNER"
      )
    ) {
      throw new Error(
        `Log do job não capturou a saída esperada: ${log}`
      );
    }

    console.log(
      "OK: saída do processo destacado é capturada no arquivo de log."
    );

    const listed =
      await jobManager.list(
        "job-manager-test-project"
      );

    if (
      !listed.some(
        (item) => item.id === job.id
      )
    ) {
      throw new Error(
        "list() não encontrou o job criado."
      );
    }

    console.log(
      "OK: list() encontra o job pelo projectId."
    );

    // -------------------------------------------------------
    // reconcile(): job preso em RUNNING com pid morto -> FAILED.
    // -------------------------------------------------------

    const staleJob =
      await jobManager.start(
        "job-manager-test-project"
      );

    await jobManager.markRunning(
      staleJob.id,
      999_999_999
    );

    const reconciled =
      await jobManager.reconcile();

    if (
      !reconciled.some(
        (item) =>
          item.id === staleJob.id
      )
    ) {
      throw new Error(
        "reconcile() não detectou o job travado."
      );
    }

    const afterReconcile =
      await jobManager.get(
        staleJob.id
      );

    if (
      afterReconcile?.status !==
      "FAILED"
    ) {
      throw new Error(
        `Job travado deveria virar FAILED, está ${afterReconcile?.status}`
      );
    }

    console.log(
      "OK: reconcile() marca como FAILED jobs cujo processo morreu sem concluir."
    );

    await removeJobRecord(
      staleJob.id
    );

    await rm(staleJob.logFile, {
      force: true,
    });

    // -------------------------------------------------------
    // start() não deve derrubar quem chamou se o processo nem
    // conseguir iniciar (binário inexistente, etc.).
    // -------------------------------------------------------

    const brokenJobManager =
      new JobManager({
        command:
          "senior-comando-que-nao-existe-xyz",
        args: () => [],
      });

    const brokenJob =
      await brokenJobManager.start(
        "job-manager-test-project"
      );

    const brokenFinished =
      await waitForTerminalStatus(
        brokenJobManager,
        brokenJob.id
      );

    if (
      brokenFinished.status !==
      "FAILED"
    ) {
      throw new Error(
        `Esperado FAILED para comando inexistente, obtido ${brokenFinished.status}`
      );
    }

    console.log(
      "OK: falha ao iniciar o processo não derruba o chamador — o job vira FAILED."
    );

    await removeJobRecord(
      brokenJob.id
    );

    await rm(brokenJob.logFile, {
      force: true,
    });

    console.log(
      "\nJOB MANAGER FUNCIONANDO."
    );
  } finally {
    await removeJobRecord(job.id);

    await rm(job.logFile, {
      force: true,
    });
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

import { JobManager } from "../core/JobManager.js";
import { Orchestrator } from "../core/Orchestrator.js";

/*
 * Executado dentro do processo destacado criado por
 * JobManager.start(). Roda de forma independente da CLI que criou
 * o job — pode continuar mesmo que o terminal que chamou "job
 * start" seja fechado.
 */
async function main() {
  const jobId = process.argv[2];

  if (!jobId) {
    console.error(
      "Uso: runJob <jobId>"
    );

    process.exitCode = 1;
    return;
  }

  const jobManager =
    new JobManager();

  const job = await jobManager.get(
    jobId
  );

  if (!job) {
    console.error(
      `Job ${jobId} não encontrado.`
    );

    process.exitCode = 1;
    return;
  }

  await jobManager.markRunning(
    jobId,
    process.pid
  );

  console.log(
    `[JOB ${jobId}] iniciado para o projeto ${job.projectId} (pid ${process.pid})`
  );

  try {
    const orchestrator =
      new Orchestrator();

    const result =
      await orchestrator.runProject(
        job.projectId
      );

    await jobManager.markCompleted(
      jobId,
      result
    );

    console.log(
      `[JOB ${jobId}] concluído com status ${result.status}`
    );
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : String(error);

    await jobManager.markFailed(
      jobId,
      message
    );

    console.error(
      `[JOB ${jobId}] falhou: ${message}`
    );

    process.exitCode = 1;
  }
}

main();

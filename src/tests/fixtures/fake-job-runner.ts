import { JobManager } from "../../core/JobManager.js";

/*
 * Dublê de runJob.ts usado só em teste: prova que o mecanismo de
 * jobs (spawn destacado, captura de log, persistência de status)
 * funciona de ponta a ponta, sem precisar rodar o Orchestrator real
 * (o que exigiria um provedor de LLM configurado).
 */
async function main() {
  const jobId = process.argv[2];

  const jobManager =
    new JobManager();

  console.log(
    `[FAKE JOB RUNNER] iniciando ${jobId}`
  );

  await jobManager.markRunning(
    jobId,
    process.pid
  );

  await new Promise((resolve) =>
    setTimeout(resolve, 300)
  );

  await jobManager.markCompleted(
    jobId,
    {
      status: "DONE",
      executions: [],
    }
  );

  console.log(
    `[FAKE JOB RUNNER] concluído ${jobId}`
  );
}

main();

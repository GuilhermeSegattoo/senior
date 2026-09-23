import { Orchestrator } from "../core/Orchestrator.js";
import { JobManager } from "../core/JobManager.js";

const senior = new Orchestrator();
const jobManager = new JobManager();

const nomesAgentes: Record<string, string> = {
  architect: "ARQUITETO",
  frontend: "FRONTEND",
  backend: "BACKEND",
  reviewer: "REVISOR",
  qa: "QA",
  devops: "DEVOPS",
};

const nomesStatus: Record<string, string> = {
  WAITING: "AGUARDANDO",
  READY: "PRONTA",
  RUNNING: "EM EXECUÇÃO",
  VALIDATING: "VALIDANDO",
  CORRECTION_REQUIRED: "AGUARDANDO CORREÇÃO",
  VALIDATED: "VALIDADA",
  DONE: "CONCLUÍDA",
  FAILED: "FALHOU",
  BLOCKED: "BLOQUEADA (PRECISA DE HUMANO)",
};

async function main() {
  const [command, ...args] =
    process.argv.slice(2);

  // =========================================================
  // STATUS
  // =========================================================

  if (command === "status") {
    const status =
      await senior.status();

    console.log("\nSENIOR");
    console.log("--------------------------------");

    console.log(
      `Codex: ${
        status.codex
          ? "ONLINE"
          : "OFFLINE"
      }`
    );

    if (status.github.connected) {
      console.log(
        "GitHub: CONECTADO"
      );

      console.log(
        `Conta: ${status.github.username}`
      );
    } else {
      console.log(
        "GitHub: DESCONECTADO"
      );
    }

    console.log(
      "Líder: ONLINE"
    );

    console.log(
      "--------------------------------\n"
    );

    return;
  }

  // =========================================================
  // GITHUB
  // =========================================================

  if (
    command === "github" &&
    args[0] === "status"
  ) {
    const github =
      await senior.githubStatus();

    console.log("\nGITHUB");
    console.log("--------------------------------");

    if (!github.connected) {
      console.log(
        "Status: DESCONECTADO"
      );

      console.log(
        "--------------------------------\n"
      );

      return;
    }

    console.log(
      "Status: CONECTADO"
    );

    console.log(
      `Conta: ${github.username}`
    );

    console.log(
      "--------------------------------\n"
    );

    return;
  }

  // =========================================================
  // CRIAR PROJETO
  // =========================================================

  if (
    command === "projeto" &&
    args[0] === "criar"
  ) {
    const name =
      args.slice(1).join(" ");

    if (!name) {
      console.error(
        'Uso: senior projeto criar "Nome do projeto"'
      );

      process.exit(1);
    }

    const project =
      await senior.createProject(
        name
      );

    console.log(
      "\nPROJETO CRIADO"
    );

    console.log(
      "--------------------------------"
    );

    console.log(
      `Nome: ${project.name}`
    );

    console.log(
      `ID: ${project.id}`
    );

    console.log(
      `Workspace: ${project.path}`
    );

    console.log(
      "Status: ATIVO"
    );

    if (project.repository) {
      console.log(
        `GitHub: ${project.repository.owner}/${project.repository.name}`
      );
    } else {
      console.log(
        "GitHub: NÃO ASSOCIADO"
      );
    }

    console.log(
      "--------------------------------\n"
    );

    return;
  }

  // =========================================================
  // LISTAR PROJETOS
  // =========================================================

  if (command === "projetos") {
    const projects =
      await senior.listProjects();

    console.log(
      "\nPROJETOS SENIOR"
    );

    console.log(
      "--------------------------------"
    );

    if (
      projects.length === 0
    ) {
      console.log(
        "Nenhum projeto cadastrado."
      );

      console.log(
        "--------------------------------\n"
      );

      return;
    }

    for (
      const project
      of projects
    ) {
      const status =
        project.status ===
        "ACTIVE"
          ? "ATIVO"
          : "ARQUIVADO";

      console.log(
        `\n[${status}] ${project.name}`
      );

      console.log(
        `ID: ${project.id}`
      );

      console.log(
        `Workspace: ${project.path}`
      );

      if (
        project.repository
      ) {
        console.log(
          `GitHub: ${project.repository.owner}/${project.repository.name}`
        );
      } else {
        console.log(
          "GitHub: NÃO ASSOCIADO"
        );
      }
    }

    console.log(
      "\n--------------------------------\n"
    );

    return;
  }

  // =========================================================
  // CRIAR PLANO
  // =========================================================

  if (command === "plan") {
    const projectId =
      args[0];

    const objective =
      args.slice(1).join(" ");

    if (
      !projectId ||
      !objective
    ) {
      console.error(
        'Uso: senior plan <projeto> "<objetivo>"'
      );

      console.error(
        'Exemplo: senior plan auth-api "Criar autenticação"'
      );

      process.exit(1);
    }

    console.log(
      "\nSENIOR está criando o plano...\n"
    );

    console.log(
      `Projeto: ${projectId}\n`
    );

    const plan =
      await senior.createPlan(
        projectId,
        objective
      );

    console.log(
      `Projeto: ${plan.projectId}`
    );

    console.log(
      `Objetivo: ${plan.objective}\n`
    );

    for (
      const task
      of plan.tasks
    ) {
      const agente =
        nomesAgentes[
          task.agent
        ] ??
        task.agent.toUpperCase();

      console.log(
        `[${task.id}] ${agente}`
      );

      console.log(
        `  ${task.task}`
      );

      if (
        task.dependsOn.length >
        0
      ) {
        console.log(
          `  Depende de: ${task.dependsOn.join(", ")}`
        );
      } else {
        console.log(
          "  Pode iniciar imediatamente"
        );
      }

      console.log();
    }

    console.log(
      "Plano salvo com sucesso.\n"
    );

    return;
  }

  // =========================================================
  // LISTAR TAREFAS
  // =========================================================

  if (command === "tarefas") {
    const projectId =
      args[0];

    if (!projectId) {
      console.error(
        "Uso: senior tarefas <projeto>"
      );

      process.exit(1);
    }

    const plan =
      await senior.getTasks(
        projectId
      );

    if (!plan) {
      console.log(
        `\nNenhum plano encontrado para o projeto ${projectId}.\n`
      );

      return;
    }

    console.log(
      `\nProjeto: ${plan.projectId}`
    );

    console.log(
      `Objetivo: ${plan.objective}\n`
    );

    for (
      const task
      of plan.tasks
    ) {
      const status =
        nomesStatus[
          task.status
        ] ??
        task.status;

      const agente =
        nomesAgentes[
          task.agent
        ] ??
        task.agent.toUpperCase();

      console.log(
        `[${status}] ${task.id} | ${agente}`
      );

      console.log(
        `  ${task.task}`
      );

      if (
        task.dependsOn.length >
        0
      ) {
        console.log(
          `  Depende de: ${task.dependsOn.join(", ")}`
        );
      }

      if (task.branch) {
        console.log(
          `  Branch: ${task.branch}`
        );
      }

      if (
        task.workspacePath
      ) {
        console.log(
          `  Workspace: ${task.workspacePath}`
        );
      }

      if (task.commit) {
        console.log(
          `  Commit: ${task.commit}`
        );
      }

      if (task.validation) {
        const attempts =
          task.validation.attempts
            .length;

        console.log(
          `  Validação: ${task.validation.status} (tentativa ${attempts}/${task.validation.maxAttempts})`
        );

        if (
          task.validation
            .blockedReason
        ) {
          console.log(
            `  Bloqueio: ${task.validation.blockedReason}`
          );
        }

        const lastAttempt =
          task.validation.attempts.at(
            -1
          );

        if (lastAttempt?.diagnosis) {
          console.log(
            `  Diagnóstico: ${lastAttempt.diagnosis}`
          );
        }
      }

      if (
        task.status ===
          "FAILED" &&
        task.error
      ) {
        console.log(
          `  Erro: ${task.error}`
        );
      }

      console.log();
    }

    if (plan.validation) {
      console.log(
        `Validação do plano: ${plan.validation.status}`
      );

      console.log(
        `  ${plan.validation.reasoning}`
      );

      for (const warning of plan
        .validation.gateWarnings) {
        console.log(
          `  Alerta: ${warning.message}`
        );
      }

      console.log();
    }

    return;
  }

  // =========================================================
  // RETRY
  // =========================================================

  if (command === "retry") {
    const projectId =
      args[0];

    const taskId =
      args[1];

    if (
      !projectId ||
      !taskId
    ) {
      console.error(
        "Uso: senior retry <projeto> <tarefa>"
      );

      console.error(
        "Exemplo: senior retry auth-api task-4"
      );

      process.exit(1);
    }

    await senior.retryTask(
      projectId,
      taskId
    );

    console.log(
      "\nNOVA TENTATIVA PREPARADA"
    );

    console.log(
      "--------------------------------"
    );

    console.log(
      `Projeto: ${projectId}`
    );

    console.log(
      `Tarefa: ${taskId}`
    );

    console.log(
      "Status: PRONTA"
    );

    console.log(
      "--------------------------------\n"
    );

    return;
  }

  // =========================================================
  // RUN AUTÔNOMO
  // =========================================================

  if (command === "run") {
    const projectId =
      args[0];

    if (!projectId) {
      console.error(
        "Uso: senior run <projeto>"
      );

      console.error(
        "Exemplo: senior run auth-api"
      );

      process.exit(1);
    }

    console.log(
      "\nSENIOR — EXECUÇÃO AUTÔNOMA"
    );

    console.log(
      "--------------------------------"
    );

    console.log(
      `Projeto: ${projectId}`
    );

    console.log(
      "Modo: SEQUENCIAL SEGURO"
    );

    console.log(
      "--------------------------------\n"
    );

    const result =
      await senior.runProject(
        projectId
      );

    console.log(
      "\nRESULTADO DO CICLO"
    );

    console.log(
      "--------------------------------"
    );

    console.log(
      `Status: ${result.status}`
    );

    if (
      result.executions.length >
      0
    ) {
      console.log(
        "\nExecuções:"
      );

      for (
        const execution
        of result.executions
      ) {
        const agente =
          nomesAgentes[
            execution.agent
          ] ??
          execution.agent.toUpperCase();

        console.log(
          `\n[${execution.status}] ${execution.taskId} | ${agente}`
        );

        console.log(
          `  Commit novo: ${
            execution.commit ??
            "nenhum"
          }`
        );

        if (
          execution.headCommit
        ) {
          console.log(
            `  HEAD final: ${execution.headCommit}`
          );
        }

        if (
          execution.error
        ) {
          console.log(
            `  Erro: ${execution.error}`
          );
        }
      }
    } else {
      console.log(
        "\nNenhuma nova tarefa executada."
      );
    }

    if (
      result.status ===
        "FAILED" &&
      "failedTasks" in result
    ) {
      console.log(
        "\nFALHAS"
      );

      for (
        const task
        of result.failedTasks
      ) {
        const agente =
          nomesAgentes[
            task.agent
          ] ??
          task.agent.toUpperCase();

        console.log(
          `- ${task.id} | ${agente}`
        );

        console.log(
          `  ${task.error ?? "Erro não informado"}`
        );
      }

      console.log(
        "\nSENIOR interrompeu o ciclo por segurança."
      );
    }

    if (
      result.status ===
        "BLOCKED" &&
      "waitingTasks" in result
    ) {
      console.log(
        "\nPROJETO BLOQUEADO"
      );

      if (
        result.runningTasks
          .length > 0
      ) {
        console.log(
          "\nTarefas em execução:"
        );

        for (
          const taskId
          of result.runningTasks
        ) {
          console.log(
            `- ${taskId}`
          );
        }
      }

      if (
        result.waitingTasks
          .length > 0
      ) {
        console.log(
          "\nAguardando dependências:"
        );

        for (
          const task
          of result.waitingTasks
        ) {
          console.log(
            `- ${task.id} <- ${task.dependsOn.join(", ")}`
          );
        }
      }
    }

    if (
      result.status ===
        "NEEDS_HUMAN" &&
      "blockedTasks" in result
    ) {
      console.log(
        "\nPRECISA DE INTERVENÇÃO HUMANA"
      );

      for (
        const task
        of result.blockedTasks
      ) {
        const agente =
          nomesAgentes[
            task.agent
          ] ??
          task.agent.toUpperCase();

        console.log(
          `- ${task.id} | ${agente}`
        );

        console.log(
          `  Motivo: ${task.blockedReason}`
        );

        if (task.lastDiagnosis) {
          console.log(
            `  Diagnóstico: ${task.lastDiagnosis}`
          );
        }
      }
    }

    if (
      "planValidation" in result &&
      result.planValidation
    ) {
      console.log(
        "\nVALIDAÇÃO DO OBJETIVO"
      );

      console.log(
        `Status: ${result.planValidation.status}`
      );

      console.log(
        result.planValidation.reasoning
      );

      for (const warning of result
        .planValidation.gateWarnings) {
        console.log(
          `Alerta: ${warning.message}`
        );
      }
    }

    if (
      result.status === "DONE"
    ) {
      console.log(
        "\nPLANO CONCLUÍDO COM SUCESSO."
      );
    }

    if (
      result.status ===
      "OBJECTIVE_NOT_MET"
    ) {
      console.log(
        "\nTODAS AS TAREFAS FORAM CONCLUÍDAS, MAS O OBJETIVO NÃO FOI CONFIRMADO."
      );
    }

    console.log(
      "\n--------------------------------\n"
    );

    return;
  }

  // =========================================================
  // JOBS
  // =========================================================

  if (
    command === "job" &&
    args[0] === "start"
  ) {
    const projectId = args[1];

    if (!projectId) {
      console.error(
        "Uso: senior job start <projeto>"
      );

      process.exit(1);
    }

    const job =
      await jobManager.start(
        projectId
      );

    console.log(
      "\nJOB CRIADO"
    );

    console.log(
      "--------------------------------"
    );

    console.log(`ID: ${job.id}`);
    console.log(
      `Projeto: ${job.projectId}`
    );
    console.log(
      `Status: ${job.status}`
    );
    console.log(
      `Log: ${job.logFile}`
    );

    console.log(
      "--------------------------------\n"
    );

    console.log(
      `Acompanhe com: npm run senior -- job status ${job.id}\n`
    );

    return;
  }

  if (
    command === "job" &&
    args[0] === "status"
  ) {
    const jobId = args[1];

    if (!jobId) {
      console.error(
        "Uso: senior job status <jobId>"
      );

      process.exit(1);
    }

    await jobManager.reconcile();

    const job = await jobManager.get(
      jobId
    );

    if (!job) {
      console.error(
        `Job ${jobId} não encontrado.`
      );

      process.exit(1);
    }

    console.log(
      "\nSTATUS DO JOB"
    );

    console.log(
      "--------------------------------"
    );

    console.log(`ID: ${job.id}`);
    console.log(
      `Projeto: ${job.projectId}`
    );
    console.log(
      `Status: ${job.status}`
    );
    console.log(
      `Criado em: ${job.createdAt}`
    );

    if (job.startedAt) {
      console.log(
        `Iniciado em: ${job.startedAt}`
      );
    }

    if (job.completedAt) {
      console.log(
        `Concluído em: ${job.completedAt}`
      );
    }

    if (job.error) {
      console.log(
        `Erro: ${job.error}`
      );
    }

    if (job.result) {
      console.log(
        `Resultado: ${JSON.stringify(job.result, null, 2)}`
      );
    }

    console.log(
      "--------------------------------\n"
    );

    return;
  }

  if (
    command === "job" &&
    args[0] === "list"
  ) {
    const projectId = args[1];

    const jobs =
      await jobManager.list(
        projectId
      );

    console.log(
      "\nJOBS"
    );

    console.log(
      "--------------------------------"
    );

    if (jobs.length === 0) {
      console.log(
        "Nenhum job encontrado."
      );
    }

    for (const job of jobs) {
      console.log(
        `[${job.status}] ${job.id} | projeto: ${job.projectId} | criado em ${job.createdAt}`
      );
    }

    console.log(
      "--------------------------------\n"
    );

    return;
  }

  if (
    command === "job" &&
    args[0] === "logs"
  ) {
    const jobId = args[1];

    if (!jobId) {
      console.error(
        "Uso: senior job logs <jobId>"
      );

      process.exit(1);
    }

    const log =
      await jobManager.readLog(
        jobId
      );

    console.log(
      log || "(log vazio)"
    );

    return;
  }

  // =========================================================
  // EXECUTAR
  // =========================================================

  if (
    command === "executar"
  ) {
    const projectId =
      args[0];

    const taskId =
      args[1];

    if (
      !projectId ||
      !taskId
    ) {
      console.error(
        "Uso: senior executar <projeto> <tarefa>"
      );

      console.error(
        "Exemplo: senior executar auth-api task-2"
      );

      process.exit(1);
    }

    console.log(
      `\nSENIOR está delegando ${taskId}...`
    );

    console.log(
      `Projeto: ${projectId}\n`
    );

    const execution =
      await senior.executeTask(
        projectId,
        taskId
      );

    const agente =
      nomesAgentes[
        execution.task.agent
      ] ??
      execution.task.agent.toUpperCase();

    console.log(
      `Projeto: ${execution.project.name}`
    );

    console.log(
      `Agente: ${agente}`
    );

    console.log(
      `Tarefa: ${execution.task.task}\n`
    );

    console.log(
      "RESULTADO"
    );

    console.log(
      "--------------------------------"
    );

    console.log(
      execution.result
    );

    console.log(
      "--------------------------------"
    );

    console.log(
      "\nGIT"
    );

    console.log(
      "--------------------------------"
    );

    console.log(
      `Branch: ${execution.git.branch}`
    );

    console.log(
      `Workspace: ${execution.git.workspacePath}`
    );

    console.log(
      `Base: ${execution.git.baseCommit}`
    );

    if (
      execution.git
        .dependencyCommits
        .length > 0
    ) {
      console.log(
        `Dependências Git: ${execution.git.dependencyCommits.join(", ")}`
      );
    } else {
      console.log(
        "Dependências Git: nenhuma"
      );
    }

    console.log(
      `Alterações: ${
        execution.git.changed
          ? "SIM"
          : "NÃO"
      }`
    );

    console.log(
      `Commit: ${
        execution.git.commit ??
        "nenhum novo commit"
      }`
    );

    console.log(
      "--------------------------------"
    );

    console.log(
      `\n${taskId} concluída com sucesso.`
    );

    console.log(
      "As próximas tarefas do projeto foram atualizadas automaticamente.\n"
    );

    return;
  }

  // =========================================================
  // CONCLUSÃO MANUAL
  // =========================================================

  if (
    command === "concluir"
  ) {
    const projectId =
      args[0];

    const taskId =
      args[1];

    if (
      !projectId ||
      !taskId
    ) {
      console.error(
        "Uso: senior concluir <projeto> <tarefa>"
      );

      process.exit(1);
    }

    await senior.completeTask(
      projectId,
      taskId
    );

    console.log(
      `\nTarefa ${taskId} do projeto ${projectId} marcada como CONCLUÍDA.`
    );

    console.log(
      "As dependências foram atualizadas automaticamente.\n"
    );

    return;
  }

  // =========================================================
  // CHIEF
  // =========================================================

  if (command === "ask") {
    const message =
      args.join(" ");

    if (!message) {
      console.error(
        'Uso: senior ask "sua solicitação"'
      );

      process.exit(1);
    }

    console.log(
      "\nSENIOR está analisando...\n"
    );

    const response =
      await senior.talkToChief(
        message
      );

    console.log(
      response
    );

    console.log();

    return;
  }

  // =========================================================
  // HELP
  // =========================================================

  console.log(`
SENIOR CLI

STATUS

  status
      Exibe o estado geral do SENIOR.

GITHUB

  github status
      Verifica a conexão com o GitHub.

PROJETOS

  projeto criar "<nome>"
      Cria um projeto local.

  projetos
      Lista os projetos cadastrados.

PLANEJAMENTO

  plan <projeto> "<objetivo>"
      Cria um plano para um projeto.

  tarefas <projeto>
      Exibe as tarefas e metadados Git.

EXECUÇÃO

  executar <projeto> <tarefa>
      Executa uma tarefa em worktree isolado.

  retry <projeto> <tarefa>
      Prepara novamente uma tarefa que falhou.

  concluir <projeto> <tarefa>
      Marca manualmente uma tarefa como concluída.

JOBS

  job start <projeto>
      Inicia a execução autônoma do plano em background (processo
      destacado). Não bloqueia o terminal; sobrevive ao fechamento
      da CLI.

  job status <jobId>
      Mostra o status atual de um job.

  job list [projeto]
      Lista jobs, opcionalmente filtrados por projeto.

  job logs <jobId>
      Mostra a saída completa registrada pelo job.

SENIOR

  ask "<solicitação>"
      Conversa diretamente com o Líder.

EXEMPLOS

  npm run senior -- status

  npm run senior -- projetos

  npm run senior -- tarefas auth-api

  npm run senior -- retry auth-api task-4

  npm run senior -- executar auth-api task-4
`);
}

main().catch((error) => {
  console.error(
    "\nErro no SENIOR:"
  );

  if (
    error instanceof Error
  ) {
    console.error(
      error.message
    );
  } else {
    console.error(
      error
    );
  }

  process.exit(1);
});

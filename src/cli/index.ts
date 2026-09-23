import { Orchestrator } from "../core/Orchestrator.js";

const jarvis = new Orchestrator();

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
  DONE: "CONCLUÍDA",
  FAILED: "FALHOU",
};

async function main() {
  const [command, ...args] =
    process.argv.slice(2);

  // =========================================================
  // STATUS
  // =========================================================

  if (command === "status") {
    const status =
      await jarvis.status();

    console.log("\nJARVIS");
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
      await jarvis.githubStatus();

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
        'Uso: jarvis projeto criar "Nome do projeto"'
      );

      process.exit(1);
    }

    const project =
      await jarvis.createProject(
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
      await jarvis.listProjects();

    console.log(
      "\nPROJETOS JARVIS"
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
        'Uso: jarvis plan <projeto> "<objetivo>"'
      );

      console.error(
        'Exemplo: jarvis plan auth-api "Criar autenticação"'
      );

      process.exit(1);
    }

    console.log(
      "\nJARVIS está criando o plano...\n"
    );

    console.log(
      `Projeto: ${projectId}\n`
    );

    const plan =
      await jarvis.createPlan(
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
        "Uso: jarvis tarefas <projeto>"
      );

      process.exit(1);
    }

    const plan =
      await jarvis.getTasks(
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
        "Uso: jarvis retry <projeto> <tarefa>"
      );

      console.error(
        "Exemplo: jarvis retry auth-api task-4"
      );

      process.exit(1);
    }

    await jarvis.retryTask(
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
        "Uso: jarvis run <projeto>"
      );

      console.error(
        "Exemplo: jarvis run auth-api"
      );

      process.exit(1);
    }

    console.log(
      "\nJARVIS — EXECUÇÃO AUTÔNOMA"
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
      await jarvis.runProject(
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
        "\nJARVIS interrompeu o ciclo por segurança."
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
      result.status === "DONE"
    ) {
      console.log(
        "\nPLANO CONCLUÍDO COM SUCESSO."
      );
    }

    console.log(
      "\n--------------------------------\n"
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
        "Uso: jarvis executar <projeto> <tarefa>"
      );

      console.error(
        "Exemplo: jarvis executar auth-api task-2"
      );

      process.exit(1);
    }

    console.log(
      `\nJARVIS está delegando ${taskId}...`
    );

    console.log(
      `Projeto: ${projectId}\n`
    );

    const execution =
      await jarvis.executeTask(
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
        "Uso: jarvis concluir <projeto> <tarefa>"
      );

      process.exit(1);
    }

    await jarvis.completeTask(
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
        'Uso: jarvis ask "sua solicitação"'
      );

      process.exit(1);
    }

    console.log(
      "\nJARVIS está analisando...\n"
    );

    const response =
      await jarvis.talkToChief(
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
JARVIS CLI

STATUS

  status
      Exibe o estado geral do JARVIS.

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

JARVIS

  ask "<solicitação>"
      Conversa diretamente com o Líder.

EXEMPLOS

  npm run jarvis -- status

  npm run jarvis -- projetos

  npm run jarvis -- tarefas auth-api

  npm run jarvis -- retry auth-api task-4

  npm run jarvis -- executar auth-api task-4
`);
}

main().catch((error) => {
  console.error(
    "\nErro no JARVIS:"
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

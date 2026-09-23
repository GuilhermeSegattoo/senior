import { AgentExecutor } from "../core/AgentExecutor.js";

import type {
  AgentRuntime,
  AgentRuntimeOptions,
  AgentRuntimeResult,
} from "../runtimes/AgentRuntime.js";

import type {
  ManagedTask,
} from "../types/Task.js";

class TestRuntime implements AgentRuntime {
  readonly name = "test";

  async status(): Promise<boolean> {
    return true;
  }

  async ask(
    prompt: string,
    options: AgentRuntimeOptions
  ): Promise<AgentRuntimeResult> {
    console.log("\n=== RUNTIME RECEBEU ===");
    console.log("CWD:", options.cwd);
    console.log("ReadOnly:", options.readOnly);
    console.log(
      "Prompt contém projeto:",
      prompt.includes("auth-api")
    );
    console.log(
      "Prompt contém task:",
      prompt.includes("task-test")
    );

    return {
      text: "TEST RUNTIME OK",
      provider: "test",
      model: "test-model",
    };
  }
}

async function main() {
  const executor =
    new AgentExecutor(
      new TestRuntime()
    );

  const task: ManagedTask = {
    id: "task-test",
    agent: "reviewer",
    task: "Teste interno do AgentExecutor.",
    dependsOn: [],
    status: "READY",
  };

  const result =
    await executor.execute(
      "auth-api",
      task,
      {
        workspacePath:
          "/home/sgt/jarvis/projects/auth-api",
        branch: "main",
      }
    );

  console.log("\n=== RESULTADO ===");
  console.log(result);

  if (result !== "TEST RUNTIME OK") {
    throw new Error(
      `Resultado inesperado: ${result}`
    );
  }

  console.log(
    "\nAGENT EXECUTOR DESACOPLADO COM SUCESSO."
  );
}

main().catch((error) => {
  console.error("\nERRO:");
  console.error(error);
  process.exitCode = 1;
});

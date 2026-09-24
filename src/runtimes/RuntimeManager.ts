import { CodexRuntime } from "./CodexRuntime.js";
import { ClaudeRuntime } from "./ClaudeRuntime.js";
import { PiRuntime } from "./PiRuntime.js";

import type {
  AgentRuntime,
} from "./AgentRuntime.js";

export type RuntimeName =
  | "codex"
  | "claude"
  | "pi";

export interface CreateRuntimeOptions {
  /*
   * Modelo específico para o runtime, quando o runtime suportar
   * (ex.: "claude" aceita qualquer alias de modelo do CLI Claude).
   * Ignorado por runtimes que não usam essa opção.
   */
  model?: string;
}

export class RuntimeManager {
  create(
    runtimeName: RuntimeName = "codex",
    options: CreateRuntimeOptions = {}
  ): AgentRuntime {
    switch (runtimeName) {
      case "codex":
        return new CodexRuntime();

      case "claude":
        return new ClaudeRuntime({
          model: options.model,
        });

      case "pi": {
        const provider =
          process.env.SENIOR_PI_PROVIDER?.trim() ||
          "openai-codex";

        const modelName =
          options.model?.trim() ||
          process.env.SENIOR_PI_MODEL?.trim() ||
          "gpt-6-astra";

        return new PiRuntime({
          provider,
          modelName,
        });
      }

      default: {
        const exhaustiveCheck: never =
          runtimeName;

        throw new Error(
          `Runtime desconhecido: ${exhaustiveCheck}`
        );
      }
    }
  }

  fromEnvironment(): AgentRuntime {
    const configured =
      process.env.SENIOR_AGENT_RUNTIME
        ?.trim()
        .toLowerCase();

    if (!configured) {
      return this.create("codex");
    }

    if (
      configured !== "codex" &&
      configured !== "claude" &&
      configured !== "pi"
    ) {
      throw new Error(
        `SENIOR_AGENT_RUNTIME inválido: ${configured}`
      );
    }

    return this.create(configured);
  }
}

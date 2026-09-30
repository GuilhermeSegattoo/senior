import { ApiRuntime } from "./ApiRuntime.js";
import { CodexRuntime } from "./CodexRuntime.js";
import { ClaudeRuntime } from "./ClaudeRuntime.js";
import { PiRuntime } from "./PiRuntime.js";

import type {
  AgentRuntime,
} from "./AgentRuntime.js";

export type RuntimeName =
  | "codex"
  | "claude"
  | "pi"
  | "grok"
  | "openai"
  | "anthropic";

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
    runtimeName: RuntimeName = this.defaultName(),
    options: CreateRuntimeOptions = {}
  ): AgentRuntime {
    switch (runtimeName) {
      case "grok":
      case "openai":
      case "anthropic":
        return new ApiRuntime(runtimeName, options.model);
      case "codex":
        return new CodexRuntime(undefined, options.model);

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
          "";

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

  defaultName(): RuntimeName {
    const value = process.env.SENIOR_AGENT_RUNTIME?.trim().toLowerCase() || "codex";
    if (!["codex", "claude", "pi", "grok", "openai", "anthropic"].includes(value)) throw new Error(`Runtime inválido: ${value}`);
    return value as RuntimeName;
  }

  fromEnvironment(): AgentRuntime {
    return this.create(this.defaultName());
  }
}

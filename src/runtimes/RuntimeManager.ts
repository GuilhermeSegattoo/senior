import { CodexRuntime } from "./CodexRuntime.js";
import { PiRuntime } from "./PiRuntime.js";

import type {
  AgentRuntime,
} from "./AgentRuntime.js";

export type RuntimeName =
  | "codex"
  | "pi";

export class RuntimeManager {
  create(
    runtimeName: RuntimeName = "codex"
  ): AgentRuntime {
    switch (runtimeName) {
      case "codex":
        return new CodexRuntime();

      case "pi": {
        const provider =
          process.env.SENIOR_PI_PROVIDER?.trim() ||
          "openai-codex";

        const modelName =
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
      configured !== "pi"
    ) {
      throw new Error(
        `SENIOR_AGENT_RUNTIME inválido: ${configured}`
      );
    }

    return this.create(configured);
  }
}

import { CodexAdapter } from "../adapters/CodexAdapter.js";

import type {
  AgentRuntime,
  AgentRuntimeOptions,
  AgentRuntimeResult,
} from "./AgentRuntime.js";

export class CodexRuntime implements AgentRuntime {
  readonly name = "codex";

  private readonly adapter: CodexAdapter;

  constructor(adapter = new CodexAdapter(), private readonly model = process.env.SENIOR_CODEX_MODEL) {
    this.adapter = adapter;
  }

  async ask(
    prompt: string,
    options: AgentRuntimeOptions
  ): Promise<AgentRuntimeResult> {
    const text = await this.adapter.ask(prompt, {
      cwd: options.cwd,
      model: this.model,
      signal: options.signal,
      sandbox: options.readOnly
        ? "read-only"
        : "workspace-write",
    });

    return {
      text,
      provider: "openai",
      model: this.model,
    };
  }

  async status(): Promise<boolean> {
    return this.adapter.status();
  }
}

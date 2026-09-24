import { ClaudeAdapter } from "../adapters/ClaudeAdapter.js";

import type {
  AgentRuntime,
  AgentRuntimeOptions,
  AgentRuntimeResult,
} from "./AgentRuntime.js";

export interface ClaudeRuntimeOptions {
  model?: string;
}

export class ClaudeRuntime implements AgentRuntime {
  readonly name = "claude";

  private readonly adapter: ClaudeAdapter;
  private readonly model: string;

  constructor(
    options: ClaudeRuntimeOptions = {},
    adapter = new ClaudeAdapter()
  ) {
    this.adapter = adapter;
    this.model =
      options.model ??
      "claude-sonnet-5";
  }

  async ask(
    prompt: string,
    options: AgentRuntimeOptions
  ): Promise<AgentRuntimeResult> {
    const text = await this.adapter.ask(prompt, {
      cwd: options.cwd,
      model: this.model,
      sandbox: options.readOnly
        ? "read-only"
        : "workspace-write",
    });

    return {
      text,
      provider: "anthropic",
      model: this.model,
    };
  }

  async status(): Promise<boolean> {
    return this.adapter.status();
  }
}

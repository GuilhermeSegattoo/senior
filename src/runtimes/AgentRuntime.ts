export interface AgentRuntimeOptions {
  cwd: string;
  readOnly?: boolean;
}

export interface AgentRuntimeResult {
  text: string;
  provider?: string;
  model?: string;
}

export interface AgentRuntime {
  readonly name: string;

  ask(
    prompt: string,
    options: AgentRuntimeOptions
  ): Promise<AgentRuntimeResult>;

  status(): Promise<boolean>;
}

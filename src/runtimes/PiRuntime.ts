import { Agent } from "@earendil-works/pi-agent-core";
import { createPiProjectTools } from "../tools/PiProjectTools.js";

import {
  createAgentSession,
  createAgentSessionServices,
} from "@earendil-works/pi-coding-agent";

import type {
  AgentRuntime,
  AgentRuntimeOptions,
  AgentRuntimeResult,
} from "./AgentRuntime.js";

type AgentOptions =
  ConstructorParameters<typeof Agent>[0];

type PiStreamFn =
  AgentOptions["streamFn"];

type PiInitialState =
  NonNullable<AgentOptions["initialState"]>;

type PiModel =
  NonNullable<PiInitialState["model"]>;

export interface PiInjectedRuntimeConfig {
  streamFn: PiStreamFn;
  model: PiModel;
  provider?: string;
  modelName?: string;
}

export interface PiRealRuntimeConfig {
  provider: string;
  modelName: string;
}

export type PiRuntimeConfig =
  | PiInjectedRuntimeConfig
  | PiRealRuntimeConfig;

function isInjectedConfig(
  config: PiRuntimeConfig
): config is PiInjectedRuntimeConfig {
  return (
    "streamFn" in config &&
    "model" in config
  );
}

export class PiRuntime implements AgentRuntime {
  readonly name = "pi";

  constructor(
    private readonly config: PiRuntimeConfig
  ) {}

  async ask(
    prompt: string,
    options: AgentRuntimeOptions
  ): Promise<AgentRuntimeResult> {
    if (isInjectedConfig(this.config)) {
      return this.askInjected(
        prompt,
        options
      );
    }

    return this.askReal(
      prompt,
      options
    );
  }

  private async askInjected(
    prompt: string,
    options: AgentRuntimeOptions
  ): Promise<AgentRuntimeResult> {
    if (!isInjectedConfig(this.config)) {
      throw new Error(
        "Configuração Pi injetada inválida."
      );
    }

    const agent = new Agent({
      streamFn: this.config.streamFn,

      initialState: {
        model: this.config.model,

        systemPrompt:
          this.buildSystemPrompt(
            options
          ),

        tools: [],
        messages: [],
      },
    });

    await agent.prompt(prompt);

    const text =
      this.extractAgentText(
        agent.state.messages
      );

    return {
      text,

      provider:
        this.config.provider ??
        this.config.model.provider,

      model:
        this.config.modelName ??
        this.config.model.id,
    };
  }

  private async askReal(
    prompt: string,
    options: AgentRuntimeOptions
  ): Promise<AgentRuntimeResult> {
    if (isInjectedConfig(this.config)) {
      throw new Error(
        "Configuração Pi real inválida."
      );
    }

    const services =
      await createAgentSessionServices({
        cwd: options.cwd,
      });

    const model =
      services.modelRuntime.getModel(
        this.config.provider,
        this.config.modelName
      );

    if (!model) {
      throw new Error(
        [
          "Modelo Pi não encontrado:",
          `${this.config.provider}/${this.config.modelName}`,
        ].join(" ")
      );
    }

    if (
      !services.modelRuntime.hasConfiguredAuth(
        model.provider
      )
    ) {
      throw new Error(
        `Autenticação não configurada para o provider "${model.provider}".`
      );
    }

    const result =
      await createAgentSession({
        cwd: options.cwd,

        modelRuntime:
          services.modelRuntime,

        model,

        noTools: "builtin",

         customTools: createPiProjectTools(
             options.cwd,
	     options.readOnly ?? false
	),

        thinkingLevel: "off",
      });

    const session = result.session;

    const finalPrompt = [
      this.buildSystemPrompt(options),
      "",
      prompt,
    ].join("\n");

    await session.prompt(
      finalPrompt
    );

    const text =
      this.extractAgentText(
        session.agent.state.messages
      );

    return {
      text,
      provider: model.provider,
      model: model.id,
    };
  }

  private buildSystemPrompt(
    options: AgentRuntimeOptions
  ): string {
    return [
      "Você é um agente executado pelo Senior.",
      `Workspace autorizado: ${options.cwd}`,
      options.readOnly
        ? "Modo: somente leitura."
        : [
            "Modo solicitado: escrita no workspace.",
            "As ferramentas de escrita ainda estão desabilitadas nesta versão do PiRuntime.",
          ].join(" "),
    ].join("\n");
  }

  private extractAgentText(
    messages: Agent["state"]["messages"]
  ): string {
    const lastAssistant = [
      ...messages,
    ]
      .reverse()
      .find(
        (message) =>
          message.role === "assistant"
      );

    if (!lastAssistant) {
      throw new Error(
        "Pi terminou sem produzir uma mensagem assistant."
      );
    }

    if (
      lastAssistant.stopReason === "error"
    ) {
      throw new Error(
        `Pi terminou com erro: ${
          lastAssistant.errorMessage ??
          "erro desconhecido"
        }`
      );
    }

    const text =
      lastAssistant.content
        .filter(
          (part) =>
            part.type === "text"
        )
        .map(
          (part) =>
            part.text
        )
        .join("")
        .trim();

    if (!text) {
      throw new Error(
        "Pi terminou sem produzir conteúdo de texto."
      );
    }

    return text;
  }

  async status(): Promise<boolean> {
    try {
      if (
        isInjectedConfig(this.config)
      ) {
        return true;
      }

      const services =
        await createAgentSessionServices({
          cwd: process.cwd(),
        });

      const model =
        services.modelRuntime.getModel(
          this.config.provider,
          this.config.modelName
        );

      if (!model) {
        return false;
      }

      return (
        services.modelRuntime
          .hasConfiguredAuth(
            model.provider
          )
      );
    } catch {
      return false;
    }
  }
}

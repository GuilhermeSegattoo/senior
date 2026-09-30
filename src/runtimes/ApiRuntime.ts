import type { AgentRuntime, AgentRuntimeOptions, AgentRuntimeResult } from "./AgentRuntime.js";

export type ApiProvider = "openai" | "anthropic" | "grok";

// Chat/research runtime. It intentionally has no filesystem or shell tools.
// Coding tasks use Pi/Codex/Claude until a safe tool loop is implemented here.
export class ApiRuntime implements AgentRuntime {
  readonly name: ApiProvider;
  constructor(private readonly provider: ApiProvider, private readonly model?: string,
    private readonly fetcher: typeof fetch = fetch) { this.name = provider; }

  private config() {
    const prefix = this.provider === "grok" ? "XAI" : this.provider.toUpperCase();
    const key = process.env[`${prefix}_API_KEY`];
    const model = this.model || process.env[`SENIOR_${prefix}_MODEL`];
    return { key, model };
  }

  async ask(prompt: string, options: AgentRuntimeOptions): Promise<AgentRuntimeResult> {
    if (!options.readOnly) throw new Error(`${this.name}: execução de código requer Pi, Codex ou Claude.`);
    const { key, model } = this.config();
    if (!key || !model) throw new Error(`${this.name}: configure a chave no servidor e o modelo nas configurações.`);
    const anthropic = this.provider === "anthropic";
    const endpoint = anthropic ? "https://api.anthropic.com/v1/messages" :
      this.provider === "grok" ? "https://api.x.ai/v1/chat/completions" : "https://api.openai.com/v1/chat/completions";
    const response = await this.fetcher(endpoint, {
      method: "POST",
      headers: anthropic ? { "content-type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01" } :
        { "content-type": "application/json", authorization: `Bearer ${key}` },
      body: JSON.stringify({ model, messages: [{ role: "user", content: prompt }], max_tokens: 4096 }),
      signal: AbortSignal.any([AbortSignal.timeout(120_000), ...(options.signal ? [options.signal] : [])]),
    });
    // Never reflect provider response bodies: they may include credential-bearing input.
    if (!response.ok) throw new Error(`${this.name}: API retornou ${response.status}. Verifique modelo, acesso e saldo.`);
    const data = await response.json() as {
      content?: Array<{ type: string; text?: string }>;
      choices?: Array<{ message?: { content?: string } }>;
    };
    const text = anthropic ? data.content?.filter(x => x.type === "text").map(x => x.text || "").join("") : data.choices?.[0]?.message?.content;
    if (!text?.trim()) throw new Error(`${this.name}: resposta vazia ou incompatível.`);
    return { text: text.trim(), provider: this.provider, model };
  }

  async status() { const { key, model } = this.config(); return Boolean(key && model); }
}

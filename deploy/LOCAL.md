# Rodar o Senior no seu computador

O caminho normal não usa Docker e não pede chave de API. Ele usa a assinatura que você já tem: ChatGPT pelo Pi, ou Claude Code.

## Três passos

1. Instale Node 24 (a versão está no `.nvmrc`) e o Git. Para conversar, deixe o Pi autenticado na assinatura do ChatGPT ou o Claude Code autenticado na assinatura do Claude.
2. Na raiz do repositório, rode `./start`.
3. Abra o endereço impresso, `http://localhost:3000/canvas`, e entre com a senha impressa.

O script é idempotente: se o `.env` já existe, ele não troca segredo nem motor. Se faltar `.env`, ele copia o exemplo e gera `SENIOR_WEB_PASSWORD`, `SENIOR_GATEWAY_TOKEN` e `SENIOR_SESSION_SECRET` com `openssl rand -hex 32`. Os mesmos três valores vão para `apps/web/.env`, porque a tela de login lê o ambiente do site.

`./start --docker` sobe o Compose com Caddy. Esse modo pede `SENIOR_DOMAIN` e não enxerga o login do Pi ou do Claude desta máquina. Para a assinatura, use `./start` sem Docker.

## O quadro

`/canvas` é o quadro infinito. Dá para arrastar o fundo, aproximar com a roda e soltar cartões de conversa, nota e agente. O título do cartão é a alça. Fechar tira o cartão. Posição, texto da nota e a conversa ligada a cada cartão ficam no `localStorage` deste navegador. O histórico da conversa continua no gateway.

O cartão de agente é um lugar reservado. Ele não executa comando. Em produção, `SENIOR_ENABLE_CODE_EXECUTION` permanece `false`. O assistente em `/assistant` e o login continuam disponíveis.

## Qual motor usar

O padrão de um `.env` novo é `SENIOR_AGENT_RUNTIME=pi`.

- **Pi, assinatura do ChatGPT.** Deixe `SENIOR_PI_PROVIDER=openai-codex`. Não preencha `OPENAI_API_KEY`. Autentique o Pi nesta máquina com a conta ChatGPT. Preencha `SENIOR_PI_MODEL` com um id que o Pi reconheça na sua conta, ou digite esse id no cartão de conversa. Sem modelo, o Pi recusa a resposta.
- **Claude Code.** Pare o `./start`, troque para `SENIOR_AGENT_RUNTIME=claude` e suba de novo. O CLI `claude` precisa já estar autenticado. Não preencha `ANTHROPIC_API_KEY`. Se `SENIOR_CLAUDE_MODEL` ficar vazio, o servidor usa `sonnet`.

`OPENAI_API_KEY`, `ANTHROPIC_API_KEY` e `XAI_API_KEY` só entram se o motor for `openai`, `anthropic` ou `grok`.

## Variáveis da raiz (`.env`)

| Variável | No chat local | Para que serve |
| --- | --- | --- |
| `NODE_ENV` | Obrigatória | `development` neste computador. Vazia, a execução de código fica fechada. |
| `SENIOR_GATEWAY_HOST` | Opcional | Endereço do gateway. O padrão local é `127.0.0.1`. |
| `SENIOR_AGENT_RUNTIME` | Obrigatória | `pi` (ChatGPT via Pi) ou `claude` (Claude Code). Também aceita `codex`, `openai`, `anthropic` e `grok`. |
| `SENIOR_GATEWAY_TOKEN` | Obrigatória com senha | Token que o site usa para falar com o gateway. Mínimo de 32 caracteres. |
| `SENIOR_WEB_PASSWORD` | Obrigatória para entrar | Senha da interface. Mínimo de 16 caracteres. O `./start` imprime o valor. |
| `SENIOR_SESSION_SECRET` | Obrigatória para entrar | Segredo que assina o cookie. Não reutilize a senha. Mínimo de 32 caracteres. |
| `SENIOR_DOMAIN` | Opcional | Hostname público. Só o deploy e o `./start --docker` exigem. |
| `OPENAI_API_KEY` | Opcional | Chave da API OpenAI. Fora do caminho `pi` e `claude`. |
| `ANTHROPIC_API_KEY` | Opcional | Chave da API Anthropic. Fora do Claude Code. |
| `XAI_API_KEY` | Opcional | Chave da API xAI, só no motor `grok`. |
| `SENIOR_OPENAI_MODEL` | Opcional | Modelo da API OpenAI. |
| `SENIOR_ANTHROPIC_MODEL` | Opcional | Modelo da API Anthropic. |
| `SENIOR_XAI_MODEL` | Opcional | Modelo da API xAI. |
| `SENIOR_CODEX_MODEL` | Opcional | Modelo do CLI Codex. |
| `SENIOR_CLAUDE_MODEL` | Opcional | Modelo do Claude Code. Vazio vira `sonnet`. |
| `SENIOR_PI_PROVIDER` | Opcional | `openai-codex` usa a assinatura do ChatGPT. |
| `SENIOR_PI_MODEL` | Obrigatória no Pi | Id do modelo na sua conta. Não é chave. |
| `SENIOR_MAX_RUNS_PER_HOUR` | Opcional | Limite de rodadas por hora. |
| `SENIOR_ENABLE_CODE_EXECUTION` | Opcional | Deixe `false`. Produção não executa código com isso desligado. |
| `SENIOR_TRUST_PROXY` | Opcional | Confia no IP vindo de um proxy. No notebook, pode ficar `true` na API sem mudar o chat. |
| `SENIOR_TRUSTED_PROXY_HOPS` | Opcional | Quantos proxies confiáveis existem à direita do `X-Forwarded-For`. |
| `SENIOR_BACKUP_KEEP` | Opcional | Quantos snapshots diários conservar. |

## Variáveis do site (`apps/web/.env`)

| Variável | No chat local | Para que serve |
| --- | --- | --- |
| `SENIOR_API_URL` | Obrigatória | Onde o site acha o gateway. No computador: `http://127.0.0.1:4000`. |
| `SENIOR_GATEWAY_TOKEN` | Obrigatória com senha | O mesmo token da raiz. |
| `SENIOR_WEB_PASSWORD` | Obrigatória para entrar | A mesma senha impressa pelo `./start`. |
| `SENIOR_SESSION_SECRET` | Obrigatória para entrar | O mesmo segredo da raiz. |
| `SENIOR_COOKIE_SECURE` | Opcional | `false` em HTTP local; `true` em HTTPS. |
| `SENIOR_TRUST_PROXY` | Opcional | `false` no computador. `true` só atrás de Traefik ou Caddy. |
| `SENIOR_TRUSTED_PROXY_HOPS` | Opcional | `1` para um proxy; `2` só com Cloudflare e Traefik. |

Não commite `.env`. Não cole a senha em issue, PR ou chat.

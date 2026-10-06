[![CI](https://github.com/GuilhermeSegattoo/senior/actions/workflows/ci.yml/badge.svg)](https://github.com/GuilhermeSegattoo/senior/actions/workflows/ci.yml)
[![Docker](https://github.com/GuilhermeSegattoo/senior/actions/workflows/docker.yml/badge.svg)](https://github.com/GuilhermeSegattoo/senior/actions/workflows/docker.yml)
[![Security](https://github.com/GuilhermeSegattoo/senior/actions/workflows/security.yml/badge.svg)](https://github.com/GuilhermeSegattoo/senior/actions/workflows/security.yml)
[![Coverage reports](https://img.shields.io/badge/coverage-job%20reports-blue)](https://github.com/GuilhermeSegattoo/senior/actions/workflows/ci.yml)

# Senior — assistente pessoal e de projetos

[Kanban e próximas entregas](docs/KANBAN.md) · [PR de implementação](https://github.com/GuilhermeSegattoo/senior/pull/1)

Senior reúne conversa persistente, memória confirmada pelo usuário, sessões pessoais ou vinculadas a projetos e um coordenador com até dois especialistas. O frontend existente de projetos continua disponível; `/assistant` é o novo centro de conversa, inclusive em telas de celular.

## Começar localmente

Use Node 24 e Git. Na raiz:

```sh
./start
```

O script cria `.env` e `apps/web/.env` se faltarem, gera senha, token e segredo com `openssl` quando estão vazios, instala dependências e sobe a API e o site. Ele imprime `http://localhost:3000/canvas` e a senha. O quadro infinito fica em `/canvas`; o assistente clássico continua em `/assistant`.

O padrão é `SENIOR_AGENT_RUNTIME=pi`: a assinatura do ChatGPT entra pelo Pi (`SENIOR_PI_PROVIDER=openai-codex`), sem `OPENAI_API_KEY`. Preencha `SENIOR_PI_MODEL` com um id da sua conta. Para o Claude Code, use `SENIOR_AGENT_RUNTIME=claude` com o CLI já autenticado, sem `ANTHROPIC_API_KEY`. Cada variável está explicada em [deploy/LOCAL.md](deploy/LOCAL.md). `./start --docker` existe, mas o login dessas assinaturas fica na sua máquina, fora do container.

O caminho manual continua válido: `npm ci`, copiar `.env.example` para `.env`, `npm run gateway` e, em `apps/web`, `npm ci` e `npm run dev -- --hostname 127.0.0.1`.

## Usar

Escolha uma sessão pessoal ou projeto, selecione o coordenador e, opcionalmente, dois especialistas. Cada especialista recebe as contribuições anteriores; o coordenador consolida a resposta. São rodadas limitadas e sequenciais. A aba Memória permite confirmar, editar e esquecer informações. O histórico recente fornece contexto de curto prazo; memória confirmada fornece contexto persistente. As memórias de projetos permanecem no respectivo escopo.

Para engenharia, gere um plano, revise tarefas e critérios no workspace e inicie a execução explicitamente. Planos não substituem automaticamente um plano existente. Jobs, cancelamentos, resultados de checks e eventos são persistidos. A integração final acontece em outra branch/worktree; não há merge automático na principal.

## Verificar

```sh
npm run check
npm run build
cd apps/web
npm run lint
npm run build
```

Os testes novos usam runtimes simulados ou HTTP interceptado. Eles não demonstram que suas contas estão conectadas. Veja o estado e as limitações em [docs/JARVIS_STATUS.md](docs/JARVIS_STATUS.md), a arquitetura em [docs/ADR-001-brain.md](docs/ADR-001-brain.md) e a publicação privada em [deploy/README.md](deploy/README.md).

## CI e cobertura

O CI usa a versão exata do `.nvmrc` e a LTS anterior (major menos 2): Node 24.19 e 22. Lint, typecheck, testes backend/web e build são jobs paralelos com cache npm. A cobertura medida por c8 inclui código não executado, aparece no resumo de cada job e em artefatos HTML/LCOV por versão; o badge leva aos relatórios, sem inventar um percentual.

Security roda CodeQL JS/TS, audit (bloqueia high/critical, com exceção só do advisory de `braces` ainda sem correção publicada e usado pelo ESLint) e gitleaks no histórico. O dependency review em PR só falha o workflow quando a variável de repositório `DEPENDENCY_REVIEW_ENABLED` é `true`. Sem ela, um repositório privado sem Dependency graph não derruba o check; o `npm audit` continua obrigatório. Docker valida Compose, constrói com Buildx/cache e bloqueia vulnerabilidades HIGH/CRITICAL corrigíveis via Trivy; achados ainda sem correção devem ser acompanhados separadamente. O smoke inicia o Compose real com override de porta apenas no runner, espera ambos healthchecks e valida login e cookie Secure/HttpOnly/SameSite. HTTPS e Traefik reais ainda exigem validação na VPS.

Em push para `main`, somente após imagens e smoke aprovados, publica `ghcr.io/guilhermesegattoo/senior/api:<SHA>` e `web:<SHA>`; PRs não publicam. Permissão de escrita em packages existe apenas nesse job, e security-events apenas no CodeQL. Workflows cancelam execuções antigas do mesmo PR. Dependabot cobre os dois projetos npm, Actions e Docker. Dependabot requer configuração no default branch após merge; este PR permanece draft.

Local: `npm run lint`, `npm run check`, `npm run build`, `npm run test:coverage`; no web, `npm run lint`, `npm run typecheck`, `npm run test:coverage` e `npm run build`. O SDK Pi foi atualizado em conjunto para 0.99.2. O lock da aplicação usa brace-expansion 5.0.12 e torna o lock superior autoritativo (`hasShrinkwrap: false` no SDK), pois o shrinkwrap publicado ainda prende 5.0.9 e npm ignora overrides nesse caso. Um teste confere as versões efetivamente instaladas de brace-expansion e undici após `npm ci`; não basta auditar metadados. Revise esse ajuste a cada atualização do SDK ou regeneração do lock.

Dependency review passa a bloquear o PR só com a variável `DEPENDENCY_REVIEW_ENABLED=true`, depois que o Dependency graph estiver habilitado. Sem essa variável, a mensagem de “not supported” não falha o workflow.

As imagens finais atualizam os pacotes Debian, removem o npm global e a API instala somente dependências de produção. O web inicia Next diretamente via Node. Compilador e tsx ficam no estágio de build/desenvolvimento; execução de engenharia em produção continua desligada.

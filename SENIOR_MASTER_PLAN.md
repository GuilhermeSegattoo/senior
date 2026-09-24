# SENIOR --- Documento Mestre do Projeto

**Status:** Em desenvolvimento\
**Objetivo deste documento:** ser a fonte única de contexto para humanos
e agentes de IA que continuarem o desenvolvimento do Senior.

------------------------------------------------------------------------

## 1. Visão do produto

Senior é uma plataforma de engenharia de software assistida por
múltiplos agentes de IA.

A ideia nasceu da necessidade de assumir responsabilidade de engenharia
em nível sênior: não apenas gerar código, mas entender objetivos,
planejar, decompor trabalho, coordenar especialistas, implementar,
revisar, testar, corrigir, validar e acompanhar vários projetos
simultaneamente.

Senior não deve ser apenas um chatbot ou uma interface para um único
modelo. Ele deve funcionar como uma camada de orquestração acima de
diferentes modelos e runtimes.

A visão final é:

> O usuário descreve o que precisa. O Senior organiza o trabalho, cria
> um plano, distribui tarefas entre agentes especializados, executa cada
> tarefa em ambientes isolados, acompanha dependências, valida o
> resultado, corrige falhas e apresenta todo o processo visualmente.

O usuário continua sendo a autoridade final para ações críticas.

------------------------------------------------------------------------

## 2. Princípios fundamentais

1.  **Senior é o orquestrador.** Pi, Codex, Claude e outros modelos são
    motores abaixo dele.
2.  **IA não é autoridade sobre estado.** Estados de tarefas,
    dependências, checks, commits, aprovações e políticas devem ser
    controlados deterministicamente.
3.  **Execução não significa conclusão.** Uma tarefa só deve ser
    considerada tecnicamente concluída depois de validada.
4.  **Toda alteração deve ser rastreável.** Projetos, tarefas,
    worktrees, branches, commits, evidências e tentativas de validação
    precisam formar uma linhagem.
5.  **Agentes recebem apenas as ferramentas necessárias.**
6.  **Ações perigosas exigem aprovação humana.**
7.  **Memória arquitetural deve viver no projeto, não apenas em
    conversas.**
8.  **Senior deve conseguir trabalhar com vários projetos
    simultaneamente sem misturar contexto.**
9.  **O sistema deve favorecer recuperação, correção e explicabilidade
    em vez de execução cega.**
10. **O produto deve ser observável visualmente. O usuário deve
    conseguir ver o trabalho acontecendo.**

------------------------------------------------------------------------

# 3. Experiência final desejada

## 3.1 Workspace visual infinito

A interface principal deve se comportar mais como um espaço de trabalho
visual do que como um dashboard tradicional.

Referência conceitual: a liberdade espacial de ferramentas como Figma.

O usuário entra em um grande canvas e pode navegar, mover, aproximar e
afastar elementos.

Nesse espaço podem existir:

-   projetos;
-   agentes;
-   terminais;
-   tarefas;
-   fluxos;
-   dependências;
-   branches/worktrees;
-   validações;
-   logs;
-   artefatos;
-   decisões;
-   alertas;
-   aprovações.

O objetivo não é imitar o editor do Figma, mas usar a ideia de um
**canvas praticamente infinito para visualizar o sistema trabalhando**.

Exemplo conceitual:

``` text
┌──────────────────────────── SENIOR WORKSPACE ────────────────────────────┐

   [ THUMDRA ]                         [ OUTRO PROJETO ]
        │
        ├── Planning                         ├── Architect
        │                                     │
        ├── Backend Agent ───────┐             └── Task #12
        │     Terminal           │
        │                        ▼
        ├── Frontend Agent   Validation
        │     Terminal           │
        │                        ├── Typecheck ✓
        ├── Reviewer             ├── Tests ✓
        │                        ├── Reviewer ✓
        └── QA                   └── QA ✓

                 ────── usuário navega livremente pelo canvas ──────
```

Cada projeto pode ser representado por um frame ou região visual.

Ao entrar em um projeto, o usuário consegue enxergar o fluxo completo.

------------------------------------------------------------------------

## 3.2 Terminais dos agentes

Cada agente ativo deve possuir uma visualização própria.

Exemplo:

``` text
BACKEND AGENT
────────────────────────────
Status: RUNNING
Task: backend-004
Branch: senior/backend-004
Runtime: Pi
Provider: OpenAI
Model: GPT-6 Astra

> analisando src/auth...
> lendo schema...
> alterando service...
> executando typecheck...
> criando testes...
```

O usuário deve conseguir:

-   acompanhar o terminal em tempo real;
-   saber qual agente está trabalhando;
-   saber em qual projeto;
-   saber em qual tarefa;
-   ver runtime/model utilizado;
-   ver ferramentas utilizadas;
-   ver arquivos alterados;
-   ver checks executados;
-   interromper quando permitido;
-   abrir detalhes;
-   consultar histórico.

O terminal é uma representação visual dos eventos reais do agente. Não
deve ser uma animação falsa.

------------------------------------------------------------------------

## 3.3 Organização visual de tarefas

As tarefas precisam ser visíveis em diferentes formas.

Possíveis visualizações:

### Flow / DAG

``` text
Architect
   │
   ▼
Backend ──────┐
              ▼
Frontend    Integration
              │
              ▼
Reviewer
   │
   ▼
QA
   │
   ▼
Validated
```

### Kanban

``` text
WAITING | READY | RUNNING | VALIDATING | CORRECTION | VALIDATED | BLOCKED
```

### Timeline

Mostrar quando cada tarefa:

-   foi criada;
-   ficou pronta;
-   iniciou;
-   executou;
-   gerou commit;
-   entrou em validação;
-   falhou;
-   foi corrigida;
-   foi aprovada.

------------------------------------------------------------------------

# 4. Gestão de múltiplos projetos

Senior deve funcionar como uma central para todos os projetos do
usuário.

Exemplos de projetos futuros:

``` text
Senior
├── Thumdra
├── Bora
├── Plataforma Educacional
├── SaaS de Fotos
├── projetos de clientes
└── novos produtos
```

Cada projeto precisa ter isolamento completo de:

-   repositório;
-   workspace;
-   configuração;
-   agentes;
-   tarefas;
-   memória;
-   decisões;
-   credenciais/referências;
-   branches;
-   worktrees;
-   histórico;
-   validações.

Nunca misturar contexto entre projetos sem uma ação explícita.

------------------------------------------------------------------------

# 5. Arquitetura geral desejada

``` text
                    ┌─────────────────────────┐
                    │        INTERFACES       │
                    │                         │
                    │ Web UI / CLI / Alexa    │
                    └────────────┬────────────┘
                                 │
                                 ▼
                    ┌─────────────────────────┐
                    │        GATEWAY          │
                    │ API / Events / Jobs     │
                    └────────────┬────────────┘
                                 │
                                 ▼
                    ┌─────────────────────────┐
                    │       SENIOR CORE       │
                    │      ORCHESTRATOR       │
                    └────────────┬────────────┘
                                 │
          ┌──────────────────────┼──────────────────────┐
          ▼                      ▼                      ▼
  Project Manager          Task Manager          Agent Manager
          │                      │                      │
          ├──────────────┐       │       ┌──────────────┤
          ▼              ▼       ▼       ▼              ▼
   Session Manager   Memory   Validation  Jobs    Integration Manager
                                Engine
                                 │
                                 ▼
                        ┌─────────────────┐
                        │ Agent Runtime   │
                        ├─────────────────┤
                        │ Pi Runtime      │
                        │ Codex Runtime   │
                        │ Future runtimes │
                        └────────┬────────┘
                                 │
            ┌────────────────────┼─────────────────────┐
            ▼                    ▼                     ▼
         OpenAI              Anthropic             Outros
                                 │
                                 ▼
                         SAFE TOOL LAYER
                                 │
          ┌──────────────────────┼──────────────────────┐
          ▼                      ▼                      ▼
        Files                   Git                   Checks
                                 │
                                 ▼
                       PROJECT WORKTREES
```

------------------------------------------------------------------------

# 6. Agentes especializados

O Senior possui uma equipe virtual.

## Chief

Responsável por:

-   interpretar objetivos;
-   decompor trabalho;
-   criar plano;
-   escolher agentes;
-   definir dependências;
-   acompanhar execução;
-   solicitar review e QA;
-   consolidar resultados.

Chief não deve executar ações destrutivas sem autorização.

## Architect

Responsável por:

-   analisar requisitos;
-   arquitetura;
-   contratos;
-   estrutura;
-   dependências técnicas;
-   decisões de design.

Normalmente opera em modo read-only.

## Frontend

Responsável por:

-   interfaces;
-   componentes;
-   estado;
-   integração frontend;
-   UX técnica;
-   testes relacionados.

## Backend

Responsável por:

-   APIs;
-   serviços;
-   persistência;
-   autenticação;
-   validações;
-   regras de negócio;
-   testes.

## Reviewer

Responsável por revisar alterações.

Deve analisar:

-   bugs;
-   segurança;
-   regressões;
-   arquitetura;
-   manutenção;
-   aderência aos requisitos.

Normalmente read-only.

## QA

Responsável por:

-   requisitos;
-   casos de teste;
-   regressões;
-   contratos;
-   autenticação;
-   comportamento funcional;
-   evidências de aceite.

## DevOps

Responsável por:

-   infraestrutura;
-   CI/CD;
-   containers;
-   deploy;
-   observabilidade;
-   configurações operacionais.

Ações de produção continuam sujeitas a aprovação.

------------------------------------------------------------------------

# 7. Multi-runtime / multi-model

Senior não deve depender de um único fornecedor.

Interface conceitual:

``` text
AgentRuntime
├── PiRuntime
├── CodexRuntime
├── ClaudeRuntime
└── futuros runtimes (ex.: GrokRuntime)
```

O `AgentExecutor` não deve conhecer detalhes específicos de cada
fornecedor.

Ele chama uma abstração comum.

Atualmente:

-   Pi Runtime funciona;
-   Codex Runtime funciona;
-   ✅ **Claude Runtime funciona** — `ClaudeAdapter` +
    `ClaudeRuntime` invocam o CLI `claude` (Claude Code) já
    autenticado na máquina pela assinatura do usuário, **não** por
    chave de API do Senior. Confirmado com uma chamada real. Grok
    fica para depois: precisa que o usuário instale e faça login no
    CLI oficial da xAI (`@xai-official/grok`) primeiro — sem chave
    de API também, mesma filosofia de "usar a assinatura, não pagar
    por token à parte".
-   OpenAI via Pi funciona;
-   Anthropic via Pi está integrado, embora disponibilidade dependa da
    conta;
-   ✅ **Seleção manual por chamada**: em vez de só uma variável de
    ambiente fixa para tudo, `Orchestrator.createPlan()`,
    `executeTask()`, `correctTask()` e `talkToChief()` aceitam um
    `{ provider, model }` opcional — quem dispara escolhe o modelo
    na hora, tarefa por tarefa. CLI: `--provider codex|claude|pi
    --model <modelo>` em `plan`/`executar`/`ask`. API: mesmo par de
    campos no corpo do POST. Sem informar nada, cai no comportamento
    de sempre (Codex).

Dois bugs reais de Windows apareceram construindo isso, mesma causa
raiz dos anteriores (npx/JobManager, codex/CodexAdapter): "claude"
instalado via `npm install -g` também é um shim `.cmd`. A correção
foi generalizada em `resolveGlobalCli()` (usado por Codex e Claude),
que resolve o executável real por trás do shim via `where <comando>`
em vez de depender de shell. Um terceiro problema, específico do
Claude: a flag `--bare` (cogitada para reduzir overhead) desativa
leitura do keychain do SO — exatamente onde a sessão da assinatura
fica — quebrando o login mesmo com o CLI autenticado. Descoberto
testando manualmente antes de considerar a integração pronta;
documentado como comentário no próprio adapter para não ser
reintroduzido.

Pi é um motor abaixo do Senior. Ele não substitui:

-   ProjectManager;
-   TaskManager;
-   Orchestrator;
-   políticas;
-   Validation Loop;
-   memória;
-   approvals;
-   interface.

------------------------------------------------------------------------

# 8. Git como parte da arquitetura

Cada tarefa de implementação deve trabalhar isoladamente.

Fluxo:

``` text
Projeto / main
     │
     ├── worktree task-1
     │       └── branch própria
     │
     ├── worktree task-2
     │       └── branch própria
     │
     └── worktree task-3
             └── branch própria
```

O Senior já possui um `GitManager` que:

-   inicializa repositório quando necessário;
-   cria worktrees;
-   cria branches por tarefa;
-   parte do commit correto;
-   considera commits das dependências;
-   realiza commit da tarefa;
-   registra HEAD final;
-   mantém linhagem.

`headCommit` deve ser tratado como referência oficial do código
analisado por uma tarefa.

------------------------------------------------------------------------

# 9. Safe Tool Layer

Agentes não devem receber shell irrestrito por padrão.

Ferramentas já construídas:

## WorkspaceGuard

Responsável por impedir:

-   caminhos absolutos;
-   traversal;
-   saída do workspace;
-   escapes por symlink em operações protegidas.

## list_project_files

Lista arquivos do workspace com limites e exclusões.

## read_project_file

Permite leitura controlada.

## write_project_file

Permite escrita controlada somente dentro do workspace.

Agentes read-only não recebem essa ferramenta.

## run_project_check

O agente escolhe apenas um tipo permitido:

``` text
typecheck
test
lint
build
```

O modelo não fornece o comando shell.

O Senior converte a escolha em comandos previamente definidos.

Observação de segurança: scripts `npm run` pertencem ao próprio projeto
e ainda podem conter comportamento arbitrário. Para repositórios não
confiáveis, será necessário isolamento adicional por container/política.

------------------------------------------------------------------------

# 10. Validation Loop --- princípio central

Uma das decisões mais importantes do Senior:

> `DONE` não deve significar que um agente terminou de responder.

O trabalho precisa ser comprovado.

Fluxo desejado:

``` text
PLANEJAMENTO
     │
     ▼
EXECUÇÃO
     │
     ▼
COMMIT
     │
     ▼
VALIDAÇÃO
     │
     ├── critérios de aceite
     ├── regras de negócio
     ├── typecheck
     ├── testes
     ├── lint
     ├── build
     ├── review
     └── QA
     │
     ├──────── PASS ────────► VALIDATED
     │
     └──────── FAIL
                │
                ▼
            DIAGNÓSTICO
                │
                ▼
        PLANO DE CORREÇÃO
                │
                ▼
             CORREÇÃO
                │
                └──────────► VALIDAR NOVAMENTE
```

O sistema precisa impedir loops infinitos.

Depois de várias tentativas sem progresso:

``` text
BLOCKED / NEEDS_HUMAN
```

O usuário recebe:

-   o que falhou;
-   o que foi tentado;
-   evidências;
-   commits;
-   erros;
-   recomendação de intervenção.

------------------------------------------------------------------------

# 11. Dois níveis de validação

## Validação da tarefa

Confirma que uma tarefa individual foi executada corretamente.

## Validação final do plano

Mesmo que todas as tarefas individuais passem, o Senior precisa
verificar se o objetivo original do usuário foi realmente atendido.

Exemplo:

``` text
10 tarefas individualmente corretas
        ≠
objetivo geral necessariamente correto
```

Antes de concluir um projeto/job, deve existir uma validação final
contra o objetivo original.

------------------------------------------------------------------------

# 12. Evidências

Cada critério de aceite precisa possuir evidências.

Exemplos:

``` text
AC-01: usuário consegue fazer login

Evidence:
- teste auth-login passou;
- endpoint retornou 200;
- QA validou comportamento;
- commit abc123 contém implementação.
```

Não basta um agente dizer "funciona".

Senior precisa saber **por que considera que funciona**.

------------------------------------------------------------------------

# 13. Máquina de estados desejada

Estado atual ainda usa:

``` text
WAITING
READY
RUNNING
DONE
FAILED
```

Evolução planejada:

``` text
WAITING
READY
RUNNING
VALIDATING
CORRECTION_REQUIRED
VALIDATED
FAILED
BLOCKED
```

Idealmente dependências só são liberadas quando a tarefa está
`VALIDATED`.

------------------------------------------------------------------------

# 14. Memória

A memória deverá existir em três níveis.

## Working memory

Contexto temporário de uma execução/tarefa.

## Project memory

Persistida no projeto.

Estrutura futura sugerida:

``` text
.senior/
├── PROJECT.md
├── ARCHITECTURE.md
├── CONVENTIONS.md
├── decisions/
└── knowledge/
```

## Global memory

Conhecimento compartilhado do Senior:

-   políticas;
-   padrões;
-   comportamento dos agentes;
-   preferências técnicas;
-   aprendizados gerais.

Começar simples com JSON/SQLite.

Postgres/pgvector apenas quando houver necessidade real.

------------------------------------------------------------------------

# 15. Jobs e execução longa

Senior precisa evoluir de chamadas síncronas para jobs persistentes.

Exemplo:

``` text
Job
├── id
├── projectId
├── objective
├── status
├── createdAt
├── startedAt
├── completedAt
├── tasks
├── events
└── result
```

Isso permitirá:

-   fechar a interface sem perder execução;
-   vários projetos simultâneos;
-   acompanhar progresso;
-   recuperar após falhas;
-   Alexa iniciar trabalhos longos;
-   UI consumir eventos em tempo real.

------------------------------------------------------------------------

# 16. Event system

O frontend não deve depender de scraping de terminal.

O backend deve emitir eventos estruturados.

Exemplos:

``` text
project.created
plan.created
task.ready
task.started
agent.started
agent.message
tool.started
tool.completed
file.changed
check.started
check.completed
commit.created
validation.started
validation.failed
validation.passed
task.blocked
task.validated
job.completed
approval.required
```

Esses eventos alimentam:

-   terminal visual;
-   canvas;
-   timeline;
-   notificações;
-   logs;
-   observabilidade.

------------------------------------------------------------------------

# 17. Frontend do Senior

O frontend será uma parte central do produto, não apenas uma tela
administrativa.

## Home / Projects

Mostrar todos os projetos.

Cada projeto deve apresentar:

-   nome;
-   status;
-   branch;
-   último job;
-   agentes ativos;
-   tarefas em andamento;
-   falhas;
-   validações pendentes;
-   última atividade.

## Project Workspace

Canvas grande e navegável.

Possíveis tecnologias a avaliar:

-   React / Next.js;
-   React Flow para grafos e nós;
-   biblioteca de pan/zoom;
-   WebSocket ou SSE para eventos em tempo real;
-   xterm.js para visualização de terminais.

A escolha final deve ser feita depois de um spike técnico.

## Nodes do canvas

Tipos possíveis:

``` text
Project
Task
Agent
Terminal
Validation
Commit
Approval
Artifact
Decision
Memory
```

Conexões mostram dependências e fluxo.

## Painel lateral

Ao selecionar qualquer elemento:

``` text
Task backend-004
────────────────────
Status
Agent
Prompt
Dependencies
Workspace
Branch
Commit
Files changed
Checks
Acceptance criteria
Evidence
Attempts
Logs
Duration
Token/model metadata
```

## Command Bar

O usuário deve conseguir escrever:

``` text
"Adicione login com Google na Thumdra"
```

Senior cria um job e o fluxo aparece no canvas.

------------------------------------------------------------------------

# 18. Visualização de agentes

Agentes devem parecer trabalhadores ativos dentro do workspace.

Exemplo:

``` text
┌──────────────────────┐
│ BACKEND              │
│ ● RUNNING            │
│                      │
│ backend-004          │
│ Implement auth       │
│                      │
│ GPT-6 Astra / Pi     │
│                      │
│ [ Open Terminal ]    │
└──────────────────────┘
```

Quando um agente usa uma ferramenta:

``` text
Backend
  │
  ├─ read_project_file
  ├─ write_project_file
  ├─ run_project_check
  └─ commit
```

Isso deve aparecer em tempo real.

------------------------------------------------------------------------

# 19. Approvals

Senior nunca deve executar silenciosamente ações críticas.

Exigem aprovação humana:

-   merge em main;
-   migrations de produção;
-   deploy de produção;
-   alteração de secrets;
-   exclusão de repositório;
-   operações destrutivas;
-   ações externas com impacto relevante.

Exemplo visual:

``` text
APPROVAL REQUIRED

Deploy Thumdra → Production

Changes: 14 files
Tests: PASS
QA: PASS
Reviewer: PASS
Commit: abc123

[ APPROVE ] [ REJECT ]
```

------------------------------------------------------------------------

# 20. Alexa / voz

Alexa será uma interface adicional, não a infraestrutura principal.

Arquitetura:

``` text
Echo
 ↓
Alexa Custom Skill
 ↓ HTTPS
Senior Gateway
 ↓
Job Manager
 ↓
Senior Core
```

Exemplo:

> "Alexa, peça ao Senior para corrigir o login da Thumdra."

Resposta:

> "Criei o job. O Senior está analisando o projeto."

Trabalhos longos continuam em background.

Ações críticas precisam de confirmação forte e algumas não devem ser
permitidas apenas por voz.

Bluetooth pode continuar sendo usado para áudio do computador, mas não é
a arquitetura de entrada de voz do Senior.

------------------------------------------------------------------------

# 21. Estado atual implementado

## Ambiente

-   WSL2 Ubuntu;
-   Node 24;
-   TypeScript;
-   Git;
-   GitHub CLI;
-   Codex CLI;
-   Pi;
-   repositório Senior criado no GitHub como privado.

## Core

Implementados:

-   ProjectManager;
-   TaskManager;
-   Orchestrator;
-   AgentExecutor;
-   IntegrationManager;
-   GitManager.

## Agentes

Existem instruções para:

-   Chief;
-   Architect;
-   Backend;
-   Reviewer;
-   QA;
-   Frontend;
-   DevOps.

## Runtime

Implementados:

-   `AgentRuntime`;
-   `RuntimeManager`;
-   `CodexRuntime`;
-   `PiRuntime`.

Pi foi integrado ao fluxo normal do Senior.

## Providers

Testados:

-   OpenAI via Pi;
-   Codex diretamente;
-   Anthropic via Pi alcança o provider, mas uso depende de
    disponibilidade/créditos da conta.

## Git execution

Já existe:

-   workspace isolado;
-   worktree;
-   branch por tarefa;
-   commits;
-   linhagem por dependência;
-   `headCommit`.

## Safe tools

Implementados/testados:

-   WorkspaceGuard;
-   ListProjectFilesTool;
-   ReadProjectFileTool;
-   WriteProjectFileTool;
-   RunProjectCheckTool;
-   PiProjectTools.

Testes reais provaram:

``` text
Senior → Pi → GPT → safe write → arquivo
Senior → Pi → GPT → safe check → typecheck
```

## Execução autônoma

Um ciclo real do projeto local `auth-api` já executou uma sequência de
tarefas com agentes, commits e dependências.

O projeto `auth-api` é local e não deve ser publicado no GitHub.

## Validation

Implementados:

-   `Validation.ts`;
-   `ValidationManager`;
-   `ValidationEngine`;
-   persistência `validation` adicionada ao tipo de task;
-   `TaskManager.setTaskValidation()` criado.

Testes:

``` text
Attempt 1 → FAILED
Attempt 2 → PASSED
```

e:

``` text
ValidationEngine
→ RunProjectCheckTool
→ tsc real
→ exit code 0
→ evidence
→ PASSED
```

------------------------------------------------------------------------

# 22. Ponto exato em que o desenvolvimento parou

**Fase A (Validation Loop + Correction Loop) está completa e
testada.** Os 14 itens da seção 24 foram implementados:

- `Orchestrator.runValidationLoop()` (privado, compartilhado entre
  `executeTask()` e `correctTask()`) roda `ValidationEngine.runChecks()`,
  avalia critérios semânticos via `SemanticValidator` (LLM read-only
  julgando o diff real, não apenas o relato do agente) e persiste tudo
  com `TaskManager.applyValidationResult()` **antes** de decidir o
  status final da tarefa.
- `TaskStatus` ganhou `VALIDATING`, `CORRECTION_REQUIRED`, `VALIDATED`,
  `BLOCKED`. Tarefas sem `businessRules`/`acceptanceCriteria`/
  `requiredChecks` continuam no fluxo antigo (`DONE` + liberação
  imediata) — compatibilidade preservada.
- `TaskManager.releaseReadyTasks()` só libera dependentes quando a
  dependência está `DONE` (sem requisitos de validação) ou
  `VALIDATED`. **Nunca com validação pendente.**
- Correction Loop real: `Orchestrator.correctTask()` reexecuta o
  agente no mesmo worktree com um prompt de correção construído a
  partir do diagnóstico/critérios falhos da tentativa anterior, e
  reavalia.
- Estagnação: duas tentativas seguidas com o mesmo diagnóstico vão
  direto para `BLOCKED` em vez de esgotar o `maxAttempts`.
- `PlanValidator`: alerta estrutural quando uma tarefa backend/frontend
  não tem Reviewer/QA dependente (item 13), e validação final do
  objetivo do plano quando todas as tarefas estão `DONE`/`VALIDATED`
  (item 14), chamada em `runProject()` e persistida em
  `plan.validation`.
- `createPlan()` já pede ao Chief `businessRules`/`acceptanceCriteria`/
  `requiredChecks` por tarefa (opcionais).

Testado em `src/tests/orchestrator-validation-integration-test.ts`
(runtimes falsos, sem rede: prova que o dependente fica `WAITING`
durante `CORRECTION_REQUIRED` e só é liberado após `VALIDATED`, com 2
tentativas registradas) e `src/tests/plan-validator-gates-test.ts`
(gate Reviewer/QA, lógica pura).

Dois bugs reais foram encontrados e corrigidos **pelo próprio teste de
integração** — vale ler antes de mexer em Git/dependências:

1. `AgentExecutor.getDependencyContext()` ainda exigia
   `status === "DONE"` literal; uma tarefa dependente de uma
   `VALIDATED` travava para sempre. Corrigido para aceitar `DONE` OU
   `VALIDATED`.
2. `GitManager.isRepository()` usava
   `git rev-parse --is-inside-work-tree`, que retorna `true` para
   **qualquer** diretório dentro da árvore de um repositório
   ancestral. Como o próprio repo do SENIOR agora é um repositório
   git, todo projeto local em `projects/<id>` era tratado como já
   inicializado e os comandos git da tarefa rodavam no repositório
   ERRADO (o do SENIOR). Corrigido comparando `--show-toplevel` com o
   próprio `projectPath`. **Se algum dia projects/ voltar a viver fora
   da árvore do repo do SENIOR, teste esse caminho de novo.**

------------------------------------------------------------------------

# 23. Próxima tarefa imediata

Fases A a F estão prontas. A próxima etapa é a **Fase G — Frontend**
(seção 17, 18, 24), a maior e mais aberta do roadmap: começar pela
visualização de projetos (lista simples) antes de qualquer canvas —
"não tente construir tudo de uma vez" vale ainda mais aqui do que nas
fases anteriores. Ver seção 24 para a ordem sugerida dentro da própria
Fase G (shell → lista de projetos → workspace → DAG → agentes →
terminal visual → eventos → validation nodes → approvals → canvas
infinito → timeline → command bar).

Dívidas conscientes deixadas para trás (não bloqueantes, mas reais):

- `PlanValidator.validateObjective()` (validação final do plano, item
  14 da Fase A) ainda não tem teste de integração com runtime falso —
  só o gate Reviewer/QA (lógica pura) foi testado. Se for mexer nela,
  escreva esse teste antes.
- As cinco novas ferramentas da Fase B (`git_status`, `git_diff`,
  `search_project_files`, `edit_project_file`,
  `inspect_package_json`) só são injetadas no `PiRuntime`
  (`createPiProjectTools`). O `CodexRuntime` usa as ferramentas
  nativas do Codex CLI via `CodexAdapter` e não passa por elas — isso
  é intencional (Safe Tool Layer é específica do Pi), não um
  esquecimento.
- Global memory (conhecimento compartilhado entre projetos, seção 14)
  não foi implementada — só project memory (`.senior/`) existe hoje.
- `knowledge/` (dentro de `.senior/`) existe como estrutura, mas nada
  escreve nela automaticamente ainda — só `decisions/` é populado
  pelo Orchestrator.

------------------------------------------------------------------------

# 24. Sequência recomendada de desenvolvimento

## Fase A --- finalizar Validation Loop --- ✅ CONCLUÍDA

1.  ✅ Persistir ValidationEngine no Orchestrator.
2.  ✅ Criar teste de integração Orchestrator + Validation.
3.  ✅ Fazer Planning gerar:
    -   businessRules;
    -   acceptanceCriteria;
    -   requiredChecks.
4.  ✅ Criar avaliador semântico de acceptance criteria.
5.  ✅ Registrar evidências.
6.  ✅ Introduzir estados `VALIDATING` e `VALIDATED`.
7.  ✅ Não liberar dependências antes de `VALIDATED`.
8.  ✅ Criar `CORRECTION_REQUIRED`.
9.  ✅ Criar Correction Loop.
10. ✅ Limitar tentativas.
11. ✅ Detectar estagnação.
12. ✅ Criar `BLOCKED / NEEDS_HUMAN`.
13. ✅ Adicionar Reviewer/QA como gates (advisory, ver seção 22).
14. ✅ Criar validação final do plano (sem teste de integração próprio
    ainda — ver dívida na seção 23).

## Fase B --- fortalecer ferramentas --- ✅ CONCLUÍDA

-   ✅ `git_status` (`GitStatusTool`);
-   ✅ `git_diff`, opcionalmente restrito a um caminho (`GitDiffTool`);
-   ✅ busca de texto (`SearchProjectFilesTool` — varredura própria,
    sem depender de grep/rg instalado);
-   ✅ edição estruturada (`EditProjectFileTool` — troca um trecho
    exato em vez de reescrever o arquivo inteiro; reaproveita
    Read/WriteProjectFileTool);
-   ✅ inspeção de package.json (`InspectPackageJsonTool` — resumo
    estruturado: nome, scripts, dependencies/devDependencies);
-   ✅ checks configurados por projeto: `RunProjectCheckTool` agora
    confere se o script (`test`/`lint`/`build`) existe no
    `package.json` do workspace antes de rodá-lo, em vez de assumir
    que todo projeto tem os três. `typecheck` continua fixo (`tsc
    --noEmit`, não depende de script). Também removida a suposição
    de que `test` sempre usa Jest (`--runInBand`).

Todas as ferramentas continuam sem shell irrestrito: nenhum argumento
livre do modelo vira comando de shell — `git_diff`/`search_project_files`
validam caminho via `WorkspaceGuard` antes de qualquer chamada `execFile`.

Testado em `src/tests/fase-b-tools-test.ts` (workspace git temporário
real, sem rede).

## Fase C --- memória --- ✅ CONCLUÍDA (project memory)

`ProjectMemory` (`src/core/ProjectMemory.ts`) cria e lê `.senior/` a
partir de `project.path` (o repositório PRINCIPAL do projeto, não o
worktree isolado da tarefa — agentes não têm acesso de filesystem a
`project.path`, só ao próprio worktree):

```
.senior/
├── PROJECT.md        # curado por humano/agente, Senior nunca sobrescreve
├── ARCHITECTURE.md    # idem
├── CONVENTIONS.md      # idem
├── decisions/          # populado automaticamente pelo Orchestrator
└── knowledge/          # reservado para uso futuro/manual
```

-   ✅ `AgentExecutor.execute()` injeta o conteúdo de `.senior/` (os
    três `.md` + decisões/conhecimento recentes, truncado a ~12k
    caracteres) como seção `# MEMÓRIA DO PROJETO` no prompt de TODA
    tarefa — já é isso que dá ao agente contexto arquitetural sem
    precisar redescobrir tudo a cada execução.
-   ✅ `Orchestrator.maybeRecordDecision()` grava automaticamente um
    arquivo em `decisions/` (task id, agente, objetivo, tarefa,
    commit, resultado relatado) sempre que uma tarefa termina em
    `DONE` (sem validação) ou `VALIDATED`. **Deliberadamente não**
    tenta extrair "decisões"/"conhecimento" do texto livre do agente
    via outra chamada de LLM — seria frágil; o histórico de tentativas
    falhas já vive em `task.validation`, memória não duplica isso.
-   ✅ `PROJECT.md`/`ARCHITECTURE.md`/`CONVENTIONS.md` são só lidos
    pelo Senior, nunca escritos automaticamente — continuam sendo
    território do humano (ou de um agente rodando fora do fluxo
    automático).
-   `knowledge/` existe (estrutura criada) mas nada escreve nela
    ainda automaticamente — fica como extensão manual/futura.

Global memory (políticas/padrões compartilhados entre projetos, seção
14) **não foi implementada** nesta fase — ficou de fora por não ter
demanda real ainda (o próprio doc diz para só migrar quando houver
necessidade).

Testado em `src/tests/project-memory-test.ts`: cria estrutura padrão,
prova que conteúdo humano nunca é sobrescrito, grava e lê uma decisão.

## Fase D --- Jobs --- ✅ CONCLUÍDA

`JobManager` (`src/core/JobManager.ts`) persiste jobs em
`data/jobs/<jobId>.json` (um arquivo por job — não um array
compartilhado, ver motivo abaixo) e `data/jobs/logs/<jobId>.log`.

-   ✅ `start(projectId)` cria o registro do job (`PENDING`) e dispara
    um processo Node **destacado** (`spawn(..., {detached:true})` +
    `unref()`) que roda `Orchestrator.runProject()` de forma
    independente (`src/jobs/runJob.ts`). `start()` retorna na hora —
    a CLI não fica bloqueada e o processo continua mesmo que o
    terminal que chamou seja fechado.
-   ✅ O processo destacado atualiza o próprio job
    (`markRunning`/`markCompleted`/`markFailed`) conforme progride.
-   ✅ `reconcile()` implementa "recuperar após falhas": detecta jobs
    presos em `RUNNING` cujo processo (pid) já morreu (crash, reinício
    da máquina) e os marca `FAILED` com motivo explícito, em vez de
    deixá-los "rodando" para sempre. Chamado automaticamente em
    `senior job status`.
-   ✅ CLI: `job start <projeto>`, `job status <jobId>`,
    `job list [projeto]`, `job logs <jobId>`.

Dois problemas reais de Windows apareceram e foram corrigidos:

1. `spawn("npx", ...)` falha com `ENOENT` no Windows sem
   `shell:true` (npx é um shim `.cmd`) — e `shell:true` traz risco de
   escaping (Node emite `DEP0190`). Corrigido invocando
   `node <caminho-para-tsx/dist/cli.mjs> <script> <jobId>`
   diretamente — multiplataforma, sem shell.
2. **Corrupção real de dados**: a primeira versão usava um único
   `data/jobs.json` com toda a lista de jobs. O processo pai (que
   chama `start()`/`get()`) e o processo destacado do job (que chama
   `markRunning()`/`markCompleted()`) escrevem quase ao mesmo tempo —
   e duas escritas concorrentes no MESMO arquivo corrompiam o JSON
   inteiro (`JSON.parse` falhando em conteúdo parcialmente escrito),
   derrubando qualquer leitura de QUALQUER job. Corrigido migrando
   para um arquivo por job + escrita atômica (grava em `.tmp-<uuid>`
   e usa `rename()`, que é atômico no mesmo filesystem) — um leitor
   nunca vê um arquivo pela metade. Reproduzido de forma flaky em ~1
   a cada poucas execuções do teste antes do fix; 0 falhas em várias
   rodadas depois.
-   ✅ `child.on("error", ...)` no processo spawnado: sem isso, uma
    falha ao sequer iniciar o processo (binário ausente) derrubava
    quem chamou `start()` com um "Unhandled 'error' event" em vez de
    apenas marcar o job como `FAILED`.

Testado em `src/tests/job-manager-test.ts`: ciclo completo
start→running→completed com processo real destacado (sem depender de
LLM — usa um runner falso injetável), captura de log, `list()`,
`reconcile()` de job travado, e o guard de erro de spawn.

## Fase E --- Event Bus --- ✅ CONCLUÍDA

`EventBus` (`src/core/EventBus.ts`) persiste cada evento em
`data/events/<projectId>.jsonl` (append-only, JSON Lines — um objeto
por linha, lido por `senior events <projeto>` ou por qualquer
consumidor futuro, inclusive de outro processo) e também emite num
`EventEmitter` em memória para quem estiver escutando no mesmo
processo (`bus.on(tipo, listener)`).

Tipos implementados (subconjunto real da lista da seção 16 — só o que
o Senior consegue emitir a partir de transições de estado que já
existem, honestamente):

```
project.created    plan.created       task.ready
task.started       agent.started      agent.message
validation.started validation.failed  validation.passed
task.blocked       task.validated     commit.created
job.completed
```

Onde cada um é emitido:

-   `project.created`/`plan.created`: `Orchestrator.createProject()` /
    `createPlan()`.
-   `task.ready`/`task.started`/`task.validated`/`task.blocked`: no
    `TaskManager`, exatamente onde a transição de estado acontece
    (`releaseReadyTasks`, `startTask`/`startCorrection`,
    `applyValidationResult`) — não inferido de fora.
-   `agent.started`/`agent.message`: `Orchestrator.executeTask()` /
    `correctTask()`, ao redor da chamada ao `AgentExecutor`.
-   `commit.created`: idem, quando `commitResult.changed` é true.
-   `validation.started`/`validation.failed`/`validation.passed`:
    `Orchestrator.runValidationLoop()`.
-   `job.completed`: `src/jobs/runJob.ts`, depois de
    `JobManager.markCompleted()`.

**Deliberadamente fora** (exigiriam instrumentação que não existe
ainda, ver comentário em `src/types/Event.ts`):

-   `tool.started`/`tool.completed`: o loop de ferramentas roda dentro
    do PiRuntime/Codex; o Orchestrator não vê chamadas individuais de
    ferramenta.
-   `file.changed`: exigiria diff por arquivo, não só por commit.
-   `approval.required`: não existe mecanismo de approvals ainda
    (isso é trabalho de uma fase futura, não coberta no roadmap atual
    A-I).
-   `check.started`/`check.completed`: existe só como
    `validation.started`/`.failed`/`.passed` em granularidade mais
    grossa (por tentativa de validação, não por check individual).

CLI: `senior events <projeto> [limite]`.

Testado em `src/tests/event-bus-test.ts` (emit/on/off/list, filtros
`since`/`limit`, persistência lida por uma segunda instância — simula
outro processo) e em
`src/tests/orchestrator-validation-integration-test.ts`, que agora
também verifica que o fluxo real (execução + correção + validação)
deixa o rastro de eventos esperado.

## Fase F --- API / Gateway --- ✅ CONCLUÍDA (REST; sem tempo real ainda)

`createGatewayServer()` (`src/gateway/server.ts`) expõe o core via
HTTP usando só `node:http` (sem framework — a superfície ainda é
pequena o suficiente para não justificar Express/Fastify). Sem
autenticação: pensado para localhost/desenvolvimento, não para expor
publicamente.

```
POST   /projects
GET    /projects
GET    /projects/:id
GET    /projects/:id/plan
POST   /projects/:id/plan                        (usa Chief/LLM)
POST   /projects/:id/tasks/:taskId/execute       (usa Chief/LLM)
POST   /projects/:id/tasks/:taskId/correct       (usa Chief/LLM)
POST   /projects/:id/jobs
GET    /jobs
GET    /jobs/:jobId
GET    /jobs/:jobId/logs
GET    /projects/:id/events
GET    /projects/:id/memory
GET    /agents
```

-   ✅ projetos, jobs, tarefas (via plano), agentes (papéis lidos de
    `agents/*/AGENT.md`), eventos, logs, memória — tudo da lista do
    doc, exceto:
-   ❌ **approvals**: não implementado, propositalmente. Não existe
    mecanismo de approvals no core ainda (seção 19 nunca foi
    construída) — expor uma rota que não faz nada seria pior que não
    expor.
-   `createGatewayServer(deps?)` aceita overrides de
    `orchestrator`/`jobManager`/`eventBus`/`projectMemory`, o que
    permitiu testar o fluxo completo (incluindo `POST
    /projects/:id/jobs` → `GET /jobs/:jobId` até `DONE`) com um
    runner de job falso injetado, sem depender de LLM real.
-   **Sem tempo real ainda**: os eventos são só `GET` (poll). WebSocket
    ou SSE para tempo real fica para quando o frontend (Fase G)
    realmente precisar — não construir antes de ter um consumidor.

CLI: `senior gateway start [porta]` (padrão 4000).

Testado em `src/tests/gateway-test.ts`: sobe o servidor numa porta
efêmera, cria projeto via HTTP, confere 404/200, confere que o evento
`project.created` do core aparece via `/events`, lê `/memory`,
`/agents`, e roda o ciclo completo de job via HTTP.

Também corrigido nesta fase: `agents/*/AGENT.md` ainda tinham "JARVIS"
no conteúdo (o rebrand anterior só cobriu `src/`) — apareceu ao testar
`GET /agents` manualmente e foi corrigido.

## Fase G --- Frontend

Começar pela visualização de projetos e depois construir o canvas.

Ordem sugerida:

1.  shell do frontend;
2.  lista de projetos;
3.  workspace de projeto;
4.  DAG de tasks;
5.  agentes;
6.  terminal visual;
7.  stream de eventos;
8.  validation nodes;
9.  approvals;
10. canvas infinito;
11. timeline;
12. command bar.

## Fase H --- execução paralela

Somente depois que estado, jobs e validação estiverem sólidos.

Executar tarefas independentes simultaneamente.

## Fase I --- Alexa

Conectar Alexa Custom Skill ao Gateway.

------------------------------------------------------------------------

# 25. Regra para agentes que continuarem este projeto

Antes de modificar código:

1.  leia este documento;
2.  inspecione o código atual;
3.  execute `npx tsc --noEmit`;
4.  não suponha que este documento substitui o código real;
5.  preserve compatibilidade;
6.  faça mudanças pequenas;
7.  teste depois de cada mudança;
8.  não remova proteções existentes;
9.  não introduza shell irrestrito;
10. não publique projetos locais;
11. não faça deploy;
12. não faça merge em main automaticamente;
13. não altere credenciais;
14. registre decisões arquiteturais importantes.

------------------------------------------------------------------------

# 26. Regras específicas para Codex

Quando Codex assumir uma etapa:

-   trabalhar dentro do repositório Senior;
-   ler este documento primeiro;
-   verificar `git status`;
-   entender arquivos relacionados antes de editar;
-   evitar grandes refactors sem necessidade;
-   executar typecheck;
-   executar testes relevantes;
-   informar arquivos alterados;
-   informar checks executados;
-   informar limitações;
-   não declarar sucesso se checks falharem;
-   não mascarar erros;
-   não modificar `projects/auth-api`;
-   não acessar/exibir tokens;
-   não executar ações destrutivas;
-   criar commits pequenos e descritivos quando solicitado.

Prompt recomendado:

``` text
Leia SENIOR_MASTER_PLAN.md integralmente antes de alterar qualquer arquivo.

Você está continuando o desenvolvimento do Senior, um orquestrador multiagente de engenharia de software.

Inspecione o estado real do código e compare com o documento. O código é a fonte de verdade para o estado implementado; o documento define a arquitetura e a direção desejada.

Continue a partir da seção "Ponto exato em que o desenvolvimento parou".

Faça uma mudança pequena por vez. Preserve as proteções existentes. Execute npx tsc --noEmit e os testes relevantes depois de cada etapa.

Não implemente etapas futuras antes de estabilizar a etapa atual.

Nunca considere uma tarefa concluída apenas porque um agente terminou de responder. A direção arquitetural é Execution → Evidence → Validation → Correction quando necessário → Validated.
```

------------------------------------------------------------------------

# 27. Estrutura futura desejada do repositório

``` text
senior/
├── agents/
│   ├── chief/
│   ├── architect/
│   ├── frontend/
│   ├── backend/
│   ├── reviewer/
│   ├── qa/
│   └── devops/
│
├── apps/
│   └── web/
│
├── src/
│   ├── core/
│   ├── runtimes/
│   ├── adapters/
│   ├── tools/
│   ├── jobs/
│   ├── events/
│   ├── memory/
│   ├── gateway/
│   ├── approvals/
│   ├── tests/
│   └── types/
│
├── docs/
│   ├── architecture/
│   └── decisions/
│
├── .senior/
├── SENIOR_MASTER_PLAN.md
├── README.md
├── package.json
└── tsconfig.json
```

Não reorganizar o repositório inteiro agora. Essa é uma direção futura.

------------------------------------------------------------------------

# 28. Visão do produto maduro

No estado final, o usuário abre Senior e vê todos os seus projetos.

Ele entra na Thumdra.

No canvas aparecem:

``` text
Objective
   ↓
Chief
   ↓
Plan
   ↓
┌─────────────┬─────────────┐
Backend       Frontend
   │             │
Terminal      Terminal
   │             │
Commit        Commit
   └──────┬──────┘
          ↓
       Reviewer
          ↓
          QA
          ↓
      Validation
          │
     ┌────┴────┐
     PASS     FAIL
      │         │
Validated   Correction
                │
                └──► Validation
```

Enquanto isso, outro projeto pode estar executando outro job.

O usuário pode afastar o zoom e visualizar a operação inteira:

``` text
THUMDRA        BORA         CLIENTE A       CLIENTE B
  ●             ●              ●               ○
RUNNING       VALIDATING      RUNNING        IDLE
```

Ele pode abrir qualquer agente e acompanhar o terminal.

Pode clicar em qualquer tarefa e ver:

-   motivo;
-   responsável;
-   dependências;
-   alterações;
-   commit;
-   checks;
-   evidências;
-   tentativas;
-   custo/modelo;
-   tempo;
-   resultado.

O Senior deixa de ser "um chat com IA" e passa a ser um **ambiente
operacional de engenharia de software com agentes autônomos
supervisionados**.

------------------------------------------------------------------------

# 29. Norte arquitetural

Sempre que houver dúvida sobre uma implementação, priorizar:

``` text
Controle > autonomia cega
Evidência > afirmação
Isolamento > compartilhamento implícito
Estado persistente > contexto efêmero
Eventos estruturados > scraping de logs
Ferramentas limitadas > shell irrestrito
Validação > "agente terminou"
Recuperação > execução perfeita
Humano no controle > ações críticas automáticas
```

------------------------------------------------------------------------

# 30. Definição de sucesso

Senior será considerado próximo da visão inicial quando for possível:

1.  cadastrar vários projetos;
2.  enviar um objetivo para um projeto;
3.  gerar plano com critérios de aceite;
4.  visualizar o plano no frontend;
5.  acompanhar agentes trabalhando;
6.  acompanhar terminais/eventos em tempo real;
7.  executar tarefas em worktrees isolados;
8.  validar automaticamente;
9.  corrigir falhas;
10. bloquear quando não conseguir avançar;
11. pedir aprovação para ações críticas;
12. validar o objetivo final;
13. manter memória do projeto;
14. executar vários jobs;
15. recuperar estado após reinício;
16. navegar por tudo em um workspace visual amplo;
17. usar CLI, Web e futuramente Alexa como interfaces para o mesmo
    Senior Core.

------------------------------------------------------------------------

## Instrução final para o próximo agente

**Não tente construir tudo de uma vez.**

O Senior já possui uma base funcional. A prioridade é transformar essa
base em um sistema confiável.

A ordem imediata é:

``` text
1. Persistir ValidationResult no Orchestrator          ✅ FEITO
2. Testar integração                                    ✅ FEITO
3. Fazer Planning gerar requisitos de validação          ✅ FEITO
4. Avaliar critérios semanticamente                      ✅ FEITO
5. Tornar Validation bloqueante                          ✅ FEITO
6. Correction Loop                                       ✅ FEITO
7. Reviewer/QA gates                                     ✅ FEITO (advisory)
8. Plan-level Validation                                 ✅ FEITO
9. Memory (project memory)                               ✅ FEITO
10. Jobs                                                 ✅ FEITO
11. Events                                               ✅ FEITO
12. API                                                  ✅ FEITO (sem approvals, sem tempo real)
13. Frontend visual                                      <- PRÓXIMO (Fase G)
14. Paralelismo
15. Alexa
```

Qualquer alteração deve preservar o que já funciona e aproximar o
sistema dessa arquitetura.

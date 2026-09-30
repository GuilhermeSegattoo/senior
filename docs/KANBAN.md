# Kanban — Jarvis Senior

Atualizado em 29/09/2026 (America/Sao_Paulo). Este é um quadro versionado em Markdown vinculado às issues; não é um Project nativo do GitHub nem sincronização automática. Atualize o estado ao iniciar, bloquear, revisar e concluir cada cartão.

## Quadro

| Estado | Prioridade | Cartão |
| --- | --- | --- |
| Em revisão | P0 | [Núcleo persistente, interface e preparação de deploy — PR #1](https://github.com/GuilhermeSegattoo/senior/pull/1) |
| Bloqueado | P0 | [Publicação privada e validação das contas reais](https://github.com/GuilhermeSegattoo/senior/issues/2) |
| A fazer | P0 | [Isolar worker de engenharia antes de habilitar código em produção](https://github.com/GuilhermeSegattoo/senior/issues/3) |
| A fazer | P1 | [Orçamento financeiro e medição de custo por agente/provedor](https://github.com/GuilhermeSegattoo/senior/issues/4) |
| A fazer | P1 | [Resumo de sessões e recuperação semântica de memória](https://github.com/GuilhermeSegattoo/senior/issues/5) |
| A fazer | P1 | [Histórico de múltiplos planos e retomada do trabalho por projeto](https://github.com/GuilhermeSegattoo/senior/issues/6) |
| A definir | P1 | [Definir e conectar as ferramentas operacionais da Thumdra](https://github.com/GuilhermeSegattoo/senior/issues/7) |
| A fazer | P2 | [Voz, notificações e experiência PWA no celular](https://github.com/GuilhermeSegattoo/senior/issues/8) |
| Concluído localmente | P0 | [Typecheck, testes, build e navegador com runtime simulado](JARVIS_STATUS.md) |

## Regras de trabalho

- A definir → A fazer → Em andamento → Em revisão → Concluído. Bloqueado exige registrar o motivo e a condição de desbloqueio na issue.
- Limite de trabalho em andamento: uma frente de implementação e uma de validação. Especialistas contribuem para a mesma frente antes de abrir novas demandas.
- P0 antes de P1; P2 depois da primeira instalação utilizável. Publicação de conversa não depende de worker de engenharia, desde que a execução de código continue desligada.
- Critérios de aceite vivem na issue; concluir significa evidências verificáveis, não apenas código escrito.
- PR #1 está em rascunho e a principal não foi alterada. A validação local não prova conexão real ou deploy.
- Nunca registrar segredos em issues, comentários, quadro ou commits.

## Próximo marco

Revisar o PR e resolver [publicação privada #2](https://github.com/GuilhermeSegattoo/senior/issues/2): host, domínio, contas reais, HTTPS e restauração de backup. Veja o [runbook](../deploy/README.md).


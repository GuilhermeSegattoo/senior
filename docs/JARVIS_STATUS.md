# Estado do Jarvis Senior — 30/09/2026

## Implementado nesta entrega

- SQLite durável para sessões, mensagens, memória, rodadas e eventos; requisições idempotentes e uma rodada ativa por sessão.
- Contexto recente, memória explícita editável, isolamento de escopo pessoal/projeto, recuperação do histórico após reload.
- Coordenador e até dois especialistas com contribuições encadeadas; interfaces para Codex, Claude Code, Pi, OpenAI, Anthropic e Grok.
- Conversa sem ferramentas de alteração, cancelamento e detecção de processos interrompidos sem reiniciar chamadas pagas automaticamente.
- Frontend de conversa responsivo, eventos com SSE e reconciliação, painel de memória, atividades reais de projeto, seleção de runtime/modelo e manifestação PWA.
- Proxy web privado, sessão assinada HttpOnly, verificação de origem, gateway com token, limite de corpo e login limitado.
- Correções em parsing de veredictos, check obrigatório ausente, autenticação CLI assíncrona, escrita segura de diretórios e concorrência de arquivos JSON.
- Planos validados como DAG, critérios de aceitação e revisão exigidos para implementação, validação final sobre commits integrados em worktree separada.
- Docker/Compose/Caddy e CI preparados para a primeira instalação privada de conversa.

## Evidências de validação

Typecheck do backend; 9 testes novos de memória, coordenação, cancelamento, gateway, integração Git, schema, locks e adaptadores; 18 scripts de regressão pertinentes; lint e build de produção do frontend. Navegador de produção com runtime simulado: login, senha incorreta recusada, cookie HttpOnly/Strict, mutation de origem externa recusada, logout, conversa, memória, reload e viewport de 390 px sem overflow. Conexões reais e dispositivo físico não foram testados. Docker não está instalado no ambiente de desenvolvimento usado nesta entrega: imagens e Compose precisam ser verificados no host antes de publicar.

## Etapas que ainda faltam

1. Instalação em host autorizado, domínio, HTTPS, segredos e primeiro smoke test com cada conta real; backup e restauração no host.
2. Worker isolado por projeto antes de habilitar execução de código em servidor compartilhado. Worktree Git e sandbox do runtime não isolam o processo inteiro; Pi pode executar ferramentas. A publicação inicial mantém execução de engenharia desligada.
3. Ciclo de múltiplos planos por projeto com arquivamento e histórico. Atualmente um plano existente bloqueia substituição.
4. Orçamento financeiro por provedor, medição real de tokens/custo, paralelismo controlado, resumo automático e busca semântica de memória. O limite atual é de rodadas por hora, não de dólares.
5. Integrações operacionais da Thumdra e ferramentas pessoais com permissões específicas; voz, notificações, push, funcionamento offline e teste de instalação em iOS/Android.
6. Dashboard de saúde que execute chamadas reais de diagnóstico por provedor. “Configurado” hoje significa variáveis presentes, não conta validada.
7. Evolução da persistência para múltiplos hosts. Locks SQLite/PID e execução em background atuais pressupõem um único host, uma instância do gateway e uma réplica web.

Esta é uma base funcional implementada e revisável. Não representa toda a visão final nem um serviço já publicado. Não foram acessadas contas reais, enviado código à branch principal ou realizado deploy remoto.

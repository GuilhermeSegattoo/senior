# Senior — assistente pessoal e de projetos

[Kanban e próximas entregas](docs/KANBAN.md) · [PR de implementação](https://github.com/GuilhermeSegattoo/senior/pull/1)

Senior reúne conversa persistente, memória confirmada pelo usuário, sessões pessoais ou vinculadas a projetos e um coordenador com até dois especialistas. O frontend existente de projetos continua disponível; `/assistant` é o novo centro de conversa, inclusive em telas de celular.

## Começar localmente

Use Node 24 e Git. Na raiz:

```sh
npm ci
cp .env.example .env
npm run gateway
```

Configure em `.env` o runtime, sua chave e um identificador de modelo disponível na sua conta. A implantação inicial usa APIs OpenAI, Anthropic ou xAI. Codex e Claude Code exigem seus respectivos CLIs instalados e autenticados; o Pi exige provedor e modelo configurados. Nenhuma assinatura de aplicativo é tratada como chave de API.

Em outro terminal:

```sh
cd apps/web
npm ci
npm run dev -- --hostname 127.0.0.1
```

Abra `http://127.0.0.1:3000/assistant`. O frontend encaminha requisições pelo servidor; chaves de provedores nunca vão ao navegador. O desenvolvimento sem token fica restrito ao acesso local. Se configurar token, configure também senha e segredo de sessão no ambiente do servidor web, conforme `apps/web/.env.example`.

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

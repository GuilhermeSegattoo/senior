# Senior no Dokploy / Traefik — VPS Hetzner

O alvo de publicação é um serviço **Docker Compose no Dokploy**, usando `compose.dokploy.yaml`. Não use `compose.yaml` nesse ambiente: ele inicia Caddy e disputa as portas 80/443 já usadas pelo Traefik. Não houve deploy real ou build Docker neste ambiente de desenvolvimento.

## 1. Preparar serviço e segredos

1. Na VPS Hetzner, mantenha Dokploy/Traefik operacionais e DNS A (e AAAA somente se IPv6 estiver configurado) apontando ao host. Libere 80/443 para Traefik, sem publicar 3000/4000.
2. Crie um projeto e um serviço **Docker Compose**, conecte este repositório e selecione a branch revisada. Caminho Compose: `compose.dokploy.yaml`. Ative **Isolated Deployments**. Use uma réplica de API e web.
3. Na aba Environment, configure `SENIOR_DOMAIN` como hostname, sem esquema; `SENIOR_AGENT_RUNTIME` como openai/anthropic/grok; pelo menos uma chave e seu `SENIOR_*_MODEL` disponível na conta.
4. Gere token, senha e segredo de sessão independentes, por exemplo com `openssl rand -hex 32`. Configure `SENIOR_GATEWAY_TOKEN` (>=32 caracteres), `SENIOR_WEB_PASSWORD` (>=16) e `SENIOR_SESSION_SECRET` (>=32). Nunca envie segredos a issues, PRs ou chats.
5. A configuração mantém `SENIOR_ENABLE_CODE_EXECUTION=false` e não passa chaves de provedores ao web. Execução de código, imports local/GitHub e `/fs/browse` permanecem bloqueados. Planejamento e Chief usam conversationOnly sem ferramentas de execução.

O compose não fixa `container_name`, rede externa ou nomes globais de volumes. Dokploy cria a rede isolada e conecta Traefik; não adicione `dokploy-network` manualmente. Confira o resultado com **Preview Compose** antes do deploy. Os serviços se encontram por `api:4000`, com volumes no namespace do projeto. Isolamento de rede Dokploy não substitui sandbox de execução por projeto.

## 2. Domains e HTTPS

Na aba **Domains**, adicione:

- Host: o mesmo valor de `SENIOR_DOMAIN`.
- Service Name: `web`.
- Container Port: **3000**; Path: `/`.
- HTTPS habilitado, certificado **Let's Encrypt** e **redirect HTTP → HTTPS** habilitado na configuração de domínio/Traefik.

Não crie domínio para `api`. Redeploy após alterar Domains, pois as labels são geradas no deploy. O frontend adiciona `Strict-Transport-Security: max-age=31536000` e `X-Content-Type-Options: nosniff` às respostas; Traefik deve preservá-las. Se aplicar HSTS também em middleware Traefik, mantenha o mesmo valor e confira que o router HTTPS gerado referencia o middleware. Não adicione routers paralelos com nomes fixos.

Verifique no host público, sem autenticação:

```sh
curl -I http://SEU_DOMINIO/login   # deve redirecionar para HTTPS
curl -I https://SEU_DOMINIO/login # deve incluir Strict-Transport-Security
```

## 3. IP confiável e login com backoff

`SENIOR_TRUST_PROXY=true` só é válido porque web não tem porta publicada e recebe tráfego pelo Traefik. Mantenha `forwardedHeaders.insecure=false` e `notAppendXForwardedFor=false` no entryPoint Traefik. Sem CDN/proxy à frente, não habilite confiança global em headers enviados pelo cliente. Se existir CDN, configure `trustedIPs` apenas para seus IPs oficiais e verifique o comportamento real antes de mudar a extração.

O login limita falhas pelo **último IP que Traefik adiciona ao X-Forwarded-For**, ignorando o prefixo controlável pelo cliente. Após cinco falhas começa backoff exponencial de 1s a 60s, com Retry-After, reset em sucesso e expiração após 15 minutos sem falha. IP ausente/inválido entra em um bucket restrito compartilhado; no desenvolvimento sem proxy os headers não são confiados. Com CDN, o último hop pode ser o IP da CDN: não troque para o primeiro IP sem validar a cadeia e implementar seleção dos hops confiáveis.

O estado do limite é por processo; esta versão requer uma réplica web. Múltiplas réplicas exigem um armazenamento compartilhado para o limite.

## 4. Healthchecks e shutdown

O healthcheck API usa `/health`; o web usa `/api/auth` e exige configuração de segredos válida. `depends_on` espera a API saudável. SIGTERM/SIGINT interrompem rodadas e abortam chamadas antes de fechar HTTP/SSE; conexões remanescentes têm limite de 10s. Compose concede 30s de stop grace.

Rodadas e locks incluem PID, boot-id da instância, horário de início e identidade de início do processo no kernel Linux. Um PID repetido no novo container não mantém execução antiga viva. A migração acrescenta colunas sem apagar histórico e registra rodadas interrompidas, sem repetir chamadas pagas automaticamente.

## 5. Backup SQLite com snapshot consistente

No terminal do serviço **api** no Dokploy, execute o script incluído na imagem:

```sh
node deploy/backup-sqlite.mjs /app/data/brain.sqlite /app/data/backups/brain-2026-09-30.sqlite
```

O script usa **VACUUM INTO** parametrizado, inclui dados confirmados no WAL, verifica `PRAGMA integrity_check`, aplica permissão 0600 e recusa sobrescrever arquivos. Não precisa parar o Brain para criar esse snapshot. Use nome novo para cada backup; a execução se dá como usuário node, dono de `/app/data`.

Copie o arquivo para armazenamento externo restrito/criptografado. O backup dentro do volume da VPS não protege contra perda da VPS. Não use a cópia bruta do `.sqlite` aberto como backup e não copie o snapshot junto com WAL/SHM da origem.

Para restaurar, primeiro valide em ambiente separado: pare API, preserve o volume atual, coloque o snapshot no caminho de `SENIOR_BRAIN_DB` (ou `/app/data/brain.sqlite`), mantendo dono node e permissão 0600. Remova apenas os arquivos WAL/SHM antigos **do banco substituído com API parada**, para não reaplicar estado da origem. Inicie uma API e confirme sessões, mensagens e memória.

O snapshot cobre somente o banco escolhido. Projetos/JSON/worktrees e credenciais locais precisam de backup separado, com API e jobs parados para consistência. Não restaure `locks.sqlite` de operações ativas; ele é transitório e deve ser recriado com API/jobs parados. Registre o nome real dos volumes no Dokploy. Ensaie restauração antes de considerar a publicação concluída.

## 6. Smoke test e rollback

- Confirme os dois healthchecks, HTTPS/redirect/HSTS e cookie Secure/HttpOnly.
- Valide falhas de login de um IP sem bloquear outro, incluindo Retry-After.
- Faça uma chamada curta em cada conta habilitada; salve memória e recarregue no computador e celular físico.
- Confirme 403 em browse/imports/jobs de código com flag desabilitada.
- Faça redeploy durante rodada de teste e confirme INTERRUPTED e nova solicitação possível, sem replay automático.
- Teste backup/restauração e retenção de volumes.

Antes de atualizar, registre commit/imagens e faça backup. Em rollback, retorne à imagem/commit anterior e restaure backup compatível se houver alteração de schema. Não use `down -v` em manutenção. Publicação permanece bloqueada pela issue P0 #9 ligada à #2 até revisão das evidências.

## Referências oficiais

- https://docs.dokploy.com/docs/core/docker-compose/domains
- https://docs.dokploy.com/docs/core/docker-compose/utilities
- https://doc.traefik.io/traefik/reference/install-configuration/entrypoints/

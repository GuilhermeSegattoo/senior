# Senior no Dokploy / Traefik — VPS Hetzner

O alvo de publicação é um serviço **Docker Compose no Dokploy**, usando `compose.dokploy.yaml`. Não use `compose.yaml` nesse ambiente: ele inicia Caddy e disputa as portas 80/443 já usadas pelo Traefik. O CI constrói e verifica as imagens; a publicação na VPS continua sendo uma etapa separada.

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

O login limita falhas pelo **último IP que Traefik adiciona ao X-Forwarded-For**, ignorando o prefixo controlável pelo cliente. Após cinco falhas começa backoff exponencial de 1s a 60s, com Retry-After, reset em sucesso e expiração após 15 minutos sem falha. IP ausente/inválido entra em um bucket restrito compartilhado; no desenvolvimento sem proxy os headers não são confiados. Configure `SENIOR_TRUSTED_PROXY_HOPS=1` para Traefik direto e `2` para Cloudflare → Traefik. O IP selecionado fica a N posições da direita; prefixos forjados são ignorados. Valores inválidos ou cadeia curta falham fechados. No Traefik, confie somente nas faixas oficiais do Cloudflare e restrinja o acesso direto à origem quando usar dois hops. `SENIOR_TRUST_PROXY` é configurável e pode ser desligado. O `compose.yaml` é destinado ao Caddy local e define a mesma confiança com um hop.

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

### Schedule diário e retenção

Em **Schedules / Jobs** do serviço Compose no Dokploy, escolha o serviço `api`, cron `0 3 * * *` (03:00 UTC; confirme a timezone usada pelo scheduler) e comando:

```sh
node /app/deploy/backup-sqlite.mjs --daily /app/data/brain.sqlite /app/data/backups
```

Defina `SENIOR_BACKUP_KEEP=14` na aba Environment, ou passe N como último argumento. N deve estar entre 1 e 3650. O script gera nome UTC datado com UUID, serializa execuções concorrentes e só remove snapshots antigos depois de verificar o novo. Mantém N arquivos próprios, preservando arquivos manuais. Verifique o primeiro job e seu log; API precisa estar em execução para o `docker exec`. Não altere `COMPOSE_PROJECT_NAME` em jobs Compose.

### Volume Backup para S3

Em **Volume Backups**, escolha `api`, volume `senior-data`, destino S3 e prefixo exclusivo da aplicação. Agende após o snapshot (por exemplo `30 3 * * *`, confirmando que o job anterior termina antes). Habilite **Turn off container** para uma cópia consistente do SQLite, JSON e locks; esse backup causa uma breve indisponibilidade da API. Registre o nome real do volume `{appName}_senior-data`. Configure também backup de `senior-projects` se houver projetos persistidos, com API/jobs parados.

Use bucket privado com bloqueio de acesso público e criptografia padrão **SSE-S3 ou SSE-KMS**; credenciais devem acessar apenas o bucket/prefixo necessários. Dokploy não criptografa o arquivo por conta própria. Configure lifecycle/retention no S3, por exemplo 30 dias: isso é independente dos N snapshots locais. Confirme upload, criptografia e restauração; manter backup apenas no volume da VPS não protege contra perda do host.

### Restauração ensaiada

1. Baixe um snapshot ou use **Restore Volume** do Dokploy para restaurar o arquivo S3 em **um volume novo, vazio e sem containers usando-o**, numa aplicação isolada. Preserve o volume original. Não execute `down -v` na produção.
2. Pare API e jobs do destino. Copie um snapshot verificado para `/app/data/brain.sqlite`, com dono node e permissão 0600. Copie apenas o snapshot: remova somente WAL/SHM antigos desse banco no destino parado, sem trazer WAL/SHM da origem.
3. Se restaurar o volume completo, preserve projetos/JSON, mas recrie `locks.sqlite` com todos os jobs parados. Confira caminhos e permissões. Inicie uma réplica de API e verifique healthcheck, sessões, mensagens, memória e uma nova gravação.
4. Após validar no ambiente isolado, repita o procedimento controlado na aplicação alvo. Registre nome do arquivo, horário UTC, commit e resultados.

`src/tests/deploy.test.ts` ensaia snapshot com WAL, integridade, permissões, retenção, falha sem perda de backup e reabertura pelo BrainStore num diretório vazio, incluindo uma gravação após restauração. O restore do S3/Dokploy precisa ser ensaiado na VPS, pois não há credenciais de infraestrutura neste CI.

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

- https://docs.dokploy.com/docs/core/docker-compose/schedules
- https://docs.dokploy.com/docs/core/volume-backups

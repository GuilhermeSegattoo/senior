# Publicação privada do Senior

Preparação concluída no código; publicação remota ainda não executada. As imagens não foram construídas neste ambiente por ausência de Docker.

## Requisitos

Host Linux com Docker Engine/Compose, Git, domínio com DNS apontando ao host e portas 80/443 disponíveis. Uma instância de API e web. Comece com conversas via API; CLIs Codex/Claude não estão instalados na imagem. Configure pelo menos uma chave e modelo disponível na sua conta, sem enviar segredos em chats, commits ou PRs.

## Configurar e subir

No host, faça checkout da branch revisada e copie `.env.example` para `.env`. Preencha `SENIOR_DOMAIN` (somente hostname), runtime API, chave e modelo. Gere três segredos independentes com `openssl rand -hex 32`: token do gateway, senha web e segredo de sessão. Token e segredo devem ter pelo menos 32 caracteres, senha pelo menos 16. Proteja o arquivo com `chmod 600 .env`. Mantenha `SENIOR_ENABLE_CODE_EXECUTION=false`.

```sh
docker compose config --quiet
docker compose build
docker compose up -d
docker compose ps
```

O gateway não publica porta no host. Caddy encaminha HTTPS à web, que autentica e encaminha internamente à API. Volumes preservam `/app/data` e `/app/projects`. Abra `https://SEU_DOMINIO/login`, entre e acesse `/assistant`. No celular, use o mesmo endereço; o proxy evita depender de localhost no aparelho. O manifesto permite oferecer instalação, mas offline/push ainda não existem.

## Smoke test antes de uso habitual

Confira login incorreto recusado, HTTPS e cookie Secure/HttpOnly. Escolha o provedor configurado e faça uma pergunta curta. Salve uma memória, recarregue, saia e entre novamente. Crie sessão de projeto e confirme que memória de outro projeto não aparece. Adicione outro especialista apenas depois de validar a conta dele. Confira logs e cancelamento. Reinicie a API e confirme histórico preservado. Registre provedor, modelo, data e resultado sem copiar chaves. Não exponha o gateway diretamente.

## Backup e restauração offline

Pare o conjunto antes de copiar volumes, para incluir SQLite, arquivos WAL/SHM e JSON em estado consistente. Backups contêm conversas e possivelmente credenciais de runtimes: armazene com acesso restrito e criptografia. Localize os volumes com `docker volume ls` (o prefixo depende do nome do projeto Compose).

```sh
docker compose stop
# Substitua os nomes de volume pelos efetivos; mantenha todos os arquivos.
docker run --rm -v NOME_VOLUME_DATA:/source:ro -v "$PWD/backups":/backup alpine sh -c 'cd /source && tar czf /backup/data.tgz .'
docker run --rm -v NOME_VOLUME_PROJECTS:/source:ro -v "$PWD/backups":/backup alpine sh -c 'cd /source && tar czf /backup/projects.tgz .'
docker compose start
```

Para restaurar, pare os serviços, preserve os volumes atuais e restaure em volumes vazios com os mesmos pontos de montagem, mantendo UID/GID. Não extraia sobre um banco aberto. Só considere o backup válido após restaurar em ambiente separado e conferir sessões, memórias e projetos. Caddy também tem volumes para certificados; o DNS/HTTPS deve ser verificado ao migrar hosts. Esta rotina ainda precisa ser ensaiada no host escolhido.

## Atualização e rollback

Faça backup antes de atualizar. Registre o commit e as imagens utilizados, reconstrua e execute o smoke test. Para rollback, volte ao commit/imagem anterior; se houver mudança futura de schema, restaure o backup correspondente. Não remova volumes com `docker compose down -v` durante manutenção.

## Execução de código

A flag de execução é uma trava de implantação, não um sandbox. Não a habilite em host compartilhado ou que armazene segredos sensíveis de outros serviços. O próximo marco exige worker separado por projeto com limites de rede, filesystem, tempo e recursos, além de política de permissões. O controle por rodadas não substitui limite financeiro na conta do provedor.

# ADR 001 — cérebro persistente com execução limitada

Data: 30/09/2026. Status: implementado para instalação de uma instância.

O Senior já possuía projetos, tarefas, orquestração e canvas, mas a conversa não era uma sessão durável. A nova camada Brain mantém o estado comum em SQLite e usa os runtimes existentes como executores de uma rodada. A identidade do assistente é o coordenador mais o estado persistido; modelos não compartilham memória interna.

BrainStore guarda mensagens, memórias confirmadas, eventos e rodadas. Um requestId identifica o envelope completo e impede repetir chamadas após resposta de rede incerta. Uma restrição de banco limita a rodada ativa por sessão. O Brain fornece histórico recente e memória do escopo, chama até dois especialistas em sequência e entrega as contribuições ao coordenador. Cancelamento impede que conclusão tardia altere uma rodada terminal. Processos mortos são registrados como interrompidos, sem replay pago automático.

Memória não é extraída e salva silenciosamente pelo modelo: o usuário confirma e pode editar ou esquecer. O contexto é limitado e não oferece recuperação semântica de histórico antigo. Conversa usa workspace vazio, modo somente leitura e ferramentas desabilitadas quando suportado pelo adaptador. APIs são de conversa, sem execução de código. Runtimes CLI continuam locais e dependem de instalação/autenticação externa.

Arquivos de projeto/planos/jobs continuam JSON por compatibilidade, com escrita atômica e locks SQLite reentrantes. A integração final reúne os commits das tarefas em uma branch/worktree própria antes dos checks e da validação de objetivo. Não modifica a branch principal. Esta não é uma transação distribuída; PID e locks assumem um host.

A web chama o gateway por proxy no servidor. Token e chaves nunca são enviados ao frontend. O acesso privado usa senha forte, cookie assinado com prazo de 12 horas e verificação de origem. Não há multiusuário, OAuth pessoal ou réplicas independentes nessa versão. HTTPS é terminado pelo Caddy.

Consequências: estado auditável e custo limitado por número de rodadas, com fila simples e especialistas sequenciais. A execução de engenharia em produção é bloqueada por padrão até existir isolamento do worker. Resumo, busca vetorial, custo monetário e múltiplos planos ficam como evolução explícita.

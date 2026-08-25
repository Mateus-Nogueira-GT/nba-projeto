# ADR-0008 — A função e o banco vivem em continentes diferentes

**Status:** aceito · 25/08/2026 · resposta a "os cliques estão lentos"

## Contexto

O cliente relatou que a interface não responde ao toque. A medição confirmou: ~1s de
TTFB em toda tela autenticada.

O cabeçalho da resposta denunciou a causa:

```
x-vercel-id: gru1::iad1
             ^^^^  ^^^^
             entra  executa
          São Paulo  Washington
```

A requisição entra pelo PoP de São Paulo e a **função executa em `iad1`
(Washington)** — o padrão da Vercel para projetos novos. O banco Neon, porém, foi
criado em `sa-east-1` (`...sa-east-1.aws.neon.tech`), **São Paulo**.

Ninguém escolheu essa combinação; ela é o encontro de dois padrões diferentes.

O custo não é uma travessia por página — é uma **por consulta**. Cada tela
autenticada faz de 4 a 6 consultas em sequência: validar sessão, atualizar o
dispositivo, conferir o usuário, conferir o direito de acesso, ler o feed.

### A medição que isola a variável

Mesma função, mesma região, mesmo dia. A única diferença é o número de consultas:

| Rota | Consultas ao banco | TTFB |
| --- | --- | --- |
| `/offline` (estática, servida do PoP) | 0 | ~78 ms |
| `/entrar` (função dinâmica, sem banco) | 0 | ~200 ms |
| `/estatisticas` | poucas | ~430 ms |
| `/gestao` (cadeia completa) | 5 | ~1000 ms |

`/entrar` prova que a função em si é rápida: 200 ms é o custo de rede Brasil↔EUA,
inevitável enquanto a função estiver lá. Os **~800 ms restantes de `/gestao` são as
cinco idas e voltas ao banco**, a ~150 ms cada.

Rodando a mesma cadeia a partir da região do banco, ela custa **178 ms no total**.

## Decisão

**Mover a FUNÇÃO para São Paulo** — `regions: ['gru1']` no `vercel.ts`.

É o melhor destino possível: aproxima a função do banco E dos usuários, matando as
duas latências de uma vez. Nenhum dado sai do Brasil.

A alternativa seria mover o banco para `us-east-1`, ao lado da função. Resolve as
cinco travessias de consulta, mas mantém os ~200 ms da requisição do usuário e tira
os dados do país. Fica registrada como plano B, não como escolha.

### O caminho até aqui (duas atribuições erradas, para não se repetirem)

A chave `regions` foi aplicada em 25/08 e o deploy voltou `Deployment was blocked`.

**Primeira leitura, errada:** "o plano recusa a chave". Um deploy de controle **sem**
a chave falhou igual, então a chave não era a causa.

**Segunda leitura, errada:** "a conta atingiu algum limite". O histórico completo de
status do commit no GitHub — e não só o status mais recente — trazia a mensagem real:

```
Git author Mateus-Nogueira-GT must have access to the project
on Vercel to create deployments.
```

**A causa real:** a Vercel verifica o AUTOR do commit. Os commits são assinados com
`mateusnnogueira451@gmail.com`, que o GitHub resolve para o usuário
`Mateus-Nogueira-GT`; essa identidade não tem acesso ao projeto na Vercel (escopo
`plus-green`). Sem isso, nenhum deploy por Git é criado — o build sequer começa.

Nada disso tem relação com região, plano ou limite de uso. A lição de método: o
GitHub guarda VÁRIOS status por commit e a API devolve o mais recente por padrão;
`/statuses` (plural) mostrou a mensagem específica que `/status` escondia.

**Consequência prática:** a região configurada aqui só entra em vigor quando o
acesso do autor for resolvido no painel da Vercel — ou quando um deploy for
disparado pelo próprio dono da conta (botão *Redeploy*, ou `vercel deploy` pela
CLI), que não passa pela verificação de autor.

## Consequências

**Com a função em São Paulo.** As cinco consultas passam a custar ~2 ms cada e a
requisição deixa de atravessar o Atlântico. TTFB previsto na casa dos
**60–100 ms**, contra ~1000 ms hoje.

**Se um dia o plano recusar a região** (não foi possível verificar), o plano B é o
banco nos EUA: As cinco consultas passam a custar ~2 ms cada, mas os
~200 ms de travessia da requisição continuam. TTFB previsto **~210 ms** — o piso que
`/entrar` já demonstra hoje. Em troca, **os dados saem do Brasil**: não há dado
sensível no modelo (e-mail, hash de senha, preferências), mas é decisão de
tratamento de dados, não só de latência, e vale registrar antes de existir
assinante pagante.

**Custo da migração (só no plano B).** Baixo hoje, alto depois. O banco atual é quase todo
demonstração, reconstruível por `npm run demo:seed`. O que precisa viajar de
verdade são `usuarios`, `direitos_acesso` e `push_inscricoes` — poucas linhas. Essa
janela fecha quando entrar o primeiro assinante pagante.

## Alternativas descartadas

**Cache das telas.** Todo conteúdo é por usuário e por rodada; `force-dynamic` e
`private, no-store` estão certos. Cachear aqui trocaria lentidão por vazamento de
dado entre contas.

**Menos consultas.** Vale por si (ver a redução da cadeia de autenticação no mesmo
PR), mas trata o sintoma: 3 consultas × 150 ms ainda é meio segundo. A distância é
que precisa sumir.

**Driver HTTP do Neon no lugar do WebSocket.** Não elimina a travessia, e o projeto
depende de transação interativa em sessão, bootstrap e webhook (ver o comentário em
`db/cliente.ts`).

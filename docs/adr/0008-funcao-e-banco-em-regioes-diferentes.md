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

**Colocar função e banco na mesma região.** Qual das duas se move depende de uma
resposta que ainda não temos.

**Caminho A — mover a FUNÇÃO para São Paulo** (`regions: ['gru1']` no `vercel.ts`).
É o melhor destino: aproxima a função do banco E dos usuários, matando as duas
latências de uma vez. A documentação da Vercel lista "Hobby · single region", o que
sugere que uma região é configurável.

**Caminho B — mover o BANCO para `us-east-1`**, ao lado da função. Não exige nada do
plano. Resolve as cinco travessias de consulta, mas mantém os ~200ms de ida e volta
da requisição do usuário.

**Testar o A primeiro**: é gratuito tentar e estritamente melhor se passar.

### O que NÃO se sabe, e por quê

Tentou-se o caminho A em 25/08 e o deploy foi recusado com `Deployment was blocked`.
A leitura imediata foi "o plano recusa a chave `regions`" — e ela estava **errada**.
Um deploy de controle, sem a chave, falhou igual:

| Horário (UTC) | `regions` | Resultado |
| --- | --- | --- |
| até 12:31 | ausente | deploy ok |
| 15:54 | `['gru1']` | `Deployment was blocked` |
| 15:55 | `['iad1']` | `Deployment was blocked` |
| 16:02 | ausente | `Deployment was blocked` |

O corte é **temporal, não causal**: a partir de ~15:54 UTC todo deploy do projeto é
bloqueado, com ou sem a chave. A mudança de região foi só o primeiro push depois do
corte, o que a fez parecer culpada.

`Deployment was blocked` é bloqueio de CONTA, não de build (ele acontece antes do
build). As causas típicas são limite de uso do plano atingido, limite de gasto ou
pausa administrativa do projeto — nenhuma delas visível pela API pública do GitHub.

**Portanto:** enquanto o bloqueio da conta não for resolvido no painel da Vercel,
não dá para afirmar se `regions: ['gru1']` funciona neste plano. A chave está fora
do `vercel.ts` porque não foi possível validá-la, não porque foi reprovada.

## Consequências

**Caminho A (função em São Paulo).** As cinco consultas passam a custar ~2 ms cada
e a requisição deixa de atravessar o Atlântico. TTFB previsto na casa dos
**60–100 ms**. Nenhum dado sai do Brasil.

**Caminho B (banco nos EUA).** As cinco consultas passam a custar ~2 ms cada, mas os
~200 ms de travessia da requisição continuam. TTFB previsto **~210 ms** — o piso que
`/entrar` já demonstra hoje. Em troca, **os dados saem do Brasil**: não há dado
sensível no modelo (e-mail, hash de senha, preferências), mas é decisão de
tratamento de dados, não só de latência, e vale registrar antes de existir
assinante pagante.

**Custo da migração (só no caminho B).** Baixo hoje, alto depois. O banco atual é quase todo
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

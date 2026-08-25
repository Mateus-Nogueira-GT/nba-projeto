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

**Mover o BANCO para `us-east-1`**, ao lado da função — e não o contrário.

A correção natural seria o contrário: `regions: ['gru1']` no `vercel.ts` põe a função
em São Paulo, junto do banco E junto dos usuários. É a melhor configuração possível
e continua sendo o destino.

Ela não está no código porque **a Vercel bloqueia o deploy antes do build neste
plano**. Testado nos dois sentidos, no mesmo dia:

| `regions` | Resultado |
| --- | --- |
| ausente | deploy ok |
| `['gru1']` | `Deployment was blocked` |
| `['iad1']` (o próprio padrão) | `Deployment was blocked` |

Ou seja: o bloqueio é a **chave**, não o valor. A documentação anuncia "Hobby ·
single region", mas na prática a configuração é recusada. Enquanto o plano não
mudar, a única metade movível do par é o banco.

## Consequências

**O que melhora.** Com banco e função em `us-east-1`, as cinco consultas passam a
custar ~2 ms cada em vez de ~150 ms. O TTFB previsto cai de ~1000 ms para a casa dos
**~210 ms** — o piso que `/entrar` já demonstra hoje.

**O que fica pior.** Os dados saem do Brasil. Não há dado pessoal sensível no
modelo (e-mail, hash de senha e preferências), mas isso é uma decisão de
tratamento de dados, não só de latência — e vale registrar antes de valer para
assinante pagante.

**O que não resolve.** Os ~200 ms de travessia Brasil↔EUA da própria requisição
continuam. Só o plano Pro com `regions: ['gru1']` elimina os dois de uma vez,
levando o TTFB para a casa dos 60–100 ms.

**Custo da migração.** Baixo hoje, alto depois. O banco atual é quase todo
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

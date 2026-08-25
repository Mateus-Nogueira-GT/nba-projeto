# Runbook — deploy

## A regra que este runbook existe para gravar

> **O deploy da Vercel NÃO roda migração.** `next build` compila; o banco fica
> onde estava. Todo merge na `main` que traga arquivo novo em `drizzle/` exige
> `npm run db:migrate` — feito por uma pessoa, antes ou logo depois do merge.

Não é preferência de estilo: em **25/08/2026** os PRs #2 e #3 foram mesclados,
o deploy ficou verde, e `/fire-live` respondeu **500** para o assinante logado.
O código pedia `jogadores_ocultos` (migração `0013`) a um banco parado no
schema de 23/08. O deploy verde escondeu o produto quebrado — build e schema
são coisas diferentes, e só uma delas a Vercel cuida.

## Antes de mesclar na `main`

```bash
npx dotenv -e .env.local -- npm run db:status
```

Saída esperada: `✓ Banco em dia com o código.` Se listar pendências, elas vão
para produção junto com o merge — decida ali se aplica antes ou logo depois,
mas nunca "depois eu vejo".

## Depois de mesclar na `main`

```bash
git checkout main && git pull
npx dotenv -e .env.local -- npm run db:status   # o que o merge trouxe
npm run db:migrate                              # se houver pendência
npx dotenv -e .env.local -- npm run db:status   # confirmação
```

E confira o produto **logado**, não só o código HTTP: sem cookie de sessão as
telas pagas devolvem `307` para o login, e um `307` saudável convive
perfeitamente com um `500` do outro lado do paywall — foi assim que o
incidente de 25/08 passou despercebido de fora.

## Quando a migração é destrutiva

`db:migrate` aplica tudo que estiver em `drizzle/`. Antes de rodar com uma
migração que apaga coluna/tabela:

1. Leia o `.sql` — o diretório `drizzle/down/` tem o caminho de volta.
2. Confirme que a coluna não é lida pelo código **em produção agora** (o deploy
   anterior ainda serve requisições durante a troca).
3. Prefira duas etapas: deploy que para de ler → migração que remove.

## Variáveis que o build lê

- `CRON_COMPLETO=true` libera os 7 crons (conta **Pro**). Sem ela, só os dois
  diários — é o padrão, e é o que mantém o build válido no plano Hobby. Ver a
  nota de 25/08 no [ADR-0003](../adr/0003-runtime-vercel.md).
- `DATABASE_URL` e demais segredos vêm do painel; `vercel env pull` traz para o
  `.env.local`.

## Sintomas e causa provável

| Sintoma | Causa provável |
| --- | --- |
| 500 numa tela só, logo após um merge | migração pendente que só aquela tela usa |
| `relation "x" does not exist` no log | `db:migrate` não rodou |
| Build falha citando cron | `CRON_COMPLETO` ligada em conta Hobby |
| Tela sem dado, sem erro | banco em dia, mas o feed não foi republicado |

## Antes de apresentar ao cliente

A demonstração é ancorada num DIA: `semearDemo` monta a rodada da data de
referência de quando roda. **No dia seguinte, o Fire Live abre em "Sem jogos
hoje"** — aconteceu em 25/08/2026.

```bash
npx dotenv -e .env.local -- npm run demo:seed      # traz a rodada para HOJE
npx dotenv -e .env.local -- npm run demo:fotos     # headshots (toca rede)
npx dotenv -e .env.local -- npm run demo:conferir  # a lista de conferência
```

`demo:conferir` é somente leitura e percorre tela por tela — Lista Secreta
(fotos, barrinhas, média, odd, turbo, OPD), Fire Live (placar do 1º quarto,
modo fire), detalhe do apito, resultados, gestão de banca e as três telas de
estatísticas. Sai com código 1 e nomeia o que está sem dado. Só apresente com
`✓ Demonstração pronta para apresentar.`

O seed é reexecutável e faz upsert: rodar de novo não duplica nada.

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
- `DEMO_AUTOSSEMEADURA=true` liga o avanço diário da temporada simulada
  (`/api/cron/demo`, 9h UTC / 6h de Brasília) **e** a faixa "dados simulados"
  no app — um interruptor só, de propósito. **Sem ela o cron roda e pula** —
  responde 200 com `executado: false`, de propósito. Ligue enquanto o banco for
  de demonstração; **desligue antes de conectar provedor real**, senão dado
  fictício sobrescreve dado verdadeiro todo dia de manhã. A carga inicial das 7
  semanas não sai do cron — ver "Antes de apresentar ao cliente".
- `DATABASE_URL` e demais segredos vêm do painel; `vercel env pull` traz para o
  `.env.local`.

## Envs de LLM (todos opcionais)

> Passo a passo completo (OpenRouter + VAPID):
> [`openrouter-e-push.md`](openrouter-e-push.md)

| Env | Padrão | Efeito |
| --- | --- | --- |
| `OPENROUTER_API_KEY` | ausente | Sem ela, todo o subsistema usa o adapter fake e o app funciona normalmente |
| `CHAT_HABILITADO` | `false` | Só a string `true` liga o endpoint `/api/chat` |
| `CHAT_COTA_DIARIA_MVP` | ausente | Perguntas por dia para assinante MVP |
| `CHAT_COTA_DIARIA_ALL_STAR` | ausente | Perguntas por dia para assinante All Star |

Grátis não tem assistente (botão oculto, API 403) — spec, decisão 7. As duas
cotas são **obrigatórias**, sem padrão: falta uma delas (ou `CHAT_HABILITADO`
não é a string exata `true`) e o chat inteiro conta como desligado — botão
oculto, API 503 — em vez de chutar um número. Ver §14 da spec de planos.

**Antes de `CHAT_HABILITADO=true` em produção:** configurar o teto de gasto da
chave no painel do OpenRouter. É o freio que não depende do nosso código.

## Envs de casas de aposta (todos opcionais)

> Passo a passo completo (contas, censo e curadoria):
> [`casas-de-aposta.md`](casas-de-aposta.md)

| Env | Fonte | Efeito |
| --- | --- | --- |
| `ODDS_BETMGM_BASE_URL` · `_API_KEY` · `_BRAND` · `_LOCATION` | BetMGM | os quatro juntos ligam a fonte; falta um, ela não existe |
| `ODDS_BETMGM_LANG` · `_AUTH_HEADER` · `_AUTH_PREFIX` | BetMGM | padrões `en` · `Authorization` · `Bearer` (sem espaço; vazio = chave nua) |
| `ODDS_ALTENAR_GATEWAY_BASE` · `_ORIGIN` · `_INTEGRATION` · `_SPORT_ID` | Altenar | idem: os quatro ligam a fonte |
| `ODDS_ALTENAR_CHAMP_ID` | Altenar | opcional; filtra a NBA |
| `ODDS_SUPERBET_BASE_URL` · `_LOCALE` · `_SPORT_ID` | Superbet | os três ligam a fonte; o host já carrega o mercado (`-br`) e o basquete é `4` |
| `ODDS_SUPERBET_CHAMP_ID` | Superbet | opcional; `tournament_id` da NBA, a confirmar quando a liga voltar |
| `ODDS_SUPERBET_EVENTOS_PATH` · `_EVENTO_PATH` · `_JANELA_MS` | Superbet | opcionais; padrões confirmados contra o feed em 22/09 |
| `ODDS_SUPERBET_API_KEY` · `_AUTH_HEADER` · `_AUTH_PREFIX` | Superbet | opcionais; o feed é aberto (sem credencial) |

Sem nenhuma delas, a coleta de odds do cron é um no-op e as telas seguem no
fallback da tabela estática. Config pela metade **não** liga meia-fonte.

## Sintomas e causa provável

| Sintoma | Causa provável |
| --- | --- |
| 500 numa tela só, logo após um merge | migração pendente que só aquela tela usa |
| `relation "x" does not exist` no log | `db:migrate` não rodou |
| Build falha citando cron | `CRON_COMPLETO` ligada em conta Hobby |
| Tela sem dado, sem erro | banco em dia, mas o feed não foi republicado |

## Antes de apresentar ao cliente

A demonstração é uma **temporada simulada de sete semanas** terminando em
HOJE. Cada dia foi jogado por sorteio e teve a Lista Secreta publicada pelo
motor **antes** de o dia ser jogado — a taxa de acerto que a tela de
Resultados mostra é consequência das regras do CJ, não roteiro. Só o dia de
hoje recebe narrativas da LLM.

Ela continua ancorada num DIA. Sem alguém avançando a janela, no dia seguinte
`data_referencia = hoje` não casa com nada e o Fire Live abre em "Sem jogos
hoje" — aconteceu em **25/08/2026**, com a apresentação marcada.

### A carga inicial é à mão — sempre

Com `DEMO_AUTOSSEMEADURA=true` no painel, o cron das 9h UTC
(`/api/cron/demo`) encerra a rodada de ontem e monta a de hoje. É o regime
normal e basta para manter a demo viva de um dia para o outro. Mas o cron
**não faz a carga inicial**, e o motivo não é só o relógio:

> A rodada de hoje só nasce com o passado inteiro no lugar — média com buraco
> não é a média que o motor leria na véspera. Num banco vazio, cada execução
> diária fecha o que couber em 240 s e para; a rodada de HOJE só aparece na
> execução que zera os dias pendentes. Sem a carga à mão, a demo pode ficar
> **dias** sem primeira rodada.

O outro motivo, o menor: a carga custa minutos e a função da Vercel tem 300 s.
Por isso as sete semanas nascem daqui, uma vez, sem orçamento de tempo:

```bash
npx dotenv -e .env.local -- npm run demo:temporada   # as 7 semanas até HOJE
npx dotenv -e .env.local -- npm run demo:fotos       # headshots (toca rede)
npx dotenv -e .env.local -- npm run demo:conferir    # o portão da apresentação
```

`demo:temporada` é o comando canônico; `demo:seed` é apelido do mesmo script.
Idempotente e resumível: interrompido no meio, o próximo continua do último
dia completo e não duplica nada. Ele termina em uma de duas frases, e só uma
delas deixa seguir:

- `✓ Temporada pronta até hoje.` → siga para `demo:fotos` e `demo:conferir`.
- `! Faltam N dia(s) da janela` → a rodada de hoje **não abriu**. Rode o mesmo
  comando de novo, quantas vezes for preciso, até a primeira frase.

Ordem de grandeza de uma janela cheia, para reconhecer meia carga: ~49 dias
encerrados, ~315 jogos, ~4.600 linhas de box, 21 jogos por time.

### O portão: `demo:conferir`

Somente leitura, percorre tela por tela — Lista Secreta (fotos, barrinhas,
média, odd, narrativa, OPD), Fire Live (placar do 1º quarto, modo fire),
detalhe do apito, Resultados com green **e** red, o lastro da temporada (dias
com jogo, jogos por time, a rodada de hoje com um jogo ao vivo), gestão de
banca e as três telas de estatísticas. Sai com código 1 e nomeia o que está
sem dado. **Só apresente com `✓ Demonstração pronta para apresentar.`**

Duas famílias de item, e a diferença importa às 8h da manhã:

| Marca | Significa |
| --- | --- |
| `✓` / `✗` | conferência: `✗` reprova e o script sai com código 1 |
| `✓` / `·` | informativo: retrata o dia, nunca reprova |

Os informativos existem porque a temporada é **sorteada**: o turbo pede um MVP
com três jogos abaixo seguidos e não acontece todo dia, e a faixa de
demonstração depende do env do APP, que este script — outro processo — não tem
como ler. Um `·` nunca é motivo para adiar a apresentação.

Quando reprova:

| `✗` em | O que fazer |
| --- | --- |
| Lista Secreta · Fire Live · rodada de hoje | `demo:temporada` de novo: a rodada de hoje não abriu |
| dias com jogo · jogos por time | idem — a janela está pela metade, e as médias e a classificação estão junto |
| fotos nos cards | `demo:fotos` (toca rede; sem internet ele falha e os cards ficam sem headshot) |
| green e red | os dias passados não foram produzidos na ordem certa; não mostre a tela de Resultados até investigar |
| OPD · modo fire | os dois cenários que a simulação FORÇA todo dia (spec §3) pararam de funcionar — é defeito, não falta de sorte |

### A faixa "dados simulados"

Com `DEMO_AUTOSSEMEADURA=true` o app mostra a faixa "Temporada demonstrativa ·
dados simulados" em todas as telas, Resultados incluída. Ligue-a no painel da
Vercel (e no `.env.local`, para o `npm run dev`) — mudança de env só vale no
próximo deploy. É o mesmo interruptor do cron, de propósito: a faixa e o dado
fictício ligam e desligam juntos, e nunca sobra faixa sobre dado de verdade
nem dado fictício sem aviso.

O item `Faixa de demonstração` do `demo:conferir` lê o env deste shell, não o
do app — ele diz o que você tem aqui e lembra de confirmar lá. Confirme
abrindo o app: a linha tem de estar no topo de qualquer tela.

### No dia do provedor real

Nesta ordem, sem pular:

1. Desligue `DEMO_AUTOSSEMEADURA` no painel da Vercel e **faça um deploy** — a
   variável só muda de valor no próximo build.
2. Apague a demonstração:

   ```bash
   npx dotenv -e .env.local -- npm run demo:limpar -- --confirmar
   ```

   O `--` antes de `--confirmar` é do npm, não do script: sem ele o argumento
   não chega e nada é apagado. Sem `--confirmar`, o script explica o que faria
   e sai com código 1 — é a rede de proteção, não um erro.

3. Só então ligue a ingestão real.

`limparDemo` apaga o dado de domínio inteiro: times, jogadores, mapa e
identidades, jogos, box de jogador/time/quarto, desfalques, médias, níveis,
classificação, apitos, greens, execuções do Fire Live, feeds, casas e odds.
Contas, sessões, assinaturas, dispositivos, inscrições de push e os rulesets
ficam intactos — e `llm_chamadas` também, de propósito: é o registro de custo e
de reprovação do validador, não dado de demonstração. **A lista de níveis do CJ
vai junto** (`niveis` e `niveis_versao`): reimporte-a antes de a ingestão real
servir apito, senão o motor roda sobre uma hierarquia vazia.

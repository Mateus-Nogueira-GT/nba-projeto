# Casas de aposta reais: BetMGM (Afiliados) e Altenar — coleta de odds pronta para configurar

**Data:** 28/08/2026 · **Status:** escrita a pedido do parceiro, aguardando revisão
**Fontes analisadas:** PDF "Nova API de Odds para Afiliados" (BetMGM, migração V1→V2)
e guia de integração Altenar (token → X-ApiToken → eventos → odds por evento).

---

## 1 · Objetivo em uma frase

Dois adapters novos atrás da porta `CasaDeAposta` que já existe, com todos os
endpoints e traduções prontos, de modo que — criadas as contas — ligar cada
casa seja **preencher variáveis de ambiente**, sem escrever código.

## 2 · O que os documentos dizem (análise)

### BetMGM Afiliados (V2)

- **Formato:** `GET {HOST}/program/v1/api/aff/v2/...`. O PDF NÃO revela o host
  (diz só "continua o mesmo") nem o mecanismo exato de credencial ("permanecem
  inalterados") — os dois só chegam com a conta. Viram env desde já.
- **Obrigatório em 100% das chamadas:** `lang`, `brand`, `location` (checklist
  do próprio PDF). `brand`/`location` são dados da conta → env.
- **Paginação por cursor:** resposta `{ limit, nextCursor, data[] }`; loop até
  `nextCursor: null`; máximo 100 por página. Média sobre página truncada é o
  pior defeito silencioso deste produto — o loop é obrigatório.
- **Eventos:** filtros `sportType`, `matchState`, `participantName`,
  `lastUpdatedAfter`; `matchState` rico (PREMATCH · ONGOING · SUSPENDED ·
  POST_MATCH · ABANDONED…) — o PDF manda tratar estados explicitamente, não
  agrupar. Para nós: **só `PREMATCH` coleta** (odds do card são pré-live);
  qualquer outro estado é descarte contado. `eventName` pode ser **nulo**
  (tratado; o confronto sai dos participantes). Placar vem embutido no evento
  (não usamos — placar nosso vem do provedor NBA).
- **Mercados/resultados:** `betMarketStatus`, `specifiers` (array — é onde
  vive a linha do prop), `marketSubtype` + nome legível (alimenta o
  `mapa_mercados`); odds já em **decimal numérico** (`formatDecimal`) — sem
  conversão americana. `probability` existe e é **ignorada de propósito**:
  o % do produto é score de confiança e nada no app fala em probabilidade.

### Altenar

- **Fluxo:** `GET /api/authenticate` (headers `Origin` + `x-Integration`) →
  token → header `X-ApiToken` nas demais. O guia não persiste token: autentica
  a cada execução — adotamos igual (coleta é 1×/dia; custo zero).
- **Endpoints:** `GET /api/v1/sports/top` (descobrir o `sportId` de basquete —
  é interno por integração, nunca hardcode), `GET /api/v1/events?sportId&
  champId&dateFrom&dateTo&page&pageSize` (eventos do dia),
  `GET /api/v1/events/{eventId}` (mercados e odds: `markets[].odds[]`, com
  `price` decimal e `oddStatus === 0` = ativa; qualquer outro status é
  descarte contado).
- **Query comum:** `culture=pt-BR`, `timezoneOffset=180`, `deviceType=2`,
  `numFormat=en-GB`, `countryCode=BR` — constantes no adapter.
- **Atenção:** o guia veio de OUTRA integração (`esportiva`). `integration`,
  `Origin` e os ids internos (`sportId`, `champId`) são da NOSSA conta quando
  ela existir → env, com um censo para descobrir os ids (seção 6).

## 3 · Fronteira e regras que governam

- **ADR-0004 intocado:** leitura de cotação pública, e só. Nenhum adapter
  autentica USUÁRIO em casa, envia aposta ou movimenta dinheiro (o token da
  Altenar é de leitura do feed, não de conta de apostador).
- **Regra 1:** `odds.casas_minimas` e `odds.exibicao` continuam mandando; nada
  de número novo em código.
- **Nenhum schema de casa atravessa a porta**: toda tradução acontece no
  adapter; o que não equivale a mercado do produto morre na fronteira,
  **contado** (`descartadas`), nunca em silêncio.

## 4 · Arquitetura

### Adapters (L0, `src/modules/ingestao/odds/`)

| Arquivo | Implementa | Injeção |
| --- | --- | --- |
| `betmgm.ts` | `casasBetmgm(config, buscar, jogoIdExterno)` → `CasaDeAposta[]` (uma casa: `betmgm`) | `buscar: typeof fetch` |
| `altenar.ts` | `casasAltenar(config, buscar, jogoIdExterno)` → `CasaDeAposta[]` (uma casa: `altenar`) | idem |

Mesmo padrão do `balldontlie-props.ts`: fixture e HTTP passam pela mesma
tradução; a fábrica real só acrescenta credencial e transporte.

### Vínculo de EVENTO (novo, `vinculo-eventos.ts`)

BetMGM e Altenar não compartilham ids com o provedor NBA. Um casador puro
`casarEventos(eventosDaCasa, jogosDoDia)` liga evento↔jogo por
**(data de referência + nomes dos dois times normalizados via
`normalizarTexto`, aceitando nome completo OU sigla)**. Casou de forma única →
grava `identidades_jogo` com `provedor='betmgm'|'altenar'` (a tabela já
suporta N provedores por jogo). Ambíguo ou sem par → **não vincula, conta** —
aparece no resultado do job, nunca some.

### Vínculo de JOGADOR por nome (novo, tabela `mapa_jogadores_casa`)

O `coletarOdds` de hoje só resolve jogador por `jogadorIdExternoProvedor`
(caminho balldontlie). Casas por nome precisam do espelho do `mapa_mercados`:

```
mapa_jogadores_casa (casa_id, nome_na_casa, jogador_id, confirmado)
UNIQUE (casa_id, nome_na_casa)
```

Semeadura automática CONSERVADORA: se `normalizarTexto(nome_na_casa)` casa com
**exatamente um** jogador canônico, a linha nasce `confirmado=true`; zero ou
mais de um → nasce pendente (`confirmado=false`) e a cotação espera curadoria
(contada em `aguardandoCuradoria`, como o mapa de mercados já faz). Mesmo
princípio do `identidade.ts` da ingestão NBA: match exato normalizado ou
curadoria humana — nunca palpite.

### Pipeline única

`coletarOdds` ganha um segundo caminho de resolução: cotação SEM
`jogadorIdExternoProvedor` resolve por `mapa_jogadores_casa` (só linhas
confirmadas). Snapshot, agregação por casas distintas, `casas_minimas` do
ruleset, upsert idempotente — tudo o que já existe permanece o mesmo para as
três fontes. A média entre casas passa a misturar vendors do balldontlie +
BetMGM + Altenar naturalmente, porque `qtdCasas` já conta casas distintas.

## 5 · Configuração (tudo env; fonte sem env = desligada, app intacto)

| Env | Fonte | Observação |
| --- | --- | --- |
| `ODDS_BETMGM_BASE_URL` | BetMGM | host que o PDF não revela; vem com a conta |
| `ODDS_BETMGM_API_KEY` | BetMGM | credencial da conta |
| `ODDS_BETMGM_AUTH_HEADER` / `ODDS_BETMGM_AUTH_PREFIX` | BetMGM | padrão `Authorization` / `Bearer ` — flexível porque o PDF não especifica o esquema |
| `ODDS_BETMGM_BRAND` / `ODDS_BETMGM_LOCATION` / `ODDS_BETMGM_LANG` | BetMGM | obrigatórios em toda chamada; lang padrão `en` |
| `ODDS_ALTENAR_GATEWAY_BASE` | Altenar | base do authenticate + REST v2 |
| `ODDS_ALTENAR_ORIGIN` / `ODDS_ALTENAR_INTEGRATION` | Altenar | da NOSSA conta (o guia usa os de outra) |
| `ODDS_ALTENAR_SPORT_ID` | Altenar | basquete; descoberto pelo censo, nunca hardcode |
| `ODDS_ALTENAR_CHAMP_ID` | Altenar | opcional; NBA, para filtrar |

`fontesDeOdds(ambiente)` lê tudo isso e devolve as fontes ATIVAS (config
completa) — é a única porta de decisão; o cron itera o que ela devolver.

## 6 · Censo e curadoria (o passo entre "conta criada" e "média no card")

Ferramenta `npm run odds:censo -- --fonte=betmgm|altenar` (somente leitura):
autentica, busca os eventos do dia e imprime o censo de **nomes de mercado** e
**nomes de jogador** com contagens — a matéria-prima para confirmar
`mapa_mercados` e `mapa_jogadores_casa` no admin. Necessária porque nenhum dos
dois documentos mostra como a casa grafia os props de NBA (o PDF nem lista
mercados de exemplo); adivinhar seria violar o princípio da curadoria.

## 7 · Fiação em produção

No cron diário `sincronizar-rodada`, após a sincronização da rodada: para cada
fonte ativa → vincular eventos do dia → `coletarOdds`. Resultado (cotações,
agregadas, sem vínculo, aguardando curadoria, jogos com erro) entra na resposta
do cron. Republicação da lista após coleta já é o comportamento existente.

## 8 · Riscos e desconhecidos declarados

| Desconhecido | Mitigação |
| --- | --- |
| Host e esquema de auth BetMGM | envs flexíveis (header/prefix); fumaça no dia da conta |
| Grafia dos props de NBA nas duas casas | censo + curadoria; nada entra sem confirmação |
| `specifiers` da BetMGM (chave exata da linha) | fronteira tenta chaves conhecidas (`line`, `total`, `points`, `handicap`); resto descarta contado; censo revela o real |
| `sportId`/`champId` Altenar da nossa conta | censo descobre; env fixa |
| Rate limits (nenhum doc declara) | coleta 1×/dia, paginada, por jogo; retry fica para quando houver números reais |

## 9 · Mercado Pago — conferência pedida

**Código: pronto e no mesmo padrão "só configurar"** — adapter real com HMAC
de webhook, fake, checkout, retorno, reconciliação a cada 10min, tudo atrás de
`MERCADOPAGO_CHECKOUT_ENABLED` (hoje `false`) e validado por
`configuracaoProdutoPago()` (env incompleto com checkout ligado derruba o boot
de propósito). Envs: `ACCESS_TOKEN`, `WEBHOOK_SECRET`, `SANDBOX`,
`PLANO_NOME`, `PLANO_VALOR_CENTAVOS`, `PREAPPROVAL_TYPE`, mais
`CADASTRO_PUBLICO_HABILITADO`.

**Lacuna real: os dois artefatos operacionais prometidos não existem** —
`docs/runbooks/mercadopago.md` (dia da virada) e `npm run mp:conferir`
(valida credenciais no sandbox sem ligar nada). Entram como task do plano
desta spec para o MP chegar à MESMA barra das casas: conta criada → env →
conferir → ligar flag.

## 10 · Fora de escopo

- Odds ao vivo (o card é pré-live; `hasLiveTrading`/`ONGOING` descartados).
- Tela de curadoria nova (o `admin/mapeamento` existente ganha os pendentes de
  `mapa_jogadores_casa` numa fatia futura; até lá, censo + SQL assistido).
- Scraping de casas sem API.
- Qualquer coisa além de PONTOS/REBOTES/ASSISTÊNCIAS.

# Odds reais pluggáveis + média entre casas — Design

**Data:** 2026-08-25 (madrugada) · **Estado:** derivado do brainstorm de 25/08 (decisões do parceiro: "puxar as odds das casas e passar a média de todas no app" · "dados fake enquanto isso, criar a lógica e no futuro só conectar as APIs" · provedores escolhidos: BALLDONTLIE GOAT e API-Sports Ultra) — escrita e executada sob a delegação da madrugada; auditoria do parceiro pela manhã
**Specs irmãs:** identidade 03 (`2026-08-25-identidade-03-broadcast-design.md`) entregou o SLOT — `ItemFeed.oddFaixa.media?` e o rodapé `ODD MÉDIA` no card já sabem renderizar; esta spec entrega o número.

## O que a investigação mudou no escopo

O brainstorm assumia "gap 0: nenhum provedor plugado". **Errado** — o scan da tarde
não desceu a `src/modules/ingestao/nba/adaptadores/`:

- **NBA está pronta.** `balldontlie.ts` (608 linhas) e `api-sports.ts` (619) implementam
  a porta `FonteNBA` com failover (`failover.ts`), fixtures espelhando payloads reais e
  os crons já orquestrando por eles. Conectar de verdade É só credencial (`.env`).
- **Escalação/lesões:** os dois adapters declaram `CapacidadeNaoSuportadaError` com
  justificativa escrita (lineups só após o início; injuries sem game_id nem semântica
  de remoção). A decisão é anterior, consciente, e a curadoria admin cobre. Fora do
  escopo desta spec.
- **Odds é o gap real.** Só existe `CasaFake`. Nenhuma casa real, nenhuma média.

O que sobra é pequeno e certeiro: **um adapter de odds real, a média na agregação e o
número no card.**

## A descoberta que define a fonte

`GET /v2/odds/player_props` do BALLDONTLIE (plano GOAT, confirmado no OpenAPI oficial
`balldontlie.io/openapi/nba.yml`):

```
{ id, game_id, player_id,
  vendor: "draftkings"|"betway"|"betrivers"|"ballybet"|"betparx"|"caesars"|"fanduel"|"rebet",
  prop_type: "points"|"rebounds"|"assists"|…|"points_1q"|…,
  line_value: "25.5",
  market: { type: "over_under", over_odds, under_odds } | { type: "milestone", odds },
  updated_at }
```

É EXATAMENTE a matéria-prima do produto: linhas de pontos/rebotes/assistências por
jogador, em **8 casas**, com over/under — e até `points_1q`. Uma chamada por jogo
devolve todas as casas de uma vez. O risco de "player props não existem no provedor",
levantado no brainstorm, morreu para o balldontlie.

**Papel da API-Sports (Ultra):** permanece o que já é — segunda fonte de STATS no
failover da NBA. A doc pública de odds dela cobre mercados de JOGO (vencedor, total,
handicap), não props de jogador, e o site bloqueia leitura anônima (403). Registro:
**não desenhar adapter de odds da API-Sports nesta spec**; se o plano Ultra revelar
props no pré-voo logado, é um `CasaDeAposta` novo pelo mesmo contrato — um arquivo.

## Decisões de tradução (o adapter é a fronteira anticorrupção)

1. **Cada vendor é uma casa.** O adapter fatia a resposta por `vendor` e materializa
   um `CasaDeAposta` por casa (nomes: `balldontlie:draftkings`, …). A média "entre
   casas" que o parceiro pediu é a média sobre vendors — 8 casas de uma chamada.
2. **Odds americanas → decimais.** O provedor devolve inteiro americano (−110, +150);
   o app exibe decimal (1,91 · 2,50). Conversão no ADAPTER, nunca depois da porta:
   `decimal = 1 + (americana > 0 ? americana/100 : 100/|americana|)`, arredondada a
   2 casas. Teste com os quatro quadrantes (−110→1.91, +150→2.50, −200→1.50, +100→2.00).
3. **Meio ponto → linha do CJ.** `line_value "24.5"` no mercado over significa "25 ou
   mais" — exatamente `PONTOS 25+`. Normalização no adapter: `linha = ceil(line_value)`
   para o lado over. Não é regra de estratégia (não decide nada do CJ — é equivalência
   de mercado); a pergunta aberta sobre EXIBIR meio ponto continua com ele.
4. **Só `over_odds` alimenta o produto** (as entradas são sempre "X ou mais");
   `market.type: "milestone"` e props compostas (`points_rebounds`…) são descartados
   no adapter, com contagem em log — nada silencioso.
5. **`prop_type` → atributo** via tabela fixa no adapter (`points→PONTOS`,
   `rebounds→REBOTES`, `assists→ASSISTENCIAS`); os demais tipos não atravessam.
6. **`player_id`/`game_id` do provedor → ids canônicos** pelo caminho que JÁ existe
   (`mapa_jogadores` / `identidades_jogo` da ingestão NBA — mesmo provedor, mesmos
   ids externos). Jogador não mapeado não atravessa: vira contagem de "puladas",
   como na reconciliação atual.

## A média

- `odds_agregada` ganha `odd_media numeric(7,3)` (migração pequena; `odd_mediana`
  continua — é mais robusta a outlier e pode voltar à tela um dia; decidir qual
  exibir foi do parceiro: **média**).
- A agregação (reconciliar) calcula média simples das odds decimais over por
  `(jogo, jogador, atributo, linha)` sobre as casas presentes na coleta.
- A materialização da Lista Secreta preenche `oddFaixa.media` quando `odd_media`
  existe — e o rodapé do card troca sozinho para `ODD MÉDIA 1,55` (componente da
  identidade 03, já testado nos dois estados). O detalhe do apito ganha a média ao
  lado da faixa ("odd média 1,55 · entre 1,47 e 1,62 em 8 casas").

## Fake com a forma exata

`CasaBalldontlieFake` consome fixture com o shape LITERAL do OpenAPI (vendors,
american odds, meio ponto, milestone para ser descartado) e passa pelo MESMO caminho
de tradução do adapter real — a única diferença entre fake e real é quem entrega o
JSON (fixture vs HTTP com `Authorization`). O dia de conectar é: criar
`BALLDONTLIE_API_KEY` no env e trocar a fábrica, como a NBA já faz com
`http.ts`/failover.

## Pré-voo antes de contratar (registro para o parceiro)

1. **BALLDONTLIE GOAT** cobre props confirmado (OpenAPI). Verificar na conta: latência
   dos updates de props e se cobre TODOS os jogos do dia.
2. **API-Sports Ultra**: com a NBA coberta pelo failover atual e props pelo GOAT,
   reavaliar se o Ultra ainda se justifica no orçamento — hoje o papel dele é
   redundância de stats. A doc logada dirá se há props escondidas.
3. As 8 casas de props são AMERICANAS (sem bet365/casas BR na lista de vendors de
   props). A média continua sendo "média das casas que o provedor cobre" — o texto da
   tela já diz "entre N casas na última coleta" e segue honesto.

## Testes

- Adapter: os 4 quadrantes da conversão americana→decimal · meio-ponto→linha inteira
  (24.5→25) · descarte de milestone/compostos com contagem · fatiamento por vendor ·
  jogador não mapeado não atravessa.
- Agregação: `odd_media` = média simples das decimais over da coleta; convive com
  `odd_mediana`; migração com down.
- Materialização: `oddFaixa.media` chega ao item quando existe; card renderiza
  `ODD MÉDIA` (teste já existe na identidade 03 — passa a receber o dado real do
  caminho inteiro no teste de integração da lista).
- Fumaça: o rito completo (tsc · lint · boundaries · suíte · build).

## Fora do escopo (registrado)

- Enviar aposta, credencial de casa, conta vinculada — **ADR-0004 intacto**; esta
  spec É leitura de cotação pública, o que o ADR já permite.
- Adapter de odds API-Sports (condicionado ao pré-voo logado).
- Escalação/lesões por provedor (decisão anterior dos adapters, curadoria cobre).
- Exibir odd no Fire Live (o card quente mostra alvo — decisão da identidade 03).

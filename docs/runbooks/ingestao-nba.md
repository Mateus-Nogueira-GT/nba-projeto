# Ingestão NBA — provedores e operação

## Provedores homologados por contrato

| Papel | Produto | Namespace imutável | Base URL |
| --- | --- | --- | --- |
| primário | BALLDONTLIE GOAT | `balldontlie` | `https://api.balldontlie.io/nba/v1` |
| reserva | API-SPORTS API-NBA Ultra | `api-sports-nba` | `https://v2.nba.api-sports.io` |

Fontes oficiais consultadas em 21/08/2026:

- [BALLDONTLIE](https://docs.balldontlie.io/) e seu
  [OpenAPI](https://www.balldontlie.io/openapi/nba.yml);
- [API-NBA v2](https://api-sports.io/documentation/nba/v2) e
  [produto API-NBA](https://api-sports.io/sports/nba).

Os nomes acima fazem parte da identidade persistida. Não os renomeie depois do
primeiro dado gravado.

## Dono de cada capacidade

| Capacidade | Primário | Reserva | Observação |
| --- | --- | --- | --- |
| times e elenco | BALLDONTLIE | API-NBA | snapshots do escopo consultado |
| agenda, placar, status e relógio | BALLDONTLIE | API-NBA | identidade sempre no namespace da fonte |
| box score de jogador | BALLDONTLIE | API-NBA | acumulado ao vivo; split por quarto só após o final na BDL |
| estatística agregada do time | API-NBA | — | `/games/statistics`; a BDL não documenta equivalente |
| classificação | BALLDONTLIE | API-NBA | temporada regular |
| escalação pós-tipoff | BALLDONTLIE | — | `/lineups`, somente 2025+ e após o início |
| lesões | BALLDONTLIE | — | status livre e sem vínculo por jogo |

Nenhuma das duas documenta escalação completa pré-jogo, regra inequívoca
de DNP ou `updated_at` para os recursos usados. O adapter deve devolver
capacidade não suportada ou `dadoAtualizadoEm: null`; não pode inventar valores.
Enquanto essa lacuna existir, o job de escalação termina como `PARCIAL` e não
altera o último snapshot.

## Semântica de rodada

`data_referencia` usa o campo `date` declarado pelo provedor. `data_hora_utc`
usa o instante ISO do tipoff. Não derive a rodada truncando UTC. Até um smoke
autenticado provar a regra de timezone dos dois provedores, divergência entre
fontes vira conflito operacional e não sobrescreve o canônico.

## Limites e retry

- BALLDONTLIE GOAT: 600 requisições/minuto; paginação por cursor, até 100.
- API-NBA Ultra: 75.000 requisições/dia e 450/minuto.
- `401`/`403` e payload inválido falham imediatamente.
- `429` respeita `Retry-After` quando presente; caso contrário usa backoff
  exponencial com jitter.
- timeout e `5xx` usam retry limitado antes do failover.

O loop ao vivo não pode buscar a liga inteira. Descobre jogos pela data, fixa a
fonte/ID do jogo e consulta apenas cada partida observada.

## Rollout seguro

1. Configure as variáveis de Preview, nunca chaves no repositório.
2. Rode os contract tests com fixtures sanitizadas.
3. Capture no Live Tester um jogo encerrado e um ao vivo de cada fonte.
   Se a API-NBA responder `paging.total > 1`, homologue o parâmetro de página
   antes do rollout; o adapter atual rejeita a resposta para não truncar dados.
4. Execute backfill de um dia em banco isolado e repita para comparar hash.
5. Ative sombra sem publicar Lista Secreta/Fire Live.
6. Compare agenda, placar, jogadores, times e classificação.
7. Ative os crons somente em plano Vercel com frequência por minuto.

Rollback: desligue os schedules e o kill switch de ingestão. Preserve as
migrations aditivas e o último snapshot válido para investigação.

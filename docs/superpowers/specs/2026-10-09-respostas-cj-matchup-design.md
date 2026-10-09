# Respostas do CJ (09/10) — confiança, média mínima, matchup em estrelas e lista por atributo

**Data:** 09/10/2026. **Origem:** respostas do CJ, por áudio, às perguntas de 07/10, repassadas
pelo parceiro com "execute spec, plano e o restante".

## 1. O que cada resposta decide

| # | Resposta | Consequência |
| --- | --- | --- |
| 1 | Rebotes: MVP ≥ 10, All Star 7–9,8, Suporte 4–6,9 | Já é o ruleset. **Nada muda.** |
| 2 | Assistências (e rebotes) **não têm % de confiança**: vale a cor do apito (amarelo < laranja < verde) | REB e AST passam a ter confiança **nula**, e a tela mostra só a cor do nível do apito. PONTOS continua com a tabela homologada. |
| 3 | Média mínima 4 em REB e AST, em todos os níveis, inclusive na OPD; "no Fire Live é basicamente isso também" | A Lista já faz isso. O **Fire Live passa a exigir média ≥ 4 em rebotes** (em assistências já exige). |
| 4 | Matchup = **estrelas** (uma por matchup), corte **top 5 da liga**, liga após 20 dias; matchup negativo = só um aviso | §2 |
| 5 | Cada jogador tem um nível **por atributo**; o nível em rebotes segue a média em rebotes | §3: as grafias repetidas em REB e AST se resolvem pela faixa de média do próprio CJ |
| 6 | "Simmons" = Anfernee Simons (PHI); "Clonley" = Noah Clowney (BKN) | Ligados em produção em 09/10 |

## 2. Matchup em estrelas

- **Não cria apito e não muda o nível nem o %.** Um apito existente ganha **uma estrela por
  critério de matchup** que o adversário do jogo atende. O matchup negativo vira um aviso.
- **Critérios por atributo** do apito. "Top 5" é a posição de 1 a 5 na liga, com empate dividindo
  a posição. Só contam jogos encerrados da temporada **antes** da data do apito:

  | Atributo | ★ por critério | Aviso (negativo) |
  | --- | --- | --- |
  | PONTOS | adversário no top 5 de pontos cedidos por jogo | — |
  | REBOTES | adversário no top 5 de bolas de 3 erradas por jogo | adversário no top 5 de pontos marcados por jogo ("melhores ataques") |
  | ASSISTENCIAS | adversário no top 5 de pontos cedidos; adversário no top 5 de bolas perdidas (turnovers) por jogo | — |

- **Contra-ataque cedido** (pedido para assistências): a BallDontLie só tem a média da temporada
  inteira (`team_season_averages`, `opp_pts_fb`), sem o dado jogo a jogo, e na temporada passada
  esse número já contém o futuro. Fica numa **fase 2**, com um sync diário próprio. O CJ disse que
  "se não tiver, não tem problema".
- **Liga depois de 20 dias de competição**: é a chave existente
  `matchup.liberar_apos_dias_de_competicao: 20`, contando datas com jogo encerrado na temporada
  antes do dia. Com `matchup.habilitado: true`.
- **Tudo no ruleset:** o corte (5), os critérios por atributo e os 20 dias. A regra é uma função
  pura do motor, que recebe as posições do adversário como fato. Quem calcula as posições é a
  entrega (`perfisDoDia`, já em cache), que ganha pontos marcados e bolas perdidas.
- **Onde aparece:** ★ ao lado do nível do apito na Lista, nos cards do Ao Vivo e no painel do apito.
  O painel também diz o motivo de cada estrela e o aviso do negativo. O item do feed carrega
  `matchup: { estrelas, motivos, aviso }`. O retroativo de 2025-26 também, regravado no fim.

## 3. Grafias repetidas em REB e AST

A lista ativa tem 49 grupos em que o mesmo jogador aparece duas vezes no mesmo atributo, com
níveis diferentes. Hoje nenhum entra (dúvida de identidade). Pela resposta 5, o nível de um
atributo segue a média naquele atributo, e as faixas são as do próprio CJ (`classificacao` do
ruleset, resposta 1). **Resolução:** em cada grupo fica a entrada cujo nível bate com a faixa da
média real do jogador no atributo, na temporada mais recente com dado. Se nenhuma ou mais de uma
bater, o grupo continua pendente e é listado para o parceiro. Nada é inventado: sem média, sem
escolha.

## 4. Fora do escopo

Contra-ataque cedido (fase 2), qualquer % para REB e AST (o CJ disse que não há) e mudanças no
front além de exibir estrelas, aviso e a ausência do %.

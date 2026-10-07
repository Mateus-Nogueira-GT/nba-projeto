# Plano — odds ocultas e rodada pela data dos EUA

Spec: [2026-10-07-odds-ocultas-e-rodada-eua-design.md](../specs/2026-10-07-odds-ocultas-e-rodada-eua-design.md).

## A · Odds desligadas

- [x] A1. Schema `odds.exibir_no_app: z.boolean().default(true)`; ruleset `false`, com comentário.
- [x] A2. Testes primeiro: com a chave `false`, o feed materializado sai sem `oddFaixa`, e o
  detalhe do apito, a Lista, Resultados e a Gestão não mostram odd. Com `true`, tudo como antes.
- [x] A3. Materialização (`entrega/lista-secreta.ts`) e carregadores (lista, resultados, apito,
  gestão, metodologia): cortar na origem e passar `exibirOdds`.
- [x] A4. Gestão: o campo "odd" e a coluna somem com a flag; a ação aceita entrada sem odd (a
  coluna já é anulável).

## B · Rodada pela data dos EUA

- [x] B1. Schema `rodada.fuso_exibicao`; ruleset `fuso: America/New_York`,
  `fuso_exibicao: America/Sao_Paulo`.
- [x] B2. Testes primeiro: jogo às 02:00 UTC de 09/11 (21h em NY de 08/11) pertence à rodada de
  08/11; a tela mostra 23:00 (Brasília); DEN×GSW e DEN×IND deixam de cair na mesma rodada.
- [x] B3. Cada carregador de tela calcula o dia com `rodada.fuso` e entrega `fuso_exibicao` para a
  tela. O mesmo vale para admin, conta, assinar, webhook e chat, nas datas que mostram.
- [x] B4. Script `jogos:recalcular-rodada` (`--dry-run` por padrão; `--confirmar` grava): recalcula
  `data_referencia` pelo fuso novo, confere colisão da chave única antes e relata quantos mudaram.
- [x] B5. O `motor:retroativo` ganha `--limpar-temporada`: apaga as tabelas retroativas da
  temporada antes de regravar.
- [x] B6. Suíte, tipos e lint.

## C · Produção (o parceiro roda)

- [x] C1. Commit e push (deploy), porque o código novo lê as chaves novas.
- [x] C2. `jogos:recalcular-rodada --dry-run`, depois `--confirmar`.
- [x] C3. `motor:retroativo --de=2025-10-21 --ate=2026-04-12 --limpar-temporada`.
- [x] C4. Conferido em 07/10: 9491124 no ar; recalcular-rodada → 0 de 1.231 jogos mudam (a BallDontLie já gravava a data dos EUA); DEN×GSW em 07/11 e DEN×IND em 08/11; 2025-26 regravada com 22.244 apitos, 99 greens, 158 feeds.

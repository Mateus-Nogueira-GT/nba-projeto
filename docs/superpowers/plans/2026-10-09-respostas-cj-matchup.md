# Plano — respostas do CJ de 09/10

Spec: [2026-10-09-respostas-cj-matchup-design.md](../specs/2026-10-09-respostas-cj-matchup-design.md).

## Lote N · confiança, Fire Live e lista por atributo (primeiro)

- [x] N1. REB e AST sem % de confiança: o bloco `confianca` de `por_atributo` fica opcional; sem ele,
  a confiança do apito é `null`. Tirar as tabelas de demonstração de REB e AST do YAML. A tela
  aguenta `null` (Lista, ordenação, cards, painel, sugestão estatística e push).
- [x] N2. Fire Live: média mínima 4 em rebotes, em chave do ruleset ao lado da de assistências.
- [x] N3. Grafias repetidas: `restaurarListaDoCj` resolve cada grupo pela faixa de média do atributo
  (spec §3) e relata os que continuam pendentes.
- [x] N4. Testes primeiro e suíte das áreas tocadas.

## Lote M · matchup em estrelas (depois do N)

- [x] M1. Ruleset: `matchup.habilitado: true`, `corte_top: 5`, critérios por atributo (estrela e
  aviso) e `liberar_apos_dias_de_competicao: 20`. Schema e testes.
- [x] M2. Motor puro: `estrelasDoMatchup(perfilDoAdversario, atributo, diasDeCompeticao, ruleset)` →
  `{ estrelas, motivos, aviso }`, com testes de âncora (cada critério, empate na posição 5, antes
  dos 20 dias, negativo).
- [x] M3. Entrega: `perfisDoDia` ganha pontos marcados e bolas perdidas, com posição, e a contagem
  de dias de competição. A materialização da Lista, do Fire Live e do retroativo põe `matchup` no
  item.
- [x] M4. Tela: ★ no nível do apito (Lista, Ao Vivo, painel); motivos e aviso no painel.
- [x] M5. Suíte inteira, tipos, lint e fronteiras.

## Produção (depois do commit e deploy)

- [ ] P1. `lista-cj:restaurar` (aplica Simmons, Clowney e as grafias resolvidas).
- [ ] P2. `motor:retroativo --de=2025-10-21 --ate=2026-04-12` (regrava com estrelas e sem % em REB/AST).

# ADR-0001 — Monolito modular com fronteira verificável

**Status:** aceito · 18/08/2026

## Contexto

v0 com prazo e custo fechados. Equipe pequena. Duas partes do sistema têm perfis de
escala opostos: a web escala com usuários, a ingestão escala com jogos.

## Decisão

Monolito — um repositório, um modelo de domínio, um deploy — com fronteiras internas
**verificadas por lint**, não por disciplina.

A única regra de dependência que importa:

```
src/modules/motor/**  NÃO importa de ingestao/, dominio/, entrega/,
                      nem de nada com I/O, rede, banco ou relógio.
```

Verificação: `eslint import/no-restricted-paths` ou `dependency-cruiser` no CI.

## Consequências

- Se a regra cair, o motor deixa de ser testável e o backtest morre junto. Por isso é CI, não convenção.
- A costura entre Web e Worker já está desenhada. Quando precisar separar de verdade, rompe no lugar certo.
- Custo: alguma cerimônia de import que um monolito bagunçado não teria.

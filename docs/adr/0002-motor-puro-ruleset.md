# ADR-0002 — Motor puro + ruleset versionado

**Status:** aceito · 18/08/2026

## Contexto

12 regras do CJ ainda sem resposta. A p.7 da proposta coloca a definição das estratégias
**fora do escopo** — os critérios vêm do cliente e vão mudar por temporada.

Regras dentro do código = cada resposta vira refatoração.

## Decisão

```
avaliar(fatos, ruleset) → apitos[]
```

Sem banco, sem `Date.now()`, sem rede dentro. Toda regra vive em
`config/ruleset.vN.yaml`. Trocar qualquer valor lá **não pode** exigir mudança de código.

## Consequências

- As 12 pendências viram campo com default. Resposta do cliente = diff de uma linha.
- **Backtest sai de graça:** motor determinístico permite rodar `v1` contra `v2` sobre a
  temporada passada e medir qual apitou melhor. Arma comercial forte para o CJ.
- Isso é impossível de retrofitar. Ou nasce assim, ou não existe.
- Custo: exige injetar tempo e fatos explicitamente. Mais verboso na borda.

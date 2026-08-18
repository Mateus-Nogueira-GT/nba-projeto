# ADR-0003 — Vercel integral no v0

**Status:** aceito · 18/08/2026 · decisão do cliente (custo)

## Contexto

Fire Live precisa observar o 1º quarto por ~25–30 min contínuos, com push "no exato
momento". Função serverless tem teto de 300s. Capacidade contratada: 10.000 simultâneos.

## Decisão

Tudo na Vercel. O teto de 300s **não se resolve esticando a função**:

| Necessidade         | Mecanismo                                                                |
| ------------------- | ------------------------------------------------------------------------ |
| Cron diário e de 6h | Vercel Cron                                                              |
| Loop do 1º quarto   | **Vercel Workflow** — 1 workflow por jogo, passos curtos, estado durável |
| Fan-out de push     | Vercel Queues                                                            |
| App, admin, API     | Next.js App Router em Fluid Compute                                      |

**Não usar WebSocket para o feed.** Com 10k conectados é o item mais caro da conta, e é
desnecessário: _o push notification já é o canal de tempo real_. Push dispara → app busca
snapshot cacheado.

## Consequências

- Custo baixo: só jogos em 1Q são observados; Active CPU cobra pouco em loop I/O-bound.
- Reavaliar se a latência real do Workflow não sustentar o "exato momento". Plano B: worker sempre ligado fora da Vercel.
- Deduplicação por chave única em `apitos` é **requisito funcional**, não otimização — retry de workflow reexecuta passos.

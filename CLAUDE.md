# NIP — instruções do projeto

PWA que lê dados da NBA, aplica a metodologia NIP (**Lista Secreta** pré-live e
**Fire Live** ao vivo) e apresenta entradas sugeridas em cards. Assinatura via Mercado
Pago e área independente de afiliados. Capacidade contratada: 10.000 usuários simultâneos.

**Leia antes de codar:** [`docs/01-arquitetura.md`](docs/01-arquitetura.md) e
[`docs/02-motor-regras.md`](docs/02-motor-regras.md).

---

## Regras invioláveis

### 1. Nenhuma regra de estratégia no código

Toda regra vive em `config/ruleset.vN.yaml`. Se você precisou escrever um número mágico
(delta, multiplicador, percentual, limiar, marco de push), ele vai no ruleset.

**Teste:** trocar qualquer valor do ruleset não pode exigir mudança de código. Se exigir,
o motor está errado.

### 2. O motor é puro

```
src/modules/motor/**  NÃO importa de ingestao/, dominio/, entrega/,
                      nem de nada com I/O, rede, banco ou relógio.
```

Tempo e fatos entram como argumento. Isso não é estilo — é o que habilita o backtest de
rulesets, que é entrega comercial do projeto.

### 3. Nunca inventar regra que o cliente não definiu

As 12 pendências foram respondidas em 18/08/2026 e o ruleset está **homologado**. As
respostas e suas consequências estão em
[`docs/05-perguntas-abertas.md`](docs/05-perguntas-abertas.md).

Se esbarrar numa área que nem o documento nem o ruleset cobrem: **pare e pergunte**, não
escolha por conta própria. Regra inventada aqui vira push errado no celular de assinante
pagante.

### 4. Somente leitura de odds

Sem envio de aposta, sem credencial de casa, sem conta de usuário vinculada a casa, sem
movimentação de dinheiro. Não crie tabela, rota ou campo para isso. Ver
[ADR-0004](docs/adr/0004-odds-somente-leitura.md).

### 5. Idempotência no apito

`apitos` tem `UNIQUE (jogo_id, jogador_id, atributo, estrategia, linha)`.
Requisito funcional, não otimização: retry de workflow reexecuta passos, e push duplicado
queima confiança em uma noite.

---

## Stack

- **Next.js App Router** — PWA do usuário + painel admin + API
- **Vercel** — Cron (jobs diários/6h), **Workflow** (loop do 1º quarto), Queues (push)
- **Postgres**
- Sem WebSocket para o feed: **o push é o canal de tempo real**, o feed é snapshot cacheado

---

## Onde as coisas ficam

```
config/ruleset.v1.yaml       a metodologia esportiva versionada — o coração
docs/                        arquitetura, regras, modelo de dados, design system
docs/adr/                    decisões e seus custos
src/modules/ingestao/        L0 · adapters NBA e casas (anticorrupção)
src/modules/ingestao/llm/     L0 · porta de LLM (OpenRouter) — narra, nunca decide
src/modules/dominio/         L1 · modelo canônico
src/modules/motor/           L2 · funções puras — SEM I/O
src/modules/entrega/         L3 · feed, push, API
src/modules/plataforma/      L4 · auth, dispositivos, assinatura, afiliados, admin
src/ui/                      tokens (tokens.css, a única fonte de cor) + peças de tela do front v2
src/features/<área>/         telas do front v2, uma pasta por área, ligadas ao back por carregar.ts
src/workflows/               Vercel Workflow — loop do 1Q
```

---

## Vocabulário

O vocabulário homologado é o vocabulário do código. Domínio em português, infraestrutura em
inglês.

| Termo                | Significado                                           |
| -------------------- | ----------------------------------------------------- |
| **apito / apitado**  | jogador sinalizado por uma estratégia                 |
| **nível do jogador** | MVP · All Star · Suporte · Randola (**por atributo**) |
| **nível do apito**   | 1 🟡 · 2 🟠 · 3 🟢 · turbo 🔵                         |
| **oscilação**        | jogou abaixo da média → tende a voltar                |
| **OPD**              | Oportunidade Por Desfalque                            |
| **randola**          | jogador de poucas aparições, majoritariamente reserva |
| **modo fire**        | MVP/All Star com **75%** da média já no 1Q            |

Cuidado: `nível do jogador` e `nível do apito` são coisas diferentes. Nunca use `nivel` sozinho.

---

## Testes

Os **15 testes-âncora** de [`docs/02-motor-regras.md`](docs/02-motor-regras.md) são o
contrato mínimo do motor — escreva-os antes da implementação. A1–A9 vêm dos exemplos
numéricos do CJ; A10–A15 travam as interpretações das respostas de 18/08.

Motor puro = teste sem mock, sem banco, sem fixture de rede. Se um teste do motor precisa
de mock, a regra 2 foi violada.

---

## Armadilhas conhecidas

- **Os elencos da lista não são a NBA real.** São projetados (Giannis no Miami, LeBron no
  Philadelphia, Harden no Cleveland). O vínculo jogador↔time vem da curadoria do CJ, nunca
  da API. Reconciliação via `mapa_jogadores`, com confirmação humana.
  **Exceção única — a aba de estatísticas.** Ela exibe dado canônico, não estratégia, e por
  isso usa `jogadores.time_id` (o time REAL do provedor). Usar a lista do CJ ali diria que
  o LeBron venceu um jogo do Philadelphia do qual ele não participou. A regra acima vale
  para tudo que alimenta o motor; a aba de consulta é o outro lado da fronteira.
- **Rebotes e assistências têm classificação desde 21/09/2026**, mas estão
  **desligados** em `niveis.atributos`, que hoje é `[PONTOS]`. Os dados estão no banco; o
  que falta são as tabelas de % e de odds dos dois, que o documento do CJ não dá. Não
  religue sem elas — as que estão no ruleset são demonstração, não dele.
- **Fire Live é só 1º quarto.** Nada além disso, em nenhuma hipótese.
- **O % não é probabilidade**, é score de confiança. Nunca escreva "probabilidade" na UI.
  Ver [`docs/04-design-system.md`](docs/04-design-system.md).
- **A OPD exige desfalque em prefixo da hierarquia.** Se o nº 2 falta e o nº 1 joga, não
  há apito.
- **15 dos 30 times não têm jogador nível MVP.** A regra do Fire Live usa o conceito de
  **bloco de topo**: todos os MVPs do time, ou o jogador nº 1 se não houver MVP. Nunca
  assuma que existe um MVP. Ver [ADR-0006](docs/adr/0006-bloco-de-topo.md).
- **Philadelphia tem dois MVPs** e os dois precisam estar fora para liberar Suporte/Randola.
- **A lista de níveis é documento vivo** — muda com o mercado, não só por temporada
  (Schröder foi dispensado durante a elaboração). O import precisa ser reexecutável.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

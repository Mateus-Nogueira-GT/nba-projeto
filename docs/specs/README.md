# Specs — o que falta construir

Oito specs, em ordem de dependência. As sete fatias de produto vieram da
auditoria de 19/08/2026. A auditoria de 21/08/2026 acrescentou a Spec 00 para
corrigir contratos da fundação antes de ampliar o sistema.

Cada documento tem duas partes: a **spec** (problema, contrato, regras que toca,
perguntas abertas, critério de pronto) e o **plano** (fatias em ordem, verificação,
riscos).

---

## A ordem não é preferência

| # | Spec | Depende de | Destrava |
| --- | --- | --- | --- |
| 00 | [Estabilização da fundação](00-estabilizacao.md) | — | execução segura das demais specs |
| 01 | [Ingestão real](01-ingestao-persistente.md) | 00 | dados reais |
| 02 | [Web Push ponta a ponta](02-web-push.md) | 00, 01 + fundação 03 | entrega do Fire Live |
| 03 | [PWA instalável e segura](03-pwa.md) | 00; integra com 02 | instalação e push no iPhone |
| 04 | [Cobrança e controle de acesso](04-paywall-contratacao.md) | 00, 01, política de cache 03 | receita |
| 05 | [Feed e filtros do Fire Live](05-feed-fire-live.md) | 01, 02 | destino do push |
| 06 | [Odds e aviso de blowout](06-odds-e-blowout.md) | 01 + contrato com as casas | o card completo |
| 07 | [Backtest e alerta de dado parado](07-backtest-e-alerta.md) | 01 + histórico | a entrega comercial do ADR-0002 |
| 08 | [Fechamento do v0 — plano de execução](08-fechamento-v0.md) | 05–07 | a sequência executável do que resta do nosso lado |

A 00 vem primeiro porque as demais specs dependem de contratos hoje quebrados:
temporada, retry de workflow, sessões, pagamento e identidade de provedor. Depois
dela, a 01 é a primeira fatia de produto porque os sincronizadores já existem,
mas nenhum job de produção os orquestra com uma fonte homologada. As 02 e 03
compartilham um único service worker: a 03 é dona da fundação e a 02 dos handlers
de Push. A capacidade pode ser construída antes da 04, mas o Push público espera
o controle de acesso para não entregar conteúdo pago a uma conta inelegível.

**Situação em 23/08/2026:** Specs 00–03 implementadas; base da Spec 04 em modo
fail-closed. A Spec 05 está implementada (snapshot por jogo, tela, filtros por
time/jogo, deep link do push); da 06, as partes sem contrato (blowout, agregação,
porta fake, curadoria de mercados); da 07, o alerta de dado parado e o backtest
com painel. O que resta está bloqueado pelos gates da
[Spec 08](08-fechamento-v0.md): decisões de produto, contrato com as casas e o
smoke no sandbox do Mercado Pago.

---

## O que dá para começar hoje

Enquanto as decisões externas da Spec 01 não chegam, três pedaços puros não
dependem do provedor NBA:

- **Aviso de blowout** (06, fatia 1) — função pura, ruleset já homologado
- **Agregação de odds** (06, fatia 2) — função pura, testável sem casa nenhuma
- **Alerta de dado parado** (07, parte B) — as peças puras já existem e não são chamadas

---

## Perguntas que bloqueiam

Nenhuma destas eu posso responder sozinho. Onde o cliente ou o CJ não definiu,
**a spec para e pergunta** — regra 3 do `CLAUDE.md`.

| Spec | Pergunta | Bloqueia |
| --- | --- | --- |
| 01 | Quem é o provedor NBA primário e o reserva? Credenciais? | tudo |
| 01 | Qual timezone/regra define a data de referência da rodada? | agenda e jobs |
| 01 | O provedor entrega quebra por quarto **do time**? | tela do time |
| 02 | As chaves VAPID são da conta de quem? | push |
| 03 | Nome comercial, ícones e plataformas mínimas suportadas | instalação |
| 04 | Cadastro self-service ou criação controlada? | contratação |
| 04 | **As estatísticas são pagas ou abertas?** | paywall |
| 04 | Plano: nome, preço, periodicidade, teste grátis | contratação |
| 04 | Política de inadimplência e de cancelamento | contratação |
| 05 | Excluir jogadores: por dispositivo ou por conta? | filtro |
| 05 | O apito some da tela quando o 1º quarto acaba? | tela |
| 06 | Quais casas, com qual contrato? | odds inteiro |
| 06 | A odd exibida é do over? | odds |
| 07 | Por qual canal o alerta acorda alguém? | alerta |

---

## Herdadas da entrega anterior

Continuam abertas desde o Fire Live:

- **Green fora do 1º quarto.** O workflow encerra no 1Q por especificação, então
  quem bate 30 pontos no 3º quarto não gera green. Exige um observador que
  ninguém definiu.
- **Green só em pontos.** `push.marcos_green` é indexado por nível, não por
  atributo, e os valores são totais de pontos. Rebotes e assistências não têm
  marco definido.
- **Rebotes e assistências.** O modelo já é `(jogador, atributo)`; falta a lista
  do Mestre da NBA. É INSERT, não migration.

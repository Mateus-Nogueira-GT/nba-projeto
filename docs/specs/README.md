# Specs — o que falta construir

Sete fatias, em ordem de dependência. Derivadas da auditoria de 19/08/2026, que
encontrou e corrigiu cinco defeitos e mapeou o que falta para o monolito rodar.

Cada documento tem duas partes: a **spec** (problema, contrato, regras que toca,
perguntas abertas, critério de pronto) e o **plano** (fatias em ordem, verificação,
riscos).

---

## A ordem não é preferência

| # | Spec | Depende de | Destrava |
| --- | --- | --- | --- |
| 01 | [Ingestão persistente e crons](01-ingestao-persistente.md) | — | tudo |
| 02 | [Web Push ponta a ponta](02-web-push.md) | 01 | o Fire Live |
| 03 | [PWA instalável](03-pwa.md) | 02 | push no iPhone |
| 04 | [Paywall e contratação](04-paywall-contratacao.md) | 01 | receita |
| 05 | [Feed e filtros do Fire Live](05-feed-fire-live.md) | 01, 02 | destino do push |
| 06 | [Odds e aviso de blowout](06-odds-e-blowout.md) | 01 + contrato com as casas | o card completo |
| 07 | [Backtest e alerta de dado parado](07-backtest-e-alerta.md) | 01 + histórico | a entrega comercial do ADR-0002 |

A 01 vem primeiro porque **nada do que já foi construído roda com dado real** —
o motor, os feeds e as telas leem tabelas que nenhum job preenche. As 02 e 03
compartilham o mesmo arquivo de service worker e devem ser feitas juntas.

---

## O que dá para começar hoje

Três pedaços não dependem de resposta de ninguém nem da spec 01:

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
| 01 | O provedor entrega quebra por quarto **do time**? | tela do time |
| 02 | As chaves VAPID são da conta de quem? | push |
| 02 | Posição de tela do apito e do green no design system | push |
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

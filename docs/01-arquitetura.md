# Arquitetura — NIP

## O princípio que organiza tudo

As 12 perguntas abertas com o cliente tinham uma coisa em comum: **todas eram valores,
nenhuma era estrutura.** Nenhuma mudava quem fala com quem, quais tabelas existem ou como
o dado flui. Foi o que permitiu construir a fundação inteira antes das respostas chegarem.

Quando chegaram (18/08/2026), três contrariaram os defaults — e o custo total foi trocar
três linhas de YAML. Uma delas, inclusive, **removeu** uma tabela do modelo.

Daí o eixo de toda a arquitetura: **separar o que o CJ muda do que nós construímos.**

- Regras dentro do código → cada resposta do CJ vira refatoração, cada temporada vira reescrita.
- Regras num ruleset versionado → cada resposta vira um `git diff` de uma linha.

Tudo abaixo é consequência disso.

---

## Camadas

```
┌──── L4 · PLATAFORMA ─────────────────────────────────────────────────┐
│ auth · dispositivos · assinatura MP · afiliados · admin · observab. │
└────────────────────────────────────────────────────────────────┘

┌─ L0 INGESTÃO ──┐   ┌─ L1 DOMÍNIO ───┐   ┌─ L2 MOTOR ──┐   ┌─ L3 ENTREGA ─┐
│ NBA principal  │──▶│ jogadores      │──▶│ Lista       │──▶│ feed         │
│ NBA reserva    │   │ times · jogos  │   │ Secreta     │   │ push         │
│ lesões/escala. │   │ box score      │   │             │   │ API do PWA   │
│ odds (casas)   │   │ split p/ quarto│   │ Fire Live   │   │ estatísticas │
└────────────────┘   │ níveis do CJ   │   └─────────────┘   └──────────────┘
   adapters +        │ mapa de nomes  │          ▲
   anticorrupção     └────────────────┘    ┌─────┴──────┐
                                           │ RULESET vN │
                                           └────────────┘
```

### L0 · Ingestão

Um adapter por fonte. **Nenhum schema de provedor entra pra dentro.** Isso não é
purismo: são duas fontes NBA com failover automático e pelo menos duas casas de aposta
com contratos diferentes. Sem camada anticorrupção, trocar de provedor é reescrever o
motor; com ela, é escrever um arquivo novo.

Cada adapter emite heartbeat — é daqui que sai o "alerta de dado parado".

### L1 · Domínio canônico

Modelo próprio, independente de fonte. Duas tabelas merecem destaque porque ninguém
pensa nelas até quebrar:

- **`niveis`** — a lista do CJ. Não é dado de provedor, é **dado editorial**. Ciclo de
  vida próprio, versionado, com histórico. Quando chegarem os níveis de rebotes e
  assistências, é INSERT, não migration.
- **`mapa_jogadores`** — ponte entre `"Wembayama"` e o ID real do provedor. Como os
  elencos da lista são projetados (não correspondem à NBA real) e os nomes vêm com
  grafia livre, esse mapa é **curadoria humana com apoio de matching aproximado**.
  Exige tela no admin. Sem ela, a lista não roda.

### L2 · Motor

Funções puras. Detalhado em [`02-motor-regras.md`](02-motor-regras.md).

### L3 · Entrega

Materializa o feed, dispara push, serve a API.

### L4 · Plataforma

Transversal e **não depende de nada acima**. Auth, dispositivos, assinatura e admin não
sabem o que é um apito.

O domínio comercial de afiliados também vive em L4. Ele reaproveita a identidade das
casas, mas não depende do motor nem altera seus sinais. Links rastreados, atribuições,
relatórios, comissões, recebimentos e repasses têm livro e permissões próprios; assinatura
e parceria são direitos independentes. Ver [ADR-0010](adr/0010-afiliados-rastreamento-e-controle.md).

---

## A fronteira que o lint precisa proteger

```
src/modules/motor/**  NÃO PODE importar de:
  - src/modules/ingestao/**
  - src/modules/dominio/**   (exceto tipos puros)
  - src/modules/entrega/**
  - qualquer coisa com I/O, rede, banco ou relógio
```

Essa é a única regra de dependência que realmente importa no projeto, e ela é
verificável automaticamente (`eslint import/no-restricted-paths` ou `dependency-cruiser`).
Se ela cair, o motor deixa de ser testável e o backtest morre junto.

---

## Runtime na Vercel (ADR-0003)

Decisão: **v0 inteiro na Vercel**, por custo.

O desafio real: o loop do Fire Live precisa observar um 1º quarto por ~25–30 min
contínuos, e função serverless tem teto de 300s. A solução não é esticar a função:

| Necessidade                                                   | Mecanismo                                                                                                                                                       |
| ------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Jobs diários e de 6h (elencos, tabela, lesões, Lista Secreta) | **Vercel Cron**                                                                                                                                                 |
| Loop do 1º quarto (longo, contínuo, sensível a latência)      | **Vercel Workflow** — um workflow por jogo, com passos curtos e estado durável. Não sofre o teto de 300s porque cada passo é uma invocação e o estado persiste. |
| Fan-out de push                                               | **Vercel Queues**                                                                                                                                               |
| App, admin e API                                              | **Next.js App Router** em Fluid Compute                                                                                                                         |

### Conexão transacional com o Neon

O cliente de banco usa `drizzle-orm/neon-serverless` com `Pool` WebSocket. O
driver HTTP anterior serve bem a consultas isoladas, mas não suporta a API de
transação interativa que protege sessão, bootstrap e webhook.

A inicialização continua preguiçosa para não abrir conexão durante o build. O
pool fica limitado a duas conexões por instância, fecha conexões ociosas após
10 segundos e usa timeout de conexão de 10 segundos. `DATABASE_URL` deve apontar
para o endpoint pooled do Neon em Preview e produção. Comandos one-shot, como o
bootstrap do primeiro administrador, chamam `fecharDb()` ao terminar.

Esse WebSocket é somente entre o servidor e o Postgres. Ele não muda a decisão
abaixo de não manter WebSocket de feed aberto por usuário.

### A escolha que segura o custo

Não usar WebSocket para o feed. Com 10k conectados, socket aberto por usuário é o item
mais caro da conta — e é desnecessário aqui, porque:

> **O push notification já é o canal de tempo real.**

O usuário recebe o push no instante do apito e o app busca um snapshot cacheado. Feed
por HTTP cacheado + push como gatilho custa uma fração de 10k sockets e entrega a mesma
percepção de imediatismo.

---

## Fire Live: a restrição mais dura do projeto

`push no exato momento que a marca é atingida` + `somente no 1º quarto`.

Isso não é polling em ciclo. Um alerta 90s atrasado já perdeu a janela de aposta.

```
observa jogos em 1Q  (e só eles)
   ↓
detecção de mudança  (diff contra último estado conhecido)
   ↓
avalia SÓ os jogadores afetados        ← nunca a liga inteira
   ↓
cruzou o alvo? já disparou antes?      ← chave de deduplicação
   ↓
apito → fila → push
```

Dois pontos que quase sempre são esquecidos:

- **Idempotência é obrigatória.** Chave natural:
  `(jogo_id, jogador_id, atributo, estrategia, linha)`. Sem ela, uma reconexão do
  provedor dispara o mesmo push três vezes. Em app pago, isso queima confiança em uma noite.
- **A janela colapsa o custo.** Só jogos em 1Q são observados. Numa rodada cheia isso é
  um punhado de jogos simultâneos por ~25 min cada, não 30 jogos por 2h30.

---

## 10.000 simultâneos: onde a conta fecha

O erro clássico seria cada cliente perguntar "e agora?" e a API recalcular.

O conteúdo do card é **igual para todos os usuários** — só o _filtro_ muda. Logo:

> A avaliação acontece **uma vez por evento**, não uma vez por usuário.

O motor grava o feed materializado; os 10k leem um snapshot cacheado. Isso é o que separa
10k usuários de ser trivial ou impossível — e é decisão de arquitetura, não de
infraestrutura. Servidor maior não conserta desenho errado.

---

## Monolito modular e a costura que vai romper primeiro

Monolito no v0, com fronteiras internas reais. Uma parte tem perfil de escala
completamente diferente das outras:

| Processo   | O quê                          | Escala com |
| ---------- | ------------------------------ | ---------- |
| **Web**    | PWA + admin + API              | usuários   |
| **Worker** | ingestão, cron, workflow do 1Q | jogos      |

Um repositório, um modelo de domínio, um deploy. Mas a costura entre esses dois já
está desenhada — quando um dia precisar separar de verdade, ela rompe no lugar certo.

---

## Decisões registradas

| ADR                                       | Decisão                                                                    |
| ----------------------------------------- | -------------------------------------------------------------------------- |
| [0001](adr/0001-monolito-modular.md)      | Monolito modular com fronteira de dependência verificável                  |
| [0002](adr/0002-motor-puro-ruleset.md)    | Motor puro + ruleset versionado                                            |
| [0003](adr/0003-runtime-vercel.md)        | Vercel integral no v0; Workflow para o loop do 1Q                          |
| [0004](adr/0004-odds-somente-leitura.md)  | Odds somente leitura, agregadas; nunca envio de aposta                     |
| [0005](adr/0005-fusao-badge-confianca.md) | Fusão da badge de confiança com o anel de apito                            |
| [0006](adr/0006-bloco-de-topo.md)         | Bloco de topo unifica a restrição de presença; dispensa rastreio em quadra |
| [0007](adr/0007-outbox-de-push.md)        | Outbox de push: a UNIQUE impede duplicata, o outbox impede perda silenciosa |
| [0008](adr/0008-funcao-e-banco-em-regioes-diferentes.md) | Banco e funções em regiões diferentes explicam latência observada |
| [0009](adr/0009-llm-narra-nunca-decide.md) | LLM narra fatos; nunca decide estratégia |
| [0010](adr/0010-afiliados-rastreamento-e-controle.md) | Primeiro toque, relatórios e liquidação manual de afiliados |

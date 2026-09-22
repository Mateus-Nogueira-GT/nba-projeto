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

**Modo demonstração.** Enquanto os gates externos não caem, o produto está no ar
com dados inventados e as telas que faltavam: navegação por abas, Resultados
(conferência das rodadas encerradas) e Gestão de banca. O motor é genérico por
atributo de verdade — rebotes e assistências têm tabelas próprias em
`por_atributo`, marcadas `origem: demonstracao`. O que é real e o que é inventado
está em [docs/demonstracao.md](../demonstracao.md).

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
| 01 | O provedor entrega quebra por quarto **do time**? | tela do time |
| 01 | O box score do provedor real traz o time de cada linha (o time daquele jogo específico), ou só o id do jogador? Sem uma coluna `time_id` em `estatisticas_jogo`, a tela de partida usa `jogadores.time_id` (cadastro de HOJE) para decidir de qual lado cada linha aparece, e erra num jogo passado se o jogador foi trocado depois dele (ver `jogo.ts`, `montarLado`) | acurácia do elenco na tela de partida após troca no meio da temporada |
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

### Da identidade 02 (mudança de identidade visual, ago/2026)

Fora dos oito specs numerados acima: a mudança de identidade visual do app (mockup do
cliente, telas navegáveis por abas — ver
[`docs/superpowers/specs/2026-08-24-identidade-rota-transmissao-design.md`](../superpowers/specs/2026-08-24-identidade-rota-transmissao-design.md))
levantou seis perguntas próprias, ainda sem resposta do CJ. Levar todas de uma vez, junto
com as pendências herdadas abaixo — não uma por vez.

| Pergunta | Bloqueia |
| --- | --- |
| Calibração da escala de confiança exibida — as 5 faixas (80/83/86/89/93) e seus rótulos são demonstração (rampa turquesa de `confianca_exibicao`, ver `docs/04-design-system.md` § Identidade 02 e ADR-0005). Quais faixas ele quer? | os cinco degraus da pílula de confiança |
| Rótulo da faixa máxima — mockup dizia "ALTÍSSIMO VALOR"; o app usou "CONFIANÇA MÁXIMA" por causa da P12 (nunca chamar de probabilidade) e, em 12/09/2026, trocou o superlativo por "SINAL MAIS FORTE" a pedido do parceiro — a P12 continua valendo, o que saiu foi o "máxima". Ele valida o rótulo? | texto da pílula no grau 5 |
| Fotos dos jogadores — headshots do CDN público da NBA sem contrato de licenciamento (ver `docs/demonstracao.md` § Fotos dos jogadores). Decisão comercial: manter, licenciar ou trocar por monogramas? | risco jurídico do produto pago |
| Linha com meio ponto — as casas usam 18,5; a lista do CJ usa inteiras. A tela deve exibir a linha como ele define (20+) ou na convenção da casa (19,5)? | formato da linha em todo card |
| Três pontos — o mockup do designer desenhou "3 PONTOS +2,5". Existe, ou vai existir, classificação de três pontos? Se sim, precisa da lista de níveis dele. | se um quarto atributo entra no modelo |
| Cronômetro no placar ao vivo — depende do provedor entregar relógio de jogo. Ele quer isso no card do Fire Live? | campo novo na ingestão, só quando houver provedor |

A identidade 03 (spec
[`2026-08-25-identidade-03-broadcast-design.md`](../superpowers/specs/2026-08-25-identidade-03-broadcast-design.md))
acrescentou duas:

| Pergunta | Bloqueia |
| --- | --- |
| As barrinhas "últ. 5 na linha" do card leem a linha PRINCIPAL do apito (a menor, quando há 2+). É essa a leitura de relance que ele quer? | qual linha alimenta as barrinhas |
| Ocultar jogador no Fire Live esconde da TELA mas não silencia o push do jogador oculto. É o comportamento desejado, ou o push também cala? | se a preferência entra no fan-out de push |
| **Marcos de green de rebotes e assistências** (`por_atributo.marcos_green`, hoje `origem: demonstracao`): quais números ele quer? E a pergunta que os números atuais expõem — eles são de JOGO INTEIRO (MVP: 10 rebotes), mas o Fire Live só observa o **1º quarto**, onde um MVP faz 2 ou 3. Ou existem marcos próprios de 1Q, ou o green de rebotes/assistências nunca dispara na vida real. | se o canal GREEN funciona fora da demonstração |
| **Grafia dos nomes na lista** (`data/fontes/introducao-ia-nba.md`): o documento traz "Porzigins" (Porziņģis?), "podzienki" (Podziemski?) e "Kesller" (Kessler?). A demo NÃO corrige — só sobe a inicial de palavra minúscula ("stephen Curry" → "Stephen Curry"), porque adivinhar o jogador certo seria inventar identidade. Quais são os nomes que ele quer ver na tela? | quem é cada jogador da lista, e o vínculo com o provedor real |
| **Nota da partida na aba de estatísticas** (spec de 26/08): a aba de consulta passará a exibir uma nota de desempenho por jogador por jogo (escala 3–10), calculada por fórmula pública (Game Score de Hollinger) sobre o box score real. Não participa da estratégia, não alimenta o motor, e nunca se chama "nível" para não colidir com o vocabulário do CJ. Registro para ciência; não bloqueia. | nada — é dado canônico da aba de consulta |
| **Tom das narrativas geradas por LLM** (spec de 25/08): os cards passarão a ter uma frase de análise gerada por IA a partir dos fatos do motor. O tom proposto é sóbrio, de comentarista, em pt-BR. O CJ quer calibrar a voz (mais provocadora? assinada como "análise da IA"?)? Não bloqueia a construção — bloqueia só o ajuste fino do texto. | o tom do texto nos cards, não a estratégia |
| **Reaberta (25/08):** a proposta homologada dizia "sempre faixa, nunca odd única" (`odds.exibicao`), mas o parceiro decidiu mostrar a **média entre casas** no card e no detalhe. O CJ valida a média, prefere a faixa, ou as duas? (`config/ruleset.v1.yaml` → `odds.exibicao`: trocar o valor religa qualquer um dos comportamentos sem código) | o rodapé de odd de todo card pré-live |

---

## Respondidas

| Data | Pergunta | Resposta | Onde vive |
| --- | --- | --- | --- |
| 24/08/2026 | Qual timezone define a data de referência da rodada? | Fuso do horário de Brasília | `rodada.fuso` no ruleset |
| 22/09/2026 | Oscilação de assistências: o "≤2 abaixo da média" do bloco geral ou o 4/3/3 por nível da seção de assistências? | A seção: MVP ≤4, All Star ≤3, Suporte ≤3 | `por_atributo.ASSISTENCIAS.oscilacao.delta` no ruleset |

A resposta do fuso trouxe uma consequência que o cliente ainda não avaliou: no
inverno americano — quase toda a temporada — o leste dos EUA está 2 horas atrás
de Brasília, então os jogos que começam 22h30 lá caem 00h30 aqui, **no dia
seguinte**. Uma mesma noite de NBA se parte em duas rodadas, e os jogos da costa
oeste aparecem na lista de "amanhã". A alternativa é `America/New_York`, a
convenção da própria liga, e trocar é editar uma linha do YAML.

Até 24/08/2026 a ingestão fixava `America/New_York` **dentro do código**, e a
tela usava UTC: os dois discordavam em silêncio. Agora existe um fuso só.

---

## Herdadas da entrega anterior

Continuam abertas desde o Fire Live:

- **Green fora do 1º quarto.** O workflow encerra no 1Q por especificação, então
  quem bate 30 pontos no 3º quarto não gera green. Exige um observador que
  ninguém definiu.
- ~~**Green só em pontos.**~~ **Resolvido.** `por_atributo.marcos_green` existe
  para REBOTES e ASSISTENCIAS, `marcosDoNivel(nivel, atributo, ruleset)` lê por
  atributo e a demonstração exibe os três canais (25/08/2026). Os valores de
  rebotes/assistências seguem `origem: demonstracao` — o CJ ainda não os
  definiu, e trocar é editar o YAML.
- **Rebotes e assistências.** O modelo já é `(jogador, atributo)`; falta a lista
  do Mestre da NBA. É INSERT, não migration.

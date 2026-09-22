# Pente fino da Gestão de banca — usabilidade provada sobre uma temporada simulada

**Data:** 22/09/2026 (reescrita no mesmo dia; a primeira versão está corrigida na seção 1).
**Estado:** executada em 22/09 (T1–T5 automatizadas; roteiro manual e E2E ao vivo com o parceiro). Achados na seção 9.
**Gatilho:** relato do parceiro — "aperto os botões da Gestão, mas não acontece nada".
**Foco:** usabilidade e lógica, não desenho. A pergunta que esta spec responde é uma só:
**cada botão da aba faz o que promete, e o que o usuário digita chega ao banco do jeito
que ele digitou?** — provado sobre uma temporada com muitas partidas, várias rodadas e
mais de uma conta, como se o app estivesse no ar.

**Plano:** [`2026-09-22-pente-fino-gestao.md`](../plans/2026-09-22-pente-fino-gestao.md).
**Base inspecionada:** `main`, commit `e5b508b`.

---

## 1. O sintoma, a causa — e o que a primeira versão desta spec errou

### 1.1 A cadeia, do clique até a linha de código

1. `/gestao` só renderiza o formulário real quando `atende(acesso.nivel, 'MVP')` —
   [`gestao/page.tsx:301`](../../../src/app/(app)/gestao/page.tsx#L301).
2. Abaixo disso, a tela mostra `<SilhuetaPaga forma="formulario">`: quatro `<div>`
   decorativos, com `pointer-events: none` no CSS — *"Ninguém clica nem tabula para
   dentro de uma forma vazia"* —
   [`SilhuetaPaga.module.css:18`](../../../src/components/planos/SilhuetaPaga.module.css#L18).
3. `acesso.nivel` sai só de `direitos_acesso`; `papel = 'ADMIN'` não conta —
   [`guarda.ts:38`](../../../src/modules/plataforma/assinatura/guarda.ts#L38).
4. `bootstrap-admin.ts` grava `papel: 'ADMIN'` e **nenhum direito** —
   [`bootstrap.ts:57-64`](../../../src/modules/plataforma/admin/bootstrap.ts#L57-L64).

**Resultado:** a conta ADMIN é tratada como Grátis em toda tela paga. Em `/gestao` ela vê
o **desenho** de um formulário, inerte de propósito. Não há bug de código na aba.

### 1.2 O que a primeira versão errou — e a correção

A primeira versão desta spec dizia que "não existe, em nenhum lugar, uma ação para
conceder acesso pago manualmente" e abria três opções para decidir. **Estava errado.**
Existe, é testada e está documentada:

| Comando | O que faz | Onde está |
| --- | --- | --- |
| `CORTESIA_EMAIL=<e-mail> [CORTESIA_ATE=AAAA-MM-DD] npx dotenv -e .env.local -- npm run cortesia` | concede direito `ALL_STAR` de origem `CORTESIA_ADMIN` a uma conta **existente**; sem `CORTESIA_ATE`, não expira; reexecutar atualiza a mesma cortesia | [`scripts/conceder-cortesia.ts`](../../../scripts/conceder-cortesia.ts), commit `d769d47` |
| `CONTA_TESTE_EMAIL=… CONTA_TESTE_SENHA='…' npx dotenv -e .env.local -- npm run conta:teste` | cria a conta se não existir **e** concede a mesma cortesia | [`scripts/criar-conta-teste.ts`](../../../scripts/criar-conta-teste.ts), pedido da call de 08/09 |

A garantia de idempotência está provada em
`src/modules/plataforma/__tests__/avaliar-acesso.test.ts`; a prática ("backfill explícito
de cortesia — equipe e piloto") está no runbook
[`cobranca-e-acesso.md`](../../runbooks/cobranca-e-acesso.md). O que faltava não era
ferramenta: era **ninguém ter rodado o comando para a conta ADMIN**, e o runbook do
bootstrap não avisar que o ADMIN nasce Grátis. O plano corrige o aviso (T1).

### 1.3 Por que nenhum teste pegou isso

Todas as suítes que renderizam `/gestao` (`telas-05-gestao`, `planos-gestao`,
`gestao-acoes`) **simulam** `avaliarAcesso` com `acessoDeTeste(...)`. Nenhuma percorre o
caminho real `usuarios → direitos_acesso → nível`. O sintoma vivia exatamente no trecho
que nenhum teste percorre. Fechar esse buraco é a primeira entrega (T1).

---

## 2. O que esta spec entrega

1. **Um teste do caminho real de acesso** — sem simular `direito`: conta sem direito vê a
   silhueta; a mesma conta, depois de `concederCortesia` de verdade, vê o formulário; e
   a ação recusa, no servidor, quem chega sem direito.
2. **A lógica da aba de ponta a ponta, sem navegador** — sobre uma temporada simulada de
   **49 dias (~315 partidas, ~4.600 linhas de box score)**: registrar → redirecionar →
   a visão Realizadas mostra o que foi digitado; registrar de novo a mesma linha
   **atualiza** (uma linha, não duas); inválido → `?erro=` → mensagem em português e
   nada gravado; dois usuários não se enxergam; ontem não aparece hoje; banca inválida
   cai no padrão; N entradas saem na ordem certa.
3. **Cenários da temporada** — rodada cheia, rodada sem lista publicada, item sem linha,
   uma segunda semente com outros jogos — e uma trava de **volume** que prova que "muitas
   partidas" existem de fato no banco de teste (a temporada não pode encurtar em silêncio).
4. **O roteiro do navegador de verdade** — um runbook, botão a botão, com o que conferir
   na tela **e** no banco a cada passo, inclusive com JavaScript desligado (a tela promete
   funcionar assim, e ninguém nunca conferiu).
5. **Automação do navegador com Playwright** — condicionada à decisão D03.

Fora daqui: desenho, cores, tipografia; as outras cinco telas com `SilhuetaPaga`
(mesmo padrão, mesma causa — ficam listadas na seção 7 para a próxima rodada).

---

## 3. Decisões

| ID | Decisão | Estado |
| --- | --- | --- |
| D01 | A ferramenta de acesso para teste é `npm run cortesia` / `npm run conta:teste`. **Nada muda na guarda**: ADMIN continua não bypassando `atende()`, porque um ADMIN que enxergasse tudo nunca veria a experiência real do assinante — e é ela que se quer testar. | confirmada pelo código |
| D02 | A simulação é `simularAte` — a temporada simulada que o projeto já tem (`src/modules/ingestao/demo/`). Nenhum gerador novo, nenhuma fixture nova de jogo. Muitas partidas = **49 dias de janela**; variação = **semente** e **data**. | confirmada |
| D03 | **Playwright** (`@playwright/test`) entra como devDependency para a automação do navegador, fora do CI (precisa de `next dev` + banco). Recomendo **sim**: é a única forma de repetir "clicou, submeteu, redirecionou, gravou" sem depender de alguém lembrar de fazer à mão. Sem ele, a tarefa T5 do plano não roda e o roteiro manual (T4) é a única prova de navegador. | **pendente — parceiro** |
| D04 | Onde roda o navegador de verdade. Hoje `.env.local` e produção apontam para o **mesmo Neon** (`ep-royal-dew-…sa-east-1`), e não há `neonctl`, `psql` nem Postgres local. Enquanto `NBA_INGESTAO_HABILITADA` estiver desligada e o banco só tiver dado simulado, `demo:temporada` contra esse Neon é **a prática documentada** (runbook de deploy) e é idempotente. **No dia em que a ingestão real ligar, esse passo passa a exigir um branch do Neon** — criado no console, por quem tem a conta. Ver seção 6. | **pendente — parceiro decide quando cria o branch** |

---

## 4. A simulação — o que "muitas partidas rodando" significa aqui

`simularAte(db, ruleset, agora, { diasDeHistorico, llm, semente })` produz, por dia da
janela: calendário de 6–7 jogos (30 times, ninguém joga em dias seguidos, três jogos por
semana por time), desfalques, box score dos elencos da lista do CJ, placar, classificação,
e a Lista Secreta **publicada com o que se sabia na véspera** — pelo motor, com o ruleset,
não à mão. No dia de hoje, ainda: o primeiro jogo da rodada fica `AO_VIVO` com 1º quarto
semeado (Fire Live), os cenários de **OPD** e **modo fire** são forçados, e as odds entram
depois da lista (a cotação é por linha, e quem decide as linhas é o motor).

Tudo é determinístico por `(semente, dia, nome)`: a mesma semente na mesma data dá os
mesmos jogos e os mesmos números em qualquer banco. É isso que faz uma asserção do tipo
"o item X tem linha Y" ser estável.

| Parâmetro | Valor nesta spec | Por quê |
| --- | --- | --- |
| `diasDeHistorico` | **49** na suíte de ponta a ponta e na de cenários; 21 na de acesso | 49 é a janela da spec da temporada (~315 partidas); 21 basta para "há lista hoje" e roda em um terço do tempo |
| `semente` | `SEMENTE_TEMPORADA` (padrão) e `'pente-fino-b'` | a segunda produz outros confrontos e outra rodada de hoje — o teste não pode passar só porque a primeira semente é generosa |
| `agora` | `2026-01-15T18:00Z` (A) e `2026-02-20T18:00Z` (B) | meio de temporada, janela inteira dentro de `2025-26` |
| `llm` | `LLMFake` | determinístico, sem rede — o texto não é objeto deste pente fino |

**Trava de volume** (T3): com 49 dias, o banco de teste precisa ter **≥ 250 jogos
`ENCERRADO`**, **≥ 3.500 linhas em `estatisticas_jogo`** e **≥ 40 rodadas distintas**. Se
um refactor da simulação encurtar a temporada, este número fica vermelho antes de alguém
apresentar uma demo pela metade.

---

## 5. A matriz do pente fino

Cada linha é um elemento da aba, o que se faz com ele, o que tem de acontecer **na tela**
e **no banco**, e **onde isso é provado**. "Auto" = teste em vitest sobre PGlite (T1–T3);
"Runbook" = roteiro manual no navegador (T4); "E2E" = Playwright (T5, se D03 = sim).

### 5.1 Acesso — a causa raiz, provada pelo caminho real

| Elemento | Ação | Tela | Banco | Prova |
| --- | --- | --- | --- | --- |
| Conta sem direito | abrir `/gestao` | silhueta + convite "Registrar entradas começa no MVP"; **nenhum** `name="unidades"` | — | Auto T1 · Runbook |
| Mesma conta após `concederCortesia` | abrir `/gestao` | chips de banca, campos, "Registrei" | `direitos_acesso` com `origem = CORTESIA_ADMIN` | Auto T1 · Runbook |
| Conta sem direito | POST direto na ação com FormData válido | — | **nada gravado**; redirect para `/assinar?nivel=MVP` | Auto T1 |
| CSS da silhueta | — | `.silhueta` contém `pointer-events: none` (asserção de fonte, padrão de `paywall.test.ts`) | — | Auto T1 |

### 5.2 Banca

| Elemento | Ação | Tela | Banco | Prova |
| --- | --- | --- | --- | --- |
| Chip R$ 200 / 500 / 1.000 / 5.000 | clicar | URL `?banca=N`; chip com `aria-current="page"`; os quatro números (unidade, teto, stop win, stop loss) mudam | — | Auto T2 (render por `searchParams`) · Runbook · E2E |
| Campo "Outro valor" + **Aplicar** | digitar 750, aplicar | URL `?banca=750`; "1 unidade" = R$ 7,50 | — | Runbook · E2E (é um `GET` — a render por `searchParams` do T2 cobre a lógica) |
| Banca inválida (`0`, `-5`, `abc`) | pela URL | volta ao padrão R$ 1.000, sem `NaN` | — | Auto T2 |
| **Aplicar com JavaScript desligado** | idem | funciona igual — é `<form method="get">` | — | Runbook · E2E (`javaScriptEnabled: false`) |

### 5.3 Registrar

| Elemento | Ação | Tela | Banco | Prova |
| --- | --- | --- | --- | --- |
| **Registrei** (unidades 1,5 · odd 1,62) | submeter | redirect `/gestao?ver=realizadas`; a entrada aparece com "1.5 unidades · odd 1.62" | 1 linha em `entradas_realizadas` com `unidades = 1.50`, `odd = 1.62`, `data_referencia = hoje` | Auto T2 · Runbook · E2E |
| **Registrei** de novo, **mesma linha** (unidades 3 · odd 2,10) | submeter | Realizadas mostra "3 unidades · odd 2.10" — **uma** entrada, não duas | **ainda 1 linha**, valores atualizados (`onConflictDoUpdate`) | Auto T2 · Runbook · E2E |
| odd em branco | submeter | Realizadas mostra "odd —" | `odd IS NULL` | Auto (já em `gestao-acoes`) · Runbook |
| unidades `0` / odd `0,5` | submeter (com `novalidate`, para passar do `min` do navegador) | redirect `?erro=entrada-invalida` → "Confira unidades e odd." em `role="alert"` | **nada** gravado | Auto T2 · E2E |
| `?erro=<frase forjada>` | pela URL | a frase **não** aparece | — | Auto (já em `telas-05-gestao`) |
| **Registrei com JavaScript desligado** | submeter | mesmo resultado — server action degrada para POST | mesma linha | Runbook · E2E |
| Item **sem linha** | — | sem formulário, sem erro (o link do jogador continua) | — | Auto T3 |
| Sessão expirada no meio | submeter | redirect `/entrar?destino=/gestao`, sem alerta confuso | nada gravado | Auto (já em `gestao-acoes`) · Runbook |

### 5.4 Realizadas

| Elemento | Ação | Tela | Banco | Prova |
| --- | --- | --- | --- | --- |
| Visão Realizadas vazia | abrir `?ver=realizadas` | "Nada registrado hoje" + link para Sugeridas | — | Auto (já) · Runbook |
| N entradas | registrar 3 em instantes diferentes | ordem: **mais recente primeiro** | `ORDER BY registrada_em DESC` | Auto T2 |
| Entrada de **ontem** | registrar com `data_referencia = ontem` | **não** aparece hoje | linha existe, com a data de ontem | Auto T2 |
| **Dois usuários** | B registra 7,5 unidades | A **não** vê "7.5 unidades"; B vê | linhas com `usuario_id` distintos | Auto T2 |
| Nota de somente leitura | — | presente no rodapé da visão | — | Auto (já) |

### 5.5 Cenários da temporada

| Cenário | Como se produz | O que se afirma | Prova |
| --- | --- | --- | --- |
| Rodada cheia | semente padrão, 49 dias | nº de "Registrei" == nº de itens com linha; "N apitos na lista" bate; grupos por time == siglas distintas | Auto T3 |
| Rodada sem lista | relógio em `hoje + 1` sem produzir o dia | "A lista de hoje ainda não foi publicada" + link "Ver a Lista Secreta" | Auto T3 |
| Outra semente | `'pente-fino-b'`, 21 dias, outra data | tudo acima continua valendo com outros jogos | Auto T3 |
| Volume | 49 dias | ≥ 250 jogos encerrados · ≥ 3.500 linhas de box · ≥ 40 rodadas | Auto T3 |

---

## 6. Segurança do banco — leia antes de rodar qualquer coisa no navegador

- **Testes automatizados (T1–T3):** PGlite em memória, migrations reais, zero rede. Não
  tocam o Neon. Podem rodar a qualquer hora.
- **Navegador (T4/T5):** precisa de `next dev`, e `getDb()` só fala com Neon
  (`@neondatabase/serverless`). Hoje `.env.local` aponta para o **mesmo** Neon da
  produção. Isso é a prática atual do projeto (runbook de deploy manda rodar
  `demo:temporada` contra ele), e é seguro **enquanto** o banco só tiver dado simulado —
  o comando é idempotente e determinístico: reexecutar não muda nada que já esteja lá.
- **Pré-condição obrigatória, conferida antes de T4/T5:** `vercel env ls production`
  **não** lista `NBA_INGESTAO_HABILITADA=true`. Se listar, **pare**: a partir daí o Neon
  tem dado real, e semear demo por cima o mistura com ficção. O passo então exige um
  **branch do Neon** (console → Branches → "Create branch" a partir de `main`; copiar a
  connection string do branch para `DATABASE_URL` no `.env.local`). Quem cria é o parceiro
  (D04); não há CLI instalada.
- **`DEMO_AUTOSSEMEADURA` não é tocada por este pente fino.** É o interruptor do parceiro
  (decisão de 19/09). `demo:temporada` é um script; não depende da variável.
- **Cortesia para a própria conta ADMIN em produção** é intencional e prevista
  (cobranca-e-acesso, "equipe e piloto"). Com `CORTESIA_ATE` a cortesia expira sozinha.

---

## 7. Fora do escopo — registrado para a próxima rodada

- As outras cinco superfícies com `SilhuetaPaga` — Estatísticas do jogo, do time e do
  jogador; o bloco de alertas em `/conta`; os jogos do dia na Lista/Fire Live do grátis —
  têm a mesma causa e merecem o mesmo T1 (acesso real). Não entram aqui para o pente fino
  da Gestão terminar antes do lançamento.
- `ruleset.gestao_banca.origem = demonstracao`: o aviso amarelo na aba é esperado até o
  CJ mandar o modelo homologado. Não é defeito.
- Mercado Pago, BALLDONTLIE e Superbet: pendências já documentadas à parte.

---

## 8. Referências

- Tela e ação: `src/app/(app)/gestao/page.tsx`, `src/app/(app)/gestao/acoes.ts`
- Serviços: `src/modules/entrega/gestao.ts` (`planoDoDia`), `gestao-realizadas.ts`
- Acesso: `src/modules/plataforma/assinatura/{guarda,direito,nivel-do-plano}.ts`
- Simulação: `src/modules/ingestao/demo/{temporada,simulacao,semear,ao-vivo,odds}.ts`
- Arnês de teste: `src/modules/dominio/__tests__/ajuda-banco.ts` (PGlite),
  `src/app/__tests__/{telas-05-gestao,planos-gestao,gestao-acoes}.test.ts`
- Scripts: `scripts/{conceder-cortesia,criar-conta-teste,demo-temporada,demo-limpar}.ts`
- Runbooks: `docs/runbooks/{cobranca-e-acesso,bootstrap-admin,deploy}.md`

---

## 9. Achados da execução

Execução de 22/09/2026, branch `pente-fino-gestao`. Um por linha: elemento · esperado ·
observado · onde está provado.

| # | Elemento | Esperado (§5) | Observado | Onde |
| --- | --- | --- | --- | --- |
| 1 | "Registrei" por linha do apito | um formulário por **item do feed** com linha (§5.5) | um por **card** — jogador + atributo, na linha de maior confiança (`agruparPorJogador`, mesmo agrupamento da Lista Secreta, desenho do documento do CJ). As outras linhas do jogador (15+/20+/25+) não têm "Registrei" em tela nenhuma: quem entrou em 20+ num card de 15+ **não consegue registrar 20+**. A §5.5 errou a unidade; o comportamento é deliberado, mas a consequência para quem registra **é matéria de decisão do parceiro/CJ**, não de correção inline. Subsídio: a ação e o upsert já aceitam qualquer linha (o Zod de `acoes.ts` não confere contra o feed) — se a decisão for abrir, a mudança é só de tela. | `gestao-cenarios-temporada.test.ts` ("um Registrei por card com linha"); runbook §4, linha "Observar" |
| 2 | Item sem linha (§5.3) | sem formulário, sem erro | **inalcançável hoje, e por isso não provado**: `linha: null` só nasce no Fire Live (`motor/fire-live/avaliar.ts`), e a Gestão lê o feed da Lista Secreta — o ramo `item.linha !== null` da tela é defensivo. Nenhuma das duas sementes produz o caso (0 de 18 e 0 de 23 itens); o teste se declara **pulado**, com o motivo, em vez de passar verde sem afirmar nada. | `gestao-cenarios-temporada.test.ts` ("item SEM linha") |
| 3 | Checagem de segurança do banco (§6) | "`vercel env ls production` não lista `NBA_INGESTAO_HABILITADA=true`" | `vercel env ls` mostra só o **nome**, nunca o valor — e configuração não é dado: a temporada retroativa (`e5b508b`, mesmo dia) grava dado **real** no Neon, que fica lá mesmo depois de as variáveis serem apagadas. O runbook passou a conferir primeiro o **dado** (`SELECT count(*) FROM checkpoints_ingestao`, tabela que só o backfill escreve) e depois a configuração (lista inteira, sem `grep`). `demo:temporada` não tem guarda própria — fica como sugestão para outra spec. | `docs/runbooks/pente-fino-gestao.md` §0 |
| 4 | Roteiro manual (T4) e E2E ao vivo (T5) | executados no navegador | **pendentes, com o parceiro**: exigem `demo:temporada`, cortesia e `next dev` contra o Neon, que é o de produção (§6). `npm run e2e` sem credenciais pula tudo (o `setup` de login e as 5 specs) — prova só que o arnês carrega. | runbook; `e2e/gestao.spec.ts` |

Fora desses, **nenhum desvio de comportamento**: acesso real (silhueta × formulário,
recusa no servidor), registrar → redirecionar → ver, upsert (uma linha, valores novos),
`?erro=` traduzido sem gravar, ontem fora de hoje, dois usuários isolados, ordem mais
recente primeiro, banca inválida no padrão, rodada sem lista — todos como a §5 descreve.

Volume medido (semente padrão, 49 dias): **315** jogos encerrados · **4.629** linhas de box
· **50** rodadas.

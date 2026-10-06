# Rastreamento de indicações — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** registrar quem indicou cada conta da NIP (parceiro convidado ou usuário) e, se ela assinar, plano, data do primeiro pagamento aprovado e situação atual — sem nenhum pagamento — e mostrar isso ao admin (nomes) e ao parceiro (só números).

**Architecture:** reaproveita o motor de afiliados (cookie `nip_afiliado_visitante`, primeiro toque de 30 dias, robôs, conflito). Entra um destino de link novo, `CADASTRO`, que leva a `/cadastrar` sem exigir casa/oferta; campanhas de indicação (`finalidade = 'INDICACAO'`) sem oferta; parceiro do tipo `USUARIO` criado sob demanda para o link pessoal. A assinatura vira um evento `ASSINATURA_NIP` gravado depois que o pagamento é aprovado, fora da transação do pagamento, com uma varredura idempotente que refaz o que falhar.

**Tech Stack:** Next.js 16.3.6 (App Router, server actions), TypeScript, Drizzle + Postgres, Vitest + PGlite (`bancoDeTeste()`), dependency-cruiser.

**Spec:** [`docs/superpowers/specs/2026-09-26-rastreamento-de-indicacoes-design.md`](../specs/2026-09-26-rastreamento-de-indicacoes-design.md)

## Global Constraints

- **Nenhum pagamento, comissão ou repasse** nasce de indicação. `comissoes_afiliados`, importação CSV e repasses não mudam; os testes atuais de afiliados continuam verdes sem edição de asserção.
- **Nenhum valor em dinheiro** é gravado ou mostrado no rastreamento de indicação.
- Janela e dono: `decidirAtribuicao` (`src/modules/plataforma/afiliados/atribuicao.ts`) — 30 dias, primeiro toque — **sem mudança**.
- **Ninguém se indica:** clique no próprio link não cria atribuição; associação a uma atribuição cujo parceiro é a própria conta é ignorada.
- **Só o admin vê nomes/e-mails.** Parceiro vê só números. Usuário comum vê só o próprio link.
- Link de indicação leva a **`/cadastrar`**. Cadastro público fechado (`CADASTRO_PUBLICO_HABILITADO=false`) vale para todos — sem exceção.
- Falha ao registrar a assinatura **nunca** atrapalha o pagamento.
- Vocabulário nas telas: "indicação", "cadastro", "assinatura"; nunca "comissão" nessas telas. "Confiança" nunca "probabilidade".
- Admin: `exigirAdmin()`/`negarSeNaoForAdmin()` em toda página e ação novas.
- `src/modules/motor/**` e `config/ruleset.v1.yaml` não mudam.
- Commits: um WIP por tarefa (`wip(indicacoes): Task N — …`), squash num commit único na Task 8. Nunca `git add -A`; nunca stage de `referencias/`, `scripts/_*`, `.superpowers/`, `backups/`.
- Suíte completa só em invocações de até 6 arquivos; `df -h /System/Volumes/Data` antes (parar abaixo de 5 GB). Nada contra o banco de produção; migração em produção é do parceiro.

## Review Focus

1. **Pagamento renovado (2º, 3º…)**: não pode criar outro `ASSINATURA_NIP` nem mudar a data do primeiro (Task 3).
2. **Pessoa que paga depois dos 30 dias**: a atribuição já ligada à conta no cadastro continua valendo para a assinatura, mesmo com `expira_em` no passado (Task 3).
3. **Atribuição em CONFLITO**: não conta como indicação de ninguém — nem no admin, nem nos números do parceiro (Tasks 3 e 4).
4. **Link de indicação de parceiro SUSPENSO ou link pausado**: leva a `/oferta-indisponivel` como os outros links, sem registrar (Task 2).
5. **Usuário comum abrindo `/admin/indicacoes` ou o painel de afiliado de outro**: recebe a negação/"sem parceria", nunca dados (Tasks 5 e 6).

---

## Estrutura de arquivos

| Arquivo | Responsabilidade |
|---|---|
| `src/modules/dominio/db/schema/afiliados.ts` | colunas/checks novos (tipo de parceiro, finalidade da campanha, destino `CADASTRO`, evento `ASSINATURA_NIP`) |
| `drizzle/0035_*.sql` + down; `scripts/gerar-down.mjs` (`CONSTRAINTS_ANTERIORES`) | migração |
| `src/modules/plataforma/afiliados/indicacoes.ts` (novo) | link pessoal, link de indicação do parceiro, registro de assinatura, varredura, leituras |
| `src/modules/plataforma/afiliados/situacao.ts` (novo, puro) | `situacaoDaIndicacao` |
| `src/modules/plataforma/afiliados/servico.ts` | `resolverLinkSemRegistrar`/`registrarClique`/`associarVisitanteAoUsuario` aceitam `CADASTRO` e barram auto-indicação; totais dos painéis; convite ligado a parceiro existente |
| `src/modules/plataforma/assinatura/webhook.ts` | chamar o registro depois do pagamento aprovado |
| `src/modules/plataforma/assinatura/reconciliacao.ts` | chamar a varredura |
| `src/app/(app)/admin/indicacoes/page.tsx` (novo), `src/features/admin/componentes.tsx`, `src/features/admin/afiliados/acoes.ts`, `src/app/(app)/admin/afiliados/page.tsx` | admin |
| `src/app/(afiliados)/afiliados/page.tsx` | números de cadastros/assinaturas |
| `src/features/conta/{carregar.ts,Blocos.tsx}`, `src/app/(app)/conta/page.tsx` | bloco "Indique a NIP" |
| `src/modules/plataforma/auth/requisicao.ts`, `src/app/(afiliados)/afiliados/convite/[token]/page.tsx`, `src/features/publico/acoes.ts` | correções da auditoria |

---

### Task 1: Esquema e migração

**Files:**
- Modify: `src/modules/dominio/db/schema/afiliados.ts` (`parceirosAfiliados` l.21, `campanhasAfiliados` l.119, `linksAfiliados` l.145, `eventosAfiliados` l.207)
- Modify: `scripts/gerar-down.mjs` (`CONSTRAINTS_ANTERIORES`, l.24-31)
- Create: `drizzle/0035_*.sql`, `drizzle/down/0035_*.sql` (gerados)
- Test: `src/modules/plataforma/afiliados/__tests__/esquema-indicacoes.test.ts`

**Interfaces:**
- Produces: `parceirosAfiliados.tipo: 'PARCEIRO' | 'USUARIO'`; `campanhasAfiliados.finalidade: 'CASA' | 'INDICACAO'` e `ofertaId` anulável; `linksAfiliados.tipoDestino` aceita `'CADASTRO'`; `eventosAfiliados.tipo` aceita `'ASSINATURA_NIP'`, colunas novas `nivelDoPlano`, `modalidade` (anuláveis) e índice único parcial `eventos_afiliados_assinatura_unica` em `(atribuicao_id) where tipo = 'ASSINATURA_NIP'`.

- [ ] **Step 1: Teste que falha** (PGlite, `bancoDeTeste()` como em `src/modules/dominio/__tests__/retroativo-schema.test.ts`):

```ts
it('campanha de INDICACAO não exige oferta; de CASA exige', async () => { /* insert campanha finalidade INDICACAO sem oferta → ok; CASA sem oferta → erro de CHECK campanhas_afiliados_oferta_por_finalidade */ })
it('link CADASTRO é aceito e não exige caminho_nip', async () => { /* insert link tipo_destino CADASTRO, caminho_nip null → ok */ })
it('ASSINATURA_NIP exige nível do plano e modalidade e é único por atribuição', async () => {
  /* 1º insert ASSINATURA_NIP com nivel_do_plano MVP, modalidade MENSAL → ok;
     2º com a mesma atribuicao_id → erro de unique; sem nivel_do_plano → erro de CHECK eventos_afiliados_assinatura_com_plano */
})
it('parceiro tem tipo PARCEIRO por padrão e aceita USUARIO; outro valor falha', async () => { /* … */ })
```

Escreva cada corpo com `banco.pg.query('insert …')` e `await expect(…).rejects.toThrow(/nome_da_constraint/)`.

- [ ] **Step 2: Ver falhar** — `npx vitest run src/modules/plataforma/afiliados/__tests__/esquema-indicacoes.test.ts` → FAIL.

- [ ] **Step 3: Implementar no schema**

```ts
// parceirosAfiliados — nova coluna e check
tipo: text('tipo').notNull().default('PARCEIRO'),
// …checks:
check('parceiros_afiliados_tipo_valido', sql`${t.tipo} in ('PARCEIRO', 'USUARIO')`),

// campanhasAfiliados
ofertaId: uuid('oferta_id').references(() => ofertasAfiliados.id),   // sem .notNull()
finalidade: text('finalidade').notNull().default('CASA'),
// …checks:
check('campanhas_afiliados_finalidade_valida', sql`${t.finalidade} in ('CASA', 'INDICACAO')`),
check('campanhas_afiliados_oferta_por_finalidade', sql`${t.finalidade} = 'INDICACAO' or ${t.ofertaId} is not null`),

// linksAfiliados — trocar o check existente
check('links_afiliados_tipo_destino_valido', sql`${t.tipoDestino} in ('NIP', 'CASA', 'CADASTRO')`),

// eventosAfiliados — colunas e checks
nivelDoPlano: text('nivel_do_plano'),
modalidade: text('modalidade'),
// …trocar o check de tipo e acrescentar:
check('eventos_afiliados_tipo_valido', sql`${t.tipo} in ('CLIQUE', 'VISITA_NIP', 'SAIDA_CASA', 'CADASTRO_NIP', 'ASSINATURA_NIP')`),
check(
  'eventos_afiliados_assinatura_com_plano',
  sql`${t.tipo} <> 'ASSINATURA_NIP' or (${t.nivelDoPlano} in ('MVP', 'ALL_STAR') and ${t.modalidade} in ('MENSAL', 'TEMPORADA') and ${t.atribuicaoId} is not null and ${t.usuarioId} is not null)`,
),
uniqueIndex('eventos_afiliados_assinatura_unica').on(t.atribuicaoId).where(sql`${t.tipo} = 'ASSINATURA_NIP'`),
```

Em `scripts/gerar-down.mjs`, acrescente em `CONSTRAINTS_ANTERIORES` o texto EXATO atual das duas constraints trocadas (copie do SQL da migração que as criou — `grep -rn "links_afiliados_tipo_destino_valido\|eventos_afiliados_tipo_valido" drizzle/*.sql`):

```js
links_afiliados_tipo_destino_valido: `CHECK ("links_afiliados"."tipo_destino" in ('NIP', 'CASA'))`,
eventos_afiliados_tipo_valido: `CHECK ("eventos_afiliados"."tipo" in ('CLIQUE', 'VISITA_NIP', 'SAIDA_CASA', 'CADASTRO_NIP'))`,
```

(use a forma exata do SQL original; o texto acima é o conteúdo esperado).

- [ ] **Step 4: Gerar** — `npm run db:generate` → `drizzle/0035_*.sql` + down sem erro. Se `oferta_id DROP NOT NULL` gerar `ALTER COLUMN … DROP NOT NULL`, o `gerar-down` já inverte.

- [ ] **Step 5: Ver passar** — o teste da Step 1 + `src/modules/plataforma/afiliados/__tests__/migracao.test.ts` + `src/modules/dominio/__tests__/migracoes-pendentes.test.ts` + os testes de contagem de tabelas (nenhuma tabela nova — contagens não mudam). Rode também `servico.test.ts` e `regras.test.ts` de afiliados: verdes sem mudança.

- [ ] **Step 6: Commit** — `git add src/modules/dominio/db/schema/afiliados.ts scripts/gerar-down.mjs drizzle/ src/modules/plataforma/afiliados/__tests__/esquema-indicacoes.test.ts` e `git commit -m "wip(indicacoes): Task 1 — esquema e migração"`.

---

### Task 2: Links de indicação e clique

**Files:**
- Create: `src/modules/plataforma/afiliados/indicacoes.ts`
- Modify: `src/modules/plataforma/afiliados/servico.ts` (`resolverLinkSemRegistrar` l.406, `registrarClique` l.435, `associarVisitanteAoUsuario` l.293, `criarCampanhaComLink` l.231)
- Test: `src/modules/plataforma/afiliados/__tests__/indicacoes.test.ts`

**Interfaces:**
- Consumes: Task 1.
- Produces:
  - `linkPessoalDoUsuario(db: Db, usuarioId: string, agora: Date): Promise<{ codigo: string }>` — idempotente: cria (uma vez) parceiro `tipo='USUARIO'`, `usuario_id`=conta, `codigo` = `u-` + 10 caracteres base36 aleatórios (reuse o gerador de código que o módulo já tiver; senão `crypto.randomBytes`), `nome_publico` = e-mail mascarado; campanha `finalidade='INDICACAO'`, `oferta_id` nulo, `canal='usuario'`; link `tipo_destino='CADASTRO'`. Devolve o código.
  - `criarLinkDeIndicacao(db: Db, ator: AtorAdmin, entrada: { parceiroId: string; nome: string; canal: string; codigo: string }, agora: Date): Promise<{ codigo: string }>` — campanha `INDICACAO` sem oferta + link `CADASTRO`, auditado como `LINK_CRIADO` (mesmo padrão de `criarCampanhaComLink`).
  - `resolverLinkSemRegistrar` para `tipo_destino='CADASTRO'` devolve `destino = '/cadastrar'` sem consultar oferta; continua recusando link inativo, campanha não ATIVA e parceiro não ATIVO (mesmos erros de hoje → `/oferta-indisponivel` na rota).
  - `registrarClique` com `usuarioId` igual ao `usuario_id` do parceiro do link grava o `CLIQUE` mas **não** cria atribuição.
  - `associarVisitanteAoUsuario`: se o parceiro da atribuição tem `usuario_id === usuarioId`, devolve `{ associada: false, conflito: false }` sem gravar.

- [ ] **Step 1: Testes que falham** (use `cenarioDeAfiliados` de `src/modules/plataforma/afiliados/__tests__/cenario.ts` e `bancoDeTeste()`):
  1. `linkPessoalDoUsuario` duas vezes → mesmo código, 1 parceiro `USUARIO`, 1 link `CADASTRO`.
  2. `resolverLinkSemRegistrar(db, codigoPessoal)` → `destino === '/cadastrar'` **sem nenhuma oferta ativa no banco** (desative as ofertas do cenário antes).
  3. `criarLinkDeIndicacao` para `parceiroA` → resolve para `/cadastrar`.
  4. Parceiro SUSPENSO (`definirStatusParceiro`) → `resolverLinkSemRegistrar` lança (rota manda para indisponível).
  5. `registrarClique` do dono no próprio link → evento `CLIQUE` gravado, nenhuma linha em `atribuicoes_afiliados`.
  6. Visitante clica no link do usuário B, cadastra como C → `associarVisitanteAoUsuario(…, 'CADASTRO')` grava `CADASTRO_NIP`; B se "cadastrando" pelo próprio cookie → nada.
  7. Os testes de `servico.test.ts` seguem verdes (links `NIP`/`CASA` intactos).

- [ ] **Step 2: Ver falhar** → FAIL. **Step 3: Implementar.** **Step 4: Ver passar** (este arquivo + `servico.test.ts`, `regras.test.ts`, `src/app/r/[codigo]/__tests__/route.test.ts`).

- [ ] **Step 5: Commit** — `wip(indicacoes): Task 2 — links de indicação e clique`.

---

### Task 3: Registro da assinatura

**Files:**
- Modify: `src/modules/plataforma/afiliados/indicacoes.ts`
- Create: `src/modules/plataforma/afiliados/situacao.ts`
- Modify: `src/modules/plataforma/assinatura/webhook.ts` (depois da transação que devolve `{ liberou: true, usuarioId }`, l.~407-434 dentro de `aplicarEfeito`; o registro vai no chamador `aplicarEventoPagamento` l.472-514, **após** o commit)
- Modify: `src/modules/plataforma/assinatura/reconciliacao.ts` (`reconciliarPagamentos` l.188)
- Test: `src/modules/plataforma/afiliados/__tests__/assinatura-indicada.test.ts`, `src/modules/plataforma/afiliados/__tests__/situacao.test.ts`

**Interfaces:**
- Produces:
  - `registrarAssinaturaIndicada(db: Db, entrada: { usuarioId: string; nivelDoPlano: 'MVP' | 'ALL_STAR'; modalidade: 'MENSAL' | 'TEMPORADA'; aprovadoEm: Date }): Promise<{ registrada: boolean }>` — acha a atribuição com `usuario_id = usuarioId`, `estado <> 'CONFLITO'` **e que tenha um evento `CADASTRO_NIP`** (a pessoa foi indicada no cadastro — quem já tinha conta e só entrou depois de um clique fica ligado pelo LOGIN e NÃO conta; regra "quem já tem conta não troca de indicador"); a mais antiga; **ignora `expira_em`** — Review Focus 2; sem atribuição → `{ registrada: false }`. Insere `ASSINATURA_NIP` (`link_id` = link de origem, `visitante_hash` da atribuição, `ocorrido_em = aprovadoEm`) com `onConflictDoNothing` no índice único → o 2º pagamento não muda nada (Review Focus 1).
  - `registrarAssinaturasPendentes(db: Db, agora: Date): Promise<number>` — para cada `direitos_acesso` com `origem` do Mercado Pago cuja conta tem atribuição não-CONFLITO **com `CADASTRO_NIP`** e ainda não tem `ASSINATURA_NIP`, registra usando o direito mais antigo daquela conta (`inicio` como `aprovadoEm`, `nivel_do_plano`, `modalidade`). Idempotente.
  - `situacaoDaIndicacao(entrada: { statusAssinatura: string | null; fimDoDireito: Date | null; agora: Date }): 'ATIVA' | 'CANCELADA' | 'VENCIDA' | 'SEM_ASSINATURA'` (puro) — `CANCELADA` se status em `CANCELADA|CANCELED|CANCELLED`; `ATIVA` se há direito com `fim > agora`; `VENCIDA` se houve direito e `fim <= agora`; senão `SEM_ASSINATURA`.

- [ ] **Step 1: Testes que falham**
  - `situacao.test.ts`: os quatro casos da função pura.
  - `assinatura-indicada.test.ts` (PGlite): (a) conta indicada, 1º registro grava; (b) 2º registro com outra data não muda nada (a data continua a do 1º); (c) atribuição com `expira_em` no passado ainda conta; (d) atribuição CONFLITO não grava; (e) conta sem atribuição → `registrada:false`; (e2) conta que já existia, clicou num link e entrou (atribuição ligada por LOGIN, sem `CADASTRO_NIP`) → `registrada:false` e não aparece em `listarIndicacoes`; (f) `registrarAssinaturasPendentes` grava o que faltou e, rodada de novo, devolve 0; (g) **falha no registro não derruba o pagamento**: no teste do webhook existente (procure em `src/modules/plataforma/__tests__/` o teste de `processarNotificacao`/`PAGAMENTO_APROVADO`), faça `registrarAssinaturaIndicada` lançar (vi.spyOn no módulo) e confira que o direito foi criado e a função não rejeitou.

- [ ] **Step 2: Ver falhar.** **Step 3: Implementar.** No webhook, depois do commit do pagamento:

```ts
if (resultado.liberou) {
  try {
    await registrarAssinaturaIndicada(db, { usuarioId, nivelDoPlano: compra.nivelDoPlano, modalidade: compra.modalidade, aprovadoEm: inicio })
  } catch (erro) {
    // Indicação é registro, não pagamento: falhar aqui nunca desfaz o acesso.
    // A varredura da reconciliação refaz.
    console.error(JSON.stringify({ evento: 'indicacao_assinatura_falhou', usuarioId, mensagem: String(erro) }))
  }
}
```

(adapte aos nomes reais em escopo; o registro fica FORA da transação do pagamento). Em `reconciliarPagamentos`, ao final, `await registrarAssinaturasPendentes(db, agora)` dentro de `try/catch` com log.

- [ ] **Step 4: Ver passar** (os dois arquivos novos + testes de webhook/reconciliação/assinatura existentes que você tocou). **Step 5: Commit** — `wip(indicacoes): Task 3 — registro da assinatura`.

---

### Task 4: Leituras (admin e parceiro)

**Files:**
- Modify: `src/modules/plataforma/afiliados/indicacoes.ts`
- Modify: `src/modules/plataforma/afiliados/servico.ts` (`painelDoAfiliado` l.1463, `painelAdministrativo` l.1718)
- Test: `src/modules/plataforma/afiliados/__tests__/indicacoes-leitura.test.ts`

**Interfaces:**
- Produces:
  - `listarIndicacoes(db: Db, filtro: { tipoIndicador?: 'PARCEIRO' | 'USUARIO'; parceiroId?: string; inicio?: Date; fim?: Date }, agora: Date): Promise<{ totais: { cadastros: number; assinaturas: number }; linhas: LinhaIndicacao[] }>` com
    `type LinhaIndicacao = { indicador: { parceiroId: string; tipo: 'PARCEIRO' | 'USUARIO'; nome: string }; linkCodigo: string; indicado: { usuarioId: string; nome: string | null; email: string }; cadastradoEm: Date; assinatura: { nivelDoPlano: string; modalidade: string; aprovadoEm: Date } | null; situacao: ReturnType<typeof situacaoDaIndicacao> }`
    — uma linha por evento `CADASTRO_NIP` cuja atribuição não está em CONFLITO; o período filtra pela data do cadastro; ordem mais recente primeiro. Para `USUARIO`, `indicador.nome` = nome/e-mail da conta indicadora.
  - `painelDoAfiliado(...).totais` ganha `cadastros` (eventos `CADASTRO_NIP` dos links do parceiro, atribuição não-CONFLITO, no período) e `assinaturas` (eventos `ASSINATURA_NIP` idem). `painelAdministrativo(...).totais` ganha os mesmos dois totais globais. **Nenhum campo com nome/e-mail no retorno do painel do parceiro.**

- [ ] **Step 1: Testes que falham** — semente: parceiro A (link `CADASTRO`), usuário B (link pessoal); 3 cadastros (2 por A, 1 por B), 1 assinatura de um indicado de A, 1 atribuição em CONFLITO (não pode aparecer); filtros por tipo, parceiro e período; `painelDoAfiliado` de A tem `cadastros=2, assinaturas=1` e **nenhuma string de e-mail** no JSON serializado do retorno (Review Focus 3 e 5); situação segue a assinatura (cancele e veja `CANCELADA`).

- [ ] **Step 2–4:** ver falhar, implementar, ver passar (este arquivo + `servico.test.ts`). **Step 5: Commit** — `wip(indicacoes): Task 4 — leituras`.

---

### Task 5: Admin

**Files:**
- Create: `src/app/(app)/admin/indicacoes/page.tsx`
- Modify: `src/features/admin/componentes.tsx` (l.6-16: `AreaAdmin` e `AREAS` ganham `{ chave: 'indicacoes', rotulo: 'Indicações', href: '/admin/indicacoes' }`)
- Modify: `src/features/admin/afiliados/acoes.ts` (nova ação `acaoCriarLinkDeIndicacao`), `src/app/(app)/admin/afiliados/page.tsx` (formulário "Link de indicação (cadastro)" com `parceiroId`, `nome`, `canal`, `codigo`; métricas Cadastros/Assinaturas)
- Test: `src/features/admin/__tests__/indicacoes.test.tsx` (fumaça no padrão de `src/features/admin/__tests__/fumaca.test.tsx`), `src/features/admin/__tests__/portao.test.ts` (a página nova entra na lista que o portão confere)

- [ ] **Step 1: Testes que falham** — (a) ADMIN vê a tabela com indicador, link, nome e e-mail do indicado, data, "Assinou"/plano/data/situação e os totais; (b) filtros por `?tipo=`, `?parceiro=`, `?de=`/`?ate=` (datas no fuso de São Paulo, como `periodo.ts`); (c) usuário comum e parceiro recebem a negação (Review Focus 5); (d) a ação cria o link e ele resolve para `/cadastrar`; (e) a página não contém "comissão".
- [ ] **Step 2–4.** **Step 5: Commit** — `wip(indicacoes): Task 5 — admin`.

---

### Task 6: Painel do parceiro e bloco da conta

**Files:**
- Modify: `src/app/(afiliados)/afiliados/page.tsx` (dentro de `GradeDeMetricas`: `<Metrica rotulo="Cadastros" valor={painel.totais.cadastros} />` e `<Metrica rotulo="Assinaturas" valor={painel.totais.assinaturas} />`)
- Modify: `src/features/conta/carregar.ts` (retorno ganha `linkDeIndicacao: string` = URL absoluta `${APP_PUBLIC_URL}/r/<codigo>` via `linkPessoalDoUsuario`), `src/features/conta/Blocos.tsx` (`BlocoIndicacao` com o link e botão copiar — reuse o botão Copiar do painel de afiliado), `src/app/(app)/conta/page.tsx`
- Test: fumaça da conta (`src/features/conta/__tests__/fumaca.test.tsx`) e do painel de afiliado (`src/features/admin/__tests__/fumaca.test.tsx` ou onde `/afiliados` é testado)

- [ ] **Step 1: Testes que falham** — conta: o bloco "Indique a NIP" mostra `/r/u-…` e não mostra números; duas visitas não criam dois links; parceiro: métricas Cadastros e Assinaturas com os valores da semente, sem nomes.
- [ ] **Step 2–4.** **Step 5: Commit** — `wip(indicacoes): Task 6 — painel do parceiro e conta`.

---

### Task 7: Correções da auditoria

**Files:**
- Modify: `src/modules/plataforma/auth/requisicao.ts` (l.4-28)
- Modify: `src/modules/plataforma/afiliados/servico.ts` (`criarConvite` l.97, `aceitarConvite` l.124), `src/features/admin/afiliados/acoes.ts` (`acaoCriarConvite` aceita `parceiroId` opcional), formulário do convite no admin
- Modify: `src/app/(afiliados)/afiliados/convite/[token]/page.tsx`, `src/features/publico/acoes.ts` (`cadastrar` l.84-119: `redirect(destinoInternoSeguro(destino) ?? '/assinar')` quando vier `destino` válido)
- Test: `src/modules/plataforma/auth/__tests__/requisicao.test.ts` (crie se não existir), `servico.test.ts` (convite), fumaça pública

- [ ] **Step 1: Testes que falham**
  - `destinoInternoSeguro('/afiliados')` → `/afiliados`; `('/afiliados/convite/Ab_c-123')` → igual; `('/afiliados/convite/../../x')`, `('//evil.com')`, `('/afiliados/convite/a/b')` → `/`. Implementação: além do `Set`, aceitar `^/afiliados$` e `^/afiliados/convite/[A-Za-z0-9_-]{16,128}$` (token base64url — confira o tamanho real gerado em `criarConvite`).
  - Convite criado com `parceiroId` de um parceiro sem conta → `aceitarConvite` preenche `usuario_id` nele (não cria outro); com parceiro já ligado a outra conta → erro claro; sem `parceiroId` → comportamento de hoje.
  - Tela do convite sem sessão mostra "Entrar para continuar" **e** "Criar conta" (`/cadastrar?destino=/afiliados/convite/<token>`); `cadastrar` com esse destino redireciona de volta ao convite; sem destino, continua `/assinar`.
- [ ] **Step 2–4.** **Step 5: Commit** — `wip(indicacoes): Task 7 — correções da auditoria`.

---

### Task 8: Runbook, bateria e commit único

- [ ] **Step 1:** `docs/runbooks/afiliados.md` ganha a seção "Indicações (sem pagamento)": link pessoal em `/conta`, link de indicação do parceiro no admin, tela `/admin/indicacoes`, a migração 0035 (**rodar `db:migrate` antes do deploy**), e que indicação nunca gera comissão.
- [ ] **Step 2:** registro §10 na spec: o que foi feito, desvios, decisões tomadas pelo controlador.
- [ ] **Step 3:** bateria — `npx next typegen`, `npm run typecheck`, `npm run lint`, `npm run boundaries`; suíte completa em invocações de 6 arquivos; `next build` com `DATABASE_URL=postgres://x:y@127.0.0.1:1/db DATABASE_URL_UNPOOLED=postgres://x:y@127.0.0.1:1/db`; `git diff <base> -- src/modules/motor config` vazio.
- [ ] **Step 4:** squash num commit único (`feat(indicacoes): rastreamento de indicações de cadastro e assinatura, sem pagamento`) e revisão final (`superpowers:requesting-code-review`). Sem push, sem merge, sem migração em produção.

## Ordem

1 → 2 → 3 → 4 → 5 → 6; 7 é independente depois da 1; 8 por último.

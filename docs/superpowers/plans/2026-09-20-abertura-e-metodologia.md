# A abertura do app e o aceite da metodologia — plano

> **Para quem executa:** SUB-SKILL OBRIGATÓRIA: `superpowers:executing-plans`.

**Goal:** o app abre onde a ação está, a metodologia fica a um clique de dentro da Lista, e
ninguém usa o produto sem ter lido o método uma vez — com o aceite gravado por conta.

**Architecture:** uma coluna nova em `usuarios`, um portão dentro do guarda que as doze telas
já atravessam, duas rotas novas que não desenham quase nada (`/abrir` decide e redireciona;
`/metodologia` mostra e grava), e o corpo da `/como-funciona` extraído para um componente que
as duas telas de metodologia renderizam.

**Tech Stack:** Next.js App Router (server components, server actions), Drizzle + Postgres
(PGlite nos testes), Vitest com `renderToStaticMarkup`.

**Spec:** [`2026-09-20-abertura-e-metodologia-design.md`](../specs/2026-09-20-abertura-e-metodologia-design.md)

## Global Constraints

- **O motor não muda; o ruleset não muda.** `npm run boundaries` continua verde.
- **Nenhuma decisão de identidade reabre.** A tela nova veste a `Moldura` e os tokens de
  sempre; nada de cor, fonte ou espaçamento inventado.
- **UM commit, no fim de tudo**, incluindo a spec e este plano. Branch `abertura-e-metodologia`.
- **`git fetch` antes de começar:** há mais de uma mão neste repositório (lição de 19/09).
- **Disco:** `df -h /` antes de suíte, build ou captura; a suíte come ~6 GB. Abaixo de 3 GB,
  limpar a lista aprovada em MEMORY.md (`disco-cheio-mac`).
- **Migração desce limpa:** `npm run db:generate` gera o `.sql` e o down; o teste
  `persistencia` sobe e desce todas.

---

# Fase 0 · Branch

- [ ] `git fetch origin && git log --oneline origin/main -1` — se a main andou, rebasear.
- [ ] `git switch -c abertura-e-metodologia`

---

# Fase 1 · A coluna

### Task 1.1: `usuarios.metodologia_aceita_em`

**Files:** `src/modules/dominio/db/schema/plataforma.ts`, `drizzle/*`

- [ ] **Step 1: a coluna**, depois de `ultimoAcesso`:

```ts
  /**
   * Quando a pessoa clicou em OK, CONCORDO na metodologia. NULO = nunca.
   *
   * Timestamp e não booleano porque "concordo" é REGISTRO: a data importa, e
   * custa o mesmo. Não guardamos qual versão do texto foi aceita — hoje não há
   * versão de metodologia para comparar.
   */
  metodologiaAceitaEm: timestamp('metodologia_aceita_em', { withTimezone: true }),
```

- [ ] **Step 2:** `npm run db:generate` — confere que nasceram o `.sql` e o down dele.
- [ ] **Step 3:** `npx vitest run src/modules/dominio/__tests__/persistencia.test.ts` → verde
      (é o teste que sobe e desce todas as migrations).

---

# Fase 2 · O conteúdo num lugar só

### Task 2.1: extrair o corpo da `/como-funciona`

**Files:** `src/components/metodologia/Conteudo.tsx` (novo),
`src/app/(app)/como-funciona/page.tsx`

- [ ] **Step 1:** criar `Conteudo.tsx` com os auxiliares `Secao`, `Caixa` e `n` e TODO o
      corpo que hoje fica dentro do `<div>` depois do `CabecalhoTela`. Ele é `async` e lê o
      ruleset por conta própria (`rulesetAtivo`, `montarTeoria`, `faixasConfianca`): as duas
      telas são de servidor, e passar a teoria por prop espalharia a leitura.

```tsx
/**
 * A METODOLOGIA NIP, escrita uma vez.
 *
 * Duas telas a mostram: `/como-funciona`, alcançável pelo botão da Lista e pelo
 * Perfil, e `/metodologia`, o portão de aceite por onde toda conta passa uma
 * vez. Texto duplicado divergiria na primeira vez que alguém corrigisse uma
 * frase só de um lado.
 */
export async function ConteudoDaMetodologia() { … }
```

- [ ] **Step 2:** `como-funciona/page.tsx` fica só com a sessão, a `Moldura`, o
      `CabecalhoTela` e `<ConteudoDaMetodologia />`.
- [ ] **Step 3: verificar** — `npx vitest run src/app/__tests__/escrita-identidade-04.test.ts src/app/__tests__/telas-demo.test.ts`
      → verde SEM editar teste nenhum. Os testes de escrita que já cobrem a `/como-funciona`
      são a rede: se o texto mudou na extração, eles quebram.

---

# Fase 3 · A tela de aceite

### Task 3.1: `/metodologia` e a ação

**Files:** `src/app/(app)/metodologia/page.tsx`, `.../acoes.ts` (novos) ·
Test: `src/app/__tests__/telas-metodologia.test.ts` (novo)

- [ ] **Step 1: o teste**

```ts
  it('mostra a metodologia e o botão de aceite, e não passa pelo portão de nível', async () => {
    const html = await renderizar()
    expect(html).toContain('OK, CONCORDO')
    // O MESMO conteúdo da /como-funciona — uma frase que só existe lá.
    expect(html).toContain('Leia uma vez: depois os cards se explicam sozinhos.')
    // Sem `exigirNivel`: senão o portão a mandaria para ela mesma, em laço.
    const fonte = readFileSync('src/app/(app)/metodologia/page.tsx', 'utf8')
    expect(fonte).not.toContain('exigirNivel')
    expect(fonte).toContain('sessaoAtual')
  }, 60_000)

  it('aceitar grava a data e leva ao destino', async () => {
    const { aceitarMetodologia } = await import('../(app)/metodologia/acoes')
    await expect(aceitarMetodologia(new FormData())).rejects.toThrow() // redirect()
    const [u] = await banco.db.select().from(usuarios).where(eq(usuarios.id, USUARIO))
    expect(u!.metodologiaAceitaEm).not.toBeNull()
  }, 60_000)
```

- [ ] **Step 2: a página** — `sessaoAtual()` (redireciona para `/entrar` se não houver),
      `Moldura aba={null}`, `CabecalhoTela` sem `voltarHref` (não há para onde voltar: é um
      portão), `<ConteudoDaMetodologia />` e o formulário com o botão
      `className="botao-primario"`, texto **OK, CONCORDO**, com o `destino` num
      `<input type="hidden">`.
- [ ] **Step 3: a ação** — grava `metodologiaAceitaEm: new Date()` para
      `sessao.usuarioId` e `redirect(destinoInternoSeguro(destino ?? '/abrir'))`.
      Usar `destinoInternoSeguro`, que o login já usa: destino vindo de URL é entrada de
      usuário, e redirecionar para fora do app seria um open redirect.
- [ ] **Step 4: verificar** — a suíte nova verde.

---

# Fase 4 · O portão

### Task 4.1: o aceite dentro de `exigirNivel`

**Files:** `src/modules/plataforma/assinatura/guarda.ts` ·
Test: `src/modules/plataforma/__tests__/` (a suíte que já cobre o guarda)

- [ ] **Step 1: o teste** — usuário com `metodologiaAceitaEm` nulo pedindo qualquer tela é
      mandado para `/metodologia?destino=<tela>`; com data, passa. E o de nível continua
      valendo DEPOIS dele.
- [ ] **Step 2:** em `exigirNivel`, entre o bloco de `acesso.nivel === null` e o `atende`:

```ts
  // O aceite da metodologia vem ANTES do nível: é o que faz a conta nova ler o
  // método antes de ver preço (decisão do parceiro, 20/09). `exigirNivel` é o
  // guarda de NÍVEL, e consentimento é outro assunto — mora aqui porque é o
  // ponto por onde as doze telas já passam, e repetir a checagem em cada uma
  // seria esquecê-la na décima terceira.
  if (!(await aceitouMetodologia(getDb(), sessao.usuarioId))) {
    redirect(`/metodologia?destino=${encodeURIComponent(destino)}`)
  }
```

- [ ] **Step 3: o teste de fonte das exceções** (novo, em `src/app/__tests__/`):

```ts
  it('toda tela de (app) passa pelo portão, ou está na lista curta de exceções', () => {
    // As exceções são de quem ainda não entrou, está entrando, ou é a própria
    // metodologia — barrá-las faria laço ou trancaria a porta por fora.
    const EXCECOES = [
      'metodologia', 'entrar', 'cadastrar', 'redefinir', 'como-funciona', 'retorno',
    ]
    // varre src/app/(app)/**/page.tsx; cada uma chama exigirNivel ou está nas exceções
  })
```

- [ ] **Step 4: verificar** — `npm run typecheck && npx vitest run src/modules/plataforma src/app/__tests__` → verde.

---

# Fase 5 · A abertura

### Task 5.1: `/abrir`

**Files:** `src/app/(app)/abrir/page.tsx` (novo) · Test: `src/app/__tests__/telas-abrir.test.ts` (novo)

- [ ] **Step 1: o teste** — com um jogo no 1º quarto, redireciona para `/fire-live`; sem
      nenhum, para `/`. (`redirect()` lança; casar a mensagem `NEXT_REDIRECT` ou usar o
      utilitário que as outras suítes já usam para isso.)
- [ ] **Step 2: a rota**

```tsx
/**
 * ONDE O APP ABRE.
 *
 * Ao Vivo quando há jogo no 1º quarto — a janela em que o Fire Live existe e a
 * única em que o produto tem urgência —, a Lista no resto do dia. Sem isso, ou
 * a pessoa precisa de um toque para achar o jogo rolando, ou abre no vazio.
 *
 * Rota SEPARADA, e não a decisão dentro de `/`: se `/` redirecionasse, clicar
 * em ENTRADAS durante um jogo jogaria a pessoa de volta no Ao Vivo e a Lista
 * ficaria inalcançável enquanto houvesse bola rolando.
 *
 * Não checa sessão: ela redireciona para telas que já têm portão.
 */
export default async function PaginaAbrir() {
  const ruleset = await rulesetAtivo()
  const fuso = ruleset.rodada.fuso
  const hoje = dataDeReferencia(new Date(), fuso)
  const jogos = await jogosDoDiaResumo(getDb(), hoje, fuso)
  const aoVivo = jogos.some((j) => estadoDoCiclo(j, false, ruleset.fire_live.quarto) === 'Q1')
  redirect(aoVivo ? '/fire-live' : '/')
}
```

- [ ] **Step 3:** `manifest.ts` → `start_url: '/abrir'`; o teste do PWA acompanha.
- [ ] **Step 4:** `entrar/acoes.ts` → o destino PADRÃO passa a ser `/abrir`. O `destino`
      explícito continua mandando.
- [ ] **Step 5: verificar** — `npx vitest run src/app/__tests__/telas-abrir.test.ts src/app/__tests__/pwa.test.ts` → verde.

---

# Fase 6 · O botão na Lista

### Task 6.1: o slot e o link

**Files:** `src/components/navegacao/CabecalhoTela.tsx`, `src/app/(app)/page.tsx`

- [ ] **Step 1: o teste** em `telas-04-lista`: há um link para `/como-funciona` no
      cabeçalho, e ele NÃO está dentro da fileira de filtros.
- [ ] **Step 2:** `CabecalhoTela` ganha `aoLadoDoTitulo?: ReactNode`, renderizado junto do
      H1. Comentário: o slot `acoes` já é dos filtros na Lista, e o pedido foi ao lado do
      título.
- [ ] **Step 3:** a Lista passa um `<Link href="/como-funciona" className="link-texto">`
      com o rótulo **COMO FUNCIONA**, na tipografia de rótulo (Montserrat 12, caixa-alta),
      com o piso de 12 px do manual.
- [ ] **Step 4: verificar** — `npx vitest run src/app/__tests__/telas-04-lista.test.ts src/app/__tests__/navegacao.test.ts` → verde.

---

# Fase 7 · Fechamento

- [ ] `df -h /`; `npm run typecheck && npm run lint && npm run boundaries && npm test`.
- [ ] `CAPTURA_LARGURAS=1024,1440 scripts/captura-telas.sh 2400 telas-` → sem rolagem.
- [ ] Olhar a 1440: o botão no cabeçalho da Lista e a tela de metodologia com o aceite.
- [ ] `docs/04-design-system.md` NÃO muda (nenhum token novo). `docs/00-visao.md` ganha uma
      linha sobre a abertura, se ela descrever o ponto de entrada — conferir.
- [ ] Um commit só, com a spec e o plano. Sem push até o parceiro pedir.

---

## Auto-revisão do plano

**Cobertura da spec:** §4.1 → Fase 5. §4.2 → Fase 6. §4.3 → Fases 1, 2, 3 e 4. §6 → Fase 7.

**Placeholders:** nenhum. O teste de fonte da Task 4.3 descreve a varredura em vez de
mostrá-la pronta — é o único lugar, e a lista de exceções está fechada.

**Consistência:** `metodologiaAceitaEm` nasce na 1.1 e é lida na 4.1 (`aceitouMetodologia`) e
escrita na 3.1. `ConteudoDaMetodologia` nasce na 2.1 e é usado em 2.2 e 3.2. `/abrir` nasce
na 5.1 e é apontado na 5.3, na 5.4 e no destino padrão da ação de aceite (3.3).

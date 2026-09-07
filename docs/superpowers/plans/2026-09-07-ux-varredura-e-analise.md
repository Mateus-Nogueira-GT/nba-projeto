# Identidade 04 · Varredura e análise — plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implementar a spec da Identidade 04 — Lista Secreta e Fire Live enxutas (varredura), detalhe do apito, Resultados e Estatísticas com densidade de análise — sobre a identidade Broadcast que fica, com o card fechando o ciclo PRÉ → CONFERIDO.

**Architecture:** Nenhuma mudança no motor. A camada de entrega (`src/modules/entrega`) ganha leituras novas (agrupamento por jogo, ciclo do card, histórico de apitos por jogador, hierarquia do time, preferências por conta) e as telas (`src/app/(app)`) são reescritas sobre componentes novos do design system (`CabecalhoJogo`, `SeloContexto`, `FormaNoAtributo`, `HierarquiaDoTime`, `FolhaDeFiltros`). A **fase 0** é infraestrutura sem dependência visual; as **fases 1–7** são uma tela cada, e cada uma só vira código depois de o parceiro aprovar o artboard correspondente no canvas de mockups.

**Tech Stack:** Next.js App Router (server components, server actions), React 19, Drizzle + Postgres (Neon em produção, PGlite nos testes), Vitest, estilos inline lendo `semantico`/`componente`.

**Spec:** [`docs/superpowers/specs/2026-09-07-ux-varredura-e-analise-design.md`](../specs/2026-09-07-ux-varredura-e-analise-design.md) · **Mockups:** canvas "Identidade 04 · Varredura e Análise" (cinco artboards a 390 px) · **Inventário do front atual e pesquisa do Sofascore:** na spec, seções 2 e 3.

## Global Constraints

- Domínio em português, infraestrutura em inglês. Nomes de função, tipo, coluna e componente em português.
- **O motor não muda.** Nada em `src/modules/motor/**` é tocado. `tela-nao-chama-o-motor` e as regras de pureza continuam valendo (`npm run boundaries`).
- **Regras de escrita** (CLAUDE.md, `docs/04-design-system.md`): nunca "probabilidade" nem "provável" na UI; o % é "nota de confiança"; a nota da partida é "nota", nunca "nível"; linha sempre inteira com "+"; odd sempre faixa (a "odd média" só acompanhada da faixa). Os testes de tela já travam isso (`telas-demo.test.ts`) — toda tela nova ganha a mesma asserção.
- **Três canais do card preservados**: faixa metálica = nível do jogador; anel do avatar = nível do apito; borda lateral 3 px = grau de confiança. Cada cor com redundância escrita.
- **A nota da partida nunca aparece no card do apito** nem em qualquer tela de estratégia. Só em Estatísticas.
- **Tokens**: nenhum hex fora de `primitivo.ts`; componentes só leem `semantico`/`componente`; `tokens.css` é gerado (`npm run tokens`) e o teste de paridade TS↔CSS precisa passar.
- **Fire Live é só o 1º quarto.** Nada além disso.
- **Sem escudos de time.** Sigla em `fonteTitulo`.
- **Gate de mockup**: uma tarefa das fases 1–7 só começa depois de o parceiro aprovar o artboard dela. Aprovação parcial libera tarefa parcial. A fase 0 não tem gate.
- **Mudança por tela é verificada de três jeitos**: suíte da tela (`telas-demo.test.ts`, que semeia com `simularAte`), `npm run demo:conferir` contra PGlite (arnês do plano da temporada) e uma captura da tela a 390 px (Chrome headless, ver a seção "Captura") comparada ao artboard.
- Verificação final de cada tarefa: `npx vitest run <alvos>`; ao fim de cada fase: `npm run typecheck && npm run lint && npm run boundaries && npm test`.
- Um commit por tarefa, mensagem em português, terminando com `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`. Nunca commitar em `main`; a branch é `ux-sofascore` (worktree `nba-projeto-ux`).

## Captura de tela para conferir com o artboard

O repositório não tem Playwright; o Chrome do sistema serve. Com `CONFERENCIA=1`, `telas-demo.test.ts` grava o HTML real de cada tela em `.superpowers/conferencia/*.html`. Depois:

```bash
CONFERENCIA=1 npx vitest run src/app/__tests__/telas-demo.test.ts
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless=new --disable-gpu --hide-scrollbars \
  --window-size=390,1600 --virtual-time-budget=4000 --screenshot=/tmp/lista.png \
  "file://$PWD/.superpowers/conferencia/lista-secreta.html"
```

A captura é o que se compara com o artboard. Não é teste automatizado; é o passo humano que a 03 chamou de "conferência visual".

---

## Mapa de arquivos

| Arquivo | Ação | Fase |
| --- | --- | --- |
| `src/design-system/tokens/semantico.ts`, `componente.ts`, `css.ts` | tokens novos: texto em opacidades, `aoVivo` sólido/tinta, durações, turbo claro/escuro | 0 |
| `src/modules/entrega/lista-secreta.ts` | `fotoUrl` lida ao vivo; `agruparPorJogo`; `estadoDoCiclo` | 0, 1 |
| `src/modules/entrega/narrativa.ts` | prompt sem percentual, 240 chars; reaproveitamento por item | 0 |
| `src/modules/ingestao/demo/fotos.ts` | mapa completo dos 229, verificado nome a nome | 0 |
| `src/modules/dominio/db/schema/plataforma.ts` + migration | tabela `preferencias_usuario` | 0 |
| `src/modules/plataforma/preferencias.ts` | ler/gravar ordem e lente por conta | 0 |
| `src/modules/entrega/estatisticas/jogador.ts` | `apitosDoJogador`, nota média recente | 0 |
| `src/modules/entrega/estatisticas/time.ts` | `hierarquiaDoTime` com desfalque em prefixo | 0 |
| `src/modules/entrega/detalhe-apito.ts` | `construirPorque` estruturado; `ultimos10` | 0 |
| `src/modules/entrega/resultados.ts` | `recapDaNoite`, `taxaDaTemporada`, estado "aguardando dado oficial" | 0 |
| `src/app/(app)/fire-live/page.tsx` | monta `AtualizarAoVivo` | 0 |
| `src/design-system/componentes/CabecalhoJogo.tsx`, `SeloContexto.tsx`, `FormaNoAtributo.tsx`, `HierarquiaDoTime.tsx` | novos | 1–5 |
| `src/design-system/componentes/CardEntrada.tsx`, `Barrinhas.tsx`, `BarraAlvo.tsx` | ciclo, abas de atributo, marcos, "apitou aqui", barrinha nova | 1, 2, 4 |
| `src/components/navegacao/CabecalhoTela.tsx`, `FolhaDeFiltros.tsx`, `FaixaDemonstracao.tsx` | seletor, lentes, botão FILTRAR, selo de contexto, faixa definitiva | 1 |
| `src/app/(app)/page.tsx` | Lista por jogo | 1 |
| `src/app/(app)/fire-live/page.tsx` | por jogo, estados, carimbo | 2 |
| `src/app/(app)/apito/[jogadorId]/page.tsx` | esqueleto de análise | 3 |
| `src/app/(app)/resultados/[data]/page.tsx` (novo) e `resultados/page.tsx` | recap da noite; redireciona para hoje | 4 |
| `src/app/(app)/estatisticas/**` | índice, jogador, time, jogo | 5 |
| `src/app/(admin)/admin/galeria/page.tsx` | componentes novos na galeria | 1–5 |
| `src/app/__tests__/telas-demo.test.ts` | asserções das telas novas | 1–5 |
| `scripts/demo-conferir.ts` | itens novos | 6 |
| `docs/04-design-system.md` | seção "Identidade 04" | 6 |

---

# Fase 0 · Infraestrutura sem dependência visual

Pode começar hoje. Nada aqui muda o que o assinante vê, exceto fotos e narrativas — que só melhoram.

### Task 0.1: A foto é lida ao vivo, não congelada no snapshot

**Files:**
- Modify: `src/modules/entrega/lista-secreta.ts` (`enriquecer`, `lerFeed`)
- Modify: `src/modules/entrega/fire-live/leitura.ts` (`lerFeedFireLive`, se também congela)
- Test: `src/modules/entrega/__tests__/lista-secreta.test.ts`

**Interfaces:**
- Produces: `lerFeed(db, dataReferencia)` devolve itens com `fotoUrl` **atual** de `jogadores.foto_url`, independentemente do que o snapshot gravou. `ItemFeed.fotoUrl` continua no tipo (o snapshot pode seguir gravando-a; a leitura a sobrescreve).

- [ ] **Step 1: Teste que falha** — em `lista-secreta.test.ts`, semeie um feed com `publicarListaSecreta`, depois `update(jogadores).set({ fotoUrl: 'https://cdn.nba.com/x.png' })` para um jogador apitado, depois `lerFeed` → `expect(item.fotoUrl).toBe('https://cdn.nba.com/x.png')`. Hoje falha (vem `null`, o valor congelado).
- [ ] **Step 2: Implementar** — em `lerFeed`, depois de ler o snapshot, uma consulta `select id, fotoUrl from jogadores where id in (ids dos itens)` e um `map` que sobrescreve `fotoUrl`. É uma query a mais por leitura, sobre ≤ 150 ids indexados por PK — custo de milissegundos na mesma região (ADR-0008). Fazer o mesmo em `lerFeedFireLive`.
- [ ] **Step 3: Rodar** `npx vitest run src/modules/entrega/__tests__/lista-secreta.test.ts src/modules/entrega/__tests__/fire-live.test.ts` → verde.
- [ ] **Step 4: Confirmar o efeito no arnês** — `demo:conferir` em PGlite após `demo:fotos`: o item "fotos nos cards" passa a contar as fotos dos jogadores apitados sem republicar.
- [ ] **Step 5: Commit** — `Foto do jogador lida ao vivo: apresentação não fica congelada no snapshot`.

### Task 0.2: Narrativa — o prompt para de induzir número inventado, e a republicação reaproveita

**Files:**
- Modify: `src/modules/entrega/narrativa.ts`
- Modify: `src/modules/ingestao/llm/regras-do-texto.ts` (se o texto do sistema mora lá)
- Test: `src/modules/entrega/__tests__/narrativa.test.ts`, `narrativa-publicacao.test.ts`

**Interfaces:**
- Produces: `promptDeNarrativa(item)` cujo sistema diz explicitamente *não cite o percentual de confiança — ele já está no card* e pede **até 240 caracteres** (o validador continua em 280); `gerarNarrativas(...)` (ou o nome real) recebe o snapshot anterior e **reaproveita** a narrativa quando `(jogadorId, atributo, linha)` é idêntico e o texto anterior existe, chamando a LLM só para itens novos.

- [ ] **Step 1: Testes que falham** — (a) o sistema do prompt contém a frase sobre não citar o percentual e "240"; (b) com uma porta fake que conta chamadas, publicar → cotar odds → republicar gera N chamadas na primeira e **0** na segunda quando as linhas não mudaram; (c) um item novo na republicação gera exatamente 1 chamada.
- [ ] **Step 2: Implementar** — no sistema: `Não cite o percentual de confiança nem nenhuma porcentagem: ele já aparece no card.` e `no máximo 240 caracteres`. No fluxo de publicação: antes de gerar, indexar `snapshotAnterior.itens` por `${jogadorId}|${atributo}|${linha}`; para cada item novo, se houver narrativa anterior, copiá-la; gerar só o resto. A gravação em lotes de 10 continua.
- [ ] **Step 3: Rodar** as duas suítes → verde. Rodar também `src/modules/ingestao/__tests__/fiacao-llm.test.ts`.
- [ ] **Step 4: Medir de verdade (opcional, custa centavos)** — o script `scratchpad/llm-exp.ts` da sessão de 07/09 chama a OpenRouter para 6 itens reais e imprime o veredito do validador. Antes: 1 de 6 ok. Depois deve ficar ≥ 4 de 6. Cole no PR.
- [ ] **Step 5: Commit** — `Narrativa: o prompt não induz percentual inventado; republicação reaproveita texto de item igual`.

### Task 0.3: Curadoria dos rostos — os 229 da lista do CJ

**Files:**
- Modify: `src/modules/ingestao/demo/fotos.ts` (`MAPA_FOTOS`)
- Test: `src/modules/ingestao/__tests__/demo-fotos.test.ts`

**Interfaces:**
- Produces: `MAPA_FOTOS` com uma entrada por nome da lista (grafia **exata** do CJ, inclusive "Fontenchhio", "Wembayama", "Jasquez Jr", "Donovan Mitchel", "Brendon Miller") → `personId` da NBA.

- [ ] **Step 1: Levantar os ids** — a fonte é a API pública `https://stats.nba.com/stats/commonallplayers?LeagueID=00&Season=2025-26&IsOnlyCurrentSeason=1` (ou o adapter `balldontlie` já existente no repositório, que devolve `id` por jogador). Para cada nome da lista do CJ, casar por sobrenome + primeiro nome com tolerância a grafia (a lista escreve "Jokic" para Nikola Jokić, "Shai" para Shai Gilgeous-Alexander). **Toda ambiguidade vira `null` explícito no mapa com comentário**, nunca palpite: dois "Wiggins" (Andrew, Aaron) já se sabe que existem.
- [ ] **Step 2: Verificar cada id contra o CDN e contra o nome** — `urlDaFoto(id)` responde 200 **e** o `personId` bate com o nome oficial devolvido pela API. Um script descartável em scratchpad; o resultado é a tabela no código, com comentário `// verificado 08/09: <nome oficial>` em cada linha.
- [ ] **Step 3: Teste** — `demo-fotos.test.ts` ganha: todo nome da lista do CJ (`lerListaDeNiveis`) tem entrada no mapa (id ou `null` justificado); nenhum `personId` se repete; após `aplicarFotos` com verificador fake, ≥ 90% dos jogadores têm `foto_url`.
- [ ] **Step 4: Rodar** `npx vitest run src/modules/ingestao/__tests__/demo-fotos.test.ts` → verde.
- [ ] **Step 5: Commit** — `Fotos: mapa completo dos 229 da lista do CJ, cada id verificado contra o CDN e o nome`.

### Task 0.4: Preferências por conta — ordem da Lista e lente

**Files:**
- Modify: `src/modules/dominio/db/schema/plataforma.ts`
- Create: migration via `npm run db:generate` (Drizzle) + `scripts/gerar-down.mjs`
- Create: `src/modules/plataforma/preferencias.ts`
- Test: `src/modules/plataforma/__tests__/preferencias.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export type OrdemLista = 'POR_JOGO' | 'POR_NIVEL'
  export type Lente = 'ULT5' | 'MEDIA_LINHA' | 'ODDS' | 'HIERARQUIA'
  export type PreferenciasUsuario = { ordemLista: OrdemLista; lente: Lente }
  export const PREFERENCIAS_PADRAO: PreferenciasUsuario = { ordemLista: 'POR_JOGO', lente: 'ULT5' }
  export async function preferenciasDoUsuario(db: Db, usuarioId: string): Promise<PreferenciasUsuario>
  export async function gravarPreferencias(db: Db, usuarioId: string, parcial: Partial<PreferenciasUsuario>): Promise<void>
  ```
  Tabela `preferencias_usuario (usuario_id PK/FK cascade, ordem_lista text, lente text, atualizado_em)`. Uma linha por usuário; ausência = padrão.

- [ ] **Step 1: Teste que falha** — sem linha, `preferenciasDoUsuario` devolve `PREFERENCIAS_PADRAO`; após `gravarPreferencias({ ordemLista: 'POR_NIVEL' })`, devolve `POR_NIVEL` e mantém `lente: 'ULT5'`; apagar o usuário apaga a linha (cascade).
- [ ] **Step 2: Implementar** schema + migration + módulo. Seguir `src/modules/plataforma/jogadores-ocultos.ts` como modelo de estilo e de teste.
- [ ] **Step 3: Rodar** o teste novo e `src/modules/dominio/__tests__/persistencia.test.ts` (aplica todas as migrations em PGlite).
- [ ] **Step 4: Commit** — `Preferências por conta: ordem da Lista e lente do card`.

### Task 0.5: Leituras novas de entrega — por jogo, ciclo do card, recap, histórico do jogador, hierarquia do time, últimos 10, "por que entrou" estruturado

**Files:**
- Modify: `src/modules/entrega/lista-secreta.ts`
- Modify: `src/modules/entrega/resultados.ts`
- Modify: `src/modules/entrega/detalhe-apito.ts`
- Modify: `src/modules/entrega/estatisticas/jogador.ts`, `time.ts`
- Test: os `__tests__` correspondentes (todos semeiam com `simularAte`, 7–21 dias, como `temporada.test.ts` faz)

**Interfaces (o contrato das telas):**
```ts
// lista-secreta.ts
export type GrupoDeJogo = {
  jogoId: string; casaSigla: string; visitanteSigla: string; horarioUtc: Date
  status: 'AGENDADO' | 'AO_VIVO' | 'ENCERRADO'; placarCasa: number | null; placarVisitante: number | null
  itens: ItemFeed[]   // ordenados por nível do apito (turbo primeiro) e grau
}
export function agruparPorJogo(itens: ItemFeed[], jogos: readonly JogoDoDia[]): GrupoDeJogo[]  // ordem: horário
export type EstadoDoCiclo = 'PRE' | 'Q1' | 'FIM_Q1' | 'FT' | 'CONFERIDO' | 'AGUARDANDO_OFICIAL'
export function estadoDoCiclo(jogo: { status: string; quartoAtual: number | null }, temBox: boolean): EstadoDoCiclo

// resultados.ts
export type RecapDaNoite = {
  dataReferencia: string; apitos: number; bateram: number; taxa: number | null
  apitoDaNoite: JogadorConferido | null          // maior (valor − linhaMaisBaixa) entre os que bateram; null se ninguém
  porJogo: { jogo: GrupoDeJogoEncerrado; cards: JogadorConferido[] }[]
}
export async function recapDaNoite(db: Db, dataReferencia: string): Promise<RecapDaNoite>
export async function taxaDaTemporada(db: Db, ate: string, dias: number): Promise<{ conferidos: number; acertos: number; rodadas: number }>
// JogadorConferido ganha `fez: number | null` (= valor) e `bateuLinhaMaisBaixa: boolean | null` (null = DNP/aguardando)

// detalhe-apito.ts
export type Fator = { chave: 'NIVEL' | 'OSCILACAO' | 'OPD' | 'MODO_FIRE' | 'TURBO' | 'NIVEL_APITO'; titulo: string; texto: string }
// construirPorque passa a devolver Fator[] em ordem fixa; porQueEntrou: string[] continua existindo como texto (map de Fator.texto)
// blocos passa a ter até 10 jogos (era 5): parâmetro `quantidade` com padrão 10

// estatisticas/jogador.ts
export type ApitoDoJogador = { dataReferencia: string; adversarioSigla: string; emCasa: boolean; atributo: Atributo; linhaMaisBaixa: number; fez: number | null; bateu: boolean | null }
export async function apitosDoJogador(db: Db, jogadorId: string, limite: number): Promise<ApitoDoJogador[]>
// telaDoJogador ganha `notaMediaRecente: number | null` (média das últimas 5 notas) e `timeNaListaDoCj: { sigla: string } | null`

// estatisticas/time.ts
export type LinhaHierarquia = { posicao: number; jogadorId: string; nome: string; nivel: Nivel; fora: boolean }
export async function hierarquiaDoTime(db: Db, timeId: string, atributo: Atributo, jogoId: string | null): Promise<LinhaHierarquia[]>
// `fora` = lesoes_escalacao FORA no jogo dado; a tela marca o PREFIXO em destaque
```

- [ ] **Step 1: Testes que falham**, um `describe` por função, sobre um banco `simularAte` de 7 dias:
  - `agruparPorJogo`: um grupo por jogo do dia, em ordem de horário; dentro, turbo antes de N3 antes de N2; nenhum item perdido (`soma dos itens == itens.length`).
  - `estadoDoCiclo`: tabela de casos (AGENDADO→PRE; AO_VIVO q1→Q1; AO_VIVO q2→FIM_Q1; ENCERRADO sem box→AGUARDANDO_OFICIAL; ENCERRADO com box→CONFERIDO).
  - `recapDaNoite(ontem)`: `apitos == conferidos`, `bateram == acertos` de `conferirRodadas`; `apitoDaNoite` bateu e tem a maior diferença; `porJogo` cobre todos os cards.
  - `taxaDaTemporada(hoje, 49)`: iguala a soma de `conferirRodadas(hoje, 49)`.
  - `construirPorque` devolve `Fator[]` com `NIVEL` primeiro; para um item OPD há um fator `OPD` cujo texto contém o nome do desfalcado; para OSCILACAO o texto contém os valores dos jogos abaixo; **nenhum texto contém `%`, "probabilidade" ou número de bônus do ruleset** (asserção explícita: regex `/\+\s?\d|bônus|peso/i` não casa).
  - `apitosDoJogador`: para um jogador apitado em 3 dias, devolve 3 linhas, ordem decrescente de data, `bateu` coerente com `fez >= linhaMaisBaixa`.
  - `hierarquiaDoTime`: ordem por `posicao`; com uma `lesoes_escalacao` FORA no nº 1, `fora === true` só nele.
- [ ] **Step 2: Implementar** cada função. `taxaDaTemporada` é uma consulta agregada em SQL (não 49 chamadas a `conferirRodadas`): `apitos join jogos join estatisticas_jogo`, `count` e `count filter (valor >= linha_minima)`, agrupado nada — um número. `recapDaNoite` reutiliza `conferirRodadas(db, dia+1, 1)` e agrupa por `jogoId`.
- [ ] **Step 3: Rodar** as suítes de entrega → verde. `npm run boundaries` → sem violação.
- [ ] **Step 4: Commit** — `Entrega: leituras da Identidade 04 — por jogo, ciclo do card, recap, histórico do jogador, hierarquia, fatores`.

### Task 0.6: Tokens da 04

**Files:**
- Modify: `src/design-system/tokens/primitivo.ts` (só se um valor novo for necessário: o azul do turbo claro/escuro; as opacidades são `rgba` derivadas de `tinta50`)
- Modify: `src/design-system/tokens/semantico.ts`, `componente.ts`, `css.ts`
- Regenerate: `npm run tokens`
- Test: `src/design-system/__tests__/tokens.test.ts`

**Interfaces:**
```ts
// semantico
texto100 = tinta50; texto70 = 'rgba(245,248,252,.7)'; texto55 = ...55; texto40 = ...40
aoVivoSolido = vermelho400; aoVivoTinta = 'rgba(255,107,107,.14)'; aoVivoBorda = 'rgba(255,107,107,.45)'
turboClaro / turboEscuro (par do azul); turboTinta = azulVeuTurbo já existe
duracaoEstado = '200ms'; duracaoEntrada = '400ms'
// componente
cabecalhoJogo = { fundoFrio: contextoFrio.cardGradiente, fundoQuente: contextoQuente.cardGradiente, borda... }
seloContexto = { preLive: { fundo: acento, texto: textoSobreCor }, aoVivo: { fundo: vivoSelo, texto: textoSobreCor } }
statusCiclo = { largura: '52px' }
```
- [ ] **Step 1: Testes** — em `tokens.test.ts`: `aoVivoTinta` sobre `superficieQuente1` com `aoVivoSolido` como texto passa AA 3:1 (gráfico); nenhum token novo colide com `apitoNivel1/2/3` nem com a rampa de confiança (o teste de colisão existente, estendido); paridade TS↔CSS.
- [ ] **Step 2: Implementar** e `npm run tokens`.
- [ ] **Step 3: Rodar** `npx vitest run src/design-system` → verde.
- [ ] **Step 4: Commit** — `Tokens da Identidade 04: texto em opacidades, ao vivo sólido/tinta, durações`.

### Task 0.7: O Fire Live se atualiza sozinho

**Files:**
- Modify: `src/app/(app)/fire-live/page.tsx`
- Move: `src/app/(app)/estatisticas/jogo/[id]/AtualizarAoVivo.tsx` → `src/components/AtualizarAoVivo.tsx` (import atualizado nos dois lugares)
- Test: `src/app/__tests__/telas-demo.test.ts` (Fire Live)

- [ ] **Step 1: Teste que falha** — o HTML do Fire Live com jogo em 1º Q contém o marcador do componente (um `data-atualiza-ao-vivo="30000"` no elemento que ele renderiza — hoje ele renderiza `null`; passe a renderizar um `<span hidden data-atualiza-ao-vivo=…>`), e **não** contém quando nenhum jogo está `AO_VIVO`.
- [ ] **Step 2: Implementar** — `page.tsx` monta `<AtualizarAoVivo />` quando `placares.length > 0`. O `next/navigation` já é mockado na suíte.
- [ ] **Step 3: Rodar** a suíte → verde. **Step 4: Commit** — `Fire Live se atualiza a cada 30 s enquanto há jogo no 1º quarto`.

**Fim da fase 0:** `npm run typecheck && npm run lint && npm run boundaries && npm test`. Carga em PGlite (`simularAte` 21 dias) + `demo:conferir` no arnês: tudo ✓ menos o que depende de rede.

---

# Fase 1 · Lista Secreta — **gate: artboard "Lista Secreta · por jogo" aprovado**

### Task 1.1: Componentes novos da varredura — `CabecalhoJogo`, `SeloContexto`, `FolhaDeFiltros`, e o `CardEntrada` com ciclo e abas de atributo

**Files:**
- Create: `src/design-system/componentes/CabecalhoJogo.tsx`, `SeloContexto.tsx`
- Create: `src/components/navegacao/FolhaDeFiltros.tsx` (`'use client'`; `<details>`/`<dialog>` nativo, sem lib)
- Modify: `src/design-system/componentes/CardEntrada.tsx`, `index.ts`; `src/components/navegacao/CabecalhoTela.tsx`, `index.ts`
- Modify: `src/app/(admin)/admin/galeria/page.tsx`
- Test: `src/design-system/__tests__/card.test.ts`, novo `cabecalho-jogo.test.ts`, `src/app/__tests__/navegacao.test.ts`

**Interfaces:**
```tsx
<CabecalhoJogo casaSigla visitanteSigla horarioUtc fuso status placarCasa? placarVisitante? temperatura="frio"|"quente" />
// "MIA @ IND · 19:30" — visitante @ mandante; status AO_VIVO mostra ponto + "1º Q · AO VIVO"; quente mostra o placar do 1º Q em Anton 24
<SeloContexto contexto="preLive"|"aoVivo" />        // pílula preenchida: PRÉ-LIVE laranja / ■ AO VIVO vermelho
<CabecalhoTela ... selo={<SeloContexto .../>} seletor={{ opcoes: [...], ativa, hrefDe }} acoes={<FolhaDeFiltros .../>} lentes={{ opcoes, ativa, hrefDe }} />
// CardEntrada novo:
estado: EstadoDoCiclo                 // exibido como badge de largura fixa (statusCiclo.largura) no canto: PRÉ · 1º Q · FIM 1º Q · FT · —
fez?: number | null; bateu?: boolean | null   // quando estado === 'CONFERIDO': rodapé direito vira "✓ fez 27" / "✗ fez 19" / "não jogou · neutro"
atributos?: { atributo: Atributo; linha: number; ativo: boolean; href: string }[]   // abas PTS · REB · AST no rodapé, no lugar de um card por atributo
lente?: Lente                          // decide a zona 2: ULT5 (Barrinhas) · MEDIA_LINHA · ODDS · HIERARQUIA
```
- [ ] **Step 1: Testes** — `card.test.ts`: (a) `estado: 'CONFERIDO', fez: 27, bateu: true` renderiza "fez 27" e o ícone ✓ com `aria-label`; `bateu: null` renderiza "não jogou · neutro"; (b) `atributos` com 3 entradas renderiza 3 abas e a ativa tem `aria-current`; (c) `lente: 'MEDIA_LINHA'` **não** renderiza `Barrinhas`; (d) o texto nunca contém "probabilidade". `cabecalho-jogo.test.ts`: ordem `visitante @ casa`, horário no fuso, ponto ao vivo com texto redundante. `navegacao.test.ts`: `SeloContexto` com `aoVivo` usa `seloContexto.aoVivo.fundo` e o texto "AO VIVO".
- [ ] **Step 2: Implementar.** Valores exatos do artboard: cabeçalho do jogo com siglas em `fonteTitulo` 18 px, `@` em `texto40`, horário `fonteRotulo` 12 px `letterSpacing 1.5`; badge de status 52 px de largura, `fonteRotulo` 10 px, `aoVivoTinta`/`aoVivoBorda`; abas de atributo `fonteRotulo` 12 px 600, ativa com borda `apitoNivel3` e tinta.
- [ ] **Step 3: Galeria** — acrescentar uma seção "Identidade 04" com os estados do card (PRÉ, 1º Q, CONFERIDO ✓, CONFERIDO ✗, DNP), o cabeçalho de jogo frio e quente, o selo de contexto.
- [ ] **Step 4: Rodar** `npx vitest run src/design-system src/app/__tests__/navegacao.test.ts` → verde. **Step 5: Commit.**

### Task 1.2: A tela — por jogo, seletor, lentes, filtros no botão

**Files:**
- Modify: `src/app/(app)/page.tsx`, `src/app/(app)/lista-secreta-rotas.ts`
- Create: `src/app/(app)/preferencias/acoes.ts` (server actions `definirOrdem`, `definirLente` → `gravarPreferencias` + `revalidatePath('/')`)
- Test: `src/app/__tests__/telas-demo.test.ts`

- [ ] **Step 1: Testes que falham** — a Lista renderiza um `CabecalhoJogo` por jogo do dia, em ordem de horário (comparar a ordem das siglas no HTML com a dos jogos no banco); o mesmo jogador com dois atributos aparece **uma vez** (contar ocorrências do nome em `<h2>`/nome do card); a parede de filtros não está no HTML inicial (nenhum `<fieldset>` de filtro visível; o botão "FILTRAR" está); o seletor POR JOGO/POR NÍVEL existe e "por nível" reordena (com `?ordem=POR_NIVEL` o primeiro card é o de maior nível/grau); a lente `?lente=MEDIA_LINHA` remove as barrinhas de todos os cards; a preferência gravada por conta é respeitada quando a URL não diz nada.
- [ ] **Step 2: Implementar.** A ordem e a lente vêm da URL quando presentes, senão de `preferenciasDoUsuario`; o seletor grava por server action ao clicar. Filtros continuam na URL, montados por `comFiltro`; a folha os apresenta. Estado vazio antes da publicação: "Próxima lista às HH:MM" + link para Resultados de ontem (a hora da publicação vem de `ruleset.publicacao.lista_secreta.antecedencia_minutos` e do primeiro jogo).
- [ ] **Step 3: Rodar** `npx vitest run src/app/__tests__/telas-demo.test.ts` → verde. Captura a 390 px e comparação com o artboard; anotar divergências no PR.
- [ ] **Step 4: Commit** — `Lista Secreta por jogo: cabeçalho de jogo como fronteira, filtros no botão, lentes, um card por jogador`.

---

# Fase 2 · Fire Live — **gate: artboard "Fire Live · no 1º Q" aprovado**

### Task 2.1: `BarraAlvo` com dois marcos e "apitou aqui"; `CardEntrada` quente com status de largura fixa

**Files:** `src/design-system/componentes/BarraAlvo.tsx`, `CardEntrada.tsx`; testes `barra-alvo.test.ts`, `card.test.ts`; galeria.

**Interfaces:** `BarraAlvo` ganha `marcos?: { valor: number; rotulo: string; cor?: string }[]` e `apitouEm?: { valor: number; rotulo: string } | null`. O marco do modo fire (75% da média) vem **do item** (`alvoFire` calculado na entrega a partir de `ruleset.fire_live.modo_fire.percentual_media × mediaTemporada`) — o componente não sabe de ruleset.

- [ ] **Step 1: Testes** — marcos renderizam com `left` proporcional e rótulo escrito; `apitouEm` renderiza o ponto com `aria-label="apitou aqui · 6 pts"`; sem `alvo` nunca preenche.
- [ ] **Step 2: Implementar.** **Step 3: Rodar.** **Step 4: Commit.**

### Task 2.2: A tela — por jogo com placar do 1º Q, três estados, carimbo

**Files:** `src/app/(app)/fire-live/page.tsx`; `src/modules/entrega/fire-live/leitura.ts` (agrupamento e `alvoFire`); testes.

- [ ] **Step 1: Testes que falham** — um `CabecalhoJogo` quente por jogo em 1º Q, com o placar; os chips NO 1º Q AGORA · AGUARDANDO · 1º Q ENCERRADO; jogos agendados aparecem como cabeçalho mudo com contagem de alvos; o carimbo "atualizado há" existe; apito de jogo com 1º Q encerrado continua na tela, com status FIM 1º Q; texto "o apito chega no push" aparece uma vez.
- [ ] **Step 2: Implementar.** **Step 3: Rodar + captura.** **Step 4: Commit.**

---

# Fase 3 · Detalhe do apito — **gate: artboard "Detalhe do apito" aprovado**

### Task 3.1: `FormaNoAtributo` e a página de análise

**Files:** `src/design-system/componentes/FormaNoAtributo.tsx` (novo); `src/app/(app)/apito/[jogadorId]/page.tsx`; `detalhe-apito.ts` (já estruturado na 0.5); testes `forma-no-atributo.test.ts`, `detalhe-apito.test.ts`, `telas-demo.test.ts`.

**Interfaces:** `<FormaNoAtributo jogos={{ valor, bateu, adversarioSigla }[]} linha={n} />` — até 10 barras verticais com o valor, régua tracejada na linha com rótulo "LINHA n", cor pelo par das barrinhas, `role="img"` com `aria-label` "bateu X de Y".

- [ ] **Step 1: Testes** — o componente: 10 barras, régua com "LINHA 4", `aria-label` correto, nenhuma barra com altura negativa (valor 0 → 3 px mínimo); a página: ordem fixa das seções (`FORMA NO ATRIBUTO` antes de `COMPARAÇÃO` antes de `POR QUE ENTROU` antes de `LINHAS` antes de `O JOGO`), fatores renderizados com título e texto, tabela de casas em texto sem `<img>` nem link externo, disclaimer do ADR-0004, rodapé "nota de confiança".
- [ ] **Step 2: Implementar** conforme o artboard (hero com pílula do grau e rótulo do grau; "fato gerador" = narrativa; três caixas: MÉDIA · LINHA · MIN). No Fire Live, a seção do 1º Q entra no topo.
- [ ] **Step 3: Rodar + captura.** **Step 4: Commit.**

---

# Fase 4 · Resultados — **gate: artboard "Resultados · recap da noite" aprovado**

### Task 4.1: `/resultados/[data]`, recap, apito da noite, contador, card conferido

**Files:** `src/app/(app)/resultados/[data]/page.tsx` (novo), `resultados/page.tsx` (redireciona para `/resultados/<hoje>`), `Barrinhas.tsx` (prop `destacarUltima`), testes.

- [ ] **Step 1: Testes que falham** — `/resultados` redireciona; `/resultados/2026-09-06` renderiza o cabeçalho da noite (N apitos, N bateram, taxa), o contador da temporada (`taxaDaTemporada`), o apito da noite, um cabeçalho por jogo com placar e quartos, cards no estado CONFERIDO com "fez N", DNP como "não jogou · neutro", a barrinha nova destacada; `?data` inválida → hoje; dia sem lista → estado vazio "sem lista publicada neste dia". **Regra de escrita nova, testada**: a taxa da temporada nunca fica no mesmo elemento que um % de confiança, e o rótulo é "bateram" / "taxa da noite" / "temporada", nunca "acerto do apito X%".
- [ ] **Step 2: Implementar.** Os greens do Fire Live seguem como bloco próprio. **Step 3: Rodar + captura.** **Step 4: Commit.**

---

# Fase 5 · Estatísticas — **gate: artboard "Estatísticas · jogador" aprovado** (índice, time e jogo seguem a gramática dele)

### Task 5.1: Jogador — quatro números, nota recente, histórico de apitos, duas visões de time

**Files:** `src/app/(app)/estatisticas/jogador/[id]/page.tsx`; `estatisticas/jogador.ts` (já na 0.5); testes.
- [ ] Testes: quatro números (PTS, REB, AST, NOTA · ÚLT. 5) com a nota em `NotaPartida`; seção "Apitos da estratégia" com ✓/✗ e contagem "X de Y bateu"; rótulos "TIME ATUAL" e "NA LISTA DO CJ" presentes e distintos quando os times diferem (semeie um caso: Giannis MIA na lista, time real outro); tabela jogo a jogo com coluna NOTA; nunca "nível" para a nota. Implementar; captura; commit.

### Task 5.2: Time — hierarquia do CJ por atributo com desfalque em prefixo

**Files:** `src/design-system/componentes/HierarquiaDoTime.tsx` (novo); `estatisticas/time/[id]/page.tsx`; testes.
- [ ] Testes: lista ordenada por posição, o prefixo desfalcado em destaque (borda + rótulo "FORA"), seletor de atributo PTS/REB/AST, rótulo "lista do CJ" na seção e "time atual" no elenco. Implementar; captura; commit.

### Task 5.3: Índice e jogo — classificação como tabela, jogos do dia como lista, 1º Q em destaque

**Files:** `estatisticas/page.tsx`, `estatisticas/jogo/[id]/page.tsx`; testes.
- [ ] Testes: classificação é `<table>` com posição, sigla, V–D, %, sequência e últimos 5 como pontinhos (com `aria-label`); trilho de playoff/play-in marcado por linha (posições 1–6 e 7–10 com rótulo escrito); jogos do dia com status; na tela de partida, a célula do 1º Q tem destaque e rótulo "1º Q · o que o Fire Live observa". Implementar; captura; commit.

---

# Fase 6 · Fechamento

### Task 6.1: `demo:conferir`, documentação, congelamento

**Files:** `scripts/demo-conferir.ts`, `docs/04-design-system.md`, `docs/runbooks/deploy.md`, a spec (status).
- [ ] `demo:conferir` ganha: "Lista agrupada por jogo (N cabeçalhos = N jogos)", "um card por jogador", "Resultados: recap com apito da noite", "taxa da temporada calculada", "perfil do jogador com histórico de apitos", "fotos ≥ 90% dos apitados".
- [ ] `docs/04-design-system.md` ganha a seção "Identidade 04 · Varredura e análise": tokens novos, componentes novos, os estados do card, a regra de escrita da taxa vs confiança, e a **política de congelamento**: anatomia do card e posição das abas não mudam durante a temporada; mudança só com feature junto.
- [ ] Spec: `**Status:** implementada em <data>`.
- [ ] Verificação final completa + carga real (`demo:temporada` na branch, `demo:fotos`, `demo:conferir` no Neon) + capturas das cinco telas ao lado dos artboards no PR.
- [ ] Commit e PR para `main` (depois do merge do PR #12).

---

## Auto-revisão

**Cobertura da spec.** 3.1–3.8 princípios → constraints globais e Task 0.7 (refresh). 4.1 → Tasks 0.5, 1.1, 1.2. 4.2 → 0.7, 2.1, 2.2. 4.3 → 0.5 (fatores, últimos 10), 3.1. 4.4 → 0.5 (recap, taxa), 4.1. 4.5 → 0.5 (histórico, hierarquia), 5.1–5.3. 5.1 ciclo → 0.5 (`estadoDoCiclo`), 1.1, 4.1. 5.2 nota → 5.1, constraint. 5.3 imagem → 0.1, 0.3, constraint dos escudos. 5.4 acabamento → 0.6, 1.1. 5.5 narrativa → 0.2. 7 mockups → gates por fase. 8 fora de escopo → nenhuma tarefa. 9 ordem → fases.

**Consistência de nomes.** `GrupoDeJogo`/`agruparPorJogo` (0.5 → 1.2, 2.2); `EstadoDoCiclo`/`estadoDoCiclo` (0.5 → 1.1, 4.1); `Fator`/`construirPorque` (0.5 → 3.1); `apitosDoJogador`/`ApitoDoJogador` (0.5 → 5.1); `hierarquiaDoTime`/`LinhaHierarquia` (0.5 → 5.2); `PreferenciasUsuario`/`OrdemLista`/`Lente` (0.4 → 1.1, 1.2); `recapDaNoite`/`taxaDaTemporada` (0.5 → 4.1); `SeloContexto`/`CabecalhoJogo` (1.1 → 2.2, 4.1).

**Riscos.** (1) `taxaDaTemporada` por render: é uma consulta agregada; se pesar, cache de 5 min no servidor — decidir na 4.1 medindo. (2) A curadoria dos 229 rostos (0.3) é a tarefa mais lenta e a de maior risco de erro humano; o teste exige `null` justificado em vez de palpite. (3) O agrupamento por jogo depende de `ItemFeed.jogoId` — existe. (4) A regra de escrita "taxa vs confiança" é nova e precisa estar no `docs/04` antes da 4.1 virar código.

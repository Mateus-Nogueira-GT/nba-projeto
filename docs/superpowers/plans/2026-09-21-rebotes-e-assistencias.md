# Rebotes e assistências — plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** O caminho que importa a lista do CJ passa a entender três atributos em vez de um,
os dados de rebotes e assistências entram no banco, e nenhum apito com número inventado
chega em assinante.

**Architecture:** Não nasce arquivo novo nem tabela nova. Alarga-se um caminho que já
existe — `parser.ts` → `importar.ts` → tabela `niveis` — que hoje é mono-atributo por
construção. As duas pontas já estão prontas: `niveis.atributo` é enum com os três valores e
o motor lê `jogador.classificacoes[atributo]`. Zero migração.

**Tech Stack:** TypeScript, Vitest, Drizzle ORM sobre Postgres (PGlite nos testes), YAML do
ruleset validado por Zod.

**Spec:** `docs/superpowers/specs/2026-09-21-rebotes-e-assistencias-design.md`

## Global Constraints

- **UM commit, no fim de tudo.** Nunca commits incrementais. É pedido explícito do parceiro,
  repetido duas vezes. Nenhuma tarefa abaixo commita; a Tarefa 9 commita o conjunto.
- **Nenhuma regra de estratégia no código.** Todo número vai em `config/ruleset.v1.yaml`
  (`CLAUDE.md` §1).
- **Nenhuma regra inventada.** O que o documento não define vira pergunta em
  `docs/05-perguntas-abertas.md`, não código (`CLAUDE.md` §3).
- **Nenhuma migração nesta passada.** A chave `niveis_unico` continua
  `(niveisVersaoId, jogadorId, atributo)`.
- **O motor continua puro.** Nada em `src/modules/motor/**` ganha I/O.
- **Teste de fonte tira comentário antes de `includes`.** Um `includes` cru casa dentro de
  comentário e o teste passa com a linha comentada.
- **Nunca rodar `prettier --write` em diretório inteiro** — reformata arquivo que não é seu e
  polui o diff. Só em arquivo nomeado.
- **Disco:** `df -h /` antes de rodar a suíte. Abaixo de ~3 GB livres, limpar os caches
  aprovados antes. A suíte come ~6 GB.

---

### Task 1: O documento novo entra no repositório

O arquivo em `data/fontes/` é uma versão anterior, sem rebotes e sem assistências. **Este
passo é humano:** o parceiro tem o arquivo; o repositório não.

**Files:**
- Modify: `data/fontes/introducao-ia-nba.md`

**Interfaces:**
- Consumes: nada
- Produces: o arquivo de fonte com as três seções, que as Tarefas 3, 4 e 5 leem

- [ ] **Step 1: Pedir o arquivo ao parceiro**

O documento é o `Introdução I.A da NBA (2).md`. Salvar por cima de
`data/fontes/introducao-ia-nba.md`, preservando o nome.

- [ ] **Step 2: Conferir que as três seções chegaram**

```bash
grep -c "Lista de Níveis" data/fontes/introducao-ia-nba.md   # esperado: 2
grep -n "^\*\*Assistências\*\*" data/fontes/introducao-ia-nba.md  # esperado: 1 linha
grep -n "Atualização lista secreta de assistências" data/fontes/introducao-ia-nba.md
```

O terceiro comando deve achar a linha. Ela é a seção **vazia** do documento — confirma que
é a versão nova, e é a pergunta 1 da Tarefa 8.

- [ ] **Step 3: Registrar as contagens reais, que as Tarefas 3 e 4 vão cravar**

```bash
npx vite-node -e '
import { readFileSync } from "node:fs"
const linhas = readFileSync("data/fontes/introducao-ia-nba.md","utf8").split("\n")
let sec = "—", n = {}
for (const l of linhas) {
  if (/Lista de Níveis\(Pontos\)/.test(l)) sec = "PONTOS"
  else if (/Lista de Níveis\(Rebotes\)/.test(l)) sec = "REBOTES"
  else if (/^\*\*Assistências\*\*/.test(l)) sec = "ASSISTENCIAS"
  else if (/^\*\*Lista secreta\*\*/.test(l)) break
  else if (/^\s*\*{0,2}\s*\d+\s*\\?-/.test(l)) n[sec] = (n[sec] ?? 0) + 1
}
console.log(n)
'
```

Anotar a saída. Esses três números são os que as Tarefas 3 e 4 cravam nos testes. **Não
inventar:** se o comando falhar, corrigir o comando, não chutar o número.

---

### Task 2: O negrito deixa de virar time

Na seção de rebotes o jogador vem em negrito (`**1 \- Towns \- MVP**`). `nomeDoTime` rejeita
linha de jogador com `/^\s*\d+\s*\\?-/`, que não casa por causa do `**` na frente — cada
jogador viraria um time. É o defeito que torna tudo o mais invisível, então vem primeiro.

**Files:**
- Modify: `src/modules/ingestao/niveis/parser.ts` (função `nomeDoTime`)
- Test: `src/modules/ingestao/__tests__/ingestao.test.ts`

**Interfaces:**
- Consumes: `lerListaDeNiveis(conteudo: string): ResultadoParse`
- Produces: `nomeDoTime` que devolve `null` para jogador em negrito

- [ ] **Step 1: Escrever o teste que falha**

Acrescentar em `src/modules/ingestao/__tests__/ingestao.test.ts`, perto do
`describe('parser da lista real do CJ')`:

```ts
describe('parser · o negrito da seção de rebotes', () => {
  it('não confunde jogador em negrito com cabeçalho de time', () => {
    const conteudo = [
      '**Lista de Níveis(Rebotes)**',
      '',
      '**Knicks**',
      '',
      '**1 \\- Towns \\- MVP**',
      '**2 \\- Hart \\- All star**',
    ].join('\n')

    const r = lerListaDeNiveis(conteudo)

    expect(r.timesEncontrados).toEqual(['Knicks'])
    expect(r.jogadores.map((j) => j.nomeNaLista)).toEqual(['Towns', 'Hart'])
  })
})
```

- [ ] **Step 2: Rodar e ver falhar**

```bash
npx vitest run src/modules/ingestao/__tests__/ingestao.test.ts -t "negrito"
```

Esperado: FALHA. `timesEncontrados` virá com três entradas — `Knicks` e os dois jogadores —
e `jogadores` virá vazio.

- [ ] **Step 3: Corrigir `nomeDoTime`**

Substituir a função inteira em `src/modules/ingestao/niveis/parser.ts`:

```ts
/** Linha de cabeçalho de time: só spans em negrito, sem entrada numerada. */
function nomeDoTime(linha: string): string | null {
  const limpa = linha.trim()
  if (!limpa.startsWith('**')) return null

  // "**Dallas** **Mavericks**" são DOIS spans na mesma linha — juntar os dois,
  // senão o time inteiro (9 jogadores) some sem aviso.
  const spans = [...limpa.matchAll(/\*\*(.+?)\*\*/g)].map((m) => m[1]!.trim())
  if (spans.length === 0) return null

  const nome = spans.join(' ').replace(/\s+/g, ' ').trim()
  if (nome.length === 0) return null

  // A seção de REBOTES escreve o jogador em negrito ("**1 \- Towns \- MVP**").
  // O teste de "é entrada numerada?" tem que rodar DEPOIS de tirar o negrito;
  // antes dele, o `**` da frente faz o `^\d` falhar e cada jogador vira time.
  if (/^\s*\d+\s*\\?-/.test(nome)) return null

  return nome
}
```

- [ ] **Step 4: Rodar e ver passar**

```bash
npx vitest run src/modules/ingestao/__tests__/ingestao.test.ts -t "negrito"
```

Esperado: PASSA.

---

### Task 3: O parser aprende as três seções

**Files:**
- Modify: `src/modules/ingestao/niveis/parser.ts`
- Test: `src/modules/ingestao/__tests__/ingestao.test.ts`

**Interfaces:**
- Consumes: `Atributo` de `src/modules/motor/tipos.ts` (`'PONTOS' | 'REBOTES' | 'ASSISTENCIAS'`)
- Produces: `JogadorNaLista` com campo `atributo: Atributo`, consumido pelas Tarefas 5 e 6

- [ ] **Step 1: Escrever os dois testes que falham**

```ts
describe('parser · as três seções', () => {
  it('dá a cada jogador o atributo da sua seção e para na Lista secreta', () => {
    const conteudo = [
      '**Lista de Níveis(Pontos)**',
      '**Knicks**',
      '1 \\- Brunson \\- MVP',
      '',
      '**Lista de Níveis(Rebotes)**',
      '**Knicks**',
      '**1 \\- Towns \\- MVP**',
      '',
      '**Assistências**',
      '**Knicks**',
      '1 \\- Josh Hart \\- Suporte',
      '',
      '**Lista secreta**',
      '1 \\- nao deve ser lido \\- MVP',
    ].join('\n')

    const r = lerListaDeNiveis(conteudo)

    expect(r.jogadores.map((j) => [j.nomeNaLista, j.atributo])).toEqual([
      ['Brunson', 'PONTOS'],
      ['Towns', 'REBOTES'],
      ['Josh Hart', 'ASSISTENCIAS'],
    ])
  })

  it('ignora as faixas de média sem chamá-las de time nem de problema', () => {
    const conteudo = [
      '**Lista de Níveis(Rebotes)**',
      'Classificação de jogadores rebotes',
      'Mvp \\- média de  10 rebotes em diante',
      'Alls star \\- media de 7 a 9,8 rebotes',
      '**Classificação de jogadores rebotes**',
      '**Mvp \\- média de  10 rebotes em diante**',
      '**Knicks**',
      '**1 \\- Towns \\- MVP**',
    ].join('\n')

    const r = lerListaDeNiveis(conteudo)

    expect(r.timesEncontrados).toEqual(['Knicks'])
    expect(r.timesSemSigla).toEqual([])
    expect(r.problemas).toEqual([])
    expect(r.jogadores).toHaveLength(1)
  })
})
```

- [ ] **Step 2: Rodar e ver falhar**

```bash
npx vitest run src/modules/ingestao/__tests__/ingestao.test.ts -t "três seções"
```

Esperado: FALHA. O primeiro teste falha porque `atributo` não existe em `JogadorNaLista`; o
segundo, porque as faixas em negrito viram time sem sigla.

- [ ] **Step 3: Declarar o atributo no tipo**

No topo de `src/modules/ingestao/niveis/parser.ts`, trocar o import e o tipo:

```ts
import type { Atributo, Nivel } from '../../motor/tipos'
import { normalizarTexto, siglaDoTime } from './times'

export type JogadorNaLista = {
  nomeNaLista: string
  posicaoHierarquia: number
  nivel: Nivel
  atributo: Atributo
  timeNaLista: string
  timeSigla: string | null
  linhaNoArquivo: number
}
```

- [ ] **Step 4: Trocar o `INICIO` por reconhecimento de seção**

Substituir a constante `INICIO` (manter `FIM` como está):

```ts
/**
 * Os três cabeçalhos de seção do documento, já normalizados.
 * `normalizarTexto` tira acento, baixa a caixa e troca pontuação por espaço:
 * "**Lista de Níveis(Rebotes)**" vira "lista de niveis rebotes".
 */
const SECOES: ReadonlyArray<readonly [RegExp, Atributo]> = [
  [/^lista de niveis pontos$/, 'PONTOS'],
  [/^lista de niveis rebotes$/, 'REBOTES'],
  [/^assistencias$/, 'ASSISTENCIAS'],
]

function secaoDaLinha(normalizada: string): Atributo | null {
  for (const [regex, atributo] of SECOES) {
    if (regex.test(normalizada)) return atributo
  }
  return null
}

/**
 * Prosa que a seção de rebotes intercala com os dados: o título da
 * classificação e as faixas de média, cada um aparecendo em versão simples E
 * em negrito. Não são time nem jogador.
 *
 * A rede de segurança é `timesSemSigla`: se uma linha de prosa escapar desta
 * lista, ela vira "time sem sigla" e o teste do arquivo real falha. Nada some
 * em silêncio — é a mesma garantia que o parser já dá para linha ilegível.
 */
const DEFINICAO: readonly RegExp[] = [
  /^classificacao de jogadores/,
  /^(mvp|all star|alls star|suporte|randola)\b.*\b(media|em diante)\b/,
]

function ehLinhaDeDefinicao(normalizada: string): boolean {
  return DEFINICAO.some((r) => r.test(normalizada))
}
```

> **A Tarefa 2 já mexeu no laço, e isso foi ratificado.** Para que o teste dela passasse,
> ela teve de alargar a detecção de linha de jogador para aceitar o negrito
> (`/^\s*(?:\*\*)?\d+/`) e tirar os `**` antes de quebrar a linha em pedaços. **Não reverta
> nem duplique isso** — o laço que você vai editar já tem as duas coisas.

- [ ] **Step 5: Trocar o `dentro: boolean` pelo atributo corrente**

Em `lerListaDeNiveis`, trocar o cabeçalho do laço. O `timeAtual` **zera a cada seção**,
porque as três repetem os mesmos times:

```ts
  let atributoAtual: Atributo | null = null
  let timeAtual: string | null = null
  let siglaAtual: string | null = null

  for (const [indice, linhaBruta] of linhas.entries()) {
    const numero = indice + 1
    const linha = linhaBruta.trimEnd()
    const normalizada = normalizarTexto(linha)

    const secao = secaoDaLinha(normalizada)
    if (secao !== null) {
      atributoAtual = secao
      timeAtual = null
      siglaAtual = null
      continue
    }

    if (atributoAtual === null) continue
    if (FIM.test(linha.trim().toLowerCase())) break
    if (linha.trim().length === 0) continue
    if (ehLinhaDeDefinicao(normalizada)) continue
```

O resto do laço fica igual, com duas mudanças:

- o `motivo` do jogador órfão passa a ser `'jogador antes de qualquer cabeçalho de time'`
  (inalterado — o caso de "antes de seção" agora é filtrado pelo `atributoAtual === null`);
- o `jogadores.push` ganha o atributo:

```ts
    jogadores.push({
      nomeNaLista: nome,
      posicaoHierarquia: posicao,
      nivel,
      atributo: atributoAtual,
      timeNaLista: timeAtual,
      timeSigla: siglaAtual,
      linhaNoArquivo: numero,
    })
```

- [ ] **Step 6: Rodar e ver passar**

```bash
npx vitest run src/modules/ingestao/__tests__/ingestao.test.ts -t "três seções"
npx tsc --noEmit
```

Esperado: os dois testes passam; o typecheck acusa `importar.ts` ainda sem o campo? Não —
`atributo` é campo novo em `JogadorNaLista`, que `importar.ts` só lê. O typecheck passa.

---

### Task 4: Os testes do arquivo real voltam a dizer a verdade

`ingestao.test.ts` crava hoje "30 times, 230 jogadores" lendo o arquivo real. Com o arquivo
novo esses números mudam, e o teste **vai falhar** — é a regressão esperada.

**Files:**
- Modify: `src/modules/ingestao/__tests__/ingestao.test.ts` (bloco `describe('parser da lista real do CJ')`)

**Interfaces:**
- Consumes: as contagens anotadas na Tarefa 1, Step 3
- Produces: nada

- [ ] **Step 1: Ver a falha esperada**

```bash
npx vitest run src/modules/ingestao/__tests__/ingestao.test.ts -t "lista real"
```

Esperado: FALHA em "lê os 30 times" e em "lê os 230 jogadores".

- [ ] **Step 2: Reescrever o bloco por seção**

Trocar os dois primeiros `it` do `describe('parser da lista real do CJ')`. Substituir
`PONTOS_REAIS`, `REBOTES_REAIS` e `ASSISTENCIAS_REAIS` pelos números anotados na Tarefa 1:

```ts
describe('parser da lista real do CJ', () => {
  const r = lerListaDeNiveis(conteudo)
  const porAtributo = (a: string) => r.jogadores.filter((j) => j.atributo === a)

  it('lê os 30 times em cada uma das três seções', () => {
    expect(new Set(r.timesEncontrados).size).toBe(30)
    expect(r.timesSemSigla).toEqual([])
    for (const atributo of ['PONTOS', 'REBOTES', 'ASSISTENCIAS']) {
      expect(new Set(porAtributo(atributo).map((j) => j.timeSigla)).size).toBe(30)
    }
  })

  it('lê os três blocos sem nenhum problema de leitura', () => {
    expect(porAtributo('PONTOS')).toHaveLength(PONTOS_REAIS)
    expect(porAtributo('REBOTES')).toHaveLength(REBOTES_REAIS)
    expect(porAtributo('ASSISTENCIAS')).toHaveLength(ASSISTENCIAS_REAIS)
    expect(r.problemas).toEqual([])
  })
```

Os outros `it` do bloco (Dallas em dois spans, os três separadores) continuam valendo, mas
passam a filtrar por `PONTOS`, porque os nomes que eles citam são da seção de pontos:

```ts
  it('pega o time escrito como DOIS spans em negrito na mesma linha', () => {
    expect(porAtributo('PONTOS').filter((j) => j.timeSigla === 'DAL')).toHaveLength(9)
  })
```

- [ ] **Step 3: Corrigir também as contagens da camada de import**

O mesmo arquivo crava 30/230 mais duas vezes, agora no relatório de
`importarListaDeNiveis` (hoje nas linhas 273–274):

```ts
    expect(rel.timesEncontrados).toBe(30)
    expect(rel.totalNaLista).toBe(230)
```

`timesEncontrados` no relatório conta **ocorrências de cabeçalho**, não times distintos —
com três seções passa a ser 90. E `totalNaLista` passa a ser a soma dos três. Trocar pelos
números da Tarefa 1:

```ts
    expect(rel.timesEncontrados).toBe(90)
    expect(rel.totalNaLista).toBe(PONTOS_REAIS + REBOTES_REAIS + ASSISTENCIAS_REAIS)
```

- [ ] **Step 4: Rodar e ver passar**

```bash
npx vitest run src/modules/ingestao/__tests__/ingestao.test.ts
```

Esperado: PASSA. Se `timesSemSigla` não vier vazio, **não relaxar o teste**: a sigla que
faltou é ou um time novo (entra no `MAPA` de `times.ts`) ou uma linha de prosa que escapou
do `DEFINICAO` da Tarefa 3. Os dois são bug, não ruído.

---

### Task 5: O importador grava o atributo que leu

**Files:**
- Modify: `src/modules/ingestao/niveis/importar.ts` (`importarListaDeNiveis` e `completarVersao`)
- Test: `src/modules/ingestao/__tests__/ingestao.test.ts`

**Interfaces:**
- Consumes: `JogadorNaLista.atributo` da Tarefa 3
- Produces: linhas em `niveis` com o atributo correto

- [ ] **Step 1: Escrever o teste de fonte que falha**

```ts
describe('importador · o atributo não é literal', () => {
  it('não grava PONTOS cravado em lugar nenhum', () => {
    const fonte = readFileSync('src/modules/ingestao/niveis/importar.ts', 'utf8')
    // Tirar comentários ANTES de procurar: um `includes` cru casa dentro de
    // comentário e o teste passaria com a linha ainda lá.
    const semComentarios = fonte
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/^\s*\/\/.*$/gm, '')

    expect(semComentarios).not.toContain("atributo: 'PONTOS'")
    expect(semComentarios).toContain('atributo: j.atributo')
  })
})
```

- [ ] **Step 2: Rodar e ver falhar**

```bash
npx vitest run src/modules/ingestao/__tests__/ingestao.test.ts -t "não é literal"
```

Esperado: FALHA — `atributo: 'PONTOS'` está presente duas vezes.

- [ ] **Step 3: Trocar nos dois lugares**

Em `importarListaDeNiveis` e em `completarVersao`, trocar `atributo: 'PONTOS',` por:

```ts
      atributo: j.atributo,
```

- [ ] **Step 4: Corrigir `jaGravados`, que hoje ignora o atributo**

Em `completarVersao`, `jaGravados` é um Set de `jogadorId` só. Com três atributos, o jogador
já gravado em PONTOS faria a entrada de REBOTES ser pulada como "já gravada". Trocar:

```ts
  const jaGravados = new Set(
    (await db.select().from(niveis).where(eq(niveis.niveisVersaoId, versaoId))).map(
      (n) => `${n.jogadorId}:${n.atributo}`,
    ),
  )
```

e, no laço, a guarda correspondente:

```ts
    if (jaGravados.has(`${jogadorId}:${j.atributo}`)) continue
```

- [ ] **Step 5: Rodar e ver passar**

```bash
npx vitest run src/modules/ingestao/__tests__/ingestao.test.ts
npx tsc --noEmit
```

Esperado: PASSA.

---

### Task 6: A repetição vira problema, não silêncio

O documento novo põe Klay Thompson em Dallas **e** Miami, e Mathurin em Pelicans **e**
Clippers — mesmo jogador, mesmo atributo, dois times. A chave única proíbe os dois, e o
`.onConflictDoNothing()` de hoje **descarta o segundo sem avisar**, ainda contando os dois
como casados. Por decisão do parceiro a chave **não** muda: o caso vira pergunta ao CJ.

**Files:**
- Modify: `src/modules/ingestao/niveis/importar.ts` (`importarListaDeNiveis`)
- Test: `src/modules/ingestao/__tests__/ingestao.test.ts`

**Interfaces:**
- Consumes: `ProblemaDeParse` de `parser.ts` (`{ linhaNoArquivo, conteudo, motivo }`)
- Produces: `importarListaDeNiveis` cujo `problemas` inclui as repetições e cujo `casados`
  conta só o que foi gravado

- [ ] **Step 1: Escrever o teste que falha**

Usar o banco de teste já montado no arquivo. Montar um conteúdo com o mesmo jogador em dois
times na mesma seção:

```ts
describe('importador · jogador repetido em dois times', () => {
  it('não grava nenhuma das duas e reporta o caso', async () => {
    const conteudo = [
      '**Lista de Níveis(Pontos)**',
      '**Dallas** **Mavericks**',
      '1 \\- Klay Thompson \\- Randola',
      '**Miami Heat**',
      '1 \\- Klay Thompson \\- Suporte',
    ].join('\n')

    const r = await importarListaDeNiveis(banco.db, conteudo, {
      provedor: PROVEDOR,
      origemArquivo: 'teste-repetido',
      importadoPor: 'teste',
    })

    expect(r.casados).toBe(0)
    expect(r.problemas.map((p) => p.motivo)).toContain(
      'mesmo jogador em dois times no mesmo atributo',
    )
  })
})
```

A versão é derivada de um hash do conteúdo, não passada: dois conteúdos diferentes geram
versões diferentes sozinhos.

- [ ] **Step 2: Rodar e ver falhar**

```bash
npx vitest run src/modules/ingestao/__tests__/ingestao.test.ts -t "repetido em dois times"
```

Esperado: FALHA. Hoje `casados` vem 2 e `problemas` vem vazio.

- [ ] **Step 3: Agrupar antes de gravar e tirar o `onConflictDoNothing`**

Em `importarListaDeNiveis`, substituir o trecho que monta `linhas` e grava. O agrupamento é
por `(jogadorId, atributo)`, e é a chave única da tabela que dita isso:

```ts
  // 4 · Só entra em `niveis` quem já tem jogador confirmado — a FK exige.
  const pendentes: string[] = []
  const candidatas = new Map<
    string,
    { linha: typeof niveis.$inferInsert; origem: JogadorNaLista }[]
  >()

  for (const j of analise.jogadores) {
    const jogadorId = mapeados.get(j.nomeNaLista) ?? null
    const timeId = j.timeSigla ? timesPorSigla.get(j.timeSigla) : undefined

    if (jogadorId === null || timeId === undefined) {
      pendentes.push(j.nomeNaLista)
      continue
    }

    const chave = `${jogadorId}:${j.atributo}`
    const grupo = candidatas.get(chave) ?? []
    grupo.push({
      linha: {
        niveisVersaoId: versaoNova!.id,
        jogadorId,
        timeId,
        atributo: j.atributo,
        nivel: j.nivel,
        posicaoHierarquia: j.posicaoHierarquia,
      },
      origem: j,
    })
    candidatas.set(chave, grupo)
  }

  // A chave única é (versão, jogador, atributo). Duas entradas na mesma chave
  // são o MESMO jogador em times diferentes — e o vínculo jogador↔time vem da
  // curadoria do CJ, nunca da nossa. Escolher uma seria inventar regra, então
  // nenhuma entra e o caso vai para o relatório.
  const linhas: (typeof niveis.$inferInsert)[] = []
  const problemas = [...analise.problemas]

  for (const grupo of candidatas.values()) {
    if (grupo.length === 1) {
      linhas.push(grupo[0]!.linha)
      continue
    }
    for (const { origem } of grupo) {
      problemas.push({
        linhaNoArquivo: origem.linhaNoArquivo,
        conteudo: `${origem.nomeNaLista} — ${origem.timeNaLista} (${origem.atributo})`,
        motivo: 'mesmo jogador em dois times no mesmo atributo',
      })
    }
  }

  if (linhas.length > 0) {
    await db.insert(niveis).values(linhas)
  }
```

E no `return`, trocar `problemas: analise.problemas` por `problemas`. O `casados: linhas.length`
agora conta o que foi de fato gravado.

O import de `JogadorNaLista` precisa entrar no topo do arquivo:

```ts
import { lerListaDeNiveis, type JogadorNaLista } from './parser'
```

- [ ] **Step 4: Rodar e ver passar**

```bash
npx vitest run src/modules/ingestao/__tests__/ingestao.test.ts
npx tsc --noEmit
```

Esperado: PASSA. Se algum teste antigo de import quebrar por causa do fim do
`onConflictDoNothing`, **ler o caso antes de mexer**: ele existia para engolir exatamente o
que agora queremos ver.

---

### Task 7: O ruleset e o interruptor

**Files:**
- Modify: `config/ruleset.v1.yaml`
- Test: `src/modules/motor/__tests__/atributos.test.ts`
- Modify: `src/modules/motor/__tests__/auditoria-documento.test.ts` (Step 5)

**Interfaces:**
- Consumes: nada
- Produces: `ruleset.niveis.atributos === ['PONTOS']`

- [ ] **Step 1: Escrever o teste do interruptor**

```ts
describe('o interruptor de atributo', () => {
  it('mantém rebotes e assistências desligados até o CJ mandar % e odds', () => {
    // `niveis.atributos` é o array que motor/index.ts e fire-live/avaliar.ts
    // iteram: ele é o liga-desliga. Com os níveis de rebotes no banco, religar
    // põe no ar apito com confiança e odd que NÓS inventamos.
    expect(ruleset.niveis.atributos).toEqual(['PONTOS'])
  })
})
```

- [ ] **Step 2: Rodar e ver falhar**

```bash
npx vitest run -t "interruptor de atributo"
```

Esperado: FALHA — hoje o array tem os três.

- [ ] **Step 3: Mexer no YAML**

Em `config/ruleset.v1.yaml`, três edições.

`niveis.atributos`:

```yaml
niveis:
  ordem: [MVP, ALL_STAR, SUPORTE, RANDOLA]
  # INTERRUPTOR. Este array é o que motor/index.ts e motor/fire-live/avaliar.ts
  # iteram. Rebotes e assistências JÁ TÊM dado real no banco (versão do CJ de
  # 21/09), mas as tabelas de confiança e de odds dos dois continuam
  # `origem: demonstracao` — números nossos, não dele. Religar aqui põe apito
  # com número inventado no celular de assinante pagante.
  # Religar quando o CJ mandar % e odds de rebotes e assistências.
  atributos: [PONTOS]
```

`fire_live.assistencias.media_minima`:

```yaml
  assistencias:
    operacao: soma
    valor: 1
    # MUDOU entre versões do documento: a anterior dizia >= 5, a de 21/09 diz
    # >= 4. Vale a nova.
    media_minima: 4 # só entra jogador com apg >= 4
```

`por_atributo.REBOTES.oscilacao.delta` — os quatro níveis passam a 4:

```yaml
    # Delta do DOCUMENTO (versão de 21/09): "a oscilação é considerada em
    # rebotes quando o jogador faz <=4 abaixo da média". Não é mais estimativa
    # nossa. O `origem: demonstracao` do bloco continua valendo por causa de
    # `confianca` e `odds`, que o documento não dá para rebotes.
    oscilacao:
      delta: { MVP: 4, ALL_STAR: 4, SUPORTE: 4, RANDOLA: 4 }
      nivel_minimo_apito: { MVP: 1, ALL_STAR: 1, SUPORTE: 1, RANDOLA: 1 }
```

- [ ] **Step 4: Rodar e ver o estrago**

```bash
npx vitest run src/modules/motor
```

Esperado: o teste do interruptor passa, e **alguns de `auditoria-documento.test.ts` quebram**.
Esse arquivo faz `carregarRuleset(yamlBruto)` no topo — lê o ruleset de **produção** —, e os
testes de rebotes que passam por `avaliar()` ou `avaliarFireLive()` dependem de
`niveis.atributos` listar os três. `avaliarOscilacao` e `deltaOscilacao` recebem o atributo
por parâmetro e **não** quebram.

- [ ] **Step 5: Religar os três no ruleset do próprio teste**

Nunca no arquivo de produção. Em `auditoria-documento.test.ts`, logo depois do
`const homologado = carregarRuleset(yamlBruto)`, acrescentar:

```ts
// `niveis.atributos` em produção é [PONTOS]: rebotes e assistências estão
// desligados até o CJ mandar % e odds (ver o comentário no ruleset). Estes
// testes auditam as regras dos três atributos, então religam os três AQUI —
// nunca no arquivo de produção.
const tresAtributos = structuredClone(homologado)
tresAtributos.niveis.atributos = ['PONTOS', 'REBOTES', 'ASSISTENCIAS']
```

Nos testes que quebraram, trocar `homologado` por `tresAtributos`. É o mesmo idioma que o
arquivo já usa na linha 17 (`const configurado = structuredClone(homologado)`).

- [ ] **Step 6: Rodar e ver passar**

```bash
npx vitest run src/modules/motor
npx vitest run -t "interruptor de atributo"
```

Esperado: os dois verdes.

---

### Task 8: As dez perguntas e a frase que deixou de valer

**Files:**
- Modify: `docs/05-perguntas-abertas.md`
- Modify: `CLAUDE.md`

**Interfaces:**
- Consumes: nada
- Produces: nada

- [ ] **Step 1: Acrescentar a seção de perguntas**

Em `docs/05-perguntas-abertas.md`, ao fim, uma seção nova. As nove são as da §8 da spec —
copiar de lá, não reescrever de memória:

```markdown
## Versão de 21/09/2026 do documento — dez perguntas

A versão nova trouxe rebotes e assistências. O que ela **não** resolve, e que por isso não
virou código:

1. O documento termina em **"Atualização lista secreta de assistências:"** e não vem nada
   depois. O que era para vir? Até vir, a lista de assistências pode estar velha.
2. **Randola não existe** em rebotes nem em assistências — as duas tabelas só definem MVP,
   All Star e Suporte, e as listas confirmam. É esquecimento ou é regra?
3. **Assistências: ≤2 ou 4/3/3?** A seção geral diz "≤2 abaixo da média"; a de assistências
   diz MVP ≤4, All Star ≤3, Suporte ≤3.
4. **Vãos nas faixas:** 9,9 rebotes não é MVP (≥10) nem All Star (7–9,8). Mesma coisa em
   7,95 assistências e 6,95 rebotes.
5. **Modo Fire: 70% ou 75%?** O parágrafo diz 70, a OBS diz 75. Seguimos com 75 (P4).
6. **Klay Thompson** aparece em Dallas e Miami; **Mathurin**, em Pelicans e Clippers. Qual
   vale? O import recusa os dois e reporta. (Wiggins em Miami e Atlanta são Andrew e Aaron,
   dois jogadores reais — não é o mesmo caso.)
7. **Detroit, em assistências,** tem "Cadê Cunningham" sem nível nenhum.
8. **"Jogadores fora da lista de rebotes entram na oscilação com média acima de 4"** — em
   que nível de apito? Quem não está na lista não tem nível, e a regra "Suporte e Randola
   não apitam nível 1" não o alcança.
9. **% e odds de rebotes e assistências.** O documento só dá as de pontos. Sem elas,
   `niveis.atributos` não pode voltar a listar os três.
10. **E quando o jogador repetido ainda não foi confirmado?** O import recusa e reporta a
    repetição quando o nome já tem jogador confirmado. Na PRIMEIRA aparição não: as duas
    ocorrências caem em `pendentes`, que é uma lista de nomes sem time, então a contradição
    do documento fica invisível na tela de admin. Nada errado é gravado, mas ninguém fica
    sabendo. Vale anotar o time em `pendentes`, ou o CJ prefere resolver na origem?
```

- [ ] **Step 2: Corrigir a armadilha do `CLAUDE.md` que deixou de valer**

A frase atual diz que só existe classificação de pontos. Trocar por:

```markdown
- **Rebotes e assistências têm classificação desde 21/09/2026**, mas estão
  **desligados** em `niveis.atributos`, que hoje é `[PONTOS]`. Os dados estão no banco; o
  que falta são as tabelas de % e de odds dos dois, que o documento do CJ não dá. Não
  religue sem elas — as que estão no ruleset são demonstração, não dele.
```

- [ ] **Step 3: Conferir que nada mais afirma o contrário**

```bash
grep -rn "só existe classificação de PONTOS\|somente pontos\|apenas pontos" \
  CLAUDE.md docs/*.md | cut -c1-120
```

Ajustar o que aparecer.

---

### Task 9: Verificação final e o commit único

**Files:** nenhum novo

- [ ] **Step 1: Conferir o disco antes da suíte**

```bash
df -h /
```

Abaixo de ~3 GB livres, limpar os caches aprovados antes de seguir. A suíte come ~6 GB.

- [ ] **Step 2: Rodar tudo**

```bash
npm test && npm run typecheck && npm run lint && npm run boundaries
```

Esperado: os quatro verdes. `boundaries` é o que prova que o motor continua puro.

- [ ] **Step 3: Conferir o diff antes de commitar**

```bash
git status --short && git diff --stat
```

Esperado: `parser.ts`, `importar.ts`, `ingestao.test.ts`, `ruleset.v1.yaml`, o arquivo de
fonte, `05-perguntas-abertas.md`, `CLAUDE.md`, a spec e este plano. **Qualquer arquivo fora
dessa lista sai do commit** — em especial teste reformatado por prettier.

- [ ] **Step 4: O commit único**

```bash
git add -A
git commit -m "$(cat <<'MSG'
Rebotes e assistências saem do papel, e ficam desligados até o CJ mandar os números

O arquivo de fonte era uma versão anterior do documento. A nova traz a
classificação de rebotes e de assistências — 30 times cada — e o caminho que
leva a lista do CJ até o banco não aguentava: o parser lia de "Lista de Níveis"
até "Lista secreta" sem noção de atributo, e as duas seções novas ficam no meio.

Três defeitos de construção no caminho, os dois primeiros silenciosos:

- as linhas de rebotes vêm em negrito, e `nomeDoTime` testava "é entrada
  numerada?" antes de tirar o `**`. Cada jogador de rebotes virava um time.
- `completarVersao` guardava `jaGravados` só por jogador, sem o atributo: o
  jogador já gravado em pontos faria a entrada de rebotes ser pulada.
- o import gravava com `onConflictDoNothing` e contava `casados` antes do
  conflito. Jogador repetido em dois times perdia uma entrada sem aviso, e o
  relatório dizia que ela entrou.

O documento repete Klay Thompson (Dallas e Miami) e Mathurin (Pelicans e
Clippers). A chave única não mudou: o import recusa os dois e reporta, porque
escolher em qual time ele joga seria inventar regra.

`niveis.atributos` fica em [PONTOS]. Os dados entram no banco e ficam
versionados, mas as tabelas de confiança e odds de rebotes e assistências ainda
são demonstração nossa — religar poria apito com número inventado no celular de
assinante. Religar é uma linha de YAML quando o CJ mandar % e odds.

Nove perguntas para ele em docs/05-perguntas-abertas.md, a começar pela seção
"Atualização lista secreta de assistências:" que o documento abre e não escreve.

Sem migração. Motor intocado.
MSG
)"
```

- [ ] **Step 5: Relatar ao parceiro**

Dizer, em uma linha cada: quantos jogadores entraram por atributo; quantas repetições o
import recusou e quais; e que rebotes e assistências estão **desligados** até as nove
perguntas voltarem — em especial a nona, que é a que destrava o interruptor.

# A saída do apito carrega sua origem — plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fazer a saída para a casa parceira registrar de qual apito ela nasceu, e dar ao admin a trilha "saiu → registrou a aposta", sem tocar no painel do parceiro nem na gestão.

**Architecture:** O evento de saída ganha uma coluna `apito_id`. A tela do apito manda a `chave` do item na URL; a rota resolve essa chave contra o índice único de `apitos` e grava o id encontrado — chave que não resolve vira saída sem origem, nunca uma origem inventada. O vínculo com a aposta registrada não é gravado em lugar nenhum: é derivado na leitura, casando pela chave natural que a gestão já usa.

**Tech Stack:** Next.js App Router, Drizzle + Postgres (Neon em produção, PGlite nos testes), Vitest.

**Spec:** [`docs/superpowers/specs/2026-09-15-saida-do-apito-e-trilha-no-admin-design.md`](../specs/2026-09-15-saida-do-apito-e-trilha-no-admin-design.md)

## Global Constraints

- **Regra 4 do `CLAUDE.md` — odds somente leitura.** Isto continua sendo um `<a>` que redireciona. Sem envio de aposta, sem credencial de casa, sem movimentação de dinheiro, sem tabela, rota ou campo novo para isso.
- **Nada disso gera comissão.** A aposta é auto-declarada pelo usuário e a NIP nunca a viu. A tela do admin rotula como declaração, não como conversão.
- **O painel do PARCEIRO não muda em nada.** Nem número, nem coluna, nem texto. A trilha vive só em `/admin/afiliados`.
- **`entradas_realizadas` não ganha campo nenhum.** Nem casa, nem status, nem resultado.
- **O formato do snapshot do feed não muda.** `ItemFeed` fica como está; a origem viaja pela `chave`, que já existe nele.
- **O dia sai de `dataDeReferencia(ocorridoEm, fuso)`** — o mesmo helper da rodada. Nunca `toISOString().slice(0,10)`, que joga a saída das 23h de Brasília para o dia seguinte.
- **Nenhum teste nomeia jogador ou time.** Asserções por estrutura; o sujeito é lido do banco.
- **Domínio em português; comentário explica a decisão, não o mecanismo.**
- **Um commit só, no final** (preferência do parceiro). As tasks terminam em verificação; a Task 5 commita.
- **Verificação de cada task:** `npm run typecheck && npm run lint && npm run boundaries` e a suíte do que foi tocado. Uma execução de vitest por vez: duas em paralelo fabricam falhas fantasmas neste repositório.

---

## Mapa de arquivos

| Arquivo | Responsabilidade | Task |
| --- | --- | --- |
| `src/modules/dominio/db/schema/afiliados.ts` | `eventos_afiliados.apito_id` + check | 1 |
| `drizzle/0026_*.sql` e `drizzle/down/0026_*.sql` (novos) | a migration e a descida | 1 |
| `src/modules/plataforma/afiliados/servico.ts` | `registrarSaidaParaCasa` resolve a chave; `trilhaDeSaidas` (novo) | 2, 4 |
| `src/modules/plataforma/afiliados/__tests__/servico.test.ts` | origem gravada, chave ruim degrada | 2 |
| `src/app/ir/[codigo]/route.ts` | lê a chave do query e repassa | 3 |
| `src/app/(app)/apito/[jogadorId]/page.tsx` | o `href` leva a chave | 3 |
| `src/app/__tests__/telas-04-detalhe.test.ts` | a tela põe a chave no link (asserção existente ATUALIZADA) | 3 |
| `src/modules/plataforma/afiliados/__tests__/trilha.test.ts` (novo) | o casamento por dia local | 4 |
| `src/app/(admin)/admin/afiliados/page.tsx` | a oitava seção | 4 |

---

### Task 1: A coluna da origem

**Files:**
- Modify: `src/modules/dominio/db/schema/afiliados.ts:206-229` (bloco `eventosAfiliados`)
- Create: `drizzle/0026_origem_do_apito.sql`, `drizzle/down/0026_origem_do_apito.sql`
- Test: `src/modules/dominio/__tests__/migracoes.test.ts` (existente — confira se há um; se não houver, a verificação é o arnês de teste, que roda TODAS as migrations ao subir)

**Interfaces:**
- Produces: `eventosAfiliados.apitoId: uuid | null`, com FK para `apitos.id` e o check `eventos_afiliados_apito_so_em_saida`. As Tasks 2 e 4 dependem da coluna existir.

- [ ] **Step 1: Schema**

Em `src/modules/dominio/db/schema/afiliados.ts`, no bloco `eventosAfiliados`, acrescente o campo depois de `atribuicaoId` e o check depois do `eventos_afiliados_tipo_valido`. O import de `apitos` vem de `./motor`:

```ts
    atribuicaoId: uuid('atribuicao_id').references(() => atribuicoesAfiliados.id),
    /**
     * De qual apito a saída nasceu. Anulável porque só a SAIDA_CASA tem
     * origem — clique e visita não vêm de um apito — e porque uma chave que
     * não resolve grava a saída SEM origem, o que é honesto; inventar origem
     * contaminaria uma trilha que vai embasar conversa comercial.
     */
    apitoId: uuid('apito_id').references(() => apitos.id, { onDelete: 'set null' }),
    tipo: text('tipo').notNull(),
```

e, no array de constraints:

```ts
    check(
      'eventos_afiliados_apito_so_em_saida',
      sql`${t.apitoId} is null or ${t.tipo} = 'SAIDA_CASA'`,
    ),
```

`onDelete: 'set null'` de propósito: apagar um apito não pode apagar o registro comercial da saída — o evento continua valendo, só perde a origem.

- [ ] **Step 2: Migration**

`drizzle/0026_origem_do_apito.sql`:

```sql
ALTER TABLE "eventos_afiliados" ADD COLUMN "apito_id" uuid;--> statement-breakpoint
ALTER TABLE "eventos_afiliados" ADD CONSTRAINT "eventos_afiliados_apito_id_apitos_id_fk" FOREIGN KEY ("apito_id") REFERENCES "public"."apitos"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "eventos_afiliados" ADD CONSTRAINT "eventos_afiliados_apito_so_em_saida" CHECK ("apito_id" is null or "tipo" = 'SAIDA_CASA');
```

`drizzle/down/0026_origem_do_apito.sql`:

```sql
ALTER TABLE "eventos_afiliados" DROP CONSTRAINT IF EXISTS "eventos_afiliados_apito_so_em_saida";--> statement-breakpoint
ALTER TABLE "eventos_afiliados" DROP CONSTRAINT IF EXISTS "eventos_afiliados_apito_id_apitos_id_fk";--> statement-breakpoint
ALTER TABLE "eventos_afiliados" DROP COLUMN IF EXISTS "apito_id";
```

Confira o nome exato do arquivo mais recente em `drizzle/` antes de numerar: se já existir um `0026_*`, use o próximo número livre, e batize o `down/` com o MESMO nome do `up/` (é a convenção do diretório, e `descer()` do arnês aplica os `down` em ordem inversa).

- [ ] **Step 3: Provar que sobe e desce**

Run: `npx vitest run src/modules/dominio`
Esperado: PASS. O arnês `bancoDeTeste()` aplica todas as migrations ao subir; um SQL inválido quebra aqui, em todo teste que usa banco.

- [ ] **Step 4: Verificar** — `npm run typecheck && npm run lint && npm run boundaries`. Marcar; **não commitar**.

---

### Task 2: `registrarSaidaParaCasa` resolve a chave

**Files:**
- Modify: `src/modules/plataforma/afiliados/servico.ts:556-577` (`registrarSaidaParaCasa`)
- Test: `src/modules/plataforma/afiliados/__tests__/servico.test.ts`

**Interfaces:**
- Consumes: `eventosAfiliados.apitoId` (Task 1).
- Produces:
  ```ts
  export async function registrarSaidaParaCasa(
    db: Db,
    entrada: {
      codigo: string
      visitanteToken: string
      agora: Date
      usuarioId?: string | null
      chaveDoApito?: string | null
    },
  ): Promise<string>
  ```
  O retorno continua sendo a URL de destino. A Task 3 passa `chaveDoApito`.

**Como a chave vira id.** `montarChave(jogoId, jogadorId, atributo, estrategia, linha)` de `motor/tipos.ts` monta `jogoId|jogadorId|atributo|estrategia|linha` (linha ausente vira string vazia). É exatamente o índice único de `apitos`. A resolução desmonta a string e consulta por esses cinco campos.

- [ ] **Step 1: Escrever os testes que falham**

Em `servico.test.ts`, acrescente ao fim. O cenário precisa de um apito de verdade, e a cadeia de FKs é time → jogador → jogo → apito:

```ts
describe('a saída para a casa carrega de qual apito nasceu', () => {
  /** Um apito real, com a cadeia mínima de FKs que o banco exige. */
  async function apitoDeTeste() {
    const sufixo = Math.random().toString(36).slice(2, 8)
    const [casa, fora] = await banco.db
      .insert(times)
      .values([
        { sigla: `C${sufixo.slice(0, 2)}`.toUpperCase(), nome: `Casa ${sufixo}` },
        { sigla: `F${sufixo.slice(0, 2)}`.toUpperCase(), nome: `Fora ${sufixo}` },
      ])
      .returning()
    const [jogador] = await banco.db
      .insert(jogadores)
      .values({ nomeCompleto: `Jogador ${sufixo}`, timeId: casa!.id })
      .returning()
    const [jogo] = await banco.db
      .insert(jogos)
      .values({
        dataHoraUtc: new Date('2026-09-15T23:00:00.000Z'),
        dataReferencia: '2026-09-15',
        timeCasaId: casa!.id,
        timeVisitanteId: fora!.id,
        status: 'AGENDADO',
      })
      .returning()
    const [apito] = await banco.db
      .insert(apitos)
      .values({
        rulesetVersao: 'v1',
        jogoId: jogo!.id,
        jogadorId: jogador!.id,
        atributo: 'PONTOS',
        estrategia: 'LISTA_SECRETA',
        nivelJogador: 'MVP',
        nivelApito: 3,
        linha: 25,
      })
      .returning()
    return {
      apito: apito!,
      chave: montarChave(jogo!.id, jogador!.id, 'PONTOS', 'LISTA_SECRETA', 25),
    }
  }

  it('com a chave do apito, o evento grava a origem', async () => {
    const c = await contexto()
    const { apito, chave } = await apitoDeTeste()
    await registrarSaidaParaCasa(banco.db, {
      codigo: c.linkA.codigo,
      visitanteToken: 'visitante-com-origem',
      agora: new Date('2026-09-15T20:00:00.000Z'),
      chaveDoApito: chave,
    })
    const [evento] = await banco.db
      .select()
      .from(eventosAfiliados)
      .where(eq(eventosAfiliados.visitanteHash, hashVisitante('visitante-com-origem')))
    expect(evento!.tipo).toBe('SAIDA_CASA')
    expect(evento!.apitoId).toBe(apito.id)
  })

  it('sem chave nenhuma, continua funcionando como antes — origem nula', async () => {
    const c = await contexto()
    await registrarSaidaParaCasa(banco.db, {
      codigo: c.linkA.codigo,
      visitanteToken: 'visitante-sem-chave',
      agora: new Date('2026-09-15T20:00:00.000Z'),
    })
    const [evento] = await banco.db
      .select()
      .from(eventosAfiliados)
      .where(eq(eventosAfiliados.visitanteHash, hashVisitante('visitante-sem-chave')))
    expect(evento!.apitoId).toBeNull()
  })

  it('chave que não resolve grava SEM origem e não lança — nunca uma origem inventada', async () => {
    const c = await contexto()
    // Forjada: uuid válido, apito que não existe. É o que um parâmetro
    // adulterado na URL produz.
    const forjada = montarChave(
      '00000000-0000-4000-8000-000000000001',
      '00000000-0000-4000-8000-000000000002',
      'PONTOS',
      'LISTA_SECRETA',
      99,
    )
    const destino = await registrarSaidaParaCasa(banco.db, {
      codigo: c.linkA.codigo,
      visitanteToken: 'visitante-chave-forjada',
      agora: new Date('2026-09-15T20:00:00.000Z'),
      chaveDoApito: forjada,
    })
    expect(destino).toContain('https://')
    const [evento] = await banco.db
      .select()
      .from(eventosAfiliados)
      .where(eq(eventosAfiliados.visitanteHash, hashVisitante('visitante-chave-forjada')))
    expect(evento!.apitoId).toBeNull()
  })

  it('chave malformada também degrada, sem lançar', async () => {
    const c = await contexto()
    const destino = await registrarSaidaParaCasa(banco.db, {
      codigo: c.linkA.codigo,
      visitanteToken: 'visitante-chave-lixo',
      agora: new Date('2026-09-15T20:00:00.000Z'),
      chaveDoApito: 'isto-nao-e-uma-chave',
    })
    expect(destino).toContain('https://')
    const [evento] = await banco.db
      .select()
      .from(eventosAfiliados)
      .where(eq(eventosAfiliados.visitanteHash, hashVisitante('visitante-chave-lixo')))
    expect(evento!.apitoId).toBeNull()
  })
})
```

Acrescente aos imports do arquivo: `apitos, jogadores, jogos, times` em `@/modules/dominio/db/schema`, e `montarChave` de `@/modules/motor/tipos`.

**`hashVisitante` NÃO é exportado hoje** (`servico.ts:283`, função de módulo). Exporte-a — é função pura, sem I/O, e o teste precisa reproduzir o hash para achar o evento pelo `visitante_hash`. A alternativa (ler o evento mais recente do link) tornaria o teste dependente de ordem, que é dívida que este projeto já tem demais.

**Sobre `contexto()`:** conferido em 15/09 — ele devolve `{ admin, usuarioA, usuarioB, parceiroA, parceiroB, oferta, acordoA, linkA, linkB }`. Use **`linkA`**: é o link cuja oferta aponta para a CASA. `linkB` tem `caminhoNip` e aponta para dentro da NIP, então `registrarSaidaParaCasa` com ele não é o caminho sob teste.

- [ ] **Step 2: Rodar e ver falhar** — `npx vitest run src/modules/plataforma/afiliados/__tests__/servico.test.ts`. Esperado: FAIL — `registrarSaidaParaCasa` não aceita `chaveDoApito` (typecheck) e `apitoId` não é gravado.

- [ ] **Step 3: Implementar** — em `servico.ts`, acrescente a resolução antes de `registrarSaidaParaCasa` e use-a:

```ts
/**
 * A CHAVE DO APITO VIRA ID — e nunca vira palpite.
 *
 * `montarChave` (motor/tipos.ts) é exatamente o índice único de `apitos`, e o
 * item do feed já a carrega: é por isso que a origem viaja por ela em vez de
 * por um id que o snapshot não tem. Quem adulterar o parâmetro na URL só
 * consegue apontar para um apito que EXISTE — não há como inventar um. E
 * chave que não resolve devolve `null`, porque uma trilha que vai embasar
 * conversa comercial prefere "não sei" a um vínculo fabricado.
 */
async function apitoDaChave(db: Db, chave: string | null | undefined): Promise<string | null> {
  if (!chave) return null
  const [jogoId, jogadorId, atributo, estrategia, linha] = chave.split('|')
  if (!jogoId || !jogadorId || !atributo || !estrategia) return null
  // `linha` vazia é o apito de Fire Live, que não tem linha: `is null` no SQL,
  // igual ao `nullsNotDistinct` do índice.
  const filtroLinha = linha === '' || linha === undefined
    ? isNull(apitos.linha)
    : eq(apitos.linha, Number(linha))
  if (linha !== '' && linha !== undefined && !Number.isInteger(Number(linha))) return null
  try {
    const [achado] = await db
      .select({ id: apitos.id })
      .from(apitos)
      .where(
        and(
          eq(apitos.jogoId, jogoId),
          eq(apitos.jogadorId, jogadorId),
          eq(apitos.atributo, atributo as (typeof apitos.atributo.enumValues)[number]),
          eq(apitos.estrategia, estrategia as (typeof apitos.estrategia.enumValues)[number]),
          filtroLinha,
        ),
      )
      .limit(1)
    return achado?.id ?? null
  } catch {
    // uuid malformado faz o Postgres recusar a conversão. Degradar é o
    // comportamento certo: o clique do usuário não pode virar erro porque
    // alguém mexeu na URL.
    return null
  }
}
```

e em `registrarSaidaParaCasa`:

```ts
export async function registrarSaidaParaCasa(
  db: Db,
  entrada: {
    codigo: string
    visitanteToken: string
    agora: Date
    usuarioId?: string | null
    chaveDoApito?: string | null
  },
) {
  const configuracao = await configuracaoDoLink(db, entrada.codigo)
  const visitanteHash = hashVisitante(entrada.visitanteToken)
  const atribuicao = await atribuicaoAtivaParaEvento(
    db,
    visitanteHash,
    entrada.usuarioId,
    entrada.agora,
  )
  const apitoId = await apitoDaChave(db, entrada.chaveDoApito)
  await db.insert(eventosAfiliados).values({
    visitanteHash,
    usuarioId: entrada.usuarioId ?? null,
    linkId: configuracao.link.id,
    atribuicaoId: atribuicao?.id ?? null,
    apitoId,
    tipo: 'SAIDA_CASA',
    ocorridoEm: entrada.agora,
  })
  return destinoDaCasa(configuracao.link, configuracao.oferta)
}
```

Acrescente `apitos` ao import de schema e `isNull` ao import de `drizzle-orm`, se ainda não estiverem.

- [ ] **Step 4: Rodar e ver passar** — `npx vitest run src/modules/plataforma/afiliados`. Esperado: PASS, inclusive os testes que já existiam (a assinatura só GANHOU um campo opcional).

- [ ] **Step 5: Verificar** — `npm run typecheck && npm run lint && npm run boundaries`. Marcar; **não commitar**.

---

### Task 3: A tela manda a chave, a rota repassa

**Files:**
- Modify: `src/app/ir/[codigo]/route.ts`
- Modify: `src/app/(app)/apito/[jogadorId]/page.tsx:776` (o `href` da saída)
- Test: `src/app/__tests__/telas-04-detalhe.test.ts:286-350` (asserção existente)

**Interfaces:**
- Consumes: `registrarSaidaParaCasa({ …, chaveDoApito })` (Task 2).
- Produces: nenhum símbolo novo.

- [ ] **Step 1: Atualizar a asserção que já existe**

**RULING (15/09, varredura pré-voo) — este passo foi REESCRITO. Não crie arquivo de teste novo, e não extraia `cenario.ts` nesta task.**

O plano mandava criar `src/app/__tests__/apito-saida-origem.test.ts` e dizia, no
Step 4, que "nenhuma asserção existente pode mudar de resultado". As duas coisas
estavam erradas, e a segunda é o que importa:
**`src/app/__tests__/telas-04-detalhe.test.ts:342` já fixa o href exato**, com a
aspa de fechamento —

```ts
expect(html).toContain(`href="/ir/${link.codigo}"`)
```

— então a mudança desta task **necessariamente** deixa esse teste vermelho. Criar
um segundo arquivo deixaria dois testes afirmando coisas contraditórias sobre o
mesmo `href`, e o antigo venceria a discussão ficando vermelho para sempre.

Além disso, aquele teste (`telas-04-detalhe.test.ts:286-350`) **já faz tudo o que
o arquivo novo faria**: monta parceiro → oferta ATIVA → campanha → link, chama
`definirSaidaDoApito`, renderiza a página de verdade com `renderizar(item)`, tem
o `item` do feed em mãos (portanto `item.chave`), e desfaz a marca num `finally`.
Um arquivo novo re-semearia uma temporada simulada inteira (`simularAte`, dezenas
de segundos) para uma asserção que cabe em duas linhas aqui.

Então: no bloco `try` daquele teste, troque a asserção do href e acrescente a da
chave:

```ts
      await definirSaidaDoApito(banco.db, ator, link.id, agora)
      html = await renderizar(item)
      // A saída carrega de qual apito nasceu. `encodeURIComponent` porque a
      // chave contém `|`, que truncaria a query string se fosse crua.
      expect(html).toContain(
        `href="/ir/${link.codigo}?apito=${encodeURIComponent(item.chave)}"`,
      )
      expect(html).toContain('rel="nofollow sponsored"')
```

As demais asserções do bloco (`rel`, o aviso do ADR-0004, a ausência de
formulário de aposta) ficam como estão. A asserção da linha 289 —
`expect(html).not.toContain('href="/ir/')`, o caso sem link marcado — continua
correta e não muda.

**Confira `item.chave` antes de usar.** `ItemFeed` tem `chave` (veja
`src/modules/entrega/tipos-feed.ts`), mas confirme o nome do campo no objeto que
`sujeito()` devolve naquele arquivo, em vez de confiar neste texto.

- [ ] **Step 2: Rodar e ver falhar** — `npx vitest run src/app/__tests__/telas-04-detalhe.test.ts`. Esperado: FAIL na asserção do href, porque a tela ainda manda `/ir/{codigo}` puro. É a falha que prova que o teste está olhando para o lugar certo.

- [ ] **Step 3a: A rota lê o parâmetro** — em `src/app/ir/[codigo]/route.ts`, dentro de `resolver`, passe a chave adiante:

```ts
    const destino = await registrarSaidaParaCasa(getDb(), {
      codigo,
      visitanteToken: token,
      usuarioId: sessao?.usuarioId,
      agora: new Date(),
      // A origem vem da tela do apito. Query string porque o `<a>` é um GET
      // simples: nada de formulário só para carregar um identificador.
      chaveDoApito: new URL(request.url).searchParams.get('apito'),
    })
```

`resolver` já recebe `request`; nada mais muda na rota. O caminho `HEAD`/robô continua resolvendo sem registrar, como hoje.

- [ ] **Step 3b: A tela põe a chave no link** — em `page.tsx`, na linha do `href`:

```tsx
            href={`/ir/${saida.codigo}?apito=${encodeURIComponent(principal.chave)}`}
```

`encodeURIComponent` não é enfeite: a chave contém `|`, e sem escapar ela chega truncada do outro lado.

- [ ] **Step 4: Rodar e ver passar** — `npx vitest run src/app/__tests__/telas-04-detalhe.test.ts`. Depois rode a pasta inteira, `npx vitest run src/app/__tests__`: a tela do apito aparece em mais de uma suíte (`apito-meia-noite`, `telas-demo`, `telas-galeria`), e o href mudou para todas elas. Uma execução de vitest por vez.

- [ ] **Step 5: Verificar** — `npm run typecheck && npm run lint && npm run boundaries && npm run build`. Marcar; **não commitar**.

---

### Task 4: A trilha no admin

**Files:**
- Modify: `src/modules/plataforma/afiliados/servico.ts` (nova `trilhaDeSaidas`)
- Modify: `src/app/(admin)/admin/afiliados/page.tsx` (oitava seção)
- Test: `src/modules/plataforma/afiliados/__tests__/trilha.test.ts` (novo)

**Interfaces:**
- Consumes: `eventosAfiliados.apitoId` (Task 1), preenchido por `registrarSaidaParaCasa` (Task 2).
- Produces:
  ```ts
  export type SaidaDaTrilha = {
    id: string
    ocorridoEm: Date
    parceiro: string
    campanha: string
    casa: string
    origem: { nome: string; atributo: string; linha: number | null } | null
    registrou: boolean
  }
  export async function trilhaDeSaidas(
    db: Db,
    opcoes: { fuso: string; filtro?: FiltroPeriodoAfiliados; limite?: number },
  ): Promise<SaidaDaTrilha[]>
  ```
- Produces: `painelAdministrativo` devolve `trilha: SaidaDaTrilha[]` a mais.

**RULING (15/09, varredura pré-voo) — leia antes de implementar.** O recorte NÃO
vem em string. `FiltroPeriodoAfiliados` (`{ inicio?: Date; fim?: Date }`) já
existe em `servico.ts:1377` e é o que `painelAdministrativo` recebe; a página
monta esse objeto com `filtroDePeriodo(inicio, fim)`, que converte pelo fuso
comercial via `intervaloDoDia`. Receber string e parsear como
`T00:00:00.000Z` faria esta seção discordar das outras sete por três horas — o
bug de janela em UTC que as Global Constraints deste plano proíbem. E o `fim`
de `intervaloDoDia` é a meia-noite do dia SEGUINTE, ou seja **exclusivo**: use
`lt`, nunca `lte`, exatamente como o bloco `totaisEventos` já faz.

**A regra do casamento.** Uma saída conta como "registrou" quando existe linha em `entradas_realizadas` com o MESMO `usuario_id`, o MESMO `jogador_id`, `atributo` e `linha` do apito de origem, e `data_referencia` igual ao **dia local** da saída. O dia local sai de `dataDeReferencia(ocorridoEm, fuso)` — o mesmo helper da rodada. Saída sem `usuario_id` (visitante anônimo) ou sem origem nunca casa.

- [ ] **Step 1: Escrever o teste que falha**

`src/modules/plataforma/afiliados/__tests__/trilha.test.ts`. O teste planta os dois lados à mão — é o que deixa a asserção sobre a REGRA, não sobre a semeadura:

```ts
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { bancoDeTeste } from '@/modules/dominio/__tests__/ajuda-banco'
import { entradasRealizadas } from '@/modules/dominio/db/schema'
import { trilhaDeSaidas } from '../servico'

const FUSO = 'America/Sao_Paulo'
let banco: Awaited<ReturnType<typeof bancoDeTeste>>

beforeAll(async () => {
  banco = await bancoDeTeste()
}, 60_000)
afterAll(async () => {
  await banco.fechar()
})

describe('trilhaDeSaidas — o casamento é por dia LOCAL', () => {
  it('banco sem saída nenhuma devolve lista vazia, sem lançar', async () => {
    expect(await trilhaDeSaidas(banco.db, { fuso: FUSO })).toEqual([])
  })

  it('a saída das 23h de Brasília casa com a entrada do MESMO dia local, não do dia seguinte', async () => {
    // 2026-09-15T23:30 em Brasília é 2026-09-16T02:30 em UTC. Se o dia saísse
    // do UTC, esta saída procuraria a entrada do dia 16 e não acharia nada —
    // justamente no horário de maior movimento.
    const cenario = await plantarSaidaComOrigem(banco.db, {
      ocorridoEmUtc: new Date('2026-09-16T02:30:00.000Z'),
      linha: 25,
    })
    await banco.db.insert(entradasRealizadas).values({
      usuarioId: cenario.usuarioId,
      dataReferencia: '2026-09-15',
      jogadorId: cenario.jogadorId,
      atributo: 'PONTOS',
      linha: 25,
      unidades: '1.00',
      odd: null,
    })

    const trilha = await trilhaDeSaidas(banco.db, { fuso: FUSO })
    const nossa = trilha.find((s) => s.id === cenario.eventoId)
    expect(nossa).toBeDefined()
    expect(nossa!.registrou).toBe(true)
    expect(nossa!.origem?.linha).toBe(25)
  })

  it('entrada de OUTRO dia não casa', async () => {
    const cenario = await plantarSaidaComOrigem(banco.db, {
      ocorridoEmUtc: new Date('2026-09-20T18:00:00.000Z'),
      linha: 30,
    })
    await banco.db.insert(entradasRealizadas).values({
      usuarioId: cenario.usuarioId,
      dataReferencia: '2026-09-21',
      jogadorId: cenario.jogadorId,
      atributo: 'PONTOS',
      linha: 30,
      unidades: '1.00',
      odd: null,
    })
    const trilha = await trilhaDeSaidas(banco.db, { fuso: FUSO })
    expect(trilha.find((s) => s.id === cenario.eventoId)!.registrou).toBe(false)
  })

  it('saída sem origem aparece na trilha, com origem nula e sem casar', async () => {
    const cenario = await plantarSaidaComOrigem(banco.db, {
      ocorridoEmUtc: new Date('2026-09-22T18:00:00.000Z'),
      linha: 20,
      semOrigem: true,
    })
    const nossa = (await trilhaDeSaidas(banco.db, { fuso: FUSO })).find(
      (s) => s.id === cenario.eventoId,
    )
    expect(nossa!.origem).toBeNull()
    expect(nossa!.registrou).toBe(false)
  })
})
```

**O helper `plantarSaidaComOrigem`** monta, numa função só: times, jogador, jogo, apito, usuário, cenário de afiliados e a chamada a `registrarSaidaParaCasa` com a chave — devolvendo `{ eventoId, usuarioId, jogadorId }`. Escreva-o no topo deste arquivo.

**RULING (15/09) — a extração do cenário é SUA, e não da Task 3.** A Task 3
acabou não precisando dela (ela reaproveitou um teste de tela que já montava o
cenário inteiro), então esta task é a primeira e única que precisa do
encadeamento fora de `servico.test.ts`.

Antes de escrever `trilha.test.ts`, crie
`src/modules/plataforma/afiliados/__tests__/cenario.ts`:

```ts
import type { Db } from '@/modules/dominio/db/tipos'

/**
 * O cenário mínimo de afiliados: admin, dois usuários, casa, dois parceiros,
 * uma oferta ATIVA e dois links — `linkA` para a CASA, `linkB` para dentro da
 * NIP. Vive fora de `servico.test.ts` porque duas suítes precisam do MESMO
 * cenário: dois encadeamentos divergentes para a mesma coisa é como um projeto
 * ganha teste que mente.
 */
export async function cenarioDeAfiliados(db: Db) { /* … */ }
```

O corpo é o do helper `contexto()` que hoje está no topo de
`plataforma/afiliados/__tests__/servico.test.ts` — mova-o inteiro, trocando toda
ocorrência de `banco.db` pelo parâmetro `db`. É essa dependência da variável de
módulo `banco` que hoje impede o reaproveitamento. Em `servico.test.ts`, no lugar
do helper, deixe `const contexto = () => cenarioDeAfiliados(banco.db)` e rode a
suíte inteira para provar que os 28 testes existentes continuam passando.

Um `.ts` auxiliar dentro de `__tests__/` é seguro: `vitest.config.mts` coleta só
`src/**/*.{test,spec}.{ts,tsx}`. É o mesmo arranjo de `dominio/__tests__/ajuda-banco.ts`.

**Não** escreva um terceiro encadeamento. O `usuarioId` da saída sai de `c.usuarioA.id`, e tem que ser passado a `registrarSaidaParaCasa`: saída sem usuário nunca casa, por desenho.

O apito e a cadeia de FKs (time → jogador → jogo → apito) já existem como
`apitoDeTeste` em `servico.test.ts`, escrito pela Task 2 e **já parametrizado**
por `{ estrategia, linha }` (com `'LISTA_SECRETA'`/`25` como padrão). Mova-o
também para `./cenario` e importe dos dois lados, pela mesma razão: um segundo
construtor de apito divergiria do primeiro no dia em que o schema mudasse.

**Para o teste do Fire Live da trilha, se você escrever um:** a Task 2 já provou
que `montarChave(..., 'FIRE_LIVE', null)` resolve para o apito sem linha. Na
trilha, esse caso tem que aparecer com origem preenchida e `registrou: false` —
é o que a spec §10 descreve, e é comportamento correto, não defeito: não existe
entrada correspondente para casar, porque a gestão exige linha.

- [ ] **Step 2: Rodar e ver falhar** — `npx vitest run src/modules/plataforma/afiliados/__tests__/trilha.test.ts`. Esperado: FAIL — `trilhaDeSaidas` não existe.

- [ ] **Step 3: Implementar a consulta** — em `servico.ts`:

```ts
export type SaidaDaTrilha = {
  id: string
  ocorridoEm: Date
  parceiro: string
  campanha: string
  casa: string
  origem: { nome: string; atributo: string; linha: number | null } | null
  registrou: boolean
}

/**
 * A TRILHA DAS SAÍDAS — só para o admin.
 *
 * O vínculo entre a saída e a aposta NÃO é gravado em lugar nenhum: é
 * derivado aqui, casando pela chave natural que a gestão já usa (usuário,
 * dia, jogador, atributo, linha). Gravar o id da saída em
 * `entradas_realizadas` obrigaria a gestão a consultar afiliados no caminho
 * de ESCRITA, acoplando entrega à plataforma comercial na hora em que o
 * usuário aperta "Registrei".
 *
 * `registrou` é DECLARAÇÃO DO USUÁRIO, nunca confirmação da casa: a NIP não
 * viu a aposta. Não gera comissão e a tela diz isso (ADR-0010).
 */
export async function trilhaDeSaidas(
  db: Db,
  opcoes: { fuso: string; filtro?: FiltroPeriodoAfiliados; limite?: number },
): Promise<SaidaDaTrilha[]> {
  const filtros = [eq(eventosAfiliados.tipo, 'SAIDA_CASA')]
  // `lt` no fim, não `lte`: `filtroDePeriodo` devolve a meia-noite do dia
  // SEGUINTE, então o limite é exclusivo — é assim que `totaisEventos` recorta.
  if (opcoes.filtro?.inicio) filtros.push(gte(eventosAfiliados.ocorridoEm, opcoes.filtro.inicio))
  if (opcoes.filtro?.fim) filtros.push(lt(eventosAfiliados.ocorridoEm, opcoes.filtro.fim))

  const linhas = await db
    .select({
      id: eventosAfiliados.id,
      ocorridoEm: eventosAfiliados.ocorridoEm,
      usuarioId: eventosAfiliados.usuarioId,
      parceiro: parceirosAfiliados.nomePublico,
      campanha: campanhasAfiliados.nome,
      casa: casas.nome,
      jogadorId: apitos.jogadorId,
      nome: jogadores.nomeCompleto,
      atributo: apitos.atributo,
      linha: apitos.linha,
    })
    .from(eventosAfiliados)
    .innerJoin(linksAfiliados, eq(eventosAfiliados.linkId, linksAfiliados.id))
    .innerJoin(campanhasAfiliados, eq(linksAfiliados.campanhaId, campanhasAfiliados.id))
    .innerJoin(ofertasAfiliados, eq(campanhasAfiliados.ofertaId, ofertasAfiliados.id))
    .innerJoin(casas, eq(ofertasAfiliados.casaId, casas.id))
    .innerJoin(parceirosAfiliados, eq(campanhasAfiliados.parceiroId, parceirosAfiliados.id))
    // LEFT: a saída sem origem continua na trilha, só sem apito.
    .leftJoin(apitos, eq(eventosAfiliados.apitoId, apitos.id))
    .leftJoin(jogadores, eq(apitos.jogadorId, jogadores.id))
    .where(and(...filtros))
    .orderBy(desc(eventosAfiliados.ocorridoEm))
    .limit(opcoes.limite ?? 200)

  // O casamento roda em memória sobre o recorte já lido: são no máximo
  // `limite` linhas, e assim o DIA LOCAL usa `dataDeReferencia`, o mesmo
  // helper da rodada, em vez de um `AT TIME ZONE` que duplicaria a regra
  // dentro do SQL.
  return Promise.all(
    linhas.map(async (l) => {
      const origem =
        l.jogadorId && l.nome && l.atributo
          ? { nome: l.nome, atributo: l.atributo as string, linha: l.linha }
          : null
      let registrou = false
      if (origem && l.usuarioId && l.linha !== null) {
        const [entrada] = await db
          .select({ id: entradasRealizadas.id })
          .from(entradasRealizadas)
          .where(
            and(
              eq(entradasRealizadas.usuarioId, l.usuarioId),
              eq(entradasRealizadas.dataReferencia, dataDeReferencia(l.ocorridoEm, opcoes.fuso)),
              eq(entradasRealizadas.jogadorId, l.jogadorId),
              eq(entradasRealizadas.atributo, l.atributo),
              eq(entradasRealizadas.linha, l.linha),
            ),
          )
          .limit(1)
        registrou = entrada !== undefined
      }
      return {
        id: l.id,
        ocorridoEm: l.ocorridoEm,
        parceiro: l.parceiro,
        campanha: l.campanha,
        casa: l.casa,
        origem,
        registrou,
      }
    }),
  )
}
```

Acrescente aos imports do arquivo o que faltar: `apitos`, `jogadores`, `entradasRealizadas`, `casas`, `ofertasAfiliados` do schema; `desc`, `gte`, `lt` de `drizzle-orm` (`lt`, não `lte` — veja o ruling acima); e `dataDeReferencia` de `../../dominio/rodada`.

- [ ] **Step 4: Rodar e ver passar** — `npx vitest run src/modules/plataforma/afiliados`. Esperado: PASS.

- [ ] **Step 5a: A trilha entra no painel, não numa chamada solta**

**RULING (15/09, varredura pré-voo).** O plano dizia "chame `trilhaDeSaidas` onde
a página já lê as outras consultas". Esse lugar não existe como descrito: a
página faz UMA chamada (`page.tsx:53`,
`painelAdministrativo(getDb(), filtroDePeriodo(inicio, fim))`) e as sete seções
leem `painel.*`. Uma segunda consulta solta faria da trilha a única seção com
caminho de dados próprio.

Em `servico.ts`, `painelAdministrativo` ganha o fuso e devolve a trilha:

```ts
export async function painelAdministrativo(
  db: Db,
  filtro: FiltroPeriodoAfiliados = {},
  opcoes: { fuso: string },
) {
```

Acrescente `trilhaDeSaidas(db, { fuso: opcoes.fuso, filtro })` como mais um item
do `Promise.all` (desestruture como `trilha`, na mesma ordem) e `trilha` ao
objeto do `return`, junto de `lotes` e `itens`. Nada mais no `painelAdministrativo`
muda. Ele tem um chamador só — a página do admin — então a mudança de assinatura
não alcança mais ninguém; confirme com `grep -rn painelAdministrativo src/`.

- [ ] **Step 5b: A página passa o fuso da RODADA**

**RULING (15/09).** O fuso do casamento é o da rodada, não o `FUSO_COMERCIAL` de
`periodo.ts`. `entradas_realizadas.data_referencia` é escrita pela gestão com
`ruleset.rodada.fuso` (`gestao/page.tsx:265`); casar contra um dia calculado por
outra autoridade funciona hoje — as duas constantes valem 'America/Sao_Paulo' —
e quebraria em silêncio no dia em que uma delas mudasse. A página é camada de app
e pode importar de `entrega`; `plataforma` importando `entrega` seria L4→L3.

Em `src/app/(admin)/admin/afiliados/page.tsx`:

```tsx
import { rulesetAtivo } from '@/modules/entrega/ruleset-ativo'
```

e na linha 53:

```tsx
  const ruleset = await rulesetAtivo()
  const painel = await painelAdministrativo(getDb(), filtroDePeriodo(inicio, fim), {
    fuso: ruleset.rodada.fuso,
  })
```

- [ ] **Step 5c: A oitava seção**

Em `page.tsx`, acrescente a seção seguindo o molde das sete que já existem (leia
`Recebimentos`, a mais parecida: lista com período). A lista vem de
`painel.trilha`; o `trilha` do JSX abaixo é ela:

```tsx
        {/* `const trilha = painel.trilha` — ou leia `painel.trilha` direto no map. */}
        <section className={estilos.painel} id="trilha">
          <h2>Trilha de saídas</h2>
          <p>
            Saídas para casas parceiras e o que o usuário declarou ter apostado depois.
            Declaração do usuário, não confirmação da casa: não gera comissão.
          </p>
          {trilha.length === 0 ? (
            <div className={estilos.vazio}>Nenhuma saída no período.</div>
          ) : (
            <table className={estilos.tabela}>
              <thead>
                <tr>
                  <th>Quando</th>
                  <th>Parceiro · campanha</th>
                  <th>Casa</th>
                  <th>Apito de origem</th>
                  <th>Declarou ter apostado</th>
                </tr>
              </thead>
              <tbody>
                {trilha.map((s) => (
                  <tr key={s.id}>
                    <td>{dataCurta(s.ocorridoEm)}</td>
                    <td>
                      {s.parceiro} · {s.campanha}
                    </td>
                    <td>{s.casa}</td>
                    <td>
                      {s.origem
                        ? `${s.origem.nome} · ${s.origem.atributo}${s.origem.linha === null ? '' : ` ${s.origem.linha}`}`
                        : '—'}
                    </td>
                    <td>{s.registrou ? 'Sim' : 'Não'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
```

O arquivo já importa `dataCurta` e `dinheiro` de `@/components/afiliados/formato` — use `dataCurta`, que é o que as outras sete seções usam. Não importe um segundo formatador de data para esta tela.

**Classes conferidas em 15/09.** O CSS do painel (`PainelComercial.module.css`)
tem: `alerta botao botaoSecundario codigo conteudo filtros formulario
formularioCompacto formularios grade gradeMetricas lateral linha lista mensagem
metrica pagina painel rodape selo tabela topo vazio`. Toda tabela da página usa
`<table className={estilos.tabela}>` (linhas 270 e 347) — não invente classe nova
nem deixe a tabela sem classe.

- [ ] **Step 6: Verificar** — `npm run typecheck && npm run lint && npm run boundaries && npm run build`, mais `npx vitest run src/app/__tests__` (o admin renderiza; nenhuma tela pode quebrar). Marcar; **não commitar**.

---

### Task 5: Fechamento

**Files:**
- Modify: `docs/superpowers/specs/2026-09-15-saida-do-apito-e-trilha-no-admin-design.md` (status)
- Test: tudo

- [ ] **Step 1: Bateria inteira** — `npm run typecheck && npm run lint && npm run boundaries && npm test && npm run build`. Esperado: verde. Se uma suíte falhar só em paralelo, rode-a isolada antes de concluir que é regressão — a contenção de PGlite neste repositório fabrica falhas fantasmas.

- [ ] **Step 2: Conferir que o painel do PARCEIRO não mudou** — `git diff --stat -- "src/app/(afiliados)"` deve vir **vazio**. É a garantia de que a trilha não vazou para terceiro.

- [ ] **Step 3: Conferir que a gestão não mudou** — `git diff --stat -- src/modules/entrega/gestao-realizadas.ts "src/app/(app)/gestao"` deve vir **vazio**.

- [ ] **Step 4: Spec** — `**Status:** implementada em <data>.`

- [ ] **Step 5: Commit único** — `git add -A` (confira com `git status` que não há `node_modules`, `.superpowers/` nem scratchpad no índice) e:

```bash
git commit -F - <<'EOF'
A saída para a casa passa a carregar de qual apito nasceu

O evento de SAIDA_CASA ganha apito_id. A tela do apito manda a chave do item
na URL e a rota resolve contra o índice único de apitos — chave que não
resolve (forjada, de snapshot velho, malformada) grava a saída SEM origem e
redireciona normalmente: um parâmetro adulterado não vira dado inventado, e o
clique de quem estava lendo não vira erro.

A chave viaja em vez do id porque ItemFeed não carrega o id do apito: o feed é
snapshot materializado. montarChave é exatamente o índice único de apitos e já
está no item, então a origem passa a existir sem mudar o formato do snapshot e
sem invalidar os que já foram gravados.

O vínculo com a aposta registrada não é gravado em lugar nenhum — é derivado
na leitura, casando pela chave natural que a gestão já usa. Gravar o id da
saída em entradas_realizadas obrigaria a gestão a consultar afiliados no
caminho de escrita, acoplando entrega à plataforma comercial na hora em que o
usuário aperta "Registrei". O dia do casamento é o LOCAL, por dataDeReferencia:
a saída das 23h de Brasília é do mesmo dia da entrada, não do seguinte.

A trilha vive só no admin. O painel do parceiro é de terceiro e a aposta é
auto-declarada pelo assinante; a tela rotula como declaração, não conversão, e
nada disso gera comissão (ADR-0010). Painel do parceiro e gestão não mudaram
uma linha.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
```

- [ ] **Step 6: Parar.** Push, PR, merge e deploy são decisão do parceiro — não os execute sem a palavra dele.

---

## Auto-revisão

**Cobertura da spec.** §1 (ponto de partida) não pede código. §2 escopo → respeitado, e a Task 5 Steps 2-3 PROVAM o que ficou de fora. §3 decisão 1 (vínculo derivado) → Task 4; decisão 2 (chave, não id) → Task 2; decisão 3 (degradar) → Task 2, dois testes; decisão 4 (só admin) → Task 4 + Task 5 Step 2; decisão 5 (não gera comissão) → texto da seção na Task 4; decisão 6 (dia local) → Task 4, teste das 23h. §4 (onde o vínculo mora) → Task 4. §5 (schema, leitura, rota) → Tasks 1, 2, 3. §6 (trilha no admin) → Task 4. §7 (tela) → Task 3. §8 (o que não muda) → Task 5. §9 "pronto quando": os oito itens têm teste, exceto "o formato do snapshot não muda", que é garantido por construção (nada toca `tipos-feed.ts`) e conferido no diff. §10 riscos → o do Fire Live está coberto pelo `isNull` da Task 2 e pela origem sem linha na Task 4.

**Placeholder scan.** Um ponto declarado sem código: o encadeamento do cenário de afiliados nos testes das Tasks 3 e 4. É deliberado e está justificado no próprio passo — ele já existe em `servico.test.ts` como `contexto()`, e mandar reescrevê-lo criaria dois cenários divergentes para a mesma coisa. O passo diz de onde copiar e qual a alternativa aceitável.

**Consistência de nomes.** `apitoId` na coluna e `chaveDoApito` na entrada de `registrarSaidaParaCasa` (2 → 3). `apitoDaChave` é interna à Task 2. `trilhaDeSaidas` e `SaidaDaTrilha` (4 → tela da 4). `montarChave` vem do motor e é usada no teste da 2 e na tela da 3 — a mesma função nos dois lados, que é o ponto. O parâmetro da URL é `apito` na rota (3a) e na tela (3b).

**Riscos do plano.** (1) *Resolvido na varredura pré-voo de 15/09:* o helper devolve `linkA`, não `linkCasa`, e o plano já nomeia o certo. A mesma varredura achou três defeitos na Task 4 (a página lê um agregado, não consultas soltas; o recorte tem que vir em `Date` com fim exclusivo; o fuso é o da rodada) — todos corrigidos no texto acima, com o ruling ao lado. (2) A Task 4 faz uma consulta por linha da trilha — aceitável dentro do limite de 200 e preferível a duplicar a regra de dia local em SQL, mas se a trilha crescer, é o primeiro lugar a otimizar. (3) O teste da Task 3 renderiza a tela do apito inteira, que é cara; se ficar lento, o valor está na asserção do `href`, não na semeadura de sete dias — `diasDeHistorico: 1` basta.

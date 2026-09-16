# Planos de assinatura — Plano A: níveis e portões — plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Trocar "pode ou não pode" por "até onde pode": três níveis (`GRATIS`, `MVP`, `ALL_STAR`), o plano grátis vendo o que a spec manda, e cada tela paga com o seu portão — sem tocar no Mercado Pago.

**Architecture:** O nível vira coluna do direito (`direitos_acesso.nivel_do_plano`); `avaliarAcesso` passa a devolver o nível em vez de um booleano, e GRATIS é "logado sem direito ativo" — nenhuma linha nova. Uma guarda só, `exigirNivel(minimo, destino)`, substitui as duas de hoje. A Task 3 troca o contrato em TODOS os chamadores preservando o comportamento (grátis ainda cai em `/assinar`); as Tasks 5–8 entregam a experiência do grátis uma tela por vez, cada uma com o seu teste de matriz. Assim não existe estado intermediário em que o grátis vê conteúdo pago.

**Tech Stack:** Next.js App Router (componentes de servidor), Drizzle + Postgres (Neon em produção, PGlite nos testes), Vitest, `renderToStaticMarkup` para testes de tela.

**Spec:** [`docs/superpowers/specs/2026-09-15-planos-de-assinatura-design.md`](../specs/2026-09-15-planos-de-assinatura-design.md) — este plano cobre §4, §5, §6, §7, §8, a cota de IA por nível e o `/assinar` como página de comparação (§15, Plano A). O Plano B (cobrança, §9–§10) vem depois.

## Global Constraints

- **Regra 4 do `CLAUDE.md` — odds somente leitura.** Nada aqui envia aposta, guarda credencial de casa ou movimenta dinheiro.
- **Nunca escreva "probabilidade" na UI.** O % é nota de confiança. A spec §12 registra o conflito com a lista comercial; este plano escreve "nível de confiança".
- **`nivel` sozinho é proibido** (CLAUDE.md, vocabulário). O tipo é `NivelDoPlano`, a coluna é `nivel_do_plano`, a variável é `nivelDoPlano` ou `acesso.nivel` dentro do resultado de acesso — nunca uma variável solta chamada `nivel`.
- **Nenhum estado intermediário em que o grátis vê conteúdo pago.** A Task 3 preserva o comportamento de hoje; cada tela só passa a renderizar para GRATIS na task que lhe dá o teste de matriz.
- **Nenhum teste nomeia jogador ou time.** Asserção por estrutura; o sujeito é lido do banco.
- **O motor não muda.** Nível do plano não entra em regra de estratégia nem em `src/modules/motor/**`.
- **O painel de afiliados, a trilha de saídas e o formato do snapshot do feed não mudam.**
- **`Nivel` (nível do jogador, motor) e `NivelDoPlano` nunca se misturam.** Se um arquivo precisar dos dois, importe com os nomes completos.
- **Domínio em português; comentário explica a decisão, não o mecanismo.**
- **Um commit só, no final** (preferência do parceiro). As tasks terminam em verificação; a Task 11 commita. Sem push, sem PR.
- **Verificação de cada task:** `npm run typecheck && npm run lint && npm run boundaries` e a suíte do que foi tocado. Uma execução de vitest por vez.
- **Rulings deste plano** (decisões que a spec não fecha, tomadas em 15/09 ao ler o código; a spec vence se contradisser):
  - **R-A1** O checkout legado (um SKU, `MERCADOPAGO_PLANO_*`) continua existindo atrás da flag no Plano A e grava `nivel_do_plano = 'MVP'`, `modalidade = 'MENSAL'`, por uma constante nomeada `NIVEL_DO_CHECKOUT_LEGADO`. É o plano pago de entrada; o Plano B a apaga junto com o checkout legado. Em produção o checkout está desligado, então isso só afeta testes e preview.
  - **R-A2** `modalidade` vai TAMBÉM em `direitos_acesso`, anulável (cortesia não tem modalidade). A spec §4 a põe só em `assinaturas`, mas `ResultadoAcesso` a devolve, e sem a coluna no direito `avaliarAcesso` precisaria de um segundo join. Cortesia grava `null`; o webhook grava a do contrato.
  - **R-A3** As quatro telas de estatísticas passam a exigir login (nível GRATIS). Hoje são públicas porque `ESTATISTICAS_EXIGEM_DIREITO=false` devolve antes de olhar sessão. A spec não tem nível "anônimo": plano grátis é conta, e o cadastro público liga nesta mesma entrega (§7). Se o parceiro quiser estatísticas sem conta, é decisão a registrar na spec, não aqui.
  - **R-A4** Nas seções pagas das estatísticas, o Plano A gateia a RENDERIZAÇÃO; os dados da seção ainda podem ser carregados pelo leitor da tela. É seguro (componente de servidor: o HTML nunca contém a seção) e evita mexer nos leitores. Deixar de carregar é otimização para depois.

---

## Mapa de arquivos

| Arquivo | Responsabilidade | Task |
| --- | --- | --- |
| `src/modules/plataforma/assinatura/nivel-do-plano.ts` (novo) | tipos, ordem, `atende`, `maior`, rótulos — puro | 1 |
| `src/modules/plataforma/assinatura/__tests__/nivel-do-plano.test.ts` (novo) | a ordem | 1 |
| `src/modules/dominio/db/schema/plataforma.ts` | as colunas novas + checks | 2 |
| `drizzle/00NN_<gerado>.sql` + `drizzle/down/` (novos, via `npm run db:generate`) | migration | 2 |
| `assinatura/configuracao.ts` | `NIVEL_DO_CHECKOUT_LEGADO`; apaga `estatisticasExigemDireito` | 2, 3 |
| `assinatura/direito.ts` | `concederCortesia` com nível; `avaliarAcesso` devolve nível | 2, 3 |
| `assinatura/webhook.ts`, `assinatura/checkout.ts` | inserts com as colunas | 2 |
| `scripts/conceder-cortesia.ts`, `scripts/criar-conta-teste.ts` | passam o nível | 2 |
| `assinatura/guarda.ts` | `exigirNivel`; apaga `exigirAcessoEstatisticasSeConfigurado` | 3 |
| `src/modules/plataforma/__tests__/acesso-de-teste.ts` (novo) | `acessoDeTeste(nivel)` para os mocks | 3 |
| 16 chamadores + 14 arquivos de teste com mock | compilam com o contrato novo, comportamento preservado | 3 |
| `src/components/planos/ConviteDoPlano.tsx`, `JogosDoDia.tsx`, `matriz.ts` (novos) | o convite, a lista de jogos do grátis, os benefícios por nível | 4 |
| `src/app/(app)/assinar/page.tsx` | página de comparação; lê `?nivel=` e `?voltar=` | 4 |
| `src/app/(app)/page.tsx` | home do grátis | 5 |
| `src/app/(app)/fire-live/page.tsx` | Fire Live do grátis | 6 |
| `src/app/(app)/estatisticas/{page,jogador/[id]/page,jogo/[id]/page,time/[id]/page}.tsx` | login + seções pagas | 7 |
| `src/app/(app)/gestao/page.tsx`, `gestao/acoes.ts` | só leitura no grátis; a ação recusa | 8 |
| `src/modules/entrega/chat-limites.ts`, `chat.ts`, `chat-contexto.ts`, `chat-prompt.ts`, `src/app/api/chat/route.ts`, `src/components/navegacao/Moldura.tsx` | cota por nível; 403; botão só com nível | 9 |
| `.env.example`, `assinatura/configuracao.ts` | cadastro público liga; env das cotas | 10 |
| tudo | fechamento | 11 |

---

### Task 1: O nível como conceito puro

**Files:**
- Create: `src/modules/plataforma/assinatura/nivel-do-plano.ts`
- Test: `src/modules/plataforma/assinatura/__tests__/nivel-do-plano.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export type NivelDoPlano = 'GRATIS' | 'MVP' | 'ALL_STAR'
  export type NivelPago = 'MVP' | 'ALL_STAR'
  export type Modalidade = 'MENSAL' | 'TEMPORADA'
  export const ORDEM_DOS_NIVEIS: readonly NivelDoPlano[]
  export const NIVEIS_PAGOS: readonly NivelPago[]
  export const ROTULO_DO_NIVEL: Record<NivelDoPlano, string>
  export function atende(nivelDoPlano: NivelDoPlano, minimo: NivelDoPlano): boolean
  export function maior(a: NivelDoPlano, b: NivelDoPlano): NivelDoPlano
  export function ehNivelPago(valor: string): valor is NivelPago
  ```
  Todas as outras tasks importam daqui.

- [ ] **Step 1: Escrever o teste que falha**

`src/modules/plataforma/assinatura/__tests__/nivel-do-plano.test.ts`:

```ts
import { describe, expect, it } from 'vitest'

import {
  atende,
  ehNivelPago,
  maior,
  NIVEIS_PAGOS,
  ORDEM_DOS_NIVEIS,
  ROTULO_DO_NIVEL,
} from '../nivel-do-plano'

describe('a ordem dos níveis é GRATIS < MVP < ALL_STAR', () => {
  it('a ordem está escrita uma vez só, e é esta', () => {
    expect(ORDEM_DOS_NIVEIS).toEqual(['GRATIS', 'MVP', 'ALL_STAR'])
    expect(NIVEIS_PAGOS).toEqual(['MVP', 'ALL_STAR'])
  })

  it('todo nível atende a si mesmo e aos de baixo, nunca aos de cima', () => {
    expect(atende('GRATIS', 'GRATIS')).toBe(true)
    expect(atende('GRATIS', 'MVP')).toBe(false)
    expect(atende('MVP', 'GRATIS')).toBe(true)
    expect(atende('MVP', 'MVP')).toBe(true)
    expect(atende('MVP', 'ALL_STAR')).toBe(false)
    expect(atende('ALL_STAR', 'MVP')).toBe(true)
    expect(atende('ALL_STAR', 'ALL_STAR')).toBe(true)
  })

  it('maior() é comutativo e devolve o de cima', () => {
    expect(maior('MVP', 'ALL_STAR')).toBe('ALL_STAR')
    expect(maior('ALL_STAR', 'MVP')).toBe('ALL_STAR')
    expect(maior('GRATIS', 'MVP')).toBe('MVP')
    expect(maior('MVP', 'MVP')).toBe('MVP')
  })

  it('ehNivelPago reconhece só os dois pagos — e recusa lixo', () => {
    expect(ehNivelPago('MVP')).toBe(true)
    expect(ehNivelPago('ALL_STAR')).toBe(true)
    expect(ehNivelPago('GRATIS')).toBe(false)
    expect(ehNivelPago('mvp')).toBe(false)
    expect(ehNivelPago('')).toBe(false)
  })

  it('os rótulos de tela são os nomes comerciais, não os identificadores', () => {
    // "All Star" com espaço e maiúsculas: é o nome do plano na lista
    // comercial de 15/09. O identificador ALL_STAR nunca aparece na UI.
    expect(ROTULO_DO_NIVEL).toEqual({ GRATIS: 'Grátis', MVP: 'MVP', ALL_STAR: 'All Star' })
  })
})
```

- [ ] **Step 2: Rodar e ver falhar** — `npx vitest run src/modules/plataforma/assinatura/__tests__/nivel-do-plano.test.ts`. Esperado: FAIL — o módulo não existe.

- [ ] **Step 3: Implementar**

`src/modules/plataforma/assinatura/nivel-do-plano.ts`:

```ts
/**
 * O NÍVEL DO PLANO — o único lugar em que a ordem está escrita.
 *
 * Chama-se `NivelDoPlano`, nunca `Nivel`: `Nivel` já é o nível do JOGADOR no
 * motor (MVP · All Star · Suporte · Randola), e o CLAUDE.md proíbe `nivel`
 * sozinho. Os dois vocabulários até compartilham palavras — "MVP", "All
 * Star" — e é exatamente por isso que os tipos não podem se confundir.
 *
 * GRATIS não é um direito no banco: é "logado sem direito ativo". Por isso
 * `NIVEIS_PAGOS` existe separado — é o que pode ser gravado numa linha.
 */
export type NivelDoPlano = 'GRATIS' | 'MVP' | 'ALL_STAR'
export type NivelPago = 'MVP' | 'ALL_STAR'
export type Modalidade = 'MENSAL' | 'TEMPORADA'

export const ORDEM_DOS_NIVEIS: readonly NivelDoPlano[] = ['GRATIS', 'MVP', 'ALL_STAR']
export const NIVEIS_PAGOS: readonly NivelPago[] = ['MVP', 'ALL_STAR']

/** Nomes comerciais, para a tela. O identificador nunca aparece na UI. */
export const ROTULO_DO_NIVEL: Record<NivelDoPlano, string> = {
  GRATIS: 'Grátis',
  MVP: 'MVP',
  ALL_STAR: 'All Star',
}

export function atende(nivelDoPlano: NivelDoPlano, minimo: NivelDoPlano): boolean {
  return ORDEM_DOS_NIVEIS.indexOf(nivelDoPlano) >= ORDEM_DOS_NIVEIS.indexOf(minimo)
}

export function maior(a: NivelDoPlano, b: NivelDoPlano): NivelDoPlano {
  return atende(a, b) ? a : b
}

export function ehNivelPago(valor: string): valor is NivelPago {
  return (NIVEIS_PAGOS as readonly string[]).includes(valor)
}
```

- [ ] **Step 4: Rodar e ver passar** — o mesmo comando. Esperado: PASS, 5 testes.

- [ ] **Step 5: Verificar** — `npm run typecheck && npm run lint && npm run boundaries`. Marcar; **não commitar**.

---

### Task 2: As colunas, a migration e todo lugar que insere

**Files:**
- Modify: `src/modules/dominio/db/schema/plataforma.ts` (blocos `assinaturas`, linhas 116–138, e `direitosAcesso`, linhas 171–204)
- Create: `drizzle/00NN_<nome gerado>.sql` e `drizzle/down/00NN_<mesmo nome>.sql` — **gerados por `npm run db:generate`**, nunca escritos à mão
- Modify: `src/modules/plataforma/assinatura/configuracao.ts` (constante nova)
- Modify: `src/modules/plataforma/assinatura/direito.ts:64-93` (`concederCortesia`)
- Modify: `src/modules/plataforma/assinatura/webhook.ts:132-149` e `:225-247` (os dois inserts)
- Modify: `src/modules/plataforma/assinatura/checkout.ts:88-116` (o insert)
- Modify: `scripts/conceder-cortesia.ts:35-40`, `scripts/criar-conta-teste.ts:47-52`
- Test: `src/modules/plataforma/__tests__/avaliar-acesso.test.ts` (os dois `insert(direitosAcesso)` ganham a coluna; o `concederCortesia` ganha o nível), `src/app/__tests__/telas-05-conta.test.ts` (quatro `insert(assinaturas)` ganham as colunas)

**Interfaces:**
- Consumes: `NivelPago`, `Modalidade` (Task 1).
- Produces:
  - `direitosAcesso.nivelDoPlano: 'MVP' | 'ALL_STAR'` (NOT NULL), `direitosAcesso.modalidade: 'MENSAL' | 'TEMPORADA' | null` (R-A2).
  - `assinaturas.nivelDoPlano` (NOT NULL), `assinaturas.modalidade` (NOT NULL).
  - `concederCortesia(db, { usuarioId, referencia, inicio, fim, nivelDoPlano })` — o campo novo é obrigatório.
  - `NIVEL_DO_CHECKOUT_LEGADO = 'MVP'` e `MODALIDADE_DO_CHECKOUT_LEGADO = 'MENSAL'` em `configuracao.ts` (R-A1).

**Por que tudo numa task:** a coluna nasce NOT NULL. No instante em que ela existe, cada `insert` sem ela é erro de tipo — então schema, migration e inserts são uma mudança só, não três.

- [ ] **Step 1: Schema**

Em `src/modules/dominio/db/schema/plataforma.ts`, bloco `assinaturas`, depois de `plano: text('plano'),`:

```ts
    /**
     * O que foi COMPRADO. `plano` (acima) é a descrição que o provedor
     * devolve — texto livre; estas duas são o contrato na linguagem da NIP.
     * A conta e a reconciliação leem daqui.
     */
    nivelDoPlano: text('nivel_do_plano').notNull(),
    modalidade: text('modalidade').notNull(),
```

e no array de constraints do mesmo bloco (hoje só tem o `index`), acrescente:

```ts
    check('assinaturas_nivel_do_plano_valido', sql`${t.nivelDoPlano} in ('MVP', 'ALL_STAR')`),
    check('assinaturas_modalidade_valida', sql`${t.modalidade} in ('MENSAL', 'TEMPORADA')`),
```

Bloco `direitosAcesso`, depois de `referenciaOrigem: text('referencia_origem').notNull(),`:

```ts
    /**
     * Qual plano este direito representa. NOT NULL e sem GRATIS no check: o
     * grátis nunca tem linha — ele É a ausência de direito ativo. Guardar
     * "GRATIS" aqui seria criar um segundo jeito de dizer a mesma coisa.
     */
    nivelDoPlano: text('nivel_do_plano').notNull(),
    /**
     * Anulável: cortesia não tem modalidade. Vive aqui, e não só no
     * contrato, para `avaliarAcesso` responder com UMA consulta — a mesma
     * razão do LEFT JOIN que já existe nela.
     */
    modalidade: text('modalidade'),
```

e no array de constraints, depois de `direitos_acesso_revogacao_tem_motivo`:

```ts
    check('direitos_acesso_nivel_do_plano_valido', sql`${t.nivelDoPlano} in ('MVP', 'ALL_STAR')`),
    check(
      'direitos_acesso_modalidade_valida',
      sql`${t.modalidade} is null or ${t.modalidade} in ('MENSAL', 'TEMPORADA')`,
    ),
```

Confira que `check` e `sql` já estão importados no arquivo (o bloco `direitosAcesso` já usa os dois).

- [ ] **Step 2: Migration — GERADA, nunca escrita à mão**

**RULING (16/09) — este passo foi REESCRITO depois de um bug real.**

A versão anterior mandava criar os dois arquivos `.sql` à mão. Isso já aconteceu
uma vez, no trabalho de afiliados de 15/09, e produziu um defeito que passou por
cinco revisões sem ser notado: **o arquivo existia, mas não estava em
`drizzle/meta/_journal.json`**. Os dois lados leem de lugares diferentes —

- o arnês de teste (`dominio/__tests__/ajuda-banco.ts`) varre a PASTA com
  `readdirSync`, então aplicava a migration e deixava tudo verde;
- produção (`npm run db:migrate` → `drizzle-kit migrate`) lê o **journal**, então
  ignoraria o arquivo e a coluna nunca existiria;
- `npm run db:status` também lê o journal, e diria "banco em dia" enquanto a
  coluna faltava.

Ou seja: teste verde, produção quebrada em execução, e o diagnóstico mentindo.
Nunca escreva migration à mão neste projeto.

Rode o gerador do projeto, que faz as três coisas de uma vez (SQL, entrada no
journal e o arquivo de descida):

```bash
npm run db:generate
```

Ele lê o schema que você acabou de editar no Step 1, compara com o snapshot do
journal e escreve `drizzle/00NN_<nome-gerado>.sql`, registra a entrada, e então
`scripts/gerar-down.mjs` escreve `drizzle/down/00NN_<mesmo-nome>.sql`. O número e
o nome saem do gerador — não os escolha.

- [ ] **Step 2b: Conferir o que foi gerado**

Três verificações, porque o gerador compara o schema INTEIRO e pode arrastar
junto alguma diferença que você não pretendia:

```bash
git status --short drizzle/          # só os dois arquivos novos, nada mais
cat drizzle/00NN_*.sql               # leia: só as colunas e checks do Step 1
grep -c nivel_do_plano drizzle/meta/_journal.json   # 0 é esperado: o journal
                                     # guarda tags, não SQL — o que importa é a
                                     # entrada nova existir
python3 -c "import json;j=json.load(open('drizzle/meta/_journal.json'));print(j['entries'][-1])"
```

O SQL gerado precisa conter, para as DUAS tabelas, o `ADD COLUMN` de
`nivel_do_plano` e `modalidade` e os quatro `CHECK`. **Se vier algo além disso**
— uma coluna que você não tocou, um índice recriado — pare e me diga: é sinal de
que o schema no repositório já estava fora de sincronia com o journal, e isso é
problema anterior a esta task.

**O default e o DROP DEFAULT.** O gerador escreve `ADD COLUMN ... NOT NULL` sem
default, o que **falha** num banco com linhas (spec §8 exige que direito
existente vire ALL_STAR). Depois de gerar, edite o `.sql` gerado para que cada
`ADD COLUMN ... NOT NULL` vire o par:

```sql
ALTER TABLE "direitos_acesso" ADD COLUMN "nivel_do_plano" text DEFAULT 'ALL_STAR' NOT NULL;--> statement-breakpoint
ALTER TABLE "direitos_acesso" ALTER COLUMN "nivel_do_plano" DROP DEFAULT;--> statement-breakpoint
```

e o mesmo para `assinaturas.nivel_do_plano` (default `'ALL_STAR'`) e
`assinaturas.modalidade` (default `'MENSAL'`). Editar o SQL gerado é permitido;
criar o arquivo do zero não é — a diferença é que aqui a entrada do journal
existe. Depois de editar, rode `node scripts/gerar-down.mjs` de novo para a
descida refletir o arquivo final.

- [ ] **Step 3: A constante do checkout legado (R-A1)**

Em `src/modules/plataforma/assinatura/configuracao.ts`, logo depois de `export const PRODUTO_PAGO = 'NBA_PRO'`:

```ts
import type { Modalidade, NivelPago } from './nivel-do-plano'

/**
 * O QUE O CHECKOUT DE UM SKU SÓ GRAVA — provisório, até o Plano B.
 *
 * Hoje existe um plano, com nome e valor em `MERCADOPAGO_PLANO_*`. Ele
 * continua funcionando atrás da flag enquanto os níveis chegam às telas; e
 * como a coluna do nível é NOT NULL, ele precisa gravar ALGUM. É o plano pago
 * de entrada. Quando o Plano B trouxer os quatro SKUs, estas duas constantes
 * somem junto com o checkout de um SKU só.
 */
export const NIVEL_DO_CHECKOUT_LEGADO: NivelPago = 'MVP'
export const MODALIDADE_DO_CHECKOUT_LEGADO: Modalidade = 'MENSAL'
```

- [ ] **Step 4: `concederCortesia` ganha o nível**

Em `direito.ts`, a assinatura e o insert:

```ts
export async function concederCortesia(
  db: Db,
  entrada: {
    usuarioId: string
    referencia: string
    inicio: Date
    fim: Date | null
    nivelDoPlano: NivelPago
  },
): Promise<string> {
  const [direito] = await db
    .insert(direitosAcesso)
    .values({
      usuarioId: entrada.usuarioId,
      produto: PRODUTO_PAGO,
      origem: 'CORTESIA_ADMIN',
      referenciaOrigem: entrada.referencia,
      inicio: entrada.inicio,
      fim: entrada.fim,
      nivelDoPlano: entrada.nivelDoPlano,
      // Cortesia não tem modalidade: ninguém pagou nada.
      modalidade: null,
      atualizadoEm: entrada.inicio,
    })
    .onConflictDoUpdate({
      target: [direitosAcesso.origem, direitosAcesso.referenciaOrigem, direitosAcesso.produto],
      set: {
        usuarioId: entrada.usuarioId,
        inicio: entrada.inicio,
        fim: entrada.fim,
        nivelDoPlano: entrada.nivelDoPlano,
        revogadoEm: null,
        motivoRevogacao: null,
        atualizadoEm: entrada.inicio,
      },
    })
    .returning({ id: direitosAcesso.id })
  if (!direito) throw new Error('não foi possível conceder cortesia')
  return direito.id
}
```

Acrescente `import type { NivelPago } from './nivel-do-plano'`.

- [ ] **Step 5: Os dois scripts passam o nível**

`scripts/conceder-cortesia.ts` e `scripts/criar-conta-teste.ts`: acrescente `nivelDoPlano: 'ALL_STAR'` ao objeto passado a `concederCortesia`, com o comentário `// Cortesia é para mostrar tudo (spec de planos, decisão 11).` Os dois scripts também leem `acesso.permitido` logo abaixo — isso quebra na Task 3, e é lá que se conserta; nesta task só o argumento.

- [ ] **Step 6: Webhook e checkout gravam as colunas**

`webhook.ts`, insert de `assinaturas` (por volta da linha 133): acrescente `nivelDoPlano: NIVEL_DO_CHECKOUT_LEGADO, modalidade: MODALIDADE_DO_CHECKOUT_LEGADO,` depois de `plano: evento.plano,`. Insert de `direitosAcesso` (por volta da 227): acrescente `nivelDoPlano: NIVEL_DO_CHECKOUT_LEGADO, modalidade: MODALIDADE_DO_CHECKOUT_LEGADO,` depois de `referenciaOrigem: cobrancaId,` — e no `set` do `onConflictDoUpdate` do mesmo insert acrescente `nivelDoPlano: NIVEL_DO_CHECKOUT_LEGADO,`. Importe as duas constantes de `./configuracao`.

`checkout.ts`, insert de `assinaturas` (por volta da linha 90): acrescente as mesmas duas chaves depois de `plano: assinatura.nomePlano,`. Importe as constantes.

- [ ] **Step 7: Os testes que inserem à mão**

`src/modules/plataforma/__tests__/avaliar-acesso.test.ts`: nos dois `banco.db.insert(direitosAcesso).values({...})` acrescente `nivelDoPlano: 'MVP',`; nas duas chamadas a `concederCortesia` acrescente `nivelDoPlano: 'ALL_STAR',`. (As asserções sobre `permitido` continuam iguais nesta task; a Task 3 as reescreve.)

`src/app/__tests__/telas-05-conta.test.ts`: nos quatro `banco.db.insert(assinaturas).values({...})` (linhas 222, 242, 276, 307) acrescente `nivelDoPlano: 'MVP', modalidade: 'MENSAL',`.

- [ ] **Step 8: Provar que sobe e desce** — `npx vitest run src/modules/dominio`. Esperado: PASS — `persistencia.test.ts` sobe todas as migrations, desce a zero e sobe de novo.

- [ ] **Step 9: A suíte de plataforma** — `npx vitest run src/modules/plataforma`. Esperado: PASS. Depois `npx vitest run src/app/__tests__/telas-05-conta.test.ts`. Esperado: PASS.

- [ ] **Step 10: Verificar** — `npm run typecheck && npm run lint && npm run boundaries`. Marcar; **não commitar**.

---

### Task 3: `avaliarAcesso` devolve o nível; `exigirNivel` substitui as guardas; todo chamador compila — comportamento preservado

**Files:**
- Modify: `src/modules/plataforma/assinatura/direito.ts:7-62` (`ResultadoAcesso`, `avaliarAcesso`)
- Modify: `src/modules/plataforma/assinatura/guarda.ts` (inteiro)
- Modify: `src/modules/plataforma/assinatura/configuracao.ts` (apaga `estatisticasExigemDireito`)
- Create: `src/modules/plataforma/__tests__/acesso-de-teste.ts`
- Modify (chamadores): `src/app/(app)/page.tsx:268-271`, `apito/[jogadorId]/page.tsx:229-230`, `fire-live/page.tsx:260-263`, `gestao/page.tsx:249-252`, `resultados/[data]/page.tsx:316-317`, `conta/page.tsx:64-73,155`, `conta/blocos.tsx:354,362`, `assinar/page.tsx:21-24`, `retorno/mercadopago/page.tsx:13-27`, `estatisticas/page.tsx:446`, `estatisticas/jogador/[id]/page.tsx:450`, `estatisticas/jogo/[id]/page.tsx:241`, `estatisticas/time/[id]/page.tsx:273`, `src/app/api/chat/route.ts:62,83`, `src/app/api/push/inscricoes/route.ts:43-49`, `scripts/conceder-cortesia.ts`, `scripts/criar-conta-teste.ts`
- Test: `src/modules/plataforma/__tests__/avaliar-acesso.test.ts` (reescrito), `spec04.test.ts` (8 asserções), `src/app/__tests__/paywall.test.ts` (2 asserções de texto-fonte), e os 13 mocks: `apito-meia-noite`, `escrita-identidade-04`, `resultados-url-invalida`, `telas-04-detalhe`, `telas-04-estatisticas`, `telas-04-firelive`, `telas-04-lista`, `telas-04-resultados`, `telas-05-classificacao`, `telas-05-conta`, `telas-05-gestao`, `telas-demo` (todos em `src/app/__tests__/`), mais `src/app/api/chat/__tests__/rota.test.ts`

**Interfaces:**
- Consumes: Tasks 1 e 2.
- Produces:
  ```ts
  // direito.ts
  export type AcessoComNivel = {
    nivel: NivelDoPlano
    direitoId: string | null
    validoAte: Date | null
    modalidade: Modalidade | null
  }
  export type ResultadoAcesso =
    | AcessoComNivel
    | { nivel: null; motivo: 'sem-sessao' | 'bloqueio-administrativo' }
  export async function avaliarAcesso(db, usuarioId, agora?, produto?): Promise<ResultadoAcesso>

  // guarda.ts
  export type Sessao = NonNullable<Awaited<ReturnType<typeof sessaoAtual>>>
  export async function exigirNivel(
    minimo: NivelDoPlano,
    destino: string,
  ): Promise<{ sessao: Sessao; acesso: AcessoComNivel }>

  // __tests__/acesso-de-teste.ts
  export function acessoDeTeste(nivel: NivelDoPlano): AcessoComNivel
  ```

**A regra desta task:** o comportamento de CADA tela é o mesmo de antes. Quem hoje redireciona o sem-direito para `/assinar` continua redirecionando (agora via `exigirNivel('MVP', …)`); quem hoje deixa passar continua deixando. A experiência do grátis chega nas Tasks 5–8, uma tela por vez, cada uma com teste. O que muda aqui é só o CONTRATO — e o `typecheck` é o que garante que ninguém ficou para trás, porque `permitido` deixa de existir.

- [ ] **Step 1: Reescrever o teste de `avaliarAcesso`**

Substitua o `describe('avaliarAcesso — as quatro respostas')` de `src/modules/plataforma/__tests__/avaliar-acesso.test.ts` por:

```ts
describe('avaliarAcesso — o nível, não um booleano', () => {
  it('sem id de usuário: sem-sessao, sem tocar o banco', async () => {
    expect(await avaliarAcesso(banco.db, null, AGORA)).toEqual({ nivel: null, motivo: 'sem-sessao' })
  })

  it('id que não existe: sem-sessao (nunca GRATIS)', async () => {
    // Um LEFT JOIN sem linha nenhuma tem que virar sem-sessao, não GRATIS:
    // são telas diferentes (entrar × a home do grátis).
    expect(
      await avaliarAcesso(banco.db, '00000000-0000-4000-8000-00000000dead', AGORA),
    ).toEqual({ nivel: null, motivo: 'sem-sessao' })
  })

  it('usuário sem direito: GRATIS — é um nível, não uma recusa', async () => {
    const id = await criarUsuario('gratis@teste.com')
    expect(await avaliarAcesso(banco.db, id, AGORA)).toEqual({
      nivel: 'GRATIS',
      direitoId: null,
      validoAte: null,
      modalidade: null,
    })
  })

  it('usuário com direito MVP vigente: MVP, com o id e a validade do direito', async () => {
    const id = await criarUsuario('mvp@teste.com')
    const fim = new Date(AGORA.getTime() + 86_400_000)
    const [direito] = await banco.db
      .insert(direitosAcesso)
      .values({
        usuarioId: id,
        produto: PRODUTO_PAGO,
        origem: 'CORTESIA',
        referenciaOrigem: 'mvp',
        inicio: new Date(AGORA.getTime() - 1000),
        fim,
        nivelDoPlano: 'MVP',
        modalidade: 'MENSAL',
      })
      .returning({ id: direitosAcesso.id })
    expect(await avaliarAcesso(banco.db, id, AGORA)).toEqual({
      nivel: 'MVP',
      direitoId: direito!.id,
      validoAte: fim,
      modalidade: 'MENSAL',
    })
  })

  it('dois direitos ativos ao mesmo tempo: vale o MAIOR (spec, decisão 3)', async () => {
    // É o instante do upgrade: o novo já nasceu e o antigo ainda não foi
    // revogado. O usuário não pode cair de nível no meio.
    const id = await criarUsuario('upgrade@teste.com')
    await banco.db.insert(direitosAcesso).values([
      {
        usuarioId: id,
        produto: PRODUTO_PAGO,
        origem: 'CORTESIA',
        referenciaOrigem: 'upgrade-mvp',
        inicio: new Date(AGORA.getTime() - 2000),
        fim: null,
        nivelDoPlano: 'MVP',
        modalidade: 'MENSAL',
      },
      {
        usuarioId: id,
        produto: PRODUTO_PAGO,
        origem: 'CORTESIA',
        referenciaOrigem: 'upgrade-all-star',
        inicio: new Date(AGORA.getTime() - 1000),
        fim: null,
        nivelDoPlano: 'ALL_STAR',
        modalidade: 'TEMPORADA',
      },
    ])
    const r = await avaliarAcesso(banco.db, id, AGORA)
    expect(r.nivel).toBe('ALL_STAR')
    expect(r.nivel !== null && r.modalidade).toBe('TEMPORADA')
  })

  it('direito vencido não conta: volta a GRATIS', async () => {
    const id = await criarUsuario('vencido@teste.com')
    await banco.db.insert(direitosAcesso).values({
      usuarioId: id,
      produto: PRODUTO_PAGO,
      origem: 'CORTESIA',
      referenciaOrigem: 'vencido',
      inicio: new Date(AGORA.getTime() - 2000),
      fim: new Date(AGORA.getTime() - 1000),
      nivelDoPlano: 'ALL_STAR',
    })
    expect((await avaliarAcesso(banco.db, id, AGORA)).nivel).toBe('GRATIS')
  })

  it('BLOQUEADO prevalece sobre direito vigente', async () => {
    const id = await criarUsuario('bloqueado@teste.com')
    await banco.db.insert(direitosAcesso).values({
      usuarioId: id,
      produto: PRODUTO_PAGO,
      origem: 'CORTESIA',
      referenciaOrigem: 'bloqueado',
      inicio: new Date(AGORA.getTime() - 1000),
      fim: null,
      nivelDoPlano: 'ALL_STAR',
    })
    await banco.db.update(usuarios).set({ status: 'BLOQUEADO' }).where(eq(usuarios.id, id))
    expect(await avaliarAcesso(banco.db, id, AGORA)).toEqual({
      nivel: null,
      motivo: 'bloqueio-administrativo',
    })
  })
})
```

O `describe('concederCortesia — reexecutar não duplica')` fica, com o `nivelDoPlano: 'ALL_STAR'` que a Task 2 já pôs. Atualize o comentário de cabeçalho do arquivo: eram "quatro respostas"; agora são três motivos de `nivel: null` ou um nível — e a ordem (bloqueio antes de direito) continua sendo regra de negócio.

- [ ] **Step 2: Rodar e ver falhar** — `npx vitest run src/modules/plataforma/__tests__/avaliar-acesso.test.ts`. Esperado: FAIL (e erro de tipo em `r.nivel`).

- [ ] **Step 3: `avaliarAcesso`**

Em `direito.ts`, substitua o tipo e a função:

```ts
import type { Modalidade, NivelDoPlano } from './nivel-do-plano'
import { atende } from './nivel-do-plano'

export type AcessoComNivel = {
  nivel: NivelDoPlano
  direitoId: string | null
  validoAte: Date | null
  modalidade: Modalidade | null
}

export type ResultadoAcesso =
  | AcessoComNivel
  | { nivel: null; motivo: 'sem-sessao' | 'bloqueio-administrativo' }

const GRATIS: AcessoComNivel = { nivel: 'GRATIS', direitoId: null, validoAte: null, modalidade: null }

export async function avaliarAcesso(
  db: Db,
  usuarioId: string | null,
  agora = new Date(),
  produto = PRODUTO_PAGO,
): Promise<ResultadoAcesso> {
  if (!usuarioId) return { nivel: null, motivo: 'sem-sessao' }

  // UMA consulta, não duas. Eram dois SELECTs em sequência (o usuário, depois
  // o direito) e toda tela autenticada pagava os dois. Numa cadeia que
  // atravessa continente — função em iad1, banco em sa-east-1 — cada ida e
  // volta custa ~150ms (ADR-0008).
  //
  // O LEFT JOIN preserva a distinção que importa: sem LINHA é usuário
  // inexistente (sem-sessao, leva a /entrar); linha COM direito nulo é
  // usuário sem assinatura — que agora é um nível, GRATIS, e não uma recusa.
  // Sem `.limit(1)`: com dois direitos ativos (o instante do upgrade) vale o
  // MAIOR, e é o código que escolhe, não a ordem física das linhas.
  const linhas = await db
    .select({
      status: usuarios.status,
      direitoId: direitosAcesso.id,
      fim: direitosAcesso.fim,
      nivelDoPlano: direitosAcesso.nivelDoPlano,
      modalidade: direitosAcesso.modalidade,
    })
    .from(usuarios)
    .leftJoin(
      direitosAcesso,
      and(
        eq(direitosAcesso.usuarioId, usuarios.id),
        eq(direitosAcesso.produto, produto),
        isNull(direitosAcesso.revogadoEm),
        lte(direitosAcesso.inicio, agora),
        or(isNull(direitosAcesso.fim), gt(direitosAcesso.fim, agora)),
      ),
    )
    .where(eq(usuarios.id, usuarioId))

  const primeira = linhas[0]
  if (!primeira) return { nivel: null, motivo: 'sem-sessao' }
  // A ORDEM é regra de negócio (Spec 04, princípio 4): bloqueio administrativo
  // prevalece sobre direito vigente.
  if (primeira.status === 'BLOQUEADO') return { nivel: null, motivo: 'bloqueio-administrativo' }

  let vencedor: AcessoComNivel | null = null
  for (const l of linhas) {
    if (!l.direitoId) continue
    const candidato: AcessoComNivel = {
      nivel: l.nivelDoPlano as NivelDoPlano,
      direitoId: l.direitoId,
      validoAte: l.fim,
      modalidade: (l.modalidade as Modalidade | null) ?? null,
    }
    if (!vencedor || (atende(candidato.nivel, vencedor.nivel) && candidato.nivel !== vencedor.nivel)) {
      vencedor = candidato
    }
  }
  return vencedor ?? GRATIS
}
```

Os `as NivelDoPlano` e `as Modalidade | null` são a fronteira entre `text` no banco e o tipo do domínio; os checks da Task 2 garantem que só esses valores existem.

- [ ] **Step 4: Rodar e ver passar** — o teste de `avaliarAcesso`. Esperado: PASS, 7 + 1.

- [ ] **Step 5: `exigirNivel`; apagar a guarda velha e a flag**

`src/modules/plataforma/assinatura/guarda.ts`, inteiro:

```ts
import { redirect } from 'next/navigation'

import { getDb } from '../../dominio/db/cliente'
import { sessaoAtual } from '../auth/cookies'
import { type AcessoComNivel, avaliarAcesso } from './direito'
import { atende, type NivelDoPlano } from './nivel-do-plano'

export type Sessao = NonNullable<Awaited<ReturnType<typeof sessaoAtual>>>

/**
 * A GUARDA DE NÍVEL — a única, para toda tela.
 *
 * Três saídas, três destinos: sem sessão vai entrar; bloqueado vai para a
 * CONTA, que mostra o status — antes ele caía em /assinar junto com quem não
 * tinha direito, e oferecer plano a quem não pode comprar era erro dos dois
 * lados; nível insuficiente vai para /assinar sabendo QUAL nível e de ONDE
 * veio, para a página destacar o plano certo e o botão voltar funcionar.
 *
 * `minimo: 'GRATIS'` é "só precisa estar logado": a tela renderiza para
 * qualquer nível e decide sozinha o que mostrar.
 */
export async function exigirNivel(
  minimo: NivelDoPlano,
  destino: string,
): Promise<{ sessao: Sessao; acesso: AcessoComNivel }> {
  const sessao = await sessaoAtual()
  if (!sessao) redirect(`/entrar?destino=${encodeURIComponent(destino)}`)
  const acesso = await avaliarAcesso(getDb(), sessao.usuarioId)
  if (acesso.nivel === null) {
    if (acesso.motivo === 'bloqueio-administrativo') redirect('/conta')
    redirect(`/entrar?destino=${encodeURIComponent(destino)}`)
  }
  if (!atende(acesso.nivel, minimo)) {
    redirect(`/assinar?nivel=${minimo}&voltar=${encodeURIComponent(destino)}`)
  }
  return { sessao, acesso }
}
```

`exigirAcessoEstatisticasSeConfigurado` é apagada. Em `configuracao.ts`, apague `estatisticasExigemDireito` do tipo, da leitura de env e do objeto devolvido. Em `spec04.test.ts`, apague `estatisticasExigemDireito: false` (linha 37) e a asserção da linha 116.

- [ ] **Step 6: O helper dos mocks**

`src/modules/plataforma/__tests__/acesso-de-teste.ts`:

```ts
import type { AcessoComNivel } from '../assinatura/direito'
import type { NivelDoPlano } from '../assinatura/nivel-do-plano'

/**
 * O QUE UM MOCK DE `avaliarAcesso` DEVOLVE — num lugar só.
 *
 * Catorze suítes de tela simulam o acesso. Cada uma escrevendo o objeto à
 * mão é como o formato diverge em silêncio: uma esquece `modalidade`, outra
 * devolve `direitoId` para GRATIS, e a tela passa a testar um acesso que o
 * servidor nunca produz. Aqui o formato é o de `avaliarAcesso`, por tipo.
 */
export function acessoDeTeste(nivel: NivelDoPlano): AcessoComNivel {
  return nivel === 'GRATIS'
    ? { nivel, direitoId: null, validoAte: null, modalidade: null }
    : { nivel, direitoId: 'direito-de-teste', validoAte: null, modalidade: 'MENSAL' }
}
```

- [ ] **Step 7: Os chamadores, um a um**

Para cada tela abaixo, o padrão é o mesmo: apague o `import { avaliarAcesso }` e o `import { sessaoAtual }` se só serviam ao portão, importe `exigirNivel` de `@/modules/plataforma/assinatura/guarda`, e substitua o bloco sessão + avaliarAcesso + redirect por uma linha. `sessao` e `acesso` continuam disponíveis com os mesmos nomes.

**Home** (`(app)/page.tsx:268-271`):
```ts
  const { sessao, acesso } = await exigirNivel('MVP', '/')
```
A linha 276 `direitoAtivo: true` fica como está (quem chegou aqui tem MVP ou mais).

**Apito** (`apito/[jogadorId]/page.tsx:229-230`) — confira como a sessão é obtida acima; o resultado tem que ser:
```ts
  const { sessao, acesso } = await exigirNivel('MVP', `/apito/${jogadorId}`)
```
(se a página já tinha `sessao` antes, apague a leitura antiga: `exigirNivel` faz as duas coisas). Se `acesso` não for usado depois, desestruture só `sessao`.

**Fire Live** (`fire-live/page.tsx:260-263`): `const { sessao, acesso } = await exigirNivel('MVP', '/fire-live')`.

**Gestão** (`gestao/page.tsx:249-252`): `const { sessao, acesso } = await exigirNivel('MVP', '/gestao')`.

**Resultados** (`resultados/[data]/page.tsx:316-317`): confira o destino real com `data` na rota; `const { sessao, acesso } = await exigirNivel('MVP', \`/resultados/${data}\`)`. *(Sim, MVP nesta task: é o comportamento de hoje. A Task 5 abre para GRATIS junto com a home — os dois testes de tela nascem juntos.)*

**Conta** (`conta/page.tsx:64-73`): troque `if (!sessao) redirect(...)` por `const { sessao, acesso } = await exigirNivel('GRATIS', '/conta')` e TIRE `avaliarAcesso(db, sessao.usuarioId)` do `Promise.all` (o primeiro item some; ajuste a desestruturação). Na linha 155, `acesso.permitido ? '✓' : '—'` vira `acesso.nivel !== 'GRATIS' ? '✓' : '—'`, e o `rotulo` do `Selo` passa a ser `assinatura ? (assinatura.plano ?? assinatura.status) : ROTULO_DO_NIVEL[acesso.nivel]` — quem não tem contrato é "Grátis", não "SEM PLANO". Importe `ROTULO_DO_NIVEL`.

**Conta, blocos** (`conta/blocos.tsx:354,362`): o tipo da prop `acesso` de `BlocoAssinatura` vira `AcessoComNivel`; `acesso.permitido && acesso.validoAte` vira `acesso.nivel !== 'GRATIS' && acesso.validoAte`; `!acesso.permitido` vira `acesso.nivel === 'GRATIS'`.

**Assinar** (`assinar/page.tsx:21-24`): `const { acesso } = await exigirNivel('GRATIS', '/assinar')` e `if (acesso.nivel !== 'GRATIS') redirect('/')` — comportamento de hoje; a Task 4 muda.

**Retorno** (`retorno/mercadopago/page.tsx:13-15`): `const { acesso } = await exigirNivel('GRATIS', '/conta')`; os três `acesso.permitido` viram `acesso.nivel !== 'GRATIS'`.

**Estatísticas, as quatro** (`estatisticas/page.tsx:446`, `jogador/[id]:450`, `jogo/[id]:241`, `time/[id]:273`): apague a linha `await exigirAcessoEstatisticasSeConfigurado()` e o import. Com a flag em `false` em todo ambiente, a função devolvia antes de olhar qualquer coisa — apagar a chamada preserva o comportamento. A Task 7 põe `exigirNivel('GRATIS', …)` no lugar (R-A3).

**Chat** (`api/chat/route.ts:62,83`): a rota não redireciona. Mantenha `avaliarAcesso`; na 83, `comDireito: acesso.permitido` vira `comDireito: acesso.nivel !== null && acesso.nivel !== 'GRATIS'`. (A Task 9 tira `comDireito` inteiro.)

**Push** (`api/push/inscricoes/route.ts:43-49`): `direitoAtivo: acesso?.permitido ?? false` vira `direitoAtivo: acesso?.nivel != null && atende(acesso.nivel, 'MVP')`. Importe `atende`. Push carrega apito; apito é pago (spec §4).

**Scripts** (`scripts/conceder-cortesia.ts`, `scripts/criar-conta-teste.ts`): `if (!acesso.permitido) throw new Error(\`…: ${acesso.motivo}\`)` vira `if (acesso.nivel === null || acesso.nivel === 'GRATIS') throw new Error(\`…: ${acesso.nivel === null ? acesso.motivo : 'GRATIS'}\`)`.

- [ ] **Step 8: Os mocks, todos**

Nos 13 arquivos de `src/app/__tests__/` listados em **Files** que têm `avaliarAcesso: async () => ({ permitido: true })`, troque o `vi.mock` por:

```ts
vi.mock('../../modules/plataforma/assinatura/direito', async () => {
  const { acessoDeTeste } = await import('../../modules/plataforma/__tests__/acesso-de-teste')
  return { avaliarAcesso: async () => acessoDeTeste('ALL_STAR') }
})
```

O `await import` dentro da fábrica é obrigatório: `vi.mock` é içado acima dos imports do arquivo, e um símbolo importado no topo ainda não existe quando a fábrica roda.

`telas-05-conta.test.ts` tem um mock MUTÁVEL (`let acessoNoTeste`). Troque o tipo e os valores: `let acessoNoTeste: AcessoComNivel = acessoDeTeste('MVP')`; onde era `{ permitido: false }` vira `acessoDeTeste('GRATIS')`; onde era `{ permitido: true, validoAte: null }` vira `acessoDeTeste('MVP')`. Se alguma asserção olha `validoAte` de um `{ permitido: true, validoAte: X }`, monte `{ ...acessoDeTeste('MVP'), validoAte: X }`.

**RULING (16/09, varredura pré-voo) — a lista acima foi CORRIGIDA.** O plano
mandava mexer em `src/modules/ingestao/llm/__tests__/fake.test.ts`; conferido,
ele **não referencia `avaliarAcesso`** (o `permitido` de lá é outra coisa). Não o
toque. Em compensação, faltava `src/app/api/chat/__tests__/rota.test.ts`, que
**tem** `vi.mock` do módulo de acesso — ele entra na lista dos 13, e a Task 9
mexe nele de novo.

Os 13 com `vi.mock` são exatamente estes, conferidos por
`grep -rl "vi.mock.*assinatura/direito" src`: os doze de `src/app/__tests__/`
nomeados acima mais `src/app/api/chat/__tests__/rota.test.ts`.

**Quatro arquivos referenciam `avaliarAcesso` SEM `vi.mock`** e precisam de
tratamento diferente: `paywall.test.ts` e `spec04.test.ts` (asserções, tratadas
abaixo), `avaliar-acesso.test.ts` (reescrito no Step 1) e
**`src/modules/entrega/__tests__/teoria.test.ts`**, que afirma sobre o
TEXTO-FONTE da página de teoria: ela tem que conter `sessaoAtual` e **não** conter
`avaliarAcesso`. Esta task não toca a página de teoria, então o teste continua
verde sozinho — ele está aqui para você não "consertar" o que não quebrou, e
porque é a guarda que impede alguém de pôr um portão numa vitrine que é de
propósito aberta a quem não assina.

`spec04.test.ts`, 8 asserções: `{ permitido: false, motivo: 'sem-direito-ativo' }` (linhas 155, 281, 340) vira `acessoDeTeste('GRATIS')` — importe o helper; `.permitido).toBe(true)` (294, 326, 374, 408) vira `.nivel).toBe('MVP')` — é o que o checkout legado grava (R-A1); `{ permitido: false, motivo: 'bloqueio-administrativo' }` (350) vira `{ nivel: null, motivo: 'bloqueio-administrativo' }`. As duas de `publica.permitido(...)` (514, 517) são da política de push e NÃO mudam.

`paywall.test.ts`, duas asserções de texto-fonte: `fonte.indexOf('if (!acesso.permitido) redirect')` vira `fonte.indexOf("exigirNivel('MVP'")` (a home); e `expect(fonte).toContain('avaliarAcesso')` da página de retorno vira `toContain('exigirNivel')`.

- [ ] **Step 9: Deixar o typecheck achar o resto** — `npm run typecheck`. Esperado: ZERO erros. Se sobrar um `permitido` em algum lugar que este plano não listou, é um chamador que a varredura de 15/09 não viu: conserte pelo mesmo padrão e anote no relatório.

- [ ] **Step 10: A bateria** — `npx vitest run src/modules/plataforma`, depois `npx vitest run src/app/__tests__`, depois `npx vitest run src/modules/ingestao/llm`. Uma por vez. Esperado: PASS em todas — nenhuma tela mudou de comportamento.

- [ ] **Step 11: Verificar** — `npm run typecheck && npm run lint && npm run boundaries && npm run build`. Marcar; **não commitar**.

---

### Task 4: O convite, a lista de jogos e a página de comparação

**Files:**
- Create: `src/components/planos/ConviteDoPlano.tsx`, `src/components/planos/JogosDoDia.tsx`, `src/components/planos/matriz.ts`
- Modify: `src/app/(app)/assinar/page.tsx` (inteiro)
- Test: `src/app/__tests__/planos-assinar.test.tsx` (novo)

**Interfaces:**
- Consumes: Task 1, `exigirNivel` (Task 3), `JogoResumo` de `@/modules/entrega/lista-por-jogo`.
- Produces:
  ```tsx
  // ConviteDoPlano.tsx
  export function ConviteDoPlano(props: { minimo: NivelPago; recurso: string; voltar: string }): JSX.Element
  // JogosDoDia.tsx
  export function JogosDoDia(props: { jogos: JogoResumo[]; fuso: string }): JSX.Element
  // matriz.ts
  export const BENEFICIOS_POR_NIVEL: Record<NivelDoPlano, readonly string[]>
  ```
  As Tasks 5–8 montam `ConviteDoPlano` e `JogosDoDia`.

- [ ] **Step 1: Escrever o teste que falha**

`src/app/__tests__/planos-assinar.test.tsx`:

```tsx
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'

import { ConviteDoPlano } from '../../components/planos/ConviteDoPlano'
import { JogosDoDia } from '../../components/planos/JogosDoDia'
import { BENEFICIOS_POR_NIVEL } from '../../components/planos/matriz'

let nivelNoTeste: 'GRATIS' | 'MVP' | 'ALL_STAR' = 'GRATIS'
vi.mock('../../modules/plataforma/auth/cookies', () => ({
  sessaoAtual: async () => ({ usuarioId: '00000000-0000-4000-8000-000000000001', email: 'x@teste.com' }),
}))
vi.mock('../../modules/plataforma/assinatura/direito', async () => {
  const { acessoDeTeste } = await import('../../modules/plataforma/__tests__/acesso-de-teste')
  return { avaliarAcesso: async () => acessoDeTeste(nivelNoTeste) }
})
vi.mock('../../modules/dominio/db/cliente', () => ({ getDb: () => ({}) }))

describe('ConviteDoPlano', () => {
  it('diz o recurso, o nível que libera, e leva para /assinar com nível e volta', () => {
    const html = renderToStaticMarkup(
      <ConviteDoPlano minimo="MVP" recurso="A Lista Secreta" voltar="/" />,
    )
    expect(html).toContain('A Lista Secreta')
    expect(html).toContain('MVP')
    expect(html).toMatch(/href="\/assinar\?nivel=MVP&(amp;)?voltar=%2F"/)
    expect(html).not.toContain('ALL_STAR')
    expect(html.toLowerCase()).not.toContain('probabilidade')
  })
})

describe('JogosDoDia', () => {
  it('lista cada confronto com as siglas e a hora no fuso — e nada de apito', () => {
    const html = renderToStaticMarkup(
      <JogosDoDia
        fuso="America/Sao_Paulo"
        jogos={[
          {
            id: 'j1',
            casaSigla: 'AAA',
            visitanteSigla: 'BBB',
            dataHoraUtc: new Date('2026-01-15T23:30:00.000Z'),
            status: 'AGENDADO',
            quartoAtual: null,
            placarCasa: null,
            placarVisitante: null,
          },
        ]}
      />,
    )
    expect(html).toContain('AAA')
    expect(html).toContain('BBB')
    expect(html).toContain('20:30') // 23:30Z em Brasília
    expect(html).not.toMatch(/confian|nível do apito|turbo/i)
  })

  it('sem jogos, diz que não há rodada — nunca uma lista vazia muda', () => {
    const html = renderToStaticMarkup(<JogosDoDia fuso="America/Sao_Paulo" jogos={[]} />)
    expect(html).toContain('Sem jogos hoje')
  })
})

describe('a página /assinar como comparação', () => {
  it('lista os três níveis com os benefícios da matriz e destaca o pedido em ?nivel=', async () => {
    nivelNoTeste = 'GRATIS'
    const { default: Pagina } = await import('../(app)/assinar/page')
    const html = renderToStaticMarkup(
      await Pagina({ searchParams: Promise.resolve({ nivel: 'ALL_STAR', voltar: '/fire-live' }) }),
    )
    for (const beneficio of BENEFICIOS_POR_NIVEL.MVP) expect(html).toContain(beneficio)
    for (const beneficio of BENEFICIOS_POR_NIVEL.ALL_STAR) expect(html).toContain(beneficio)
    expect(html).toContain('Grátis')
    expect(html).toContain('All Star')
    expect(html).toMatch(/aria-current="true"[^>]*>[^<]*All Star|All Star[^<]*<[^>]*aria-current="true"/)
    expect(html).toMatch(/href="\/fire-live"/)
    expect(html.toLowerCase()).not.toContain('probabilidade')
  })

  it('quem já tem nível NÃO é redirecionado — a comparação é para todo mundo', async () => {
    nivelNoTeste = 'MVP'
    const { default: Pagina } = await import('../(app)/assinar/page')
    const html = renderToStaticMarkup(await Pagina({ searchParams: Promise.resolve({}) }))
    expect(html).toContain('All Star')
  })
})
```

- [ ] **Step 2: Rodar e ver falhar** — `npx vitest run src/app/__tests__/planos-assinar.test.tsx`. Esperado: FAIL — os componentes não existem.

- [ ] **Step 3: A matriz**

`src/components/planos/matriz.ts` — só o que a plataforma entrega hoje, na letra da spec §5; o que está fora (Telegram, comunidade, lives) entra como benefício LISTADO, marcado, porque a página de planos é a vitrine comercial:

```ts
import type { NivelDoPlano } from '@/modules/plataforma/assinatura/nivel-do-plano'

/**
 * O QUE CADA NÍVEL ENTREGA — a vitrine, escrita uma vez.
 *
 * Os itens marcados com "(em breve)" não são entregues pela plataforma
 * hoje: Telegram é a spec seguinte; comunidade, lives e mentorias acontecem
 * fora do app. Estão aqui porque a lista comercial de 15/09 os promete, e
 * a página de planos é onde a promessa aparece — mas o rótulo diz a
 * verdade. Nunca "probabilidade": o % é nível de confiança (CLAUDE.md).
 */
export const BENEFICIOS_POR_NIVEL: Record<NivelDoPlano, readonly string[]> = {
  GRATIS: [
    'Os jogos de cada rodada',
    'Resultados da noite anterior, com o que bateu',
    'Classificação, times e o resumo de cada jogador',
    'Histórico da sua gestão de banca',
  ],
  MVP: [
    'A Lista Secreta inteira: todos os apitos da rodada',
    'Fire Live: o 1º quarto ao vivo',
    'Base da temporada completa e estatísticas avançadas',
    'Jogo a jogo e números completos de cada jogador',
    'Nível de confiança de cada apito',
    'Gestão de banca com registro das entradas',
    'Alertas de apito no celular',
    'Assistente de IA, com cota diária',
    'Dois filtros de alerta no Telegram (em breve)',
    'Uma live mensal exclusiva (em breve)',
  ],
  ALL_STAR: [
    'Tudo do MVP',
    'Cota ampliada do assistente de IA',
    'Todos os filtros de alerta no Telegram (em breve)',
    'Sala exclusiva na comunidade (em breve)',
    'Lives semanais e uma mentoria coletiva por mês (em breve)',
    'Reprises completas e acesso aos especialistas (em breve)',
    'Acesso antecipado a recursos novos',
    'Suporte prioritário',
  ],
}
```

- [ ] **Step 4: O convite e a lista de jogos**

`src/components/planos/ConviteDoPlano.tsx`:

```tsx
import Link from 'next/link'

import { componente } from '@/design-system/tokens/componente'
import { semantico } from '@/design-system/tokens/semantico'
import { type NivelPago, ROTULO_DO_NIVEL } from '@/modules/plataforma/assinatura/nivel-do-plano'

/**
 * O CONVITE — o que o grátis vê no lugar do que não tem.
 *
 * Nunca uma tela vazia, nunca só um redirecionamento (spec §6): o convite
 * diz o que existe ali e qual nível libera, e leva para /assinar sabendo
 * de onde veio — é o `voltar` que faz o botão de retorno funcionar.
 */
export function ConviteDoPlano({
  minimo,
  recurso,
  voltar,
}: {
  minimo: NivelPago
  recurso: string
  voltar: string
}) {
  const href = `/assinar?nivel=${minimo}&voltar=${encodeURIComponent(voltar)}`
  return (
    <section
      aria-label={`${recurso} começa no plano ${ROTULO_DO_NIVEL[minimo]}`}
      style={{
        marginTop: 18,
        padding: 18,
        borderRadius: 12,
        background: componente.cardFundo,
        border: `1px solid ${semantico.borda}`,
      }}
    >
      <p style={{ margin: 0, fontFamily: semantico.fonteRotulo, letterSpacing: 0.5 }}>
        {recurso} começa no <strong>{ROTULO_DO_NIVEL[minimo]}</strong>
      </p>
      <Link
        href={href}
        style={{
          display: 'inline-block',
          marginTop: 12,
          padding: '10px 16px',
          borderRadius: 10,
          background: componente.ctaFundo,
          color: semantico.textoSobreCor,
          fontWeight: 700,
          textDecoration: 'none',
        }}
      >
        Ver os planos
      </Link>
    </section>
  )
}
```

Confira em `src/design-system/tokens/componente.ts` e `semantico.ts` os nomes exatos dos tokens (`cardFundo`, `borda`, `ctaFundo`, `textoSobreCor`) — use os que existem; se `cardFundo`/`borda` tiverem outro nome, use o do card da Lista Secreta.

`src/components/planos/JogosDoDia.tsx`:

```tsx
import type { JogoResumo } from '@/modules/entrega/lista-por-jogo'
import { semantico } from '@/design-system/tokens/semantico'

/**
 * OS JOGOS DO DIA, SEM O SINAL — a home e o Fire Live do grátis.
 *
 * Mostra que há rodada e quais confrontos; quem apitou, o nível e a
 * confiança são 100% pagos (spec, decisão 5). Recebe o mesmo `JogoResumo`
 * que a home paga usa nos cabeçalhos de seção — nada é lido a mais.
 */
export function JogosDoDia({ jogos, fuso }: { jogos: JogoResumo[]; fuso: string }) {
  if (jogos.length === 0) {
    return <p style={{ color: semantico.textoSecundario }}>Sem jogos hoje.</p>
  }
  const hora = new Intl.DateTimeFormat('pt-BR', { timeZone: fuso, hour: '2-digit', minute: '2-digit' })
  return (
    <ul style={{ listStyle: 'none', margin: '16px 0 0', padding: 0, display: 'grid', gap: 8 }}>
      {jogos.map((j) => (
        <li
          key={j.id}
          style={{ display: 'flex', justifyContent: 'space-between', fontFamily: semantico.fonteRotulo }}
        >
          <span>
            {j.casaSigla} × {j.visitanteSigla}
          </span>
          <span style={{ color: semantico.textoSecundario }}>
            {j.status === 'AO_VIVO' && j.placarCasa !== null && j.placarVisitante !== null
              ? `${j.placarCasa}–${j.placarVisitante} · Q${j.quartoAtual ?? '–'}`
              : hora.format(j.dataHoraUtc)}
          </span>
        </li>
      ))}
    </ul>
  )
}
```

Confira o valor exato do status ao vivo em `StatusJogo` (`src/modules/dominio/…`): o Fire Live usa `'AO_VIVO'` (visto em `fire-live/page.tsx:375`). Se o enum tiver outro nome, use o dele.

- [ ] **Step 5: A página `/assinar`**

Reescreva `src/app/(app)/assinar/page.tsx`. A regra: quem chega vê os três níveis lado a lado; `?nivel=` destaca um; `?voltar=` vira o link de retorno; e o bloco legado (preço único + botão) continua exatamente como está, atrás de `checkoutHabilitado`, abaixo da comparação — o Plano B o substitui.

```tsx
import Link from 'next/link'

import { MolduraConta } from '@/components/conta/MolduraConta'
import { BENEFICIOS_POR_NIVEL } from '@/components/planos/matriz'
import { componente } from '@/design-system/tokens/componente'
import { semantico } from '@/design-system/tokens/semantico'
import { configuracaoProdutoPago } from '@/modules/plataforma/assinatura/configuracao'
import { exigirNivel } from '@/modules/plataforma/assinatura/guarda'
import {
  ehNivelPago,
  ORDEM_DOS_NIVEIS,
  ROTULO_DO_NIVEL,
} from '@/modules/plataforma/assinatura/nivel-do-plano'
import { contratar } from './acoes'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Planos' }

/** Só caminhos internos voltam: um `voltar=https://…` seria redirecionamento aberto. */
function caminhoDeVolta(bruto: string | string[] | undefined): string {
  const valor = Array.isArray(bruto) ? bruto[0] : bruto
  return valor && valor.startsWith('/') && !valor.startsWith('//') ? valor : '/'
}

export default async function PaginaAssinar({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  // GRATIS: a comparação é para todo mundo, inclusive quem já paga e quer
  // ver o de cima. Não há mais redirect de quem tem direito.
  const { acesso } = await exigirNivel('GRATIS', '/assinar')
  const config = configuracaoProdutoPago()
  const parametros = await searchParams
  const pedido = Array.isArray(parametros.nivel) ? parametros.nivel[0] : parametros.nivel
  const destacado = pedido && ehNivelPago(pedido) ? pedido : null
  const voltar = caminhoDeVolta(parametros.voltar)
  const erro = Array.isArray(parametros.erro) ? parametros.erro[0] : parametros.erro

  return (
    <MolduraConta titulo="Planos" descricao="O que cada nível da NIP entrega.">
      <div style={{ display: 'grid', gap: 18 }}>
        <p style={{ margin: 0, color: semantico.textoSecundario }}>
          Você está no plano <strong>{ROTULO_DO_NIVEL[acesso.nivel]}</strong>.{' '}
          <Link href={voltar}>Voltar</Link>
        </p>
        <div style={{ display: 'grid', gap: 14 }}>
          {ORDEM_DOS_NIVEIS.map((nivelDoPlano) => (
            <section
              key={nivelDoPlano}
              aria-current={nivelDoPlano === destacado ? 'true' : undefined}
              style={{
                padding: 16,
                borderRadius: 12,
                border: `2px solid ${nivelDoPlano === destacado ? componente.ctaFundo : semantico.borda}`,
              }}
            >
              <h2 style={{ margin: '0 0 8px', fontFamily: semantico.fonteTitulo }}>
                {ROTULO_DO_NIVEL[nivelDoPlano]}
              </h2>
              <ul style={{ margin: 0, paddingLeft: 20, lineHeight: 1.8 }}>
                {BENEFICIOS_POR_NIVEL[nivelDoPlano].map((b) => (
                  <li key={b}>{b}</li>
                ))}
              </ul>
            </section>
          ))}
        </div>

        {/* O checkout de UM SKU, como era. Fica atrás da flag até o Plano B
            trazer os quatro SKUs com preço; em produção a flag está
            desligada, então este bloco não aparece. */}
        {erro && (
          <p role="alert" style={{ margin: 0, color: semantico.alerta }}>
            {erro === 'limite'
              ? 'Muitas tentativas. Aguarde alguns minutos.'
              : 'O checkout está temporariamente indisponível.'}
          </p>
        )}
        {config.checkoutHabilitado && acesso.nivel === 'GRATIS' ? (
          <form action={contratar}>
            <p style={{ margin: '0 0 8px' }}>
              <strong style={{ fontSize: 24 }}>
                {(config.valorCentavos / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
              </strong>
              <span style={{ color: semantico.textoSecundario }}> / mês · {config.nomePlano}</span>
            </p>
            <button
              type="submit"
              style={{
                width: '100%',
                border: 0,
                borderRadius: 10,
                padding: 13,
                background: componente.ctaFundo,
                color: semantico.textoSobreCor,
                fontFamily: semantico.fonteTitulo,
                letterSpacing: 0.5,
                textTransform: 'uppercase',
                fontWeight: 700,
                cursor: 'pointer',
              }}
            >
              Continuar no Mercado Pago
            </button>
          </form>
        ) : (
          <p style={{ margin: 0, color: semantico.textoSecundario }}>
            A contratação pelo app chega em breve. Enquanto isso, fale com quem administra a sua conta.
          </p>
        )}
        <Link href="/conta" style={{ color: semantico.textoSecundario, fontSize: 13 }}>
          Ver minha conta
        </Link>
      </div>
    </MolduraConta>
  )
}
```

`config.nomePlano` e `config.valorCentavos` podem estar vazios em ambiente sem checkout — `configuracaoProdutoPago` já trata isso hoje (confira: se ela lança quando a flag está desligada e os valores faltam, mantenha o mesmo comportamento da página atual, que também a chama).

- [ ] **Step 6: Rodar e ver passar** — `npx vitest run src/app/__tests__/planos-assinar.test.tsx`. Esperado: PASS, 5 testes.

- [ ] **Step 7: A suíte das telas** — `npx vitest run src/app/__tests__`. Esperado: PASS. Se `telas-05-conta` ou outra suíte afirmava que `/assinar` redireciona quem tem direito, essa asserção mudou de propósito — atualize-a para afirmar a comparação.

- [ ] **Step 8: Verificar** — `npm run typecheck && npm run lint && npm run boundaries && npm run build`. Marcar; **não commitar**.

---

### Task 5: A home e os resultados do grátis

**Files:**
- Modify: `src/app/(app)/page.tsx:268-271` (o portão) e o ponto antes de `await lerFeed` (linha ~303)
- Modify: `src/app/(app)/resultados/[data]/page.tsx:316` (o portão vira GRATIS)
- Test: `src/app/__tests__/planos-home.test.ts` (novo), `paywall.test.ts` (a asserção de ordem)

**Interfaces:**
- Consumes: `exigirNivel`, `atende`, `ConviteDoPlano`, `JogosDoDia`.
- Produces: nenhum símbolo novo.

- [ ] **Step 1: Escrever o teste que falha**

`src/app/__tests__/planos-home.test.ts` — o arnês de `telas-04-lista.test.ts` (banco semeado por `simularAte`, mocks de sessão e de acesso), com o mock de acesso MUTÁVEL para render como GRATIS e como MVP no mesmo arquivo:

```ts
import { renderToStaticMarkup } from 'react-dom/server'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

import { bancoDeTeste } from '../../modules/dominio/__tests__/ajuda-banco'
import { usuarios } from '../../modules/dominio/db/schema'
import { dataDeReferencia } from '../../modules/dominio/rodada'
import { rulesetAtivo } from '../../modules/entrega/ruleset-ativo'
import { simularAte } from '../../modules/ingestao/demo/temporada'
import { LLMFake } from '../../modules/ingestao/llm'
import type { NivelDoPlano } from '../../modules/plataforma/assinatura/nivel-do-plano'

const AGORA = new Date('2026-01-15T18:00:00.000Z')
const USUARIO = '00000000-0000-4000-8000-000000000001'
let banco: Awaited<ReturnType<typeof bancoDeTeste>>
let nivelNoTeste: NivelDoPlano = 'GRATIS'

vi.mock('../../modules/plataforma/auth/cookies', () => ({
  sessaoAtual: async () => ({ usuarioId: USUARIO, email: 'demo@teste.com' }),
}))
vi.mock('../../modules/plataforma/assinatura/direito', async () => {
  const { acessoDeTeste } = await import('../../modules/plataforma/__tests__/acesso-de-teste')
  return { avaliarAcesso: async () => acessoDeTeste(nivelNoTeste) }
})
vi.mock('../../modules/dominio/db/cliente', () => ({ getDb: () => banco.db, fecharDb: async () => {} }))

beforeAll(async () => {
  vi.stubEnv('DATABASE_URL', 'postgres://teste-local')
  banco = await bancoDeTeste()
  await simularAte(banco.db, await rulesetAtivo(), AGORA, { diasDeHistorico: 2, llm: new LLMFake() })
  await banco.db.insert(usuarios).values({ id: USUARIO, email: 'demo@teste.com', senhaHash: 'x' }).onConflictDoNothing()
}, 180_000)
afterAll(async () => {
  vi.unstubAllEnvs()
  await banco.fechar()
})

async function renderizarHome() {
  const { default: Pagina } = await import('../(app)/page')
  return renderToStaticMarkup(await Pagina({ searchParams: Promise.resolve({}) }))
}

describe('a home por nível (spec §5, linha 1)', () => {
  it('GRATIS vê os jogos do dia e o convite — e NENHUM apito', async () => {
    nivelNoTeste = 'GRATIS'
    const { lerFeed } = await import('../../modules/entrega/lista-secreta')
    const ruleset = await rulesetAtivo()
    const feed = await lerFeed(banco.db, dataDeReferencia(AGORA, ruleset.rodada.fuso))
    const { jogosDoDiaResumo } = await import('../../modules/entrega/lista-por-jogo')
    const jogos = await jogosDoDiaResumo(banco.db, dataDeReferencia(AGORA, ruleset.rodada.fuso), ruleset.rodada.fuso)
    expect(feed!.conteudo.itens.length).toBeGreaterThan(0)
    expect(jogos.length).toBeGreaterThan(0)

    const html = await renderizarHome()
    // Os confrontos estão lá — o sujeito vem do banco, nunca de um nome fixo.
    expect(html).toContain(jogos[0]!.casaSigla)
    // O sinal NÃO está: nem o nome de quem apitou, nem a confiança, nem o card.
    for (const item of feed!.conteudo.itens) expect(html).not.toContain(item.nome)
    expect(html).not.toMatch(/confian[çc]a/i)
    expect(html).not.toContain('href="/apito/')
    expect(html).toContain('começa no')
    expect(html).toMatch(/href="\/assinar\?nivel=MVP/)
    expect(html.toLowerCase()).not.toContain('probabilidade')
  })

  it('MVP vê a Lista inteira', async () => {
    nivelNoTeste = 'MVP'
    const html = await renderizarHome()
    expect(html).toContain('href="/apito/')
    expect(html).not.toContain('começa no')
  })
})
```

Conferido em 15/09: o nome do jogador em `ItemFeed` é o campo `nome` (`src/modules/entrega/tipos-feed.ts:27`).

- [ ] **Step 2: Rodar e ver falhar** — `npx vitest run src/app/__tests__/planos-home.test.ts`. Esperado: FAIL — o GRATIS é redirecionado (a `redirect()` do Next lança em teste) em vez de renderizar.

- [ ] **Step 3: A home**

Em `src/app/(app)/page.tsx`, troque `exigirNivel('MVP', '/')` por `exigirNivel('GRATIS', '/')` e, DEPOIS do `Promise.all` que lê `jogosDoDia` (linha ~289-293) e ANTES de `await lerFeed` (linha ~303), insira:

```tsx
  // O GRÁTIS PARA AQUI — antes de qualquer leitura do snapshot pago. Vê a
  // rodada (siglas, horário, status) e o convite; o sinal é 100% MVP (spec,
  // decisão 5). Nada do feed entra nesta renderização.
  if (!atende(acesso.nivel, 'MVP')) {
    return (
      <Moldura aba="lista">
        <CabecalhoTela sobrancelha={SOBRANCELHA} titulo="LISTA SECRETA" />
        <JogosDoDia jogos={jogosDoDia} fuso={fuso} />
        <ConviteDoPlano minimo="MVP" recurso="A Lista Secreta" voltar="/" />
      </Moldura>
    )
  }
```

Use o mesmo `sobrancelha`/`titulo` que o `CabecalhoTela` da renderização paga usa (linha ~415) — leia-os de lá. Importe `atende`, `JogosDoDia`, `ConviteDoPlano`. A linha `direitoAtivo: true` do push (linha ~276) continua correta: quem passa do `if` tem MVP.

`paywall.test.ts`: a asserção de ordem vira `sessao = fonte.indexOf("exigirNivel('GRATIS'")`, `direito = fonte.indexOf("atende(acesso.nivel, 'MVP')")`, `feed = fonte.indexOf('await lerFeed')`, mantendo `sessao < direito < feed` — a spec do teste ("fecha o feed antes de consultar o snapshot pago") continua verdadeira, e agora com o nome certo.

- [ ] **Step 4: Resultados abre para o grátis** — em `resultados/[data]/page.tsx`, `exigirNivel('MVP', …)` vira `exigirNivel('GRATIS', …)`. Nada mais muda: a tela é inteira para todo nível (spec, decisão 9). Acrescente ao `planos-home.test.ts` um terceiro `it`:

```ts
  it('Resultados é inteiro para o GRATIS — a prova social (decisão 9)', async () => {
    nivelNoTeste = 'GRATIS'
    const { ultimaRodadaConferida } = await import('../../modules/entrega/resultados')
    const data = await ultimaRodadaConferida(banco.db)
    const { default: Pagina } = await import('../(app)/resultados/[data]/page')
    const html = renderToStaticMarkup(
      await Pagina({ params: Promise.resolve({ data: data! }), searchParams: Promise.resolve({}) }),
    )
    expect(html).not.toContain('começa no')
    expect(html).toContain('href="/apito/')
  })
```

Confira a assinatura real de `ultimaRodadaConferida` e da página em `telas-04-resultados.test.ts`, e reproduza o que ele faz para chegar a uma rodada com conferência.

- [ ] **Step 5: Rodar e ver passar** — `npx vitest run src/app/__tests__/planos-home.test.ts`, depois `npx vitest run src/app/__tests__` inteira. Esperado: PASS.

- [ ] **Step 6: Verificar** — `npm run typecheck && npm run lint && npm run boundaries && npm run build`. Marcar; **não commitar**.

---

### Task 6: O Fire Live do grátis

**Files:**
- Modify: `src/app/(app)/fire-live/page.tsx:260-263` e o ponto antes da leitura do feed (linha ~272)
- Test: `src/app/__tests__/planos-fire-live.test.ts` (novo)

**Interfaces:**
- Consumes: `exigirNivel`, `atende`, `ConviteDoPlano`, `JogosDoDia`, `jogosDoDiaResumo`.

- [ ] **Step 1: Escrever o teste que falha** — o mesmo arnês de `telas-04-firelive.test.ts` (que semeia um dia com jogo ao vivo; copie o `beforeAll` de lá), com o mock de acesso mutável do padrão da Task 5:

```ts
describe('o Fire Live por nível (spec §5, linha 3)', () => {
  it('GRATIS vê os jogos e o convite — nunca um apito nem o modo fire', async () => {
    nivelNoTeste = 'GRATIS'
    const { default: Pagina } = await import('../(app)/fire-live/page')
    const html = renderToStaticMarkup(await Pagina({ searchParams: Promise.resolve({}) }))
    expect(html).toContain('começa no')
    expect(html).toMatch(/href="\/assinar\?nivel=MVP&(amp;)?voltar=%2Ffire-live"/)
    expect(html).not.toContain('href="/apito/')
    expect(html).not.toMatch(/modo fire|MODO FIRE/)
    expect(html).not.toMatch(/confian[çc]a/i)
  })

  it('MVP vê o painel do 1º quarto', async () => {
    nivelNoTeste = 'MVP'
    const { default: Pagina } = await import('../(app)/fire-live/page')
    const html = renderToStaticMarkup(await Pagina({ searchParams: Promise.resolve({}) }))
    expect(html).not.toContain('começa no')
  })
})
```

Confira a assinatura real de `Pagina` em `telas-04-firelive.test.ts` (ela pode receber `searchParams` com `jogo`).

- [ ] **Step 2: Rodar e ver falhar** — `npx vitest run src/app/__tests__/planos-fire-live.test.ts`. Esperado: FAIL — GRATIS é redirecionado.

- [ ] **Step 3: Implementar** — em `fire-live/page.tsx`, `exigirNivel('MVP', '/fire-live')` vira `exigirNivel('GRATIS', '/fire-live')`, e logo depois de `const hoje = dataDeReferencia(agora, fuso)` (antes do `Promise.all` que lê `lerFeedFireLive`):

```tsx
  // O GRÁTIS PARA AQUI, antes do snapshot do Fire Live. Vê os jogos — ao
  // vivo, com placar e quarto, se houver — e o convite. O apito de modo fire
  // é MVP (spec, decisão 6).
  if (!atende(acesso.nivel, 'MVP')) {
    const jogos = await jogosDoDiaResumo(getDb(), hoje, fuso)
    return (
      <Moldura aba="fire-live">
        <CabecalhoTela sobrancelha={SOBRANCELHA} titulo="FIRE LIVE" />
        <JogosDoDia jogos={jogos} fuso={fuso} />
        <ConviteDoPlano minimo="MVP" recurso="O Fire Live" voltar="/fire-live" />
      </Moldura>
    )
  }
```

Leia `sobrancelha`/`titulo` do `CabecalhoTela` da renderização paga (linha ~323). Importe `jogosDoDiaResumo` de `@/modules/entrega/lista-por-jogo`.

- [ ] **Step 4: Rodar e ver passar** — o teste novo, depois `npx vitest run src/app/__tests__/telas-04-firelive.test.ts`. Esperado: PASS nos dois.

- [ ] **Step 5: Verificar** — `npm run typecheck && npm run lint && npm run boundaries`. Marcar; **não commitar**.

---

### Task 7: Estatísticas — login para todos, profundidade para MVP

**Files:**
- Modify: `src/app/(app)/estatisticas/page.tsx:446`, `jogador/[id]/page.tsx:450` e `:723-760`, `jogo/[id]/page.tsx:241` e `:284-362`, `time/[id]/page.tsx:273` e `:324-400`
- Test: `src/app/__tests__/planos-estatisticas.test.ts` (novo)

**Interfaces:**
- Consumes: `exigirNivel`, `atende`, `ConviteDoPlano`, `Secao` (de `../moldura`).

**A régua (spec, decisão 10 e §5):** grátis vê o resumo; profundidade é MVP. Jogador: "Jogo a jogo", "Números completos", "Apitos da estratégia". Jogo: "Box score" (os dois lados) e "Confrontos anteriores". Time: "Box score por jogo". Classificação: inteira. R-A3: as quatro páginas passam a exigir login. R-A4: gateia-se a renderização; o carregamento dos dados pode ficar como está.

- [ ] **Step 1: Escrever o teste que falha** — arnês de `telas-04-estatisticas.test.ts` (copie o `beforeAll` e o modo como ele escolhe um jogador, um jogo e um time reais do banco), mock de acesso mutável:

```ts
function trecho(html: string, de: string, ate: string): string {
  const i = html.indexOf(de)
  const f = html.indexOf(ate, i)
  if (i < 0 || f < 0) throw new Error(`trecho não encontrado: ${de} … ${ate}`)
  return html.slice(i, f)
}

describe('estatísticas por nível (spec §5, linhas 5-6)', () => {
  it('GRATIS: o jogador tem o resumo, e as três seções fundas viram convite', async () => {
    nivelNoTeste = 'GRATIS'
    const html = await renderizarJogador(jogadorId)
    expect(html).toContain('ATAQUE')
    for (const secao of ['JOGO A JOGO', 'NÚMEROS COMPLETOS', 'APITOS DA ESTRATÉGIA']) {
      expect(html).toContain(secao)
    }
    expect(trecho(html, 'JOGO A JOGO', 'NÚMEROS COMPLETOS')).not.toContain('<table')
    expect(trecho(html, 'JOGO A JOGO', 'NÚMEROS COMPLETOS')).toContain('começa no')
    expect(trecho(html, 'NÚMEROS COMPLETOS', 'Última atualização')).toContain('começa no')
  })

  it('MVP: as três seções fundas têm conteúdo e nenhum convite', async () => {
    nivelNoTeste = 'MVP'
    const html = await renderizarJogador(jogadorId)
    expect(trecho(html, 'JOGO A JOGO', 'NÚMEROS COMPLETOS')).toContain('<table')
    expect(html).not.toContain('começa no')
  })

  it('GRATIS: o jogo tem líderes e desfalques; box score e confrontos viram convite', async () => {
    nivelNoTeste = 'GRATIS'
    const html = await renderizarJogo(jogoId)
    expect(html).toContain('LÍDERES DA PARTIDA')
    expect(trecho(html, 'BOX SCORE', 'CONFRONTOS ANTERIORES')).not.toContain('<table')
    expect(trecho(html, 'BOX SCORE', 'CONFRONTOS ANTERIORES')).toContain('começa no')
  })

  it('GRATIS: o time tem campanha e elenco; box score por jogo vira convite', async () => {
    nivelNoTeste = 'GRATIS'
    const html = await renderizarTime(timeId)
    expect(html).toContain('CAMPANHA')
    expect(html).toContain('ELENCO')
    expect(trecho(html, 'BOX SCORE POR JOGO', 'ELENCO')).not.toContain('<table')
    expect(trecho(html, 'BOX SCORE POR JOGO', 'ELENCO')).toContain('começa no')
  })

  it('a classificação é inteira para o GRATIS', async () => {
    nivelNoTeste = 'GRATIS'
    const html = await renderizarClassificacao()
    expect(html).toContain('<table')
    expect(html).not.toContain('começa no')
  })
})
```

Os títulos das seções aparecem em MAIÚSCULAS no HTML porque `Secao` os renderiza assim (confira em `moldura.tsx`; se for por CSS e não por texto, use a caixa do texto-fonte). Os helpers `renderizarJogador/Jogo/Time/Classificacao` seguem `telas-04-estatisticas.test.ts`.

- [ ] **Step 2: Rodar e ver falhar** — `npx vitest run src/app/__tests__/planos-estatisticas.test.ts`. Esperado: FAIL — as seções fundas renderizam para GRATIS.

- [ ] **Step 3: Login nas quatro páginas** — no lugar onde a Task 3 apagou `exigirAcessoEstatisticasSeConfigurado()`, insira `const { acesso } = await exigirNivel('GRATIS', <destino>)` com o destino real de cada página (`/estatisticas`, `` `/estatisticas/jogador/${id}` `` etc.). Na classificação, `acesso` não é usado — desestruture nada: `await exigirNivel('GRATIS', '/estatisticas')`.

- [ ] **Step 4: As seções fundas** — em cada página, `const profundidade = atende(acesso.nivel, 'MVP')` e, em cada `<Secao>` da régua, o conteúdo vira condicional. Jogador:

```tsx
      <Secao titulo="Apitos da estratégia" aux={profundidade ? resumoDosApitos(apitos, truncado) : undefined}>
        {!profundidade ? (
          <ConviteDoPlano minimo="MVP" recurso="O histórico de apitos" voltar={`/estatisticas/jogador/${id}`} />
        ) : apitos.length === 0 ? (
          /* …o que já existe… */
        ) : (
          /* …o que já existe… */
        )}
      </Secao>

      <Secao titulo="Jogo a jogo" aux={profundidade ? recorte : undefined}>
        {profundidade ? (
          <Tabela … />
        ) : (
          <ConviteDoPlano minimo="MVP" recurso="O jogo a jogo" voltar={`/estatisticas/jogador/${id}`} />
        )}
      </Secao>

      <Secao titulo="Números completos" aux={profundidade ? `${recorte} · médias de jogo inteiro` : undefined}>
        {profundidade ? (
          <NumerosCompletos n={tela.perfilNumeros} />
        ) : (
          <ConviteDoPlano minimo="MVP" recurso="Os números completos" voltar={`/estatisticas/jogador/${id}`} />
        )}
      </Secao>
```

O `aux` some no grátis de propósito: ele diz o recorte de um conteúdo que não está lá. Jogo: as duas `Secao` de "Box score" (a por lado e a única) e "Confrontos anteriores" seguem o mesmo padrão — um `ConviteDoPlano` para o par de box scores, não dois. Time: "Box score por jogo". Use `id` do jogo/time nos `voltar`.

- [ ] **Step 5: Rodar e ver passar** — o teste novo, depois `npx vitest run src/app/__tests__/telas-04-estatisticas.test.ts` e `telas-05-classificacao.test.ts` (os dois mockam acesso como ALL_STAR desde a Task 3, então continuam vendo tudo). Esperado: PASS.

- [ ] **Step 6: Verificar** — `npm run typecheck && npm run lint && npm run boundaries && npm run build`. Marcar; **não commitar**.

---

### Task 8: A gestão do grátis é só leitura — e a ação recusa

**Files:**
- Modify: `src/app/(app)/gestao/page.tsx:249-252` e o bloco `{ver === 'sugeridas' && (…)}` (linha ~325)
- Modify: `src/app/(app)/gestao/acoes.ts:23-34` (`registrarEntrada`)
- Test: `src/app/__tests__/planos-gestao.test.ts` (novo), `src/app/__tests__/gestao-acoes.test.ts` (um caso a mais)

**Interfaces:**
- Consumes: `exigirNivel`, `atende`, `ConviteDoPlano`.

**Por que a ação também:** um formulário escondido não é portão. Quem tem GRATIS pode dar POST direto em `registrarEntrada` com os campos certos; se a ação não checar o nível, o grátis registra entrada por fora da tela. Portão de escrita é no servidor, sempre.

- [ ] **Step 1: Escrever os testes que falham**

`src/app/__tests__/planos-gestao.test.ts`, arnês de `telas-05-gestao.test.ts` (que semeia entradas realizadas para o usuário), mock de acesso mutável:

```ts
describe('a gestão por nível (spec §5, linha 7)', () => {
  it('GRATIS em ?ver=sugeridas: o convite no lugar das sugestões, sem formulário', async () => {
    nivelNoTeste = 'GRATIS'
    const html = await renderizarGestao({ ver: 'sugeridas' })
    expect(html).toContain('começa no')
    expect(html).not.toContain('name="unidades"')
    expect(html).not.toMatch(/<form[^>]*action=/)
  })

  it('GRATIS em ?ver=realizadas: o histórico aparece como sempre', async () => {
    nivelNoTeste = 'GRATIS'
    const html = await renderizarGestao({ ver: 'realizadas' })
    expect(html).toContain('Realizadas')
    // A linha semeada está lá — o sujeito é lido do banco pelo arnês.
    expect(html).toContain(entradaSemeada.unidadesEmTexto)
  })

  it('MVP em ?ver=sugeridas: as sugestões e o formulário', async () => {
    nivelNoTeste = 'MVP'
    const html = await renderizarGestao({ ver: 'sugeridas' })
    expect(html).not.toContain('começa no')
    expect(html).toContain('name="unidades"')
  })
})
```

`entradaSemeada.unidadesEmTexto` é o que `telas-05-gestao.test.ts` já afirma na aba realizadas — reaproveite a mesma asserção.

Em `gestao-acoes.test.ts`, um caso a mais, no padrão dos que já existem (eles mockam `sessaoAtual` e chamam `registrarEntrada` com um `FormData`):

```ts
  it('GRATIS não registra: a ação redireciona para os planos e não grava nada', async () => {
    nivelNoTeste = 'GRATIS'
    const antes = await banco.db.select().from(entradasRealizadas)
    await expect(registrarEntrada(formularioValido())).rejects.toThrow(/NEXT_REDIRECT/)
    const depois = await banco.db.select().from(entradasRealizadas)
    expect(depois.length).toBe(antes.length)
  })
```

`redirect()` do Next lança um erro cuja mensagem contém `NEXT_REDIRECT`; confira como os casos existentes do arquivo afirmam redirecionamento e siga o mesmo jeito. O arquivo precisa do mock de acesso mutável (a ação passa a chamar `avaliarAcesso`).

- [ ] **Step 2: Rodar e ver falhar** — `npx vitest run src/app/__tests__/planos-gestao.test.ts`, depois `gestao-acoes.test.ts`. Esperado: FAIL nos dois.

- [ ] **Step 3: A tela** — `exigirNivel('MVP', '/gestao')` vira `exigirNivel('GRATIS', '/gestao')`; `const registra = atende(acesso.nivel, 'MVP')`. No bloco `{ver === 'sugeridas' && (…)}`, envolva: `{ver === 'sugeridas' && !registra && <ConviteDoPlano minimo="MVP" recurso="Registrar entradas" voltar="/gestao" />}` e `{ver === 'sugeridas' && registra && (…o bloco que existe…)}`. O `if (!plano.temModelo && ver === 'sugeridas')` (linha ~279) fica ANTES e continua valendo para os dois níveis — não há sugestão sem modelo, pago ou não. A aba realizadas não muda.

- [ ] **Step 4: A ação** — em `gestao/acoes.ts`, logo depois de `if (!sessao) redirect(...)`:

```ts
  // Portão de ESCRITA, no servidor: esconder o formulário não impede um POST
  // direto. Registrar entrada começa no MVP (spec §5).
  const acesso = await avaliarAcesso(getDb(), sessao.usuarioId)
  if (acesso.nivel === null || !atende(acesso.nivel, 'MVP')) {
    redirect('/assinar?nivel=MVP&voltar=%2Fgestao')
  }
```

Importe `avaliarAcesso` e `atende`.

- [ ] **Step 5: Rodar e ver passar** — os dois testes novos, depois `npx vitest run src/app/__tests__/telas-05-gestao.test.ts`. Esperado: PASS.

- [ ] **Step 6: Verificar** — `npm run typecheck && npm run lint && npm run boundaries`. Marcar; **não commitar**.

---

### Task 9: O assistente por nível — cota, 403 e o botão

**Files:**
- Modify: `src/modules/entrega/chat-limites.ts:40-52` (`configuracaoChat`)
- Modify: `src/modules/entrega/chat.ts:151,178-193` (`responder` recebe a cota), `chat-contexto.ts:41,48,94`, `chat-prompt.ts:30,47` (some `comDireito`)
- Modify: `src/app/api/chat/route.ts:62-83`
- Modify: `src/components/navegacao/Moldura.tsx:28-56` (prop `assistente`)
- Modify: as páginas com aba que passam a prop: `(app)/page.tsx`, `fire-live/page.tsx`, `estatisticas/{page,jogador,jogo,time}`, `resultados/[data]/page.tsx`, `gestao/page.tsx`, `conta/page.tsx` — cada `<Moldura aba=…>` ganha `assistente={atende(acesso.nivel, 'MVP')}`
- Test: `src/modules/entrega/__tests__/chat-limites.test.ts` (existente ou novo), `src/app/api/chat/__tests__/rota.test.ts` (dois casos), `src/app/__tests__/chat-botao.test.ts` (reescrito)

**Interfaces:**
- Consumes: `NivelPago`, `atende`, `AcessoComNivel`.
- Produces:
  ```ts
  export function configuracaoChat(ambiente?): {
    habilitado: boolean
    cotaDiariaPorNivel: Record<NivelPago, number> | null
  }
  // responder(...) ganha `cotaDiaria: number` na entrada e perde `comDireito`.
  // Moldura ganha `assistente?: boolean` (padrão false).
  ```

**A regra (spec, decisão 7 e §14):** GRATIS não tem IA — botão não montado, API 403. MVP e ALL_STAR têm cota por dia, uma variável cada. Com qualquer das duas vazia, o chat se comporta como desligado (`habilitado: false`): degradar é melhor que quebrar o boot, e melhor que inventar um número. `comDireito` morre: ninguém sem nível chega ao chat, então o ramo "sem direito" do prompt e do contexto não tem mais quem o percorra.

- [ ] **Step 1: Escrever os testes que falham**

`src/modules/entrega/__tests__/chat-limites.test.ts` (se já existir um teste de `configuracaoChat`, acrescente a ele):

```ts
describe('configuracaoChat por nível', () => {
  it('com as duas cotas, liga e devolve cada uma', () => {
    const c = configuracaoChat({ CHAT_HABILITADO: 'true', CHAT_COTA_DIARIA_MVP: '20', CHAT_COTA_DIARIA_ALL_STAR: '60' })
    expect(c).toEqual({ habilitado: true, cotaDiariaPorNivel: { MVP: 20, ALL_STAR: 60 } })
  })

  it('cota faltando = chat DESLIGADO, não um padrão inventado (spec §14)', () => {
    expect(configuracaoChat({ CHAT_HABILITADO: 'true', CHAT_COTA_DIARIA_MVP: '20' }).habilitado).toBe(false)
    expect(configuracaoChat({ CHAT_HABILITADO: 'true', CHAT_COTA_DIARIA_MVP: 'x', CHAT_COTA_DIARIA_ALL_STAR: '60' }).habilitado).toBe(false)
    expect(configuracaoChat({ CHAT_HABILITADO: 'true', CHAT_COTA_DIARIA_MVP: '0', CHAT_COTA_DIARIA_ALL_STAR: '60' }).habilitado).toBe(false)
  })

  it('a flag desligada vence, mesmo com as cotas', () => {
    expect(configuracaoChat({ CHAT_HABILITADO: 'nao', CHAT_COTA_DIARIA_MVP: '20', CHAT_COTA_DIARIA_ALL_STAR: '60' }).habilitado).toBe(false)
  })
})
```

`src/app/api/chat/__tests__/rota.test.ts`, dois casos a mais no padrão dos existentes (eles mockam sessão e acesso; troque o mock de acesso pelo mutável com `acessoDeTeste`):

```ts
  it('GRATIS recebe 403 com motivo nivel-insuficiente — e a LLM não é chamada', async () => {
    nivelNoTeste = 'GRATIS'
    const resposta = await POST(requisicaoValida('quantas perguntas tenho por dia?'))
    expect(resposta.status).toBe(403)
    expect(await resposta.json()).toEqual({ erro: 'nivel-insuficiente' })
    expect(llmFake.chamadas).toBe(0)
  })

  it('a cota diária que vale é a do nível', async () => {
    nivelNoTeste = 'ALL_STAR'
    // Com CHAT_COTA_DIARIA_ALL_STAR=2 e MVP=1 no ambiente do teste: a 2ª
    // pergunta do ALL_STAR passa, a 3ª leva 429.
    …
  })
```

Escreva o segundo caso com o arnês real do arquivo (como ele fixa env e conta chamadas); a asserção é: com `CHAT_COTA_DIARIA_MVP=1` e `CHAT_COTA_DIARIA_ALL_STAR=2`, um ALL_STAR consegue duas perguntas e a terceira é `429 cota-esgotada`, enquanto um MVP consegue uma e a segunda é 429.

`src/app/__tests__/chat-botao.test.ts`, reescrito: os quatro casos existentes passam a montar `Moldura({ aba: 'lista', assistente: true, children: null })` onde esperam o botão, e ganham um quinto:

```ts
  it('sem `assistente` — o nível não dá — a Moldura com aba e flag ligada NÃO monta o botão', () => {
    const html = renderToStaticMarkup(Moldura({ aba: 'lista', assistente: false, children: null }))
    expect(html).not.toContain('Abrir o assistente')
  })
```

- [ ] **Step 2: Rodar e ver falhar** — `npx vitest run src/modules/entrega/__tests__/chat-limites.test.ts`, depois `src/app/api/chat`, depois `src/app/__tests__/chat-botao.test.ts`. Esperado: FAIL nos três.

- [ ] **Step 3: `configuracaoChat`**

```ts
import type { NivelPago } from '../plataforma/assinatura/nivel-do-plano'

function cotaLida(bruta: string | undefined): number | null {
  const n = Number(bruta)
  // Só inteiro positivo vale. Zero trancaria todo mundo fora; NaN liberaria
  // geral — os dois acidentes acontecem por env mal digitado, e aqui viram
  // "chat desligado" em vez de um número inventado.
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : null
}

export function configuracaoChat(ambiente: NodeJS.ProcessEnv = process.env): {
  habilitado: boolean
  cotaDiariaPorNivel: Record<NivelPago, number> | null
} {
  const mvp = cotaLida(ambiente.CHAT_COTA_DIARIA_MVP)
  const allStar = cotaLida(ambiente.CHAT_COTA_DIARIA_ALL_STAR)
  const cotaDiariaPorNivel = mvp !== null && allStar !== null ? { MVP: mvp, ALL_STAR: allStar } : null
  return {
    // Só a string exata liga — e só com as DUAS cotas definidas. Cota que
    // falta é decisão comercial que ainda não chegou (spec §14): degradar
    // para "desligado" é melhor que quebrar o boot e melhor que chutar.
    habilitado: ambiente.CHAT_HABILITADO === 'true' && cotaDiariaPorNivel !== null,
    cotaDiariaPorNivel,
  }
}
```

`COTA_PADRAO` some. Atualize o comentário de cabeçalho do módulo.

- [ ] **Step 4: `responder` recebe a cota; `comDireito` morre** — em `chat.ts`, a entrada de `responder` ganha `cotaDiaria: number` e perde `comDireito`; a linha 193 `const { cotaDiaria } = configuracaoChat()` some (usa `entrada.cotaDiaria`); a linha 151 `configuracaoChat().cotaDiaria * 2` vira um parâmetro — confira quem chama essa função e passe `cotaDiaria` até ela. Em `chat-contexto.ts`, o campo `comDireito` some das opções e as duas condicionais (48 e 94) viram o ramo "com direito" sem `if`. Em `chat-prompt.ts`, `sistema(comDireito: boolean)` vira `sistema()` e o texto do ramo sem direito é apagado — leia o arquivo inteiro antes: o prompt tem exemplos concretos de escopo (achado da sonda de 15/09) que precisam continuar lá.

- [ ] **Step 5: A rota** — em `api/chat/route.ts`:

```ts
    const acesso = await avaliarAcesso(getDb(), sessao.usuarioId)
    if (acesso.nivel === null) return NextResponse.json({ erro: 'sem-sessao' }, { status: 401 })
    // O assistente começa no MVP (spec, decisão 7). É portão, não conteúdo:
    // quem não tem nível não chega à LLM, e a resposta diz o motivo em JSON
    // para o painel traduzir.
    if (!atende(acesso.nivel, 'MVP')) {
      return NextResponse.json({ erro: 'nivel-insuficiente' }, { status: 403 })
    }
    const config = configuracaoChat()
    if (!config.habilitado || !config.cotaDiariaPorNivel) {
      return NextResponse.json({ erro: 'fora-do-ar' }, { status: 503 })
    }
    const cotaDiaria = config.cotaDiariaPorNivel[acesso.nivel as NivelPago]
```

e em `responder(...)`, `comDireito: …` vira `cotaDiaria,`. Confira se a rota já checa `habilitado` em outro ponto (ela responde 503 "fora do ar" hoje) e não duplique.

- [ ] **Step 6: A Moldura** — a prop:

```tsx
export function Moldura({
  aba,
  largura = 'leitura',
  assistente = false,
  children,
}: {
  aba: Aba | null
  largura?: LarguraDaMoldura
  /** O nível da sessão dá direito ao assistente (MVP ou mais). A página sabe; a Moldura não consulta. */
  assistente?: boolean
  children?: ReactNode
}) {
  …
      {aba !== null && assistente && configuracaoChat().habilitado && <BotaoChat />}
```

E cada `<Moldura aba=…>` das páginas listadas em **Files** ganha `assistente={atende(acesso.nivel, 'MVP')}`. Nas páginas em que há mais de um `return <Moldura…>` (os vazios, os erros), passe nos que têm `acesso` em escopo; nos que retornam antes do portão, deixe o padrão (`false`).

- [ ] **Step 7: Rodar e ver passar** — os três testes, depois `npx vitest run src/app/__tests__` e `npx vitest run src/modules/entrega`. Esperado: PASS. As suítes de chat que fixavam `CHAT_COTA_DIARIA` no env precisam passar a fixar as duas por nível.

- [ ] **Step 8: Verificar** — `npm run typecheck && npm run lint && npm run boundaries && npm run build`. Marcar; **não commitar**.

---

### Task 10: Cadastro público liga; env e documentação

**Files:**
- Modify: `src/modules/plataforma/assinatura/configuracao.ts:46-50` (o padrão de `CADASTRO_PUBLICO_HABILITADO`)
- Modify: `.env.example:14-24` e onde houver `CHAT_COTA_DIARIA`
- Modify: `src/modules/plataforma/__tests__/spec04.test.ts:115` (a asserção do padrão)
- Modify: `docs/runbooks/cobranca-e-acesso.md` (se mencionar a flag de estatísticas ou o cadastro fechado — `grep -n "ESTATISTICAS_EXIGEM\|CADASTRO_PUBLICO\|CHAT_COTA" docs/`)

- [ ] **Step 1: O padrão** — em `configuracao.ts`, o terceiro argumento de `booleanoExplicito('CADASTRO_PUBLICO_HABILITADO', …, false)` vira `true`, com o comentário: `// Plano grátis é conta (spec de planos, §7). A flag continua existindo para fechar a porta numa emergência.` Em `spec04.test.ts:115`, `expect(lida.cadastroPublicoHabilitado).toBe(false)` vira `toBe(true)`.

- [ ] **Step 2: `.env.example`** — apague `ESTATISTICAS_EXIGEM_DIREITO` e seu comentário; `CADASTRO_PUBLICO_HABILITADO=true` com o comentário `# Plano grátis é conta: o cadastro fica aberto. 'false' fecha a porta numa emergência.`; onde estiver `CHAT_COTA_DIARIA`, troque por:

```
# Cota do assistente por nível, em perguntas por dia. As DUAS são obrigatórias
# com CHAT_HABILITADO=true; faltando qualquer uma, o chat fica desligado — os
# valores são decisão comercial (spec de planos, §14), não padrão de código.
CHAT_COTA_DIARIA_MVP=
CHAT_COTA_DIARIA_ALL_STAR=
```

- [ ] **Step 3: Docs** — atualize o runbook onde ele descrever cadastro fechado ou a flag de estatísticas; uma frase por lugar, apontando para a spec de planos.

- [ ] **Step 4: Rodar** — `npx vitest run src/modules/plataforma/__tests__/spec04.test.ts`. Esperado: PASS.

- [ ] **Step 5: Verificar** — `npm run typecheck && npm run lint && npm run boundaries`. Marcar; **não commitar**.

---

### Task 11: Fechamento

**Files:**
- Modify: `docs/superpowers/specs/2026-09-15-planos-de-assinatura-design.md` (status do Plano A)
- Test: tudo

- [ ] **Step 1: Bateria inteira** — `npm run typecheck && npm run lint && npm run boundaries && npm test && npm run build`. Esperado: verde. Se uma suíte falhar só em paralelo, rode-a isolada antes de concluir que é regressão.

- [ ] **Step 2: A varredura de `permitido`** — `grep -rn "\.permitido\b" src scripts | grep -v "politica\|Politica\|origemPermitida\|permitido(" ` deve vir **vazio**: todo `permitido` restante é da política de push ou da allowlist de URL, nunca de acesso.

- [ ] **Step 3: A varredura de "probabilidade"** — `grep -rni "probabilidade" src/app src/components` deve devolver só a frase da página do apito que diz "não uma probabilidade" (linha ~803) — nenhuma ocorrência nova.

- [ ] **Step 4: A matriz, linha a linha** — confira que existe um teste para cada linha de §5 que este plano cobre: home (Task 5), apito (Task 3 — redireciona; o teste é `apito-meia-noite`/`telas-04-detalhe` com ALL_STAR, mais o `exigirNivel('MVP'` no texto-fonte), Fire Live (6), Resultados (5), Estatísticas resumo e profundidade (7), Gestão (8), Push (Task 3, `push.test.ts` se cobrir `direitoAtivo`), Assistente (9), Conta (3, `telas-05-conta`). Se faltar um, escreva-o antes de commitar.

- [ ] **Step 5: Fronteiras intocadas** — `git diff --stat -- src/modules/motor "src/app/(afiliados)" src/modules/plataforma/afiliados src/modules/entrega/tipos-feed.ts` deve vir **vazio**.

- [ ] **Step 6: Spec** — em `docs/superpowers/specs/2026-09-15-planos-de-assinatura-design.md`, o status vira `**Status:** aprovada em 15/09/2026 · Plano A implementado em <data> · Plano B pendente.` Acrescente a §14 os rulings R-A1 a R-A4 deste plano, em uma linha cada, para o Plano B ler.

- [ ] **Step 7: Commit único** — `git add -A` (confira com `git status` que não há `node_modules`, `.superpowers/` nem scratchpad) e:

```bash
git commit -F - <<'EOF'
Planos de assinatura, parte A: três níveis e o portão de cada tela

A pergunta que toda tela fazia era "pode ou não pode". Passa a ser "até onde
pode": GRATIS, MVP ou ALL_STAR. O nível é coluna do direito
(direitos_acesso.nivel_do_plano) e GRATIS é "logado sem direito ativo" — não
existe linha para o grátis, porque ele É a ausência de direito. Cortesias
existentes viram ALL_STAR na migration: cortesia é para mostrar tudo.

avaliarAcesso devolve o nível em vez de um booleano, e com dois direitos ativos
— o instante de um upgrade — vale o maior, por código, não pela ordem física
das linhas. exigirNivel(minimo, destino) substitui as duas guardas: sem sessão
vai entrar; bloqueado vai para a conta (antes caía em /assinar, oferecendo plano
a quem não pode comprar); nível insuficiente vai para /assinar sabendo qual
nível e de onde veio.

O grátis vê a rodada — siglas, horário, status — e nunca o sinal. Vê Resultados
inteiro, porque é a prova de que funciona com um dia de atraso. Nas estatísticas
vê o resumo; jogo a jogo, números completos, box score e confrontos são MVP, e
a seção mostra o título e o convite em vez de sumir. A gestão mostra o
histórico e não registra — e a AÇÃO recusa, porque formulário escondido não é
portão. Fire Live, push e o assistente começam no MVP; a cota do assistente
é por nível, e sem as duas cotas definidas o chat fica desligado em vez de
inventar um número.

Cadastro público liga: plano grátis que ninguém consegue criar não é plano.

O checkout de um SKU continua atrás da flag e grava MVP/MENSAL até o Plano B
trazer os quatro SKUs. Motor, afiliados, trilha de saídas e o snapshot do feed
não mudaram uma linha.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
EOF
```

- [ ] **Step 8: Parar.** Sem push, sem PR. O Plano B começa depois que o parceiro vir o grátis funcionando.

---

## Auto-revisão

**Cobertura da spec (Plano A).** §4 modelo → Tasks 1, 2, 3. §5 matriz: home → 5; apito → 3 (redirect, preservado); Fire Live → 6; Resultados → 5; estatísticas resumo/profundidade → 7; gestão → 8; push → 3; assistente → 9; filtros → nada a fazer (só há lista para MVP+); conta → 3; Telegram → registro, fora. §6 grátis mais que bloqueado → 4 (o convite), 5, 6, 7, 8. §7 cadastro → 10. §8 migração → 2. Cota de IA por nível → 9. `/assinar` como comparação → 4. §12 conflitos → o plano escreve "nível de confiança" (matriz da Task 4) e nunca "probabilidade" (varredura na 11). §13 "pronto quando" do Plano A: cada item tem uma task acima; "cadastro público cria uma conta que nasce GRATIS" é consequência de 3 + 10 e é coberto por `spec04.test.ts:154` reescrito na Task 3 (`acessoDeTeste('GRATIS')` depois do cadastro).

**Placeholder scan.** Dois pontos pedem "confira antes de usar" de propósito: os nomes dos tokens do design system na Task 4 — verificáveis em uma linha de grep, e chutar o nome errado custaria uma rodada inteira. (O campo do nome do jogador em `ItemFeed` foi conferido: é `nome`.) O segundo caso de teste da rota do chat (Task 9) está descrito e não escrito, porque depende do arnês real de `rota.test.ts` (como ele fixa env e conta chamadas); a asserção está fechada em uma frase.

**Consistência de nomes.** `NivelDoPlano`, `NivelPago`, `Modalidade` (1) → `nivelDoPlano`/`modalidade` no schema (2) → `AcessoComNivel.nivel`/`.modalidade` (3) → `acesso.nivel` em toda tela (3–9). `exigirNivel(minimo, destino)` devolve `{ sessao, acesso }` em 3 e é assim que 4–8 o usam. `atende(acesso.nivel, 'MVP')` é a única forma de perguntar nível nas telas. `ConviteDoPlano({ minimo, recurso, voltar })` e `JogosDoDia({ jogos, fuso })` (4) são usados com essas props em 5, 6, 7, 8. `acessoDeTeste(nivel)` (3) é o único mock. `configuracaoChat().cotaDiariaPorNivel` (9) e as env `CHAT_COTA_DIARIA_MVP`/`_ALL_STAR` (9, 10). `NIVEL_DO_CHECKOUT_LEGADO` (2) é lido no webhook e no checkout (2) e citado nas asserções de `spec04` (3).

**Riscos do plano.** (1) A Task 3 é a maior — 16 chamadores e 14 arquivos de teste — mas é a única forma de o typecheck provar que ninguém ficou para trás; dividi-la deixaria o repositório sem compilar entre duas tasks. (2) `simularAte` em três arnêses novos (5, 6, 7) é caro; `diasDeHistorico: 2` basta para o que se afirma. (3) R-A3 muda comportamento visível — estatísticas passam a pedir login; está declarado como ruling e no relatório de fechamento. (4) O Plano B vai apagar `NIVEL_DO_CHECKOUT_LEGADO`, `MERCADOPAGO_PLANO_*` e o bloco legado de `/assinar`; os três estão marcados no código como provisórios.

import { readFileSync } from 'node:fs'
import { eq } from 'drizzle-orm'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

import { bancoDeTeste } from '../../modules/dominio/__tests__/ajuda-banco'
import { entradasRealizadas, usuarios } from '../../modules/dominio/db/schema'
import { dataDeReferencia } from '../../modules/dominio/rodada'
import { lerFeed } from '../../modules/entrega/lista-secreta'
import { rulesetAtivo } from '../../modules/entrega/ruleset-ativo'
import { simularAte } from '../../modules/ingestao/demo/temporada'
import { LLMFake } from '../../modules/ingestao/llm'
import { concederCortesia } from '../../modules/plataforma/assinatura/direito'

/**
 * O CAMINHO REAL DE ACESSO — a causa raiz do "aperto e não acontece nada".
 *
 * Todas as outras suítes de /gestao simulam `avaliarAcesso`. Aqui não: a
 * conta nasce em `usuarios` sem direito nenhum (exatamente como o ADMIN do
 * bootstrap), a tela é renderizada por cima disso, e só depois a cortesia
 * REAL é concedida. Se alguém um dia fizer ADMIN bypassar `atende()`, ou
 * quebrar o LEFT JOIN de `avaliarAcesso`, é aqui que fica vermelho.
 */

const FUSO = 'America/Sao_Paulo'
const AGORA = new Date('2026-01-15T18:00:00.000Z')
const HOJE = dataDeReferencia(AGORA, FUSO)

let banco: Awaited<ReturnType<typeof bancoDeTeste>>
let usuarioId: string
let sessao: {
  usuarioId: string
  email: string
  dispositivoId: string | null
  papel: 'USUARIO' | 'ADMIN'
} | null = null

vi.mock('../../modules/plataforma/auth/cookies', () => ({
  sessaoAtual: async () => sessao,
}))
vi.mock('next/cache', () => ({
  unstable_cache: (fn: (...args: never[]) => unknown) => fn,
  revalidateTag: () => {},
  revalidatePath: () => {},
}))
vi.mock('../../modules/dominio/db/cliente', () => ({
  getDb: () => banco.db,
  fecharDb: async () => {},
}))

beforeAll(async () => {
  process.env.DATABASE_URL = 'postgres://demo'
  banco = await bancoDeTeste()
  await simularAte(banco.db, await rulesetAtivo(), AGORA, {
    diasDeHistorico: 21,
    llm: new LLMFake(),
  })
  // Como o ADMIN do bootstrap: `papel = 'ADMIN'` em `usuarios` e na sessão,
  // nada em `direitos_acesso`. O papel é o que dá dente à suíte: um "conserto"
  // que deixasse ADMIN pular o portão (pela sessão ou pelo banco) só aparece
  // aqui se a conta for ADMIN de fato. A metodologia já aceita — o portão dela
  // é de outra suíte (telas-metodologia).
  const [u] = await banco.db
    .insert(usuarios)
    .values({
      email: 'admin-sem-direito@teste.com',
      senhaHash: 'x',
      papel: 'ADMIN',
      metodologiaAceitaEm: new Date('2026-01-01T00:00:00.000Z'),
    })
    .returning({ id: usuarios.id })
  usuarioId = u!.id
  sessao = { usuarioId, email: 'admin-sem-direito@teste.com', dispositivoId: null, papel: 'ADMIN' }
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(AGORA)
}, 180_000)

afterAll(async () => {
  vi.useRealTimers()
  await banco.fechar()
})

async function renderizar(params: Record<string, string> = {}): Promise<string> {
  const { default: Pagina } = await import('../(app)/gestao/page')
  return renderToStaticMarkup(await Pagina({ searchParams: Promise.resolve(params) }))
}

function formularioValido(): FormData {
  const f = new FormData()
  f.set('dataReferencia', HOJE)
  f.set('jogadorId', usuarioId) // qualquer uuid — o portão recusa antes do Zod olhar
  f.set('atributo', 'PONTOS')
  f.set('linha', '20')
  f.set('unidades', '1')
  f.set('odd', '')
  return f
}

describe('conta sem direito — o que o ADMIN do bootstrap vê', () => {
  it('a tela mostra a silhueta e o convite, e NENHUM campo do formulário', async () => {
    const html = await renderizar()
    expect(html).not.toContain('name="unidades"')
    expect(html).not.toContain('>Registrei<')
    // Front v2 (Tarefa 6): o convite da Gestão do v2 diz o plano por extenso.
    expect(html).toContain('Registrar entradas é do plano MVP')
    expect(html).toContain('href="/assinar?nivel=MVP&amp;voltar=%2Fgestao"')
  })

  it('a silhueta é inerte — é a razão do "clico e nada acontece"', async () => {
    // Front v2 (Tarefa 6): a silhueta da Gestão deixou de ser o `SilhuetaPaga`
    // (inerte por `pointer-events: none`) e virou blocos de forma dentro do
    // convite (`features/gestao/TelaGestao.tsx`). A trava continua a mesma
    // ideia: nada ali dentro é clicável — o único controle é "Ver planos".
    const html = await renderizar()
    const inicio = html.indexOf('aria-hidden="true"', html.indexOf('Ver planos'))
    expect(inicio).toBeGreaterThan(-1)
    const silhueta = html.slice(inicio, html.indexOf('</div></div>', inicio))
    expect(silhueta).not.toMatch(/<(a|button|input|form|select)\b/)
  })

  it('a AÇÃO recusa no servidor, pelo caminho real, e não grava nada', async () => {
    const { registrarEntrada } = await import('../../features/gestao/acoes')
    await expect(registrarEntrada(formularioValido())).rejects.toMatchObject({
      digest: expect.stringContaining('/assinar?nivel=MVP'),
    })
    const linhas = await banco.db
      .select()
      .from(entradasRealizadas)
      .where(eq(entradasRealizadas.usuarioId, usuarioId))
    expect(linhas).toHaveLength(0)
  })
})

describe('a mesma conta, depois de `npm run cortesia`', () => {
  it('o formulário aparece, com chips de banca, unidades, odd e Registrei', async () => {
    await concederCortesia(banco.db, {
      usuarioId,
      referencia: 'cortesia:admin-sem-direito@teste.com',
      inicio: AGORA,
      fim: null,
      nivelDoPlano: 'ALL_STAR',
    })
    const html = await renderizar()
    expect(html).toContain('name="unidades"')
    expect(html).toContain('name="odd"')
    expect(html).toContain('>Registrei<')
    expect(html).toContain('href="/gestao?banca=500"')
    expect(html).not.toContain('Registrar entradas é do plano MVP')
  })

  it('e a ação passa a gravar — a mesma cortesia libera tela e servidor', async () => {
    const feed = await lerFeed(banco.db, HOJE)
    const item = feed!.conteudo.itens.find((i) => i.linha !== null)!
    const f = formularioValido()
    f.set('jogadorId', item.jogadorId)
    f.set('atributo', item.atributo)
    f.set('linha', String(item.linha))
    const { registrarEntrada } = await import('../../features/gestao/acoes')
    await expect(registrarEntrada(f)).rejects.toMatchObject({
      digest: expect.stringContaining('/gestao?ver=realizadas'),
    })
    const linhas = await banco.db
      .select()
      .from(entradasRealizadas)
      .where(eq(entradasRealizadas.usuarioId, usuarioId))
    expect(linhas).toHaveLength(1)
    expect(linhas[0]).toMatchObject({ jogadorId: item.jogadorId, linha: item.linha, unidades: '1.00', odd: null })
  })
})

describe('o runbook do bootstrap avisa', () => {
  it('diz que o ADMIN nasce Grátis e aponta o comando de cortesia', () => {
    const runbook = readFileSync('docs/runbooks/bootstrap-admin.md', 'utf8')
    expect(runbook).toContain('npm run cortesia')
    expect(runbook.toLowerCase()).toContain('grátis')
  })
})

import { renderToStaticMarkup } from 'react-dom/server'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

import { dataCurta, dataHoraCurta } from '../../features/afiliados/formato'
import { bancoDeTeste } from '../../modules/dominio/__tests__/ajuda-banco'
import { entradasRealizadas } from '../../modules/dominio/db/schema'
import { plantarSaidaComOrigem } from '../../modules/plataforma/afiliados/__tests__/cenario'

/**
 * A TRILHA DE SAÍDAS RENDERIZA — e o rótulo comercial vem junto.
 *
 * Não é cobertura de enfeite. O texto "Declaração do usuário, não confirmação
 * da casa: não gera comissão" é decisão de spec sobre verdade comercial
 * (decisão 5), e a ressalva de que "Não" também cobre a saída sem como casar
 * é o que impede a coluna de mentir por omissão (§10). Se qualquer um dos dois
 * sumir num refactor, sobra uma tela que parece afirmar conversão para um
 * parceiro — e nada acusaria.
 *
 * Componente de servidor de verdade sobre PGlite semeado pelo MESMO helper que
 * a suíte da consulta usa; só sessão e cliente de banco são simulados.
 */

let banco: Awaited<ReturnType<typeof bancoDeTeste>>

vi.mock('../../modules/dominio/db/cliente', () => ({
  getDb: () => banco.db,
  fecharDb: async () => {},
}))
// A página de afiliados do v2 (`(app)/admin/afiliados`) não passa por
// `negarSeNaoForAdmin`: ela chama `exigirAdmin` direto. É esse o alvo. (O
// portão com sessão de verdade está em `features/admin/__tests__/fumaca`.)
vi.mock('../../modules/plataforma/auth/cookies', () => ({
  exigirAdmin: async () => ({
    usuarioId: '00000000-0000-4000-8000-0000000000ad',
    email: 'admin@teste.com',
    papel: 'ADMIN' as const,
    sessaoId: '00000000-0000-4000-8000-0000000000se',
    dispositivoId: null,
    criadaEm: new Date('2026-09-01T00:00:00.000Z'),
  }),
}))

const RELOGIO_COM_ORIGEM = new Date('2026-09-16T02:30:00.000Z')
const RELOGIO_SEM_ORIGEM = new Date('2026-09-22T18:00:00.000Z')
const LINHA = 25

beforeAll(async () => {
  process.env.DATABASE_URL = 'postgres://teste'
  banco = await bancoDeTeste()
}, 180_000)
afterAll(async () => {
  await banco?.fechar()
})

async function renderizar(): Promise<string> {
  const { default: Pagina } = await import('../(app)/admin/afiliados/page')
  return renderToStaticMarkup(await Pagina({ searchParams: Promise.resolve({}) }))
}

/** As `<tr>` da oitava seção, sem alcançar as tabelas das outras sete. */
function linhasDaTrilha(html: string): string[] {
  const abre = html.indexOf('id="trilha"')
  expect(abre).toBeGreaterThan(-1)
  const secao = html.slice(abre, html.indexOf('</section>', abre))
  return secao.match(/<tr>[\s\S]*?<\/tr>/g) ?? []
}

describe('a trilha de saídas na tela do admin', () => {
  it('sem saída nenhuma, a seção renderiza o estado vazio em vez de quebrar', async () => {
    const html = await renderizar()
    expect(html).toContain('Trilha de saídas')
    expect(html).toContain('Nenhuma saída no período.')
  })

  it('a saída com origem e entrada registrada aparece com o desfecho positivo', async () => {
    const cenario = await plantarSaidaComOrigem(banco.db, {
      ocorridoEmUtc: RELOGIO_COM_ORIGEM,
      linha: LINHA,
    })
    await banco.db.insert(entradasRealizadas).values({
      usuarioId: cenario.usuarioId,
      // O dia LOCAL da saída: 23h30 de Brasília ainda é dia 15.
      dataReferencia: '2026-09-15',
      jogadorId: cenario.jogadorId,
      atributo: 'PONTOS',
      linha: LINHA,
      unidades: '1.00',
      odd: null,
    })

    const linhas = linhasDaTrilha(await renderizar())
    // O sujeito é lido do banco, não nomeado no teste.
    const nossa = linhas.filter((l) => l.includes(cenario.nomeDoJogador))
    expect(nossa).toHaveLength(1)
    expect(nossa[0]).toContain(`PONTOS ${LINHA}`)
    expect(nossa[0]).toContain('<td>Sim</td>')
    // A HORA precisa estar na coluna "Quando": esta saída é de 23h30 locais, e
    // é a hora que explica por que ela casou com o dia anterior ao do UTC. Sem
    // nomear o horário — a asserção é que a célula diz mais que a data seca.
    expect(nossa[0]).toContain(dataHoraCurta(RELOGIO_COM_ORIGEM))
    expect(dataHoraCurta(RELOGIO_COM_ORIGEM)).not.toBe(dataCurta(RELOGIO_COM_ORIGEM))
  })

  it('a saída sem origem aparece com o traço no lugar do apito, e sem declaração', async () => {
    await plantarSaidaComOrigem(banco.db, {
      ocorridoEmUtc: RELOGIO_SEM_ORIGEM,
      linha: LINHA,
      semOrigem: true,
    })
    const semOrigem = linhasDaTrilha(await renderizar()).filter((l) => l.includes('<td>—</td>'))
    expect(semOrigem).toHaveLength(1)
    expect(semOrigem[0]).toContain('<td>Não</td>')
  })

  it('o rótulo da declaração está na tela, na letra — e a ressalva do "Não" também', async () => {
    const html = await renderizar()
    expect(html).toContain('Declaração do usuário, não confirmação da casa: não gera comissão.')
    expect(html).toContain('também cobre a saída que não tem como casar')
    expect(html).toContain('visitante sem conta')
    expect(html).toContain('Fire Live, que não tem linha')
    // Conversão é palavra da casa, não desta trilha.
    expect(html.toLowerCase()).not.toContain('conversão')
  })

  it('a tela nunca chama o score de probabilidade', async () => {
    expect((await renderizar()).toLowerCase()).not.toContain('probabilidade')
  })
})

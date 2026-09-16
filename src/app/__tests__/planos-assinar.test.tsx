import { renderToStaticMarkup } from 'react-dom/server'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

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

beforeAll(() => {
  // Cadastro público abre por padrão (spec de planos, §7); a config falha
  // alto sem APP_PUBLIC_URL, e /assinar a lê no render.
  vi.stubEnv('APP_PUBLIC_URL', 'https://app.example.com')
})
afterAll(() => {
  vi.unstubAllEnvs()
})

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

/**
 * `caminhoDeVolta` não é exportada — a única superfície é o `href` do link
 * "Voltar" na página renderizada. Validar por prefixo (`startsWith('/') &&
 * !startsWith('//')`) deixava passar `/\evil.com`: o segundo caractere é
 * `\`, não `/`, então o teste de `//` não pega, mas o parser de URL do
 * navegador trata `\` como `/` em esquemas http — o link vira
 * `https://evil.com`. A correção resolve o valor contra uma origem
 * descartável e só aceita o que continuar nela.
 */
describe('o link "Voltar" — só caminho interno volta', () => {
  const casos: [string | undefined, string][] = [
    ['/gestao', '/gestao'],
    ['https://evil.com', '/'],
    ['//evil.com', '/'],
    ['/\\evil.com', '/'], // barra invertida: o caso que a validação por prefixo deixava passar
    ['\\\\evil.com', '/'],
    ['/../admin', '/admin'],
    ['', '/'],
    [undefined, '/'],
  ]

  it.each(casos)('voltar=%j vira href=%j', async (bruto, esperado) => {
    nivelNoTeste = 'GRATIS'
    const { default: Pagina } = await import('../(app)/assinar/page')
    const parametros: Record<string, string> = {}
    if (bruto !== undefined) parametros.voltar = bruto
    const html = renderToStaticMarkup(await Pagina({ searchParams: Promise.resolve(parametros) }))
    const casamento = html.match(/href="([^"]*)">Voltar<\/a>/)
    expect(casamento?.[1]).toBe(esperado)
  })
})

describe('BENEFICIOS_POR_NIVEL — a vitrine não promete o que a plataforma não entrega', () => {
  it('todo item de fora da plataforma aparece marcado', () => {
    // Escrito à mão de propósito: importar a lista do módulo faria o teste
    // comparar o arquivo consigo mesmo — foi assim que uma mutação que
    // apagou um "(em breve)" passou batido antes desta suíte.
    // 'live' sozinho bateria em "Fire Live" (feature real, entregue hoje) —
    // por isso os termos de "live" saem específicos o bastante para não
    // confundir o nome do produto com o benefício fora da plataforma.
    const foraDaPlataforma = [
      'Telegram',
      'comunidade',
      'live mensal',
      'lives semanais',
      'mentoria',
      'Reprises',
      'especialistas',
      'Acesso antecipado',
    ]
    for (const nivelDoPlano of ['MVP', 'ALL_STAR'] as const) {
      for (const beneficio of BENEFICIOS_POR_NIVEL[nivelDoPlano]) {
        const citado = foraDaPlataforma.some((assunto) =>
          beneficio.toLowerCase().includes(assunto.toLowerCase()),
        )
        if (citado) {
          expect(beneficio, `"${beneficio}" promete algo que a plataforma não entrega`).toContain(
            '(em breve)',
          )
        }
      }
    }
  })
})

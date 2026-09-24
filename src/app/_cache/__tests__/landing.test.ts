import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * A VITRINE DA LANDING EM CACHE (Tarefa 11 do front v2, decisão D2 de 23/09).
 *
 * `/conheca` é pública e sem login: nada PAGO de hoje pode sair dela. O que a
 * landing mostra é a última noite CONFERIDA (só quem bateu, com o placar do
 * jogo) e, de hoje, um único número (quantos apitos há). `unstable_cache`
 * falso com a semântica que importa (mesmo de `placar.test.ts`): guarda pela
 * chave + argumentos, e o valor atravessa JSON como o de verdade.
 */
const loja = new Map<string, unknown>()
const registros: { chaves: string[]; tags: string[]; revalidate: number }[] = []
vi.mock('next/cache', () => ({
  unstable_cache:
    (
      fn: (...a: unknown[]) => Promise<unknown>,
      chaves: string[],
      opcoes: { tags: string[]; revalidate: number },
    ) =>
    async (...args: unknown[]) => {
      registros.push({ chaves, tags: opcoes.tags, revalidate: opcoes.revalidate })
      const k = JSON.stringify([chaves, args])
      if (!loja.has(k)) loja.set(k, JSON.parse(JSON.stringify(await fn(...args))))
      return loja.get(k)
    },
}))

const ultimaRodadaConferida = vi.fn()
const recapDaNoite = vi.fn()
const lerFeed = vi.fn()
vi.mock('@/modules/entrega/resultados', () => ({
  ultimaRodadaConferida: (...a: unknown[]) => ultimaRodadaConferida(...a),
  recapDaNoite: (...a: unknown[]) => recapDaNoite(...a),
}))
vi.mock('@/modules/entrega/lista-secreta', () => ({
  lerFeed: (...a: unknown[]) => lerFeed(...a),
  // Um card por jogador e atributo, como na Lista — o que a landing conta.
  agruparPorJogador: (itens: { jogadorId: string; atributo: string }[]) => {
    const vistos = new Map<string, unknown>()
    for (const i of itens) vistos.set(`${i.jogadorId}|${i.atributo}`, i)
    return [...vistos.values()]
  },
}))
vi.mock('@/modules/dominio/db/cliente', () => ({ getDb: () => ({}) }))

import { TAG_FEED, tagDoFeed } from '../feed'
import { landingCacheada, type VitrineDaLanding } from '../landing'
import { TAG_LATERAL } from '../lateral'

const FAIXAS = [
  { de: 80, grau: 5, rotulo: 'Confiança muito alta', rotulo_curto: 'Muito alta', cor_token: 'x' },
  { de: 60, grau: 4, rotulo: 'Confiança alta' },
]

const JOGO = {
  jogoId: 'g1',
  casaId: 't-casa',
  visitanteId: 't-vis',
  casaSigla: 'CAS',
  visitanteSigla: 'VIS',
  status: 'ENCERRADO',
  quartoAtual: 4,
  dataHoraUtc: new Date('2026-11-02T23:00:00.000Z'),
  placarCasa: 110,
  placarVisitante: 104,
  quartosCasa: [28, 27, 25, 30],
  quartosVisitante: [26, 26, 26, 26],
  temBoxOficial: true,
  atualizadoEm: new Date('2026-11-03T03:00:00.000Z'),
}

// A chave do recap de verdade é `jogoId|jogadorId|atributo`
// (entrega/resultados.ts): é por ela que a vitrine NÃO pode passar.
const card = (extra: Record<string, unknown> & { jogadorId: string }) => ({
  chave: `g1|${extra.jogadorId}|PONTOS`,
  jogoId: 'g1',
  nome: 'Fulano',
  timeId: 't-casa',
  timeSigla: 'CAS',
  fotoUrl: null,
  atributo: 'PONTOS',
  nivelJogador: 'MVP',
  nivelApito: 2,
  turbo: false,
  linhas: [{ linha: 20, confianca: 85, bateu: true }],
  linhaConferida: 20,
  valor: 27,
  maiorLinhaBatida: 20,
  fez: 27,
  bateuLinhaMaisBaixa: true,
  ...extra,
})

const RECAP = {
  dataReferencia: '2026-11-02',
  publicados: 3,
  conferidos: 2,
  bateram: 1,
  taxa: 0.5,
  apitoDaNoite: null,
  noiteEncerrada: true,
  porJogo: [
    {
      jogo: JOGO,
      cards: [
        card({ jogadorId: 'j-bateu', nome: 'Bateu Silva' }),
        card({ jogadorId: 'j-falhou', nome: 'Falhou Souza', fez: 12, bateuLinhaMaisBaixa: false, linhas: [{ linha: 20, confianca: 65, bateu: false }] }),
        card({ jogadorId: 'j-dnp', nome: 'Naojogou Lima', fez: null, valor: null, bateuLinhaMaisBaixa: null, linhas: [{ linha: 20, confianca: 90, bateu: null }] }),
      ],
    },
  ],
  atualizacao: { em: new Date('2026-11-03T03:00:00.000Z'), fonte: 'jogos da rodada' },
}

const FEED_DE_HOJE = {
  conteudo: {
    dataReferencia: '2026-11-03',
    itens: [
      { jogadorId: 'hoje-1', atributo: 'PONTOS', linha: 20, nome: 'Pago Um' },
      { jogadorId: 'hoje-1', atributo: 'PONTOS', linha: 25, nome: 'Pago Um' },
      { jogadorId: 'hoje-2', atributo: 'PONTOS', linha: 10, nome: 'Pago Dois' },
    ],
  },
  geradoEm: new Date('2026-11-03T12:00:00.000Z'),
}

beforeEach(() => {
  loja.clear()
  registros.length = 0
  ultimaRodadaConferida.mockReset().mockResolvedValue('2026-11-02')
  recapDaNoite.mockReset().mockResolvedValue(RECAP)
  lerFeed.mockReset().mockResolvedValue(FEED_DE_HOJE)
})

describe('landingCacheada', () => {
  it('a noite é a última CONFERIDA até ontem — nunca a de hoje', async () => {
    const v = await landingCacheada('2026-11-03', FAIXAS)
    // `ate` é o que a entrega já usa: a rodada de hoje fica de fora mesmo se
    // um jogo já tiver acabado.
    expect(ultimaRodadaConferida).toHaveBeenCalledWith({}, '2026-11-02')
    expect(recapDaNoite).toHaveBeenCalledWith({}, '2026-11-02')
    expect(v.noite?.dataReferencia).toBe('2026-11-02')
    expect(v.noite).toMatchObject({ bateram: 1, conferidos: 2, taxa: 0.5 })
  })

  it('só quem BATEU entra, com o placar do jogo e sem jogadorId', async () => {
    const v = await landingCacheada('2026-11-03', FAIXAS)
    expect(v.noite?.acertos.map((a) => a.nome)).toEqual(['Bateu Silva'])
    const [a] = v.noite!.acertos
    expect(a).toMatchObject({
      linha: 20,
      fez: 27,
      confianca: 85,
      grau: 5,
      placar: { visitanteSigla: 'VIS', casaSigla: 'CAS', placarVisitante: 104, placarCasa: 110 },
    })
    // Nem o jogadorId nem o jogoId de quem bateu — nem pela `chave`, que no
    // recap os carrega.
    const texto = JSON.stringify(v)
    expect(texto).not.toContain('j-bateu')
    expect(texto).not.toContain('g1')
    expect(texto).not.toContain('jogadorId')
    expect(texto).not.toContain('jogoId')
    expect(a!.chave).toBe('Bateu Silva|PONTOS|0')
  })

  it('de hoje, SÓ o número de apitos — nenhum item, nome ou linha do feed pago', async () => {
    const v = await landingCacheada('2026-11-03', FAIXAS)
    expect(lerFeed).toHaveBeenCalledWith({}, '2026-11-03')
    expect(v.totalDeApitosHoje).toBe(2)
    const texto = JSON.stringify(v)
    for (const i of FEED_DE_HOJE.conteudo.itens) {
      expect(texto).not.toContain(i.jogadorId)
      expect(texto).not.toContain(i.nome)
    }
    // A forma do valor guardado é fechada: um campo novo aqui é uma revisão.
    expect(Object.keys(v).sort()).toEqual(['noite', 'totalDeApitosHoje'])
    expect(Object.keys(v.noite!).sort()).toEqual(['acertos', 'bateram', 'conferidos', 'dataReferencia', 'taxa'])
  })

  it('sem noite conferida e sem lista, a vitrine é vazia — não inventa', async () => {
    ultimaRodadaConferida.mockResolvedValue(null)
    lerFeed.mockResolvedValue(null)
    const v = await landingCacheada('2026-11-03', FAIXAS)
    expect(v).toEqual({ noite: null, totalDeApitosHoje: 0 } satisfies VitrineDaLanding)
    expect(recapDaNoite).not.toHaveBeenCalled()
  })

  it('a segunda visita do mesmo dia não vai ao banco; outro dia é outra chave', async () => {
    await landingCacheada('2026-11-03', FAIXAS)
    await landingCacheada('2026-11-03', FAIXAS)
    expect(recapDaNoite).toHaveBeenCalledTimes(1)
    expect(lerFeed).toHaveBeenCalledTimes(1)
    await landingCacheada('2026-11-04', FAIXAS)
    expect(recapDaNoite).toHaveBeenCalledTimes(2)
    expect(lerFeed).toHaveBeenCalledTimes(2)
  })

  it('a chave é o recorte das faixas, não o ruleset inteiro', async () => {
    await landingCacheada('2026-11-03', FAIXAS)
    await landingCacheada('2026-11-03', FAIXAS.map((f) => ({ ...f, cor_token: 'outra' })))
    expect(recapDaNoite).toHaveBeenCalledTimes(1)
  })

  it('tag da lateral (os crons que fecham a rodada) e a do feed do dia (a publicação da lista), uma hora', async () => {
    await landingCacheada('2026-11-03', FAIXAS)
    expect(registros.at(-1)).toMatchObject({
      tags: [TAG_LATERAL, TAG_FEED, tagDoFeed('2026-11-03')],
      revalidate: 3600,
    })
  })

  it('o valor atravessa o JSON do cache sem perder nada — não há Date guardado', async () => {
    const v = await landingCacheada('2026-11-03', FAIXAS)
    expect(JSON.parse(JSON.stringify(v))).toEqual(v)
  })
})

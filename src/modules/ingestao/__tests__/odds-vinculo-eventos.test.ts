import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { bancoDeTeste } from '../../dominio/__tests__/ajuda-banco'
import { identidadesJogo, jogos, times } from '../../dominio/db/schema'
import { casarEventos, vincularEventosDoDia } from '../odds/vinculo-eventos'

const JOGOS = [
  {
    jogoId: 'j1',
    nomeCasa: 'Los Angeles Lakers',
    siglaCasa: 'LAL',
    nomeVisitante: 'Boston Celtics',
    siglaVisitante: 'BOS',
  },
  {
    jogoId: 'j2',
    nomeCasa: 'Denver Nuggets',
    siglaCasa: 'DEN',
    nomeVisitante: 'Miami Heat',
    siglaVisitante: 'MIA',
  },
]

describe('casador de eventos (puro)', () => {
  it('casa por nome completo normalizado, indiferente a caixa e acento', () => {
    const r = casarEventos(
      [
        {
          idExterno: 'e1',
          nomeCasa: 'LOS ANGELES LAKERS',
          nomeVisitante: 'boston celtics',
          inicioIso: null,
        },
      ],
      JOGOS,
    )
    expect(r.pares).toEqual([{ jogoId: 'j1', idExterno: 'e1' }])
  })

  it('casa por SIGLA quando a casa abrevia', () => {
    const r = casarEventos(
      [{ idExterno: 'e2', nomeCasa: 'DEN', nomeVisitante: 'MIA', inicioIso: null }],
      JOGOS,
    )
    expect(r.pares).toEqual([{ jogoId: 'j2', idExterno: 'e2' }])
  })

  it('ordem invertida (casa/visitante trocados na casa de aposta) ainda casa', () => {
    const r = casarEventos(
      [
        {
          idExterno: 'e3',
          nomeCasa: 'Boston Celtics',
          nomeVisitante: 'Los Angeles Lakers',
          inicioIso: null,
        },
      ],
      JOGOS,
    )
    expect(r.pares).toEqual([{ jogoId: 'j1', idExterno: 'e3' }])
  })

  it('sem par ou ambíguo NÃO vincula — conta', () => {
    const doisIguais = [...JOGOS, { ...JOGOS[0]!, jogoId: 'j9' }]
    const r = casarEventos(
      [
        { idExterno: 'e4', nomeCasa: 'Time Fantasma', nomeVisitante: 'Outro', inicioIso: null },
        {
          idExterno: 'e5',
          nomeCasa: 'Los Angeles Lakers',
          nomeVisitante: 'Boston Celtics',
          inicioIso: null,
        },
        { idExterno: 'e6', nomeCasa: null, nomeVisitante: null, inicioIso: null },
      ],
      doisIguais,
    )
    expect(r.pares).toEqual([])
    expect(r.semPar).toBe(2) // e4 e e6
    expect(r.ambiguos).toBe(1) // e5 casa com j1 E j9
  })
})

describe('gravação do vínculo', () => {
  let banco: Awaited<ReturnType<typeof bancoDeTeste>>
  let jogoId: string

  beforeAll(async () => {
    banco = await bancoDeTeste()
    const [lal] = await banco.db
      .insert(times)
      .values({ sigla: 'LAL', nome: 'Los Angeles Lakers' })
      .returning()
    const [bos] = await banco.db
      .insert(times)
      .values({ sigla: 'BOS', nome: 'Boston Celtics' })
      .returning()
    const [jogo] = await banco.db
      .insert(jogos)
      .values({
        dataHoraUtc: new Date('2026-08-28T23:00:00Z'),
        dataReferencia: '2026-08-28',
        timeCasaId: lal!.id,
        timeVisitanteId: bos!.id,
      })
      .returning()
    jogoId = jogo!.id
  }, 120_000)
  afterAll(async () => banco.fechar())

  it('grava identidades_jogo do provedor da casa e reexecutar não duplica', async () => {
    const eventos = [
      { idExterno: 'ev1', nomeCasa: 'LAL', nomeVisitante: 'BOS', inicioIso: null },
      { idExterno: 'ev2', nomeCasa: 'Fantasma', nomeVisitante: 'Outro', inicioIso: null },
    ]
    const primeira = await vincularEventosDoDia(banco.db, 'altenar', '2026-08-28', eventos)
    expect(primeira).toMatchObject({ vinculados: 1, semPar: 1, ambiguos: 0 })

    const segunda = await vincularEventosDoDia(banco.db, 'altenar', '2026-08-28', eventos)
    expect(segunda.vinculados).toBe(1)

    const linhas = await banco.db.select().from(identidadesJogo)
    expect(linhas).toHaveLength(1)
    expect(linhas[0]).toMatchObject({ jogoId, provedor: 'altenar', idExterno: 'ev1' })
  })
})

import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { bancoDeTeste } from '../../dominio/__tests__/ajuda-banco'
import { identidadesJogo, jogos, times } from '../../dominio/db/schema'
import { casarEventos, vincularEventosDoDia } from '../odds/vinculo-eventos'

const JOGOS = [
  { jogoId: 'j1', nomeCasa: 'Los Angeles Lakers', siglaCasa: 'LAL', nomeVisitante: 'Boston Celtics', siglaVisitante: 'BOS' },
  { jogoId: 'j2', nomeCasa: 'Denver Nuggets', siglaCasa: 'DEN', nomeVisitante: 'Miami Heat', siglaVisitante: 'MIA' },
]
const ev = (idExterno: string, nomeCasa: string | null, nomeVisitante: string | null, inicioIso: string | null = null) => ({
  idExterno,
  nomeCasa,
  nomeVisitante,
  inicioIso,
})

describe('casador de eventos (puro)', () => {
  it('casa por nome completo normalizado, indiferente a caixa e acento', () => {
    expect(casarEventos([ev('e1', 'LOS ANGELES LAKERS', 'boston celtics')], JOGOS).pares).toEqual([{ jogoId: 'j1', idExterno: 'e1' }])
  })

  it('casa por SIGLA quando a casa abrevia', () => {
    expect(casarEventos([ev('e2', 'DEN', 'MIA')], JOGOS).pares).toEqual([{ jogoId: 'j2', idExterno: 'e2' }])
  })

  it('casa pelo APELIDO — "Lakers vs Celtics" é como a casa grafa; "Los Angeles Lakers" é como o provedor grava', () => {
    expect(casarEventos([ev('e3', 'Lakers', 'Celtics')], JOGOS).pares).toEqual([{ jogoId: 'j1', idExterno: 'e3' }])
    // E o inverso: a casa com o nome completo, o provedor com o curto.
    const curtos = [{ ...JOGOS[1]!, nomeCasa: 'Nuggets', nomeVisitante: 'Heat' }]
    expect(casarEventos([ev('e4', 'Denver Nuggets', 'Miami Heat')], curtos).pares).toEqual([{ jogoId: 'j2', idExterno: 'e4' }])
  })

  it('ordem invertida (casa/visitante trocados na casa de aposta) ainda casa', () => {
    expect(casarEventos([ev('e5', 'Boston Celtics', 'Los Angeles Lakers')], JOGOS).pares).toEqual([{ jogoId: 'j1', idExterno: 'e5' }])
  })

  it('um evento que serve para DOIS jogos não vincula — conta', () => {
    const doisIguais = [...JOGOS, { ...JOGOS[0]!, jogoId: 'j9' }]
    const r = casarEventos([ev('e6', 'Time Fantasma', 'Outro'), ev('e7', 'Los Angeles Lakers', 'Boston Celtics'), ev('e8', null, null)], doisIguais)
    expect(r.pares).toEqual([])
    expect(r.semPar).toBe(2) // e6 e e8
    expect(r.ambiguos).toBe(1) // e7 casa com j1 E j9
  })

  it('DOIS eventos que servem para o MESMO jogo (a revanche) também é ambiguidade — nenhum vincula', () => {
    const r = casarEventos([ev('hoje', 'Lakers', 'Celtics'), ev('revanche', 'Lakers', 'Celtics'), ev('outro', 'DEN', 'MIA')], JOGOS)
    expect(r.pares).toEqual([{ jogoId: 'j2', idExterno: 'outro' }])
    expect(r.ambiguos).toBe(2)
  })
})

describe('gravação do vínculo', () => {
  let banco: Awaited<ReturnType<typeof bancoDeTeste>>
  let jogoId: string
  const DIA = '2026-08-28'
  const FUSO = 'America/Sao_Paulo'

  beforeAll(async () => {
    banco = await bancoDeTeste()
    const [lal] = await banco.db.insert(times).values({ sigla: 'LAL', nome: 'Los Angeles Lakers' }).returning()
    const [bos] = await banco.db.insert(times).values({ sigla: 'BOS', nome: 'Boston Celtics' }).returning()
    const [jogo] = await banco.db
      .insert(jogos)
      .values({ dataHoraUtc: new Date('2026-08-28T23:00:00Z'), dataReferencia: DIA, timeCasaId: lal!.id, timeVisitanteId: bos!.id })
      .returning()
    jogoId = jogo!.id
  }, 120_000)
  afterAll(async () => banco.fechar())

  it('corta ao DIA antes de casar: a revanche de daqui a dois dias fica fora, não ambígua', async () => {
    const eventos = [
      ev('ev1', 'Lakers', 'Celtics', '2026-08-28T23:00:00Z'), // 20h em Brasília, mesmo dia
      ev('rev', 'Lakers', 'Celtics', '2026-08-30T23:00:00Z'), // outro dia — fora, e não atrapalha ev1
      ev('ev2', 'Fantasma', 'Outro', null),
    ]
    const r = await vincularEventosDoDia(banco.db, 'altenar', DIA, eventos, FUSO)
    expect(r).toMatchObject({ vinculados: 1, semPar: 1, ambiguos: 0, foraDoDia: 1 })
    expect(r.pares).toEqual([{ jogoId, idExterno: 'ev1' }])

    const linhas = await banco.db.select().from(identidadesJogo)
    expect(linhas).toHaveLength(1)
    expect(linhas[0]).toMatchObject({ jogoId, provedor: 'altenar', idExterno: 'ev1' })
  })

  it('reexecutar não duplica; id reemitido pela casa SUBSTITUI o antigo em vez de ficar preso', async () => {
    const r = await vincularEventosDoDia(banco.db, 'altenar', DIA, [ev('ev1-novo', 'LAL', 'BOS')], FUSO)
    expect(r.vinculados).toBe(1)
    const linhas = await banco.db.select().from(identidadesJogo)
    expect(linhas).toHaveLength(1)
    expect(linhas[0]!.idExterno).toBe('ev1-novo')
  })

  it('outro provedor é outra linha para o mesmo jogo', async () => {
    await vincularEventosDoDia(banco.db, 'betmgm', DIA, [ev('b1', 'Los Angeles Lakers', 'Boston Celtics')], FUSO)
    const linhas = await banco.db.select().from(identidadesJogo)
    expect(linhas.map((l) => l.provedor).sort()).toEqual(['altenar', 'betmgm'])
  })
})

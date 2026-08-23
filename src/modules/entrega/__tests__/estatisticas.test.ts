import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { renderToStaticMarkup } from 'react-dom/server'
import { createElement } from 'react'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import { bancoDeTeste } from '../../dominio/__tests__/ajuda-banco'
import {
  classificacao,
  estatisticasJogo,
  estatisticasQuarto,
  estatisticasTimeJogo,
  jogadores,
  jogos,
  mediasJogador,
  times,
} from '../../dominio/db/schema'
import { CardEntrada, UltimaAtualizacao } from '../../../design-system/componentes'
import { buscar, listarTimes } from '../estatisticas/busca'
import { telaDoJogador } from '../estatisticas/jogador'
import { telaJogosDoDia } from '../estatisticas/jogos-do-dia'
import { telaDaClassificacao, telaDoTime } from '../estatisticas/time'
import { rotaDoJogador, rotaDoTime } from '../estatisticas/rotas'

const TEMPORADA = '2026'
const HOJE = '2026-08-19'
const AGORA = new Date('2026-08-19T23:30:00.000Z')

let banco: Awaited<ReturnType<typeof bancoDeTeste>>
let idPorNome: Map<string, string>
let lalId: string
let bosId: string
let jogoDeOntemId: string
let jogoDeHojeId: string

/** Nomes com acento e grafia difícil de propósito — é o que a busca enfrenta. */
const ELENCO = [
  { nome: 'Luka Dončić', posicao: 'PG', camisa: 77 },
  { nome: 'Jalen Brunson', posicao: 'PG', camisa: 11 },
  { nome: 'Mamukelashvili', posicao: 'C', camisa: 88 },
]

beforeAll(async () => {
  banco = await bancoDeTeste()
})
afterAll(async () => {
  await banco.fechar()
})

async function semear() {
  const db = banco.db

  await db.delete(estatisticasQuarto)
  await db.delete(estatisticasJogo)
  await db.delete(estatisticasTimeJogo)
  await db.delete(classificacao)
  await db.delete(mediasJogador)
  await db.delete(jogos)
  await db.delete(jogadores)
  await db.delete(times)

  const [lal] = await db
    .insert(times)
    .values({ sigla: 'LAL', nome: 'Lakers', conferencia: 'Oeste' })
    .returning()
  const [bos] = await db
    .insert(times)
    .values({ sigla: 'BOS', nome: 'Celtics', conferencia: 'Leste' })
    .returning()
  lalId = lal!.id
  bosId = bos!.id

  idPorNome = new Map()
  for (const { nome, posicao, camisa } of ELENCO) {
    const [j] = await db
      .insert(jogadores)
      .values({ nomeCompleto: nome, posicao, numeroCamisa: camisa, timeId: lal!.id })
      .returning()
    idPorNome.set(nome, j!.id)
  }

  await db.insert(mediasJogador).values({
    jogadorId: idPorNome.get('Luka Dončić')!,
    temporada: TEMPORADA,
    janela: 'TEMPORADA',
    jogos: 40,
    ppg: '30.00',
    rpg: '8.50',
    apg: '9.20',
  })

  await db.insert(classificacao).values({
    temporada: TEMPORADA,
    timeId: lal!.id,
    conferencia: 'Oeste',
    vitorias: 30,
    derrotas: 12,
    posicao: 2,
    aproveitamento: '0.714',
    sequencia: 'V3',
  })

  // Jogo de ONTEM, encerrado — alimenta histórico e box score.
  const [ontem] = await db
    .insert(jogos)
    .values({
      dataHoraUtc: new Date('2026-08-18T23:00:00.000Z'),
      dataReferencia: '2026-08-18',
      timeCasaId: lal!.id,
      timeVisitanteId: bos!.id,
      status: 'ENCERRADO',
      placarCasa: 112,
      placarVisitante: 105,
    })
    .returning()
  jogoDeOntemId = ontem!.id

  await db.insert(estatisticasJogo).values({
    jogoId: ontem!.id,
    jogadorId: idPorNome.get('Luka Dončić')!,
    minutos: '36.50',
    pontos: 34,
    rebotesTotal: 9,
    rebotesOf: 2,
    rebotesDef: 7,
    assistencias: 11,
    cestasC: 12,
    cestasT: 22,
    tresC: 4,
    tresT: 9,
    lanceC: 6,
    lanceT: 7,
    roubos: 2,
    bloqueios: 1,
    turnovers: 4,
    faltas: 2,
    saldoQuadra: 14,
  })

  await db.insert(estatisticasTimeJogo).values([
    {
      jogoId: ontem!.id,
      timeId: lal!.id,
      pontos: 112,
      pontosQ1: 28,
      pontosQ2: 30,
      pontosQ3: 26,
      pontosQ4: 28,
      rebotesTotal: 44,
      assistencias: 27,
      cestasC: 42,
      cestasT: 88,
      tresC: 14,
      tresT: 36,
      turnovers: 11,
    },
    {
      jogoId: ontem!.id,
      timeId: bos!.id,
      pontos: 105,
      pontosQ1: 25,
      pontosQ2: 27,
      pontosQ3: 29,
      pontosQ4: 24,
    },
  ])

  // Jogo de HOJE, ao vivo — alimenta o bloco ao vivo e os jogos do dia.
  const [hoje] = await db
    .insert(jogos)
    .values({
      dataHoraUtc: new Date(`${HOJE}T23:00:00.000Z`),
      dataReferencia: HOJE,
      timeCasaId: lal!.id,
      timeVisitanteId: bos!.id,
      status: 'AO_VIVO',
      quartoAtual: 2,
      tempoRestante: '07:12',
      placarCasa: 41,
      placarVisitante: 38,
    })
    .returning()
  jogoDeHojeId = hoje!.id

  await db.insert(estatisticasQuarto).values([
    {
      jogoId: hoje!.id,
      jogadorId: idPorNome.get('Luka Dončić')!,
      quarto: 1,
      pontos: 12,
      rebotes: 3,
      assistencias: 4,
    },
    {
      jogoId: hoje!.id,
      jogadorId: idPorNome.get('Luka Dončić')!,
      quarto: 2,
      pontos: 7,
      rebotes: 1,
      assistencias: 2,
    },
  ])
}

beforeEach(semear)

// ===========================================================================
// OS DOIS CAMINHOS
// ===========================================================================

describe('os dois caminhos chegam na mesma tela', () => {
  it('a busca do menu e o nome no card produzem a MESMA rota', async () => {
    const lukaId = idPorNome.get('Luka Dončić')!

    // Caminho 1 — menu: o usuário busca e clica no resultado.
    const [achado] = await buscar(banco.db, 'Doncic', { apenas: 'JOGADOR' })
    expect(achado).toBeDefined()
    expect(achado!.id).toBe(lukaId)
    const rotaPeloMenu = rotaDoJogador(achado!.id)

    // Caminho 2 — card: o nome do jogador dentro da entrada sugerida.
    const html = renderToStaticMarkup(
      createElement(CardEntrada, {
        nome: 'Luka Dončić',
        jogadorHref: rotaDoJogador(lukaId),
        timeSigla: 'LAL',
        timeNome: 'Lakers',
        posicao: 'PG',
        atributo: 'PONTOS' as const,
        nivelJogador: 'MVP' as const,
        nivelApito: 1 as const,
        confianca: 90,
      }),
    )
    const href = /href="([^"]+)"/.exec(html)?.[1]

    expect(href).toBe(rotaPeloMenu)
  })

  it('a rota dos dois caminhos resolve numa tela que existe', async () => {
    const [achado] = await buscar(banco.db, 'Doncic', { apenas: 'JOGADOR' })
    const rota = rotaDoJogador(achado!.id)

    // O destino não pode ser só uma string bonita: tem que carregar.
    const idNaRota = decodeURIComponent(rota.split('/').pop()!)
    const tela = await telaDoJogador(banco.db, idNaRota, { temporada: TEMPORADA })

    expect(tela).not.toBeNull()
    expect(tela!.perfil.nome).toBe('Luka Dončić')
  })

  it('o card sem href não vira link — a galeria não tem para onde navegar', () => {
    const html = renderToStaticMarkup(
      createElement(CardEntrada, {
        nome: 'Luka Dončić',
        timeSigla: 'LAL',
        timeNome: 'Lakers',
        posicao: null,
        atributo: 'PONTOS' as const,
        nivelJogador: 'MVP' as const,
        nivelApito: 1 as const,
        confianca: 90,
      }),
    )
    // `<a` sozinho casaria com `<article` — o que interessa é a âncora.
    expect(html).not.toMatch(/<a\s+href=/)
    expect(html).toContain('Luka Dončić')
  })
})

// ===========================================================================
// BUSCA
// ===========================================================================

describe('busca por nome parcial', () => {
  it('acha pelo começo do sobrenome', async () => {
    const r = await buscar(banco.db, 'brun', { apenas: 'JOGADOR' })
    expect(r.map((x) => x.nome)).toContain('Jalen Brunson')
  })

  it('acha por um trecho no meio do nome', async () => {
    const r = await buscar(banco.db, 'kelash', { apenas: 'JOGADOR' })
    expect(r.map((x) => x.nome)).toContain('Mamukelashvili')
  })

  it('acha time pela sigla e pelo nome', async () => {
    expect((await buscar(banco.db, 'LAL', { apenas: 'TIME' })).map((t) => t.nome)).toContain(
      'Lakers',
    )
    expect((await buscar(banco.db, 'celt', { apenas: 'TIME' })).map((t) => t.nome)).toContain(
      'Celtics',
    )
  })

  it('consulta vazia não devolve nada', async () => {
    expect(await buscar(banco.db, '   ')).toEqual([])
  })
})

describe('busca por grafia aproximada', () => {
  it('acha ignorando acento', async () => {
    const r = await buscar(banco.db, 'doncic', { apenas: 'JOGADOR' })
    expect(r[0]!.nome).toBe('Luka Dončić')
  })

  it('acha com letra trocada', async () => {
    const r = await buscar(banco.db, 'doncick', { apenas: 'JOGADOR' })
    expect(r.map((x) => x.nome)).toContain('Luka Dončić')
  })

  it('acha com sobrenome escrito errado', async () => {
    const r = await buscar(banco.db, 'Brunsen', { apenas: 'JOGADOR' })
    expect(r.map((x) => x.nome)).toContain('Jalen Brunson')
  })

  it('acha nome longo escrito de oitiva', async () => {
    const r = await buscar(banco.db, 'mamukelashvilli', { apenas: 'JOGADOR' })
    expect(r.map((x) => x.nome)).toContain('Mamukelashvili')
  })

  it('não devolve qualquer coisa: termo sem relação nenhuma volta vazio', async () => {
    expect(await buscar(banco.db, 'xyzabc', { apenas: 'JOGADOR' })).toEqual([])
  })

  it('o acerto exato vem antes do parcial', async () => {
    const r = await buscar(banco.db, 'Jalen Brunson', { apenas: 'JOGADOR' })
    expect(r[0]!.nome).toBe('Jalen Brunson')
  })
})

// ===========================================================================
// TELA DO JOGADOR
// ===========================================================================

describe('tela do jogador', () => {
  it('traz o histórico linha a linha com adversário, resultado e percentuais', async () => {
    const tela = await telaDoJogador(banco.db, idPorNome.get('Luka Dončić')!, {
      temporada: TEMPORADA,
    })

    expect(tela).not.toBeNull()
    const linha = tela!.historico.find((h) => h.jogoId === jogoDeOntemId)
    expect(linha).toBeDefined()
    expect(linha!.adversarioSigla).toBe('BOS')
    expect(linha!.emCasa).toBe(true)
    expect(linha!.resultado).toBe('V')
    expect(linha!.pontos).toBe(34)
    expect(linha!.rebotes).toBe(9)
    expect(linha!.assistencias).toBe(11)
    // 12/22 = 54,5% · 4/9 = 44,4%
    expect(linha!.fgPercentual).toBe(54.5)
    expect(linha!.tresPercentual).toBe(44.4)
  })

  it('mostra o bloco ao vivo enquanto o jogador está em jogo', async () => {
    const tela = await telaDoJogador(banco.db, idPorNome.get('Luka Dončić')!, {
      temporada: TEMPORADA,
    })

    expect(tela!.aoVivo).not.toBeNull()
    expect(tela!.aoVivo!.jogoId).toBe(jogoDeHojeId)
    // Acumula os quartos já registrados: 12 + 7.
    expect(tela!.aoVivo!.pontos).toBe(19)
    expect(tela!.aoVivo!.assistencias).toBe(6)
    expect(tela!.aoVivo!.porQuarto).toHaveLength(2)
  })

  it('não há bloco ao vivo para jogador de time que não está em quadra', async () => {
    // Um time sem jogo ao vivo nenhum.
    const [phi] = await banco.db.insert(times).values({ sigla: 'PHI', nome: 'Sixers' }).returning()
    const [j] = await banco.db
      .insert(jogadores)
      .values({ nomeCompleto: 'Fora da Rodada', timeId: phi!.id })
      .returning()

    const tela = await telaDoJogador(banco.db, j!.id, { temporada: TEMPORADA })
    expect(tela!.aoVivo).toBeNull()
  })

  it('jogador em quadra sem estatística ainda não pontuada aparece zerado, não ausente', async () => {
    // Brunson está no LAL, que tem jogo AO_VIVO, mas não tem linha em
    // estatisticas_quarto. O bloco tem que existir — sumir com ele faria a
    // tela parecer quebrada — e tem que mostrar zero, não inventar número.
    const tela = await telaDoJogador(banco.db, idPorNome.get('Jalen Brunson')!, {
      temporada: TEMPORADA,
    })

    expect(tela!.aoVivo).not.toBeNull()
    expect(tela!.aoVivo!.jogoId).toBe(jogoDeHojeId)
    expect(tela!.aoVivo!.pontos).toBe(0)
    expect(tela!.aoVivo!.porQuarto).toEqual([])
  })

  it('traz números completos de ataque, defesa e posse', async () => {
    const tela = await telaDoJogador(banco.db, idPorNome.get('Luka Dončić')!, {
      temporada: TEMPORADA,
    })
    const n = tela!.perfilNumeros

    // PTS/REB/AST vêm de medias_jogador — a MESMA média que a estratégia usa.
    expect(n.ataque.pontos).toBe(30)
    expect(n.defesa.rebotesTotal).toBe(8.5)
    expect(n.ataque.assistencias).toBe(9.2)

    expect(n.ataque.fgPercentual).toBe(54.5)
    expect(n.ataque.lancePercentual).toBe(85.7)
    expect(n.defesa.roubos).toBe(2)
    expect(n.posse.turnovers).toBe(4)
    expect(n.posse.saldoQuadra).toBe(14)
  })

  it('devolve null para jogador que não existe', async () => {
    const inexistente = '00000000-0000-0000-0000-000000000000'
    expect(await telaDoJogador(banco.db, inexistente, { temporada: TEMPORADA })).toBeNull()
  })

  it('percentual sem tentativa é nulo, nunca 0%', async () => {
    const [j] = await banco.db
      .insert(jogadores)
      .values({ nomeCompleto: 'Reserva Absoluto', timeId: lalId })
      .returning()
    await banco.db.insert(estatisticasJogo).values({
      jogoId: jogoDeOntemId,
      jogadorId: j!.id,
      pontos: 0,
      cestasC: 0,
      cestasT: 0,
    })

    const tela = await telaDoJogador(banco.db, j!.id, { temporada: TEMPORADA })
    expect(tela!.historico[0]!.fgPercentual).toBeNull()
  })
})

// ===========================================================================
// TELA DO TIME
// ===========================================================================

describe('tela do time', () => {
  it('traz classificação, vitórias, derrotas, aproveitamento e sequência', async () => {
    const tela = await telaDoTime(banco.db, lalId, { temporada: TEMPORADA })

    expect(tela).not.toBeNull()
    expect(tela!.campanha).toMatchObject({
      posicao: 2,
      vitorias: 30,
      derrotas: 12,
      aproveitamento: 0.714,
      sequencia: 'V3',
    })
  })

  it('traz box score por jogo COM quebra por quarto', async () => {
    const tela = await telaDoTime(banco.db, lalId, { temporada: TEMPORADA })
    const jogo = tela!.jogosDoTime.find((j) => j.jogoId === jogoDeOntemId)

    expect(jogo).toBeDefined()
    expect(jogo!.nosso).toMatchObject({ q1: 28, q2: 30, q3: 26, q4: 28, total: 112 })
    // A quebra do adversário vem junto, para leitura lado a lado.
    expect(jogo!.deles).toMatchObject({ q1: 25, q2: 27, q3: 29, q4: 24, total: 105 })
    expect(jogo!.resultado).toBe('V')
  })

  it('a soma dos quartos bate com o total do jogo', async () => {
    const tela = await telaDoTime(banco.db, lalId, { temporada: TEMPORADA })
    const jogo = tela!.jogosDoTime.find((j) => j.jogoId === jogoDeOntemId)!

    expect(jogo.nosso).not.toBeNull()
    const q = jogo.nosso!
    const soma = q.q1 + q.q2 + q.q3 + q.q4 + q.prorrogacao
    expect(soma).toBe(q.total)
  })

  it('o adversário vê o mesmo jogo pelo lado dele', async () => {
    const tela = await telaDoTime(banco.db, bosId, { temporada: TEMPORADA })
    const jogo = tela!.jogosDoTime.find((j) => j.jogoId === jogoDeOntemId)!

    expect(jogo.emCasa).toBe(false)
    expect(jogo.adversarioSigla).toBe('LAL')
    expect(jogo.resultado).toBe('D')
  })

  it('elenco leva à tela do jogador', async () => {
    const tela = await telaDoTime(banco.db, lalId, { temporada: TEMPORADA })
    expect(tela!.elenco.length).toBeGreaterThan(0)

    const primeiro = tela!.elenco[0]!
    const doJogador = await telaDoJogador(banco.db, primeiro.id, { temporada: TEMPORADA })
    expect(doJogador).not.toBeNull()
  })

  it('devolve null para time que não existe', async () => {
    const inexistente = '00000000-0000-0000-0000-000000000000'
    expect(await telaDoTime(banco.db, inexistente, { temporada: TEMPORADA })).toBeNull()
  })
})

// ===========================================================================
// JOGOS DO DIA
// ===========================================================================

describe('jogos do dia', () => {
  it('lista os jogos da data com placar e estado', async () => {
    const tela = await telaJogosDoDia(banco.db, HOJE)

    expect(tela.jogos).toHaveLength(1)
    expect(tela.jogos[0]).toMatchObject({
      id: jogoDeHojeId,
      status: 'AO_VIVO',
      quartoAtual: 2,
    })
    expect(tela.jogos[0]!.casa.sigla).toBe('LAL')
    expect(tela.jogos[0]!.visitante.sigla).toBe('BOS')
  })

  it('não traz jogo de outro dia', async () => {
    const tela = await telaJogosDoDia(banco.db, HOJE)
    expect(tela.jogos.map((j) => j.id)).not.toContain(jogoDeOntemId)
  })

  it('leva à tela do time pelos dois lados', async () => {
    const tela = await telaJogosDoDia(banco.db, HOJE)
    const jogo = tela.jogos[0]!

    expect(rotaDoTime(jogo.casa.id)).toContain(jogo.casa.id)
    expect(await telaDoTime(banco.db, jogo.casa.id, { temporada: TEMPORADA })).not.toBeNull()
    expect(await telaDoTime(banco.db, jogo.visitante.id, { temporada: TEMPORADA })).not.toBeNull()
  })
})

// ===========================================================================
// HORÁRIO DA ÚLTIMA ATUALIZAÇÃO — sem exceção
// ===========================================================================

describe('horário da última atualização', () => {
  it('toda carga de tela da aba traz a marca de atualização', async () => {
    const telas = [
      await telaJogosDoDia(banco.db, HOJE),
      await telaDaClassificacao(banco.db, TEMPORADA),
      (await telaDoJogador(banco.db, idPorNome.get('Luka Dončić')!, { temporada: TEMPORADA }))!,
      (await telaDoTime(banco.db, lalId, { temporada: TEMPORADA }))!,
    ]

    for (const tela of telas) {
      expect(tela.atualizacao).toBeDefined()
      expect(tela.atualizacao.em).toBeInstanceOf(Date)
      expect(typeof tela.atualizacao.fonte).toBe('string')
      expect(tela.atualizacao.fonte.length).toBeGreaterThan(0)
    }
  })

  it('o horário vem do DADO, não do relógio da consulta', async () => {
    const tela = await telaJogosDoDia(banco.db, HOJE)
    // As linhas foram gravadas no `semear`, portanto antes de agora.
    expect(tela.atualizacao.em.getTime()).toBeLessThanOrEqual(Date.now())
    expect(tela.atualizacao.em.getTime()).toBeGreaterThan(0)
  })

  it('a tela adota o horário do dado MAIS ANTIGO que exibe', async () => {
    const antiga = new Date('2026-08-01T10:00:00.000Z')
    await banco.db.update(classificacao).set({ atualizadoEm: antiga })

    const tela = await telaDoTime(banco.db, lalId, { temporada: TEMPORADA })
    expect(tela!.atualizacao.em.getTime()).toBe(antiga.getTime())
    expect(tela!.atualizacao.fonte).toBe('classificação')
  })

  it('sem dado nenhum, admite que não há dado em vez de datar 1970', async () => {
    const tela = await telaJogosDoDia(banco.db, '2020-01-01')
    expect(tela.jogos).toHaveLength(0)
    expect(tela.atualizacao.em.getTime()).toBe(0)

    const html = renderToStaticMarkup(
      createElement(UltimaAtualizacao, {
        em: tela.atualizacao.em,
        fonte: tela.atualizacao.fonte,
        agora: AGORA,
      }),
    )
    expect(html).toContain('sem dado para exibir')
    expect(html).not.toContain('1970')
  })

  it('o componente mostra o tempo decorrido e o horário absoluto', () => {
    const html = renderToStaticMarkup(
      createElement(UltimaAtualizacao, {
        em: new Date('2026-08-19T23:27:00.000Z'),
        fonte: 'ao vivo',
        agora: AGORA,
      }),
    )
    expect(html).toContain('há 3 min')
    expect(html).toContain('ao vivo')
    expect(html).toContain('2026-08-19T23:27:00.000Z')
  })

  /**
   * Varredura de FONTE. As telas são Server Components assíncronos, que o
   * vitest não renderiza sem um harness do Next inteiro — mas o requisito é
   * "sem exceção", e uma tela nova que esqueça o rodapé passaria por todos os
   * testes acima. Este aqui olha o arquivo.
   */
  it('TODA página da aba renderiza <UltimaAtualizacao>', () => {
    const raiz = 'src/app/(app)/estatisticas'

    function paginas(dir: string): string[] {
      return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
        const caminho = join(dir, e.name)
        if (e.isDirectory()) return paginas(caminho)
        return e.name === 'page.tsx' ? [caminho] : []
      })
    }

    const encontradas = paginas(raiz)
    expect(encontradas.length).toBeGreaterThanOrEqual(3)

    for (const caminho of encontradas) {
      const fonte = readFileSync(caminho, 'utf8')
      expect(fonte, `${caminho} não informa a última atualização`).toContain('<UltimaAtualizacao')
    }
  })

  it('nenhum arquivo da aba importa o motor', () => {
    const raizes = ['src/app/(app)/estatisticas', 'src/modules/entrega/estatisticas']

    function arquivos(dir: string): string[] {
      return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
        const caminho = join(dir, e.name)
        if (e.isDirectory()) return arquivos(caminho)
        return /\.tsx?$/.test(e.name) ? [caminho] : []
      })
    }

    for (const raiz of raizes) {
      for (const caminho of arquivos(raiz)) {
        const fonte = readFileSync(caminho, 'utf8')
        expect(fonte, `${caminho} importa o motor`).not.toMatch(
          /from ['"](@\/modules\/motor|.*\.\.\/motor)/,
        )
      }
    }
  })
})

// ===========================================================================

describe('menu de times', () => {
  it('ordena pela classificação e mantém time sem campanha na lista', async () => {
    const lista = await listarTimes(banco.db, TEMPORADA)

    expect(lista.map((t) => t.sigla)).toEqual(expect.arrayContaining(['LAL', 'BOS']))
    // LAL é 2º; BOS não tem linha de classificação e cai para o fim.
    expect(lista[0]!.sigla).toBe('LAL')
    expect(lista.find((t) => t.sigla === 'BOS')!.posicao).toBeNull()
  })
})

// ===========================================================================
// AUSÊNCIA DE DADO — o que a tela faz quando a ingestão veio pela metade
// ===========================================================================

describe('ingestão parcial', () => {
  it('sem box score do time, a quebra por quarto é AUSENTE, não zerada', async () => {
    const [j] = await banco.db
      .insert(jogos)
      .values({
        dataHoraUtc: new Date('2026-08-17T23:00:00.000Z'),
        dataReferencia: '2026-08-17',
        timeCasaId: lalId,
        timeVisitanteId: bosId,
        status: 'ENCERRADO',
        placarCasa: 112,
        placarVisitante: 105,
      })
      .returning()

    const tela = await telaDoTime(banco.db, lalId, { temporada: TEMPORADA })
    const jogo = tela!.jogosDoTime.find((x) => x.jogoId === j!.id)!

    // Zerar os quartos ao lado do total real mostrava "0 0 0 0 | 112" —
    // números que não fecham e que o usuário lê como dado, não como buraco.
    expect(jogo.nosso).toBeNull()
    expect(jogo.rebotesTotal).toBeNull()
    expect(jogo.placar).toBe('112–105')
  })

  it('média ignora o jogo sem o número, em vez de contá-lo como zero', async () => {
    const [p] = await banco.db
      .insert(jogadores)
      .values({ nomeCompleto: 'Minutos Faltantes', timeId: lalId })
      .returning()

    const MINUTOS: (string | null)[] = ['36.00', null, '34.00']
    for (const [i, minutos] of MINUTOS.entries()) {
      const [j] = await banco.db
        .insert(jogos)
        .values({
          dataHoraUtc: new Date(`2026-08-${10 + i}T23:00:00.000Z`),
          dataReferencia: `2026-08-${10 + i}`,
          timeCasaId: lalId,
          timeVisitanteId: bosId,
          status: 'ENCERRADO',
          placarCasa: 100,
          placarVisitante: 90,
        })
        .returning()
      await banco.db
        .insert(estatisticasJogo)
        .values({ jogoId: j!.id, jogadorId: p!.id, minutos, pontos: 10 })
    }

    const tela = await telaDoJogador(banco.db, p!.id, { temporada: TEMPORADA })
    // Jogou 36 e 34: a média de quem jogou é 35. Contar o nulo como 0 daria
    // 23,3 e faria o titular parecer reserva por causa de um buraco no dado.
    expect(tela!.perfilNumeros.posse.minutos).toBe(35)
  })
})

// ===========================================================================
// BUSCA SOB ENTRADA HOSTIL
// ===========================================================================

describe('busca resiste a entrada hostil', () => {
  it('caractere especial de regex não estoura', async () => {
    for (const termo of ['(', '[a-z]+', '.*', '\\', '$^', '((((']) {
      await expect(buscar(banco.db, termo), `termo ${termo}`).resolves.toBeDefined()
    }
  })

  it('consulta gigante não trava a tela', async () => {
    const inicio = Date.now()
    await buscar(banco.db, 'a'.repeat(5000))
    expect(Date.now() - inicio).toBeLessThan(3000)
  })

  it('uma letra não devolve o elenco inteiro', async () => {
    // "a" está contido em quase todo nome. Devolver todos é ruído com cara de
    // resultado — abaixo de 3 letras só a grafia aproximada responde.
    const r = await buscar(banco.db, 'a', { apenas: 'JOGADOR' })
    expect(r.length, `"a" devolveu ${r.length} jogadores`).toBeLessThan(3)
  })

  it('três letras já discriminam e continuam achando', async () => {
    const r = await buscar(banco.db, 'bru', { apenas: 'JOGADOR' })
    expect(r.map((x) => x.nome)).toContain('Jalen Brunson')
  })
})

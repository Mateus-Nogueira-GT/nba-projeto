import { identidadesDeApresentacao } from '../../dominio/identidade-apresentacao'
import { and, asc, desc, eq, gte, inArray, isNotNull, lte, or, sql } from 'drizzle-orm'

import {
  classificacao,
  estatisticasJogo,
  estatisticasTimeJogo,
  jogadores,
  jogos,
  lesoesEscalacao,
  niveis,
  niveisVersao,
  times,
} from '../../dominio/db/schema'
import type { Db } from '../../dominio/db/tipos'
import { ordenarHierarquia, timeNaData } from '../../dominio/retroativo/regras'
import { temporadaDe, type ConfigTemporada } from '../../dominio/temporada'

// A aba de estatísticas NÃO importa do motor (regra `estatisticas-nao-passam-
// pelo-motor`). Atributo e nível vêm do schema — é a lista do CJ como dado
// gravado, não como regra.
type Atributo = (typeof niveis.$inferSelect)['atributo']
type Nivel = (typeof niveis.$inferSelect)['nivel']
import { daColuna, maisAntiga } from './atualizacao'
import type { ComAtualizacao } from './atualizacao'
import { LIMITE_FORMA } from './jogo'
import { numero, percentual } from './numeros'

export type QuebraPorQuarto = {
  q1: number
  q2: number
  q3: number
  q4: number
  prorrogacao: number
  total: number
}

export type BoxScoreDoJogo = {
  jogoId: string
  data: Date
  adversarioSigla: string
  emCasa: boolean
  resultado: 'V' | 'D' | null
  placar: string | null
  /**
   * Quebra por quarto do time consultado.
   *
   * NULL quando o box score do time ainda não chegou. Antes isto era um objeto
   * com quartos zerados e o total real do placar — a tela mostrava
   * "0 0 0 0 | 112", números que não fecham e que o usuário lê como dado, não
   * como ausência. Ingestão parcial é rotina; anunciá-la é obrigação.
   */
  nosso: QuebraPorQuarto | null
  /** Quebra por quarto do adversário, para leitura lado a lado. */
  deles: QuebraPorQuarto | null
  fgPercentual: number | null
  tresPercentual: number | null
  rebotesTotal: number | null
  assistencias: number | null
  turnovers: number | null
}

export type TelaTime = ComAtualizacao & {
  time: {
    id: string
    sigla: string
    nome: string
    logoUrl: string | null
    conferencia: string | null
  }
  campanha: {
    posicao: number | null
    vitorias: number
    derrotas: number
    /** 0..1. A tela formata como percentual. */
    aproveitamento: number | null
    /** Ex.: "V3", "D2". Vem do provedor. */
    sequencia: string | null
  } | null
  elenco: { id: string; nome: string; posicao: string | null; numeroCamisa: number | null }[]
  jogosDoTime: BoxScoreDoJogo[]
}

function quebra(l: {
  pontos: number
  pontosQ1: number
  pontosQ2: number
  pontosQ3: number
  pontosQ4: number
  pontosProrrogacao: number
}): QuebraPorQuarto {
  return {
    q1: l.pontosQ1,
    q2: l.pontosQ2,
    q3: l.pontosQ3,
    q4: l.pontosQ4,
    prorrogacao: l.pontosProrrogacao,
    total: l.pontos,
  }
}

export async function telaDoTime(
  db: Db,
  timeId: string,
  opcoes: {
    temporada: string
    limiteJogos?: number
    /**
     * Recorte das partidas por dia da rodada, inclusive nas duas pontas. Só a
     * temporada ANTERIOR o passa: sem ele, "as mais recentes" seriam as da
     * temporada de hoje debaixo do rótulo da passada. Na temporada atual a
     * consulta segue a de sempre.
     */
    periodo?: { de: string; ate: string }
  },
): Promise<TelaTime | null> {
  const [time] = await db.select().from(times).where(eq(times.id, timeId)).limit(1)
  if (!time) return null

  const limite = opcoes.limiteJogos ?? 20

  const [campanhaLinhas, partidas, elenco] = await Promise.all([
    db
      .select()
      .from(classificacao)
      .where(and(eq(classificacao.timeId, timeId), eq(classificacao.temporada, opcoes.temporada)))
      .limit(1),
    db
      .select()
      .from(jogos)
      .where(
        and(
          or(eq(jogos.timeCasaId, timeId), eq(jogos.timeVisitanteId, timeId)),
          opcoes.periodo ? gte(jogos.dataReferencia, opcoes.periodo.de) : undefined,
          opcoes.periodo ? lte(jogos.dataReferencia, opcoes.periodo.ate) : undefined,
        ),
      )
      .orderBy(desc(jogos.dataHoraUtc))
      .limit(limite),
    db.select().from(jogadores).where(eq(jogadores.timeId, timeId)),
  ])

  const idsJogo = partidas.map((p) => p.id)

  const [boxes, listaTimes] = await Promise.all([
    idsJogo.length > 0
      ? db.select().from(estatisticasTimeJogo).where(inArray(estatisticasTimeJogo.jogoId, idsJogo))
      : Promise.resolve([]),
    db.select().from(times),
  ])

  const siglaPorTime = new Map(listaTimes.map((t) => [t.id, t.sigla] as const))

  const jogosDoTime: BoxScoreDoJogo[] = partidas.map((jogo) => {
    const emCasa = jogo.timeCasaId === timeId
    const adversarioId = emCasa ? jogo.timeVisitanteId : jogo.timeCasaId

    const nosso = boxes.find((b) => b.jogoId === jogo.id && b.timeId === timeId)
    const deles = boxes.find((b) => b.jogoId === jogo.id && b.timeId === adversarioId)

    const temPlacar = jogo.placarCasa !== null && jogo.placarVisitante !== null
    const meus = emCasa ? jogo.placarCasa : jogo.placarVisitante
    const outros = emCasa ? jogo.placarVisitante : jogo.placarCasa
    // VEREDITO SÓ DE JOGO ENCERRADO. Um jogo AO VIVO tem placar parcial: a
    // coluna "Res" derivava V/D de qualquer placar não-nulo e anunciava
    // vencedor de partida no 1º quarto. O placar parcial continua aparecendo;
    // o que some é a sentença.
    const encerrado = jogo.status === 'ENCERRADO'

    return {
      jogoId: jogo.id,
      data: jogo.dataHoraUtc,
      adversarioSigla: siglaPorTime.get(adversarioId) ?? '—',
      emCasa,
      resultado: encerrado && temPlacar ? (meus! > outros! ? 'V' : 'D') : null,
      placar: temPlacar ? `${jogo.placarCasa}–${jogo.placarVisitante}` : null,
      nosso: nosso ? quebra(nosso) : null,
      deles: deles ? quebra(deles) : null,
      fgPercentual: nosso ? percentual(nosso.cestasC, nosso.cestasT) : null,
      tresPercentual: nosso ? percentual(nosso.tresC, nosso.tresT) : null,
      rebotesTotal: nosso?.rebotesTotal ?? null,
      assistencias: nosso?.assistencias ?? null,
      turnovers: nosso?.turnovers ?? null,
    }
  })

  const campanha = campanhaLinhas[0]

  const identidades = await identidadesDeApresentacao(
    db,
    elenco.map((j) => j.id),
  )

  return {
    time: {
      id: time.id,
      sigla: time.sigla,
      nome: time.nome,
      logoUrl: time.logoUrl,
      conferencia: time.conferencia,
    },
    campanha: campanha
      ? {
          posicao: campanha.posicao,
          vitorias: campanha.vitorias,
          derrotas: campanha.derrotas,
          aproveitamento: numero(campanha.aproveitamento),
          sequencia: campanha.sequencia,
        }
      : null,
    elenco: elenco
      .map((j) => ({
        id: j.id,
        nome: identidades.get(j.id)?.nome ?? j.nomeCompleto,
        posicao: j.posicao,
        numeroCamisa: j.numeroCamisa,
      }))
      .sort((a, b) => a.nome.localeCompare(b.nome)),
    jogosDoTime,
    atualizacao: maisAntiga([
      campanha ? { em: campanha.atualizadoEm, fonte: 'classificação' } : null,
      daColuna(boxes, 'box score do time'),
      daColuna(partidas, 'partidas'),
    ]),
  }
}

/** Uma posição da hierarquia do CJ no atributo, e se está fora do jogo dado. */
export type LinhaHierarquia = {
  posicao: number
  jogadorId: string
  nome: string
  nivel: Nivel
  /** FORA em `lesoes_escalacao` para `jogoId`; sempre false sem jogo. */
  fora: boolean
}

/**
 * A HIERARQUIA DO CJ POR ATRIBUTO — o depth chart do Sofascore com a regra do
 * CJ em cima (identidade 04). É a OPD visualizada: a tela marca o PREFIXO
 * desfalcado em destaque, porque é só ele que abre a regra (se o nº 2 falta e
 * o nº 1 joga, não há apito).
 *
 * Vem de `niveis` (versão ativa), a curadoria — rotulada na tela como "lista
 * do CJ", à parte do elenco real de `jogadores.time_id`. Sem rótulo, a
 * divergência (Giannis no Miami) seria lida como bug.
 */
export async function hierarquiaDoTime(
  db: Db,
  timeId: string,
  atributo: Atributo,
  jogoId: string | null,
  opcoes: {
    /**
     * Uma temporada ANTERIOR à do calendário: a hierarquia é REMONTADA com o
     * time em que cada jogador da lista JOGOU até `data` (decisão 2) e
     * ordenada pelo nível do jogador e, no mesmo nível, pela posição dele na
     * lista do CJ (decisão 3) — a mesma regra de `montarFatosRetroativos`.
     */
    temporadaAnterior?: { temporada: string; data: string; calendario: ConfigTemporada }
  } = {},
): Promise<LinhaHierarquia[]> {
  const [versao] = await db.select().from(niveisVersao).where(eq(niveisVersao.ativa, true)).limit(1)
  if (!versao) return []
  if (opcoes.temporadaAnterior) {
    return hierarquiaRetroativa(db, versao.id, timeId, atributo, opcoes.temporadaAnterior)
  }

  const [linhas, fora] = await Promise.all([
    db
      .select({
        posicao: niveis.posicaoHierarquia,
        jogadorId: niveis.jogadorId,
        nome: jogadores.nomeCompleto,
        nivel: niveis.nivel,
      })
      .from(niveis)
      .innerJoin(jogadores, eq(niveis.jogadorId, jogadores.id))
      .where(
        and(
          eq(niveis.niveisVersaoId, versao.id),
          eq(niveis.timeId, timeId),
          eq(niveis.atributo, atributo),
        ),
      )
      .orderBy(asc(niveis.posicaoHierarquia)),
    jogoId === null
      ? Promise.resolve([] as { jogadorId: string }[])
      : db
          .select({ jogadorId: lesoesEscalacao.jogadorId })
          .from(lesoesEscalacao)
          .where(and(eq(lesoesEscalacao.jogoId, jogoId), eq(lesoesEscalacao.status, 'FORA'))),
  ])
  const identidades = await identidadesDeApresentacao(
    db,
    linhas.map((l) => l.jogadorId),
  )
  const desfalcados = new Set(fora.map((f) => f.jogadorId))
  return linhas.map((l) => ({
    ...l,
    nome: identidades.get(l.jogadorId)?.nome ?? l.nome,
    fora: desfalcados.has(l.jogadorId),
  }))
}

/**
 * A hierarquia de um time numa temporada que já acabou. Sem `fora`: o
 * desfalque é de um JOGO, e aqui não há jogo de hoje a marcar.
 *
 * O time de cada jogador sai do BOX SCORE (`estatisticas_jogo.time_id`), não
 * da lista do CJ — a lista dá o nível e a posição, não o time. Só conta o box
 * da temporada pedida: o último jogo de outra temporada não põe ninguém no
 * elenco desta. Jogador fora da lista do CJ não entra (spec 25/09, §6).
 */
async function hierarquiaRetroativa(
  db: Db,
  versaoId: string,
  timeId: string,
  atributo: Atributo,
  anterior: { temporada: string; data: string; calendario: ConfigTemporada },
): Promise<LinhaHierarquia[]> {
  const classes = await db
    .select({
      jogadorId: niveis.jogadorId,
      nivel: niveis.nivel,
      posicaoCj: niveis.posicaoHierarquia,
      nome: jogadores.nomeCompleto,
    })
    .from(niveis)
    .innerJoin(jogadores, eq(niveis.jogadorId, jogadores.id))
    .where(and(eq(niveis.niveisVersaoId, versaoId), eq(niveis.atributo, atributo)))
  if (classes.length === 0) return []

  // O ÚLTIMO jogo de cada jogador até a data, no banco: é só dele que
  // `timeNaData` precisa, e a liga inteira de box não viaja para a memória.
  const ultimos = await db
    .selectDistinctOn([estatisticasJogo.jogadorId], {
      jogadorId: estatisticasJogo.jogadorId,
      timeId: estatisticasJogo.timeId,
      data: jogos.dataReferencia,
      dataHoraUtc: jogos.dataHoraUtc,
    })
    .from(estatisticasJogo)
    .innerJoin(jogos, eq(jogos.id, estatisticasJogo.jogoId))
    .where(
      and(
        inArray(
          estatisticasJogo.jogadorId,
          classes.map((c) => c.jogadorId),
        ),
        isNotNull(estatisticasJogo.timeId),
        lte(jogos.dataReferencia, anterior.data),
      ),
    )
    .orderBy(estatisticasJogo.jogadorId, desc(jogos.dataReferencia), desc(jogos.dataHoraUtc))

  const doTime = new Set(
    ultimos
      .filter((u) => temporadaDe(u.dataHoraUtc, anterior.calendario) === anterior.temporada)
      .filter((u) => timeNaData([u], anterior.data) === timeId)
      .map((u) => u.jogadorId),
  )
  const membros = classes.filter((c) => doTime.has(c.jogadorId))
  const posicoes = ordenarHierarquia(membros)
  const identidades = await identidadesDeApresentacao(
    db,
    membros.map((m) => m.jogadorId),
  )
  return membros
    .map((m) => ({
      posicao: posicoes.get(m.jogadorId)!,
      jogadorId: m.jogadorId,
      nome: identidades.get(m.jogadorId)?.nome ?? m.nome,
      nivel: m.nivel,
      fora: false,
    }))
    .sort((a, b) => a.posicao - b.posicao)
}

export type TelaClassificacao = ComAtualizacao & {
  temporada: string
  linhas: {
    timeId: string
    sigla: string
    nome: string
    conferencia: string | null
    posicao: number | null
    vitorias: number
    derrotas: number
    aproveitamento: number | null
    sequencia: string | null
    /**
     * Os últimos resultados (V/D), do mais recente para o mais antigo — a
     * mesma "forma" que a tela de partida mostra sob o placar
     * (`LadoDaPartida.forma`), aqui como os pontinhos da classificação.
     *
     * Vazio quando o time ainda não encerrou partida: a tela escreve "—" em
     * vez de inventar resultado.
     */
    forma: ('V' | 'D')[]
  }[]
}

/** Classificação da liga — a entrada "por time" do menu. */
export async function telaDaClassificacao(db: Db, temporada: string): Promise<TelaClassificacao> {
  // LIMIT por time, dentro do banco: um calendário desigual não pode consumir
  // a janela de outra equipe. O lateral mantém uma única ida ao banco e no
  // máximo cinco resultados por time, sem um recorte arbitrário da liga.
  const ultimasPartidas = db
    .select({
      id: jogos.id,
      dataHoraUtc: jogos.dataHoraUtc,
      timeCasaId: jogos.timeCasaId,
      placarCasa: jogos.placarCasa,
      placarVisitante: jogos.placarVisitante,
    })
    .from(jogos)
    .where(
      and(
        eq(jogos.status, 'ENCERRADO'),
        isNotNull(jogos.placarCasa),
        isNotNull(jogos.placarVisitante),
        or(
          eq(jogos.timeCasaId, classificacao.timeId),
          eq(jogos.timeVisitanteId, classificacao.timeId),
        ),
      ),
    )
    .orderBy(desc(jogos.dataHoraUtc), asc(jogos.id))
    .limit(LIMITE_FORMA)
    .as('ultimas_partidas')
  const [linhas, recentes] = await Promise.all([
    db
      .select({ c: classificacao, t: times })
      .from(classificacao)
      .innerJoin(times, eq(classificacao.timeId, times.id))
      .where(eq(classificacao.temporada, temporada)),
    // A forma nasce do JOGO ENCERRADO, aqui na entrega: derivá-la na tela
    // faria cada tela ter a sua definição de "últimos 5".
    db
      .select({
        timeId: classificacao.timeId,
        timeCasaId: ultimasPartidas.timeCasaId,
        placarCasa: ultimasPartidas.placarCasa,
        placarVisitante: ultimasPartidas.placarVisitante,
      })
      .from(classificacao)
      .leftJoinLateral(ultimasPartidas, sql`true`)
      .where(eq(classificacao.temporada, temporada))
      .orderBy(
        asc(classificacao.timeId),
        desc(ultimasPartidas.dataHoraUtc),
        asc(ultimasPartidas.id),
      ),
  ])

  const forma = new Map<string, ('V' | 'D')[]>()
  for (const jogo of recentes) {
    if (jogo.placarCasa === null || jogo.placarVisitante === null) continue
    const emCasa = jogo.timeId === jogo.timeCasaId
    const meus = emCasa ? jogo.placarCasa : jogo.placarVisitante
    const deles = emCasa ? jogo.placarVisitante : jogo.placarCasa
    const lista = forma.get(jogo.timeId) ?? []
    lista.push(meus > deles ? 'V' : 'D')
    forma.set(jogo.timeId, lista)
  }

  return {
    temporada,
    linhas: linhas
      .map(({ c, t }) => ({
        timeId: t.id,
        sigla: t.sigla,
        nome: t.nome,
        conferencia: c.conferencia ?? t.conferencia,
        posicao: c.posicao,
        vitorias: c.vitorias,
        derrotas: c.derrotas,
        aproveitamento: numero(c.aproveitamento),
        sequencia: c.sequencia,
        forma: forma.get(t.id) ?? [],
      }))
      .sort((a, b) => (a.posicao ?? 99) - (b.posicao ?? 99) || a.nome.localeCompare(b.nome)),
    atualizacao: daColuna(
      linhas.map((l) => l.c),
      'classificação',
    ) ?? { em: new Date(0), fonte: 'sem dado' },
  }
}

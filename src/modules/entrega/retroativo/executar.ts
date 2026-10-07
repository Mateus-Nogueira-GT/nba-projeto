import { createHash } from 'node:crypto'
import { and, count, eq, gte, inArray, lt, or, sql } from 'drizzle-orm'

import {
  apitosRetroativos,
  feedRetroativo,
  greensRetroativos,
  jogadores,
  jogos,
  niveis,
  niveisVersao,
  times,
} from '../../dominio/db/schema'
import type { Db } from '../../dominio/db/tipos'
import { identidadesDeApresentacao } from '../../dominio/identidade-apresentacao'
import { montarFatosRetroativos, versaoDaListaRetroativa } from '../../dominio/retroativo/fatos'
import { dataDeReferencia, intervaloDoDia } from '../../dominio/rodada'
import { calendarioDoRuleset, temporadaDe, type ConfigTemporada } from '../../dominio/temporada'
import { avaliar, avaliarFireLive, type Green } from '../../motor'
import type { Ruleset } from '../../motor/ruleset/schema'
import type { Apito, NivelApito } from '../../motor/tipos'
import { datasDoPeriodo, type PeriodoBacktest } from '../backtest/executar'
import type { ConteudoFeed } from '../tipos-feed'
import { montarItensRetroativos, type IdentidadeItem } from './feed'
import { ehTemporadaAnterior } from './temporada'

/**
 * EXECUTOR DA TEMPORADA ANTERIOR (spec 25/09) — o motor de sempre, sem mudar
 * uma linha, rodado dia a dia sobre os fatos de uma temporada que já acabou.
 *
 * NUNCA PUSH — este módulo não importa `entrega/push` nem `entrega/fila`, e a
 * regra `retroativo-sem-push` do dependency-cruiser garante. Também nunca
 * grava em `apitos`, `greens` ou `feed_snapshot`: nada daqui foi publicado na
 * época, e o que vai para as tabelas do app ao vivo vira push, Placar e
 * histórico de assinante (decisão 5).
 *
 * Cada dia é APAGAR E REGRAVAR numa transação. É isso que faz a troca da lista
 * do CJ regravar o dia com a versão nova em vez de somar a ela, e o que torna
 * reexecutar seguro: o resultado depende só dos fatos e do ruleset.
 */

export type ResultadoDiaRetroativo = { apitos: number; greens: number; jogos: number }

const ZERADO: ResultadoDiaRetroativo = { apitos: 0, greens: 0, jogos: 0 }

/** Mesmo recorte de `publicarListaSecreta`: o item inteiro, sem o horário de geração. */
function hashDe(conteudo: ConteudoFeed): string {
  return createHash('sha256').update(JSON.stringify(conteudo.itens)).digest('hex').slice(0, 16)
}

/** O rótulo da temporada de um dia — meio-dia UTC, para não depender do fuso de quem roda. */
function temporadaDoDia(dataReferencia: string, calendario: ConfigTemporada): string {
  return temporadaDe(new Date(`${dataReferencia}T12:00:00Z`), calendario)
}

function recusarTemporadaDoCalendario(temporada: string, doCalendario: string): void {
  if (temporada === doCalendario) {
    throw new Error(
      `motor:retroativo só roda em temporada anterior — a temporada do calendário (${doCalendario}) ` +
        'é publicada pelo job diário',
    )
  }
  // Uma temporada FUTURA ainda não aconteceu: não há o que reproduzir.
  if (!ehTemporadaAnterior(temporada, doCalendario)) {
    throw new Error(
      `motor:retroativo só roda em temporada anterior — ${temporada} é posterior à do calendário (${doCalendario})`,
    )
  }
}

/**
 * A temporada de um intervalo do `motor:retroativo`: o intervalo INTEIRO tem
 * de ser uma temporada só, e anterior à do calendário. Como uma temporada é
 * um trecho contínuo do calendário, as duas pontas na mesma temporada
 * garantem que todo dia do meio também está nela.
 */
export function temporadaDoIntervalo(
  de: string,
  ate: string,
  calendario: ConfigTemporada,
  agora: Date,
): string {
  const temporadaDe_ = temporadaDoDia(de, calendario)
  const temporadaAte = temporadaDoDia(ate, calendario)
  if (temporadaDe_ !== temporadaAte) {
    throw new Error(
      `motor:retroativo roda uma temporada só por vez — --de é de ${temporadaDe_} e --ate é de ${temporadaAte}`,
    )
  }
  recusarTemporadaDoCalendario(temporadaDe_, temporadaDe(agora, calendario))
  return temporadaDe_
}

export async function executarDiaRetroativo(
  db: Db,
  ruleset: Ruleset,
  dataReferencia: string,
  opcoes: { agora?: Date } = {},
): Promise<ResultadoDiaRetroativo> {
  const calendario = calendarioDoRuleset(ruleset)
  const temporada = temporadaDoDia(dataReferencia, calendario)
  // Defesa em profundidade, além do script: um dia da temporada do calendário
  // nunca vai para as tabelas retroativas — é da temporada paga, publicada
  // ao vivo. O relógio entra como opção para o teste poder fixá-lo.
  recusarTemporadaDoCalendario(temporada, temporadaDe(opcoes.agora ?? new Date(), calendario))

  const { niveisVersaoId, ...fatos } = await montarFatosRetroativos(db, dataReferencia, {
    calendario,
    janela: ruleset.media.janela,
    // O quarto sai do ruleset, nunca de um literal: "Fire Live é só 1º quarto"
    // é regra do yaml.
    quartoFireLive: ruleset.fire_live.quarto,
  })
  if (niveisVersaoId === null) return ZERADO
  if (fatos.jogos.length === 0) {
    // O dia ficou sem jogo — ou nunca teve, ou o jogo dele mudou de rodada.
    // O que estava gravado para esta data é velho: apaga, não regrava. Só com
    // lista classificada: versão vazia também devolve zero jogos, e aí apagar
    // seria perder o dia por causa de um import incompleto.
    const [classificadas] = await db
      .select({ n: count() })
      .from(niveis)
      .where(eq(niveis.niveisVersaoId, niveisVersaoId))
    if (classificadas?.n) await db.transaction(async (tx) => apagarDia(tx, dataReferencia, []))
    return ZERADO
  }

  // Lista Secreta e Fire Live — o mesmo `avaliar` do backtest. A deduplicação
  // é a mesma do ao vivo (`gravarApitos`, ON CONFLICT DO NOTHING na chave da
  // regra 5): fica o primeiro de cada chave.
  const apitos = primeiroDeCada(avaliar(fatos, ruleset), chaveDeApito)

  // Greens: o Fire Live com a OPD da Lista do próprio dia, como o ao vivo
  // recebe a OPD publicada.
  const timesPorId = new Map(fatos.times.map((t) => [t.id, t] as const))
  const greens: Green[] = []
  for (const jogo of fatos.jogos) {
    const opdPreLive = new Map<string, NivelApito>(
      apitos
        .filter(
          (a) => a.jogoId === jogo.id && a.estrategia === 'LISTA_SECRETA' && a.metodo === 'OPD',
        )
        .map((a) => [a.jogadorId, a.nivelApito] as const),
    )
    for (const timeId of [jogo.timeCasaId, jogo.timeVisitanteId]) {
      const time = timesPorId.get(timeId)
      if (!time) continue
      greens.push(...avaliarFireLive(time, jogo, ruleset, { opdPreLive }).greens)
    }
  }
  const greensUnicos = primeiroDeCada(greens, chaveDeGreen)

  const daLista = apitos.filter((a) => a.estrategia === 'LISTA_SECRETA')
  const [versao, nomes] = await Promise.all([
    db
      .select({ versao: niveisVersao.versao })
      .from(niveisVersao)
      .where(eq(niveisVersao.id, niveisVersaoId))
      .then((r) => r[0]),
    identidadesDoDia(db, daLista, fatos.times),
  ])

  const rulesetVersao = `v${ruleset.version}`
  const conteudo: ConteudoFeed = {
    dataReferencia,
    geradoEm: new Date().toISOString(),
    rulesetVersao: versao ? `${rulesetVersao}+${versao.versao}` : rulesetVersao,
    itens: montarItensRetroativos(daLista, fatos, nomes, ruleset),
  }

  await db.transaction(async (tx) => {
    await apagarDia(
      tx,
      dataReferencia,
      fatos.jogos.map((j) => j.id),
    )

    if (apitos.length > 0) {
      await tx
        .insert(apitosRetroativos)
        .values(
          apitos.map((a) =>
            linhaDeApito(a, { temporada, dataReferencia, niveisVersaoId, rulesetVersao }),
          ),
        )
    }
    if (greensUnicos.length > 0) {
      await tx.insert(greensRetroativos).values(
        greensUnicos.map((g) => ({
          temporada,
          dataReferencia,
          jogoId: g.jogoId,
          jogadorId: g.jogadorId,
          atributo: g.atributo,
          nivelJogador: g.nivelJogador,
          marco: g.marco,
          valor: g.valor,
        })),
      )
    }
    await tx.insert(feedRetroativo).values({
      temporada,
      dataReferencia,
      niveisVersaoId,
      conteudoJson: conteudo,
      hash: hashDe(conteudo),
    })
  })

  return { apitos: apitos.length, greens: greensUnicos.length, jogos: fatos.jogos.length }
}

/**
 * Apaga o que o dia vai regravar: pela DATA e, nos apitos e greens, também
 * pelo JOGO. Um jogo que trocou de rodada (fuso do dia mudou, remarcação)
 * deixava a linha velha na data antiga — e ela bloqueava a chave de
 * deduplicação do mesmo jogo na data nova. O feed é por data e só sai pela data.
 */
async function apagarDia(db: Db, dataReferencia: string, idsJogo: string[]): Promise<void> {
  const doApito =
    idsJogo.length > 0
      ? or(
          eq(apitosRetroativos.dataReferencia, dataReferencia),
          inArray(apitosRetroativos.jogoId, idsJogo),
        )
      : eq(apitosRetroativos.dataReferencia, dataReferencia)
  const doGreen =
    idsJogo.length > 0
      ? or(
          eq(greensRetroativos.dataReferencia, dataReferencia),
          inArray(greensRetroativos.jogoId, idsJogo),
        )
      : eq(greensRetroativos.dataReferencia, dataReferencia)
  await db.delete(apitosRetroativos).where(doApito)
  await db.delete(greensRetroativos).where(doGreen)
  await db.delete(feedRetroativo).where(eq(feedRetroativo.dataReferencia, dataReferencia))
}

/**
 * DOIS JOGOS DO MESMO TIME NUMA RODADA (achado de 06/10/2026, 08/11/2025).
 *
 * Com a rodada no fuso de Brasília, um jogo às 22h de Nova York começava à
 * meia-noite daqui e caía na rodada SEGUINTE — então o Denver teve DEN×GSW
 * (da noite anterior) e DEN×IND na mesma rodada, e o motor emitiu o mesmo
 * apito do Fire Live duas vezes, idênticos. O ao vivo descarta o repetido pela
 * constraint; aqui ele quebrava o INSERT do dia inteiro. Desde 07/10/2026 a
 * rodada é a data dos EUA e esse caso some, mas a deduplicação fica: é a mesma
 * regra 5 do ao vivo, e não custa nada.
 */
export function primeiroDeCada<T>(itens: T[], chave: (item: T) => string): T[] {
  const vistos = new Set<string>()
  return itens.filter((item) => {
    const k = chave(item)
    if (vistos.has(k)) return false
    vistos.add(k)
    return true
  })
}

/** As colunas de `apitos_retroativos_dedup` (as mesmas de `apitos_dedup`). */
export const chaveDeApito = (a: Apito): string =>
  [a.jogoId, a.jogadorId, a.atributo, a.estrategia, a.linha ?? ''].join('|')

/** As colunas de `greens_retroativos_unico`. */
const chaveDeGreen = (g: Green): string => [g.jogoId, g.jogadorId, g.atributo, g.marco].join('|')

function linhaDeApito(
  a: Apito,
  dia: { temporada: string; dataReferencia: string; niveisVersaoId: string; rulesetVersao: string },
) {
  return {
    ...dia,
    jogoId: a.jogoId,
    jogadorId: a.jogadorId,
    atributo: a.atributo,
    estrategia: a.estrategia,
    metodo: a.metodo,
    nivelJogador: a.nivelJogador,
    nivelApito: a.nivelApito,
    turbo: a.turbo,
    modoFire: a.modoFire,
    opdOrigemNivel: a.opdOrigemNivel,
    linha: a.linha,
    confianca: a.confianca === null ? null : String(a.confianca),
    alvo1q: a.alvo1Q,
  }
}

/**
 * Nome, foto, posição e TIME DO DIA de cada apitado. O time é o `TimeFato`
 * que contém o jogador — o que ele jogou naquela data —, nunca o vínculo da
 * lista do CJ, que é o de hoje.
 */
async function identidadesDoDia(
  db: Db,
  apitos: Apito[],
  timesDoDia: { id: string; jogadores: { id: string }[] }[],
): Promise<Map<string, IdentidadeItem>> {
  const ids = [...new Set(apitos.map((a) => a.jogadorId))]
  if (ids.length === 0) return new Map()

  const timeDoJogador = new Map<string, string>()
  for (const t of timesDoDia) for (const j of t.jogadores) timeDoJogador.set(j.id, t.id)
  const idsTime = [...new Set(ids.flatMap((id) => timeDoJogador.get(id) ?? []))]

  const [elenco, listaTimes, identidades] = await Promise.all([
    db.select().from(jogadores).where(inArray(jogadores.id, ids)),
    idsTime.length > 0
      ? db.select().from(times).where(inArray(times.id, idsTime))
      : Promise.resolve([]),
    identidadesDeApresentacao(db, ids),
  ])
  const timePorId = new Map(listaTimes.map((t) => [t.id, t] as const))

  return new Map(
    elenco.map((j) => {
      const time = timePorId.get(timeDoJogador.get(j.id) ?? '')
      return [
        j.id,
        {
          nome: identidades.get(j.id)?.nome ?? j.nomeCompleto,
          fotoUrl: j.fotoUrl,
          timeSigla: time?.sigla ?? '—',
          timeNome: time?.nome ?? '—',
          posicao: j.posicao,
        },
      ] as const
    }),
  )
}

export type LinhasRetroativas = { apitos: number; greens: number; feed: number }

/** Quantas linhas a temporada tem nas três tabelas retroativas (o dry-run do `--limpar-temporada`). */
export async function contarTemporadaRetroativa(db: Db, temporada: string): Promise<LinhasRetroativas> {
  const [[a], [g], [f]] = await Promise.all([
    db.select({ n: count() }).from(apitosRetroativos).where(eq(apitosRetroativos.temporada, temporada)),
    db.select({ n: count() }).from(greensRetroativos).where(eq(greensRetroativos.temporada, temporada)),
    db.select({ n: count() }).from(feedRetroativo).where(eq(feedRetroativo.temporada, temporada)),
  ])
  return { apitos: a?.n ?? 0, greens: g?.n ?? 0, feed: f?.n ?? 0 }
}

/**
 * APAGA A TEMPORADA INTEIRA das três tabelas retroativas, numa transação.
 *
 * Existe por causa da rodada pela data dos EUA (decisão de 07/10/2026): quando
 * o fuso do dia muda, um jogo troca de rodada. Regravar dia a dia apaga só o
 * dia que regrava — o dia que PERDEU o jogo ficaria com o apito velho, e o
 * apito velho ainda bloquearia a chave `apitos_retroativos_dedup` do mesmo
 * jogo no dia novo. Limpar a temporada antes é o que torna a troca de fuso
 * reexecutável.
 */
export async function limparTemporadaRetroativa(db: Db, temporada: string): Promise<LinhasRetroativas> {
  return db.transaction(async (tx) => {
    // Em sequência: uma transação é uma conexão só.
    const apitos = await tx
      .delete(apitosRetroativos)
      .where(eq(apitosRetroativos.temporada, temporada))
      .returning({ id: apitosRetroativos.id })
    const greens = await tx
      .delete(greensRetroativos)
      .where(eq(greensRetroativos.temporada, temporada))
      .returning({ id: greensRetroativos.id })
    const feed = await tx
      .delete(feedRetroativo)
      .where(eq(feedRetroativo.temporada, temporada))
      .returning({ id: feedRetroativo.id })
    return { apitos: apitos.length, greens: greens.length, feed: feed.length }
  })
}

/**
 * A trava do `--limpar-temporada`: só apaga a temporada quem vai regravá-la
 * INTEIRA, e com uma lista do CJ para regravar.
 *
 * - `de..ate` cobre do primeiro ao último jogo ENCERRADO da temporada (a data
 *   do jogo é a da rodada, no fuso do ruleset — a mesma que o executor usa).
 *   Um trecho parcial apagaria os dias de fora sem regravá-los.
 * - a versão que `montarFatosRetroativos` usa (a ativa) existe e tem
 *   classificação. Sem ela todo dia sai vazio, e a limpeza vira só apagar.
 */
export async function conferirLimpezaDaTemporada(
  db: Db,
  calendario: ConfigTemporada,
  temporada: string,
  periodo: { de: string; ate: string },
): Promise<void> {
  const anoInicial = Number(temporada.slice(0, 4))
  const mes = String(calendario.mesInicio).padStart(2, '0')
  const inicio = intervaloDoDia(`${String(anoInicial).padStart(4, '0')}-${mes}-01`, calendario.fuso).inicio
  const fim = intervaloDoDia(`${String(anoInicial + 1).padStart(4, '0')}-${mes}-01`, calendario.fuso).inicio

  const [extremos] = await db
    .select({
      primeiro: sql<string | null>`min(${jogos.dataHoraUtc})`,
      ultimo: sql<string | null>`max(${jogos.dataHoraUtc})`,
    })
    .from(jogos)
    .where(and(eq(jogos.status, 'ENCERRADO'), gte(jogos.dataHoraUtc, inicio), lt(jogos.dataHoraUtc, fim)))
  if (!extremos?.primeiro || !extremos.ultimo) {
    throw new Error(`--limpar-temporada: ${temporada} não tem jogo ENCERRADO no banco — nada a regravar`)
  }
  const primeiraData = dataDeReferencia(new Date(extremos.primeiro), calendario.fuso)
  const ultimaData = dataDeReferencia(new Date(extremos.ultimo), calendario.fuso)
  if (periodo.de > primeiraData || periodo.ate < ultimaData) {
    throw new Error(
      `--limpar-temporada apaga a temporada inteira e só roda sobre ela: use --de=${primeiraData} ` +
        `(ou antes) e --ate=${ultimaData} (ou depois) — recebido ${periodo.de}..${periodo.ate}`,
    )
  }

  const versao = await versaoDaListaRetroativa(db)
  const [classificadas] = versao
    ? await db.select({ n: count() }).from(niveis).where(eq(niveis.niveisVersaoId, versao.id))
    : [undefined]
  if (!versao || !classificadas?.n) {
    throw new Error(
      '--limpar-temporada: não há versão da lista do CJ vigente (ativa e com classificação) — ' +
        'importe e ative a lista antes, senão a temporada é apagada e nada é regravado',
    )
  }
}

/**
 * A temporada inteira (ou um trecho), dia a dia, somando os contadores.
 * `aoConcluirDia` existe para o script dar progresso — são ~200 dias.
 *
 * `limparTemporada` apaga a temporada do intervalo INTEIRA antes do primeiro
 * dia (`limparTemporadaRetroativa`) — e por isso só roda se `de..ate` cobrir a
 * temporada toda e houver lista vigente (`conferirLimpezaDaTemporada`).
 */
export async function executarTemporadaRetroativa(
  db: Db,
  ruleset: Ruleset,
  opcoes: PeriodoBacktest & {
    aoConcluirDia?: (data: string, resultado: ResultadoDiaRetroativo) => void | Promise<void>
    agora?: Date
    limparTemporada?: boolean
    aoLimpar?: (apagados: LinhasRetroativas) => void | Promise<void>
  },
): Promise<ResultadoDiaRetroativo> {
  const agora = opcoes.agora ?? new Date()
  // Antes do primeiro dia: um intervalo inválido não grava metade da temporada.
  const temporada = temporadaDoIntervalo(opcoes.de, opcoes.ate, calendarioDoRuleset(ruleset), agora)
  if (opcoes.limparTemporada) {
    await conferirLimpezaDaTemporada(db, calendarioDoRuleset(ruleset), temporada, opcoes)
    await opcoes.aoLimpar?.(await limparTemporadaRetroativa(db, temporada))
  }
  const total = { ...ZERADO }
  for (const data of datasDoPeriodo({ de: opcoes.de, ate: opcoes.ate })) {
    const r = await executarDiaRetroativo(db, ruleset, data, { agora })
    total.apitos += r.apitos
    total.greens += r.greens
    total.jogos += r.jogos
    await opcoes.aoConcluirDia?.(data, r)
  }
  return total
}

import { eq } from 'drizzle-orm'

import { identidadesJogo, jogos } from '../../dominio/db/schema'
import type { Db } from '../../dominio/db/tipos'
import { dataDeReferencia, somarDias } from '../../dominio/rodada'
import type { ConfigTemporada } from '../../dominio/temporada'
import { CapacidadeNaoSuportadaError } from '../nba/porta'
import { consultarComOrigem } from '../nba/failover'
import {
  sincronizarJogadores,
  sincronizarJogos,
  sincronizarTimes,
} from '../sincronizar/elenco'
import type { FontesConfiguradas } from '../sincronizar/fonte'
import { recalcularMedias, type JanelaMedia } from '../sincronizar/medias'
import {
  jogosDaData,
  persistirBoxScore,
  persistirBoxScoreDoTime,
  sincronizarClassificacao,
  sincronizarEscalacao,
  type JogoParaSincronizar,
} from '../sincronizar/partida'

export type ContagensJob = Record<string, number>

function somar(contagens: ContagensJob, chave: string, valor: number): void {
  contagens[chave] = (contagens[chave] ?? 0) + valor
}

/**
 * A que dia de rodada pertence este instante.
 *
 * O fuso vinha fixo em `America/New_York` aqui dentro — a convenção da liga,
 * escolhida no código e não pelo cliente. Isso quebrava a regra 1 do
 * CLAUDE.md e, pior, discordava em silêncio da tela: a ingestão gravava o dia
 * segundo Nova York e o app perguntava pelo dia segundo outro fuso.
 *
 * Agora só existe um fuso, e ele vive no ruleset (`rodada.fuso`).
 */
export const dataReferenciaNba = dataDeReferencia

export const deslocarData = somarDias

async function sincronizarIdentidadesDeJogo(
  db: Db,
  fontes: FontesConfiguradas,
  dataReferencia: string,
  agora: Date,
  contagens: ContagensJob,
): Promise<void> {
  let erroPrimaria: unknown = null
  let erroReserva: unknown = null
  let primariaSincronizada = false
  try {
    const primaria = await sincronizarJogos(
      db,
      fontes.failover,
      dataReferencia,
      agora,
      fontes.primaria.nome,
    )
    somar(contagens, 'jogos_balldontlie', primaria.gravados)
    somar(contagens, 'jogos_ignorados', primaria.ignorados)
    primariaSincronizada = true
  } catch (erro) {
    erroPrimaria = erro
    somar(contagens, 'falhas_fontes', 1)
  }

  if (fontes.reserva) {
    try {
      const reserva = await sincronizarJogos(
        db,
        fontes.failover,
        dataReferencia,
        agora,
        fontes.reserva.nome,
        !primariaSincronizada,
      )
      somar(contagens, 'jogos_api_sports', reserva.gravados)
      somar(contagens, 'jogos_ignorados', reserva.ignorados)
    } catch (erro) {
      erroReserva = erro
      somar(contagens, 'falhas_fontes', 1)
    }
  }

  if (erroPrimaria && (!fontes.reserva || erroReserva)) {
    throw new Error('nenhuma fonte conseguiu sincronizar a agenda da rodada', {
      cause: erroPrimaria,
    })
  }
}

async function sincronizarSnapshotsDaData(
  db: Db,
  fontes: FontesConfiguradas,
  dataReferencia: string,
  agora: Date,
  contagens: ContagensJob,
  statusPermitidos: JogoParaSincronizar['status'][],
): Promise<void> {
  const identidades = (await jogosDaData(db, fontes.primaria, dataReferencia)).filter((jogo) =>
    statusPermitidos.includes(jogo.status),
  )
  await persistirSnapshotsDasIdentidades(db, fontes, identidades, agora, contagens)
}

async function persistirSnapshotsDasIdentidades(
  db: Db,
  fontes: FontesConfiguradas,
  identidades: Awaited<ReturnType<typeof jogosDaData>>,
  agora: Date,
  contagens: ContagensJob,
): Promise<void> {
  const porJogo = new Map<string, typeof identidades>()
  for (const identidade of identidades) {
    const grupo = porJogo.get(identidade.id) ?? []
    grupo.push(identidade)
    porJogo.set(identidade.id, grupo)
  }

  for (const grupo of porJogo.values()) {
    const primaria = grupo.find((jogo) => jogo.provedor === fontes.primaria.nome)
    const reserva = grupo.find((jogo) => jogo.provedor === fontes.reserva?.nome)
    const buscarBoxJogador = async () => {
      if (primaria) {
        try {
          return await consultarComOrigem(
            fontes.failover,
            (fonte) => fonte.boxScore(primaria.idExterno),
            primaria.provedor,
          )
        } catch (erro) {
          if (!reserva || !fontes.reserva) throw erro
        }
      }
      return reserva && fontes.reserva
        ? consultarComOrigem(
            fontes.failover,
            (fonte) => fonte.boxScore(reserva.idExterno),
            reserva.provedor,
          )
        : null
    }
    const [boxJogador, boxTime] = await Promise.all([
      buscarBoxJogador(),
      reserva && fontes.reserva
        ? consultarComOrigem(
            fontes.failover,
            (fonte) => fonte.boxScoreDoTime(reserva.idExterno),
            reserva.provedor,
          )
        : null,
    ])
    const identidadeDoBoxJogador =
      boxJogador?.provedor === primaria?.provedor
        ? primaria
        : boxJogador?.provedor === reserva?.provedor
          ? reserva
          : null

    // Todo I/O externo terminou. O commit abaixo troca o snapshot do jogo como
    // unidade; falha na segunda metade desfaz também a primeira.
    await db.transaction(async (tx) => {
      if (identidadeDoBoxJogador && boxJogador) {
        const resultado = await persistirBoxScore(
          tx,
          identidadeDoBoxJogador,
          agora,
          boxJogador,
        )
        somar(contagens, 'box_jogador', resultado.gravados)
      }
      if (reserva && boxTime) {
        const resultado = await persistirBoxScoreDoTime(tx, reserva, agora, boxTime)
        somar(contagens, 'box_time', resultado.gravados)
      }
    })
  }
}

/** Ciclo por jogo usado pelo Workflow: busca, valida, persiste e só então libera o motor. */
export async function executarSnapshotAoVivoDoJogo(
  db: Db,
  fontes: FontesConfiguradas,
  jogoId: string,
  agora: Date,
): Promise<ContagensJob> {
  const [jogo] = await db
    .select({ dataReferencia: jogos.dataReferencia })
    .from(jogos)
    .where(eq(jogos.id, jogoId))
    .limit(1)
  if (!jogo) throw new Error('jogo não encontrado para ingestão ao vivo')

  const contagens: ContagensJob = {}
  await sincronizarIdentidadesDeJogo(db, fontes, jogo.dataReferencia, agora, contagens)
  const identidades = await db
    .select({
      id: identidadesJogo.jogoId,
      idExterno: identidadesJogo.idExterno,
      provedor: identidadesJogo.provedor,
      status: jogos.status,
    })
    .from(identidadesJogo)
    .innerJoin(jogos, eq(jogos.id, identidadesJogo.jogoId))
    .where(eq(identidadesJogo.jogoId, jogoId))
  await persistirSnapshotsDasIdentidades(db, fontes, identidades, agora, contagens)
  return contagens
}

export async function executarJobElenco(
  db: Db,
  fontes: FontesConfiguradas,
  dataReferencia: string,
  agora: Date,
): Promise<ContagensJob> {
  const contagens: ContagensJob = {}
  const times = await sincronizarTimes(db, fontes.failover)
  somar(contagens, 'times', times.gravados)
  const jogadores = await sincronizarJogadores(db, fontes.failover, fontes.primaria.nome)
  somar(contagens, 'jogadores', jogadores.gravados)
  await sincronizarIdentidadesDeJogo(db, fontes, dataReferencia, agora, contagens)
  return contagens
}

export async function executarJobRodada(
  db: Db,
  fontes: FontesConfiguradas,
  opcoes: {
    dataReferencia: string
    sobreposicaoDias: number
    temporada: string
    agora: Date
    janelaMedia: JanelaMedia
    configTemporada: ConfigTemporada
  },
): Promise<ContagensJob> {
  const contagens: ContagensJob = {}
  for (let deslocamento = -opcoes.sobreposicaoDias; deslocamento <= 0; deslocamento += 1) {
    const data = deslocarData(opcoes.dataReferencia, deslocamento)
    await sincronizarIdentidadesDeJogo(db, fontes, data, opcoes.agora, contagens)
    await sincronizarSnapshotsDaData(db, fontes, data, opcoes.agora, contagens, [
      'AO_VIVO',
      'ENCERRADO',
    ])
  }

  const classificacao = await sincronizarClassificacao(
    db,
    fontes.failover,
    opcoes.temporada,
    opcoes.agora,
  )
  somar(contagens, 'classificacao', classificacao.gravados)
  const medias = await recalcularMedias(db, {
    janela: opcoes.janelaMedia,
    configTemporada: opcoes.configTemporada,
    agora: opcoes.agora,
  })
  somar(contagens, 'medias', medias.gravados)
  return contagens
}

export async function executarJobEscalacao(
  db: Db,
  fontes: FontesConfiguradas,
  dataReferencia: string,
  agora: Date,
): Promise<ContagensJob> {
  const contagens: ContagensJob = {}
  await sincronizarIdentidadesDeJogo(db, fontes, dataReferencia, agora, contagens)
  const jogos = (await jogosDaData(db, fontes.primaria, dataReferencia)).filter(
    (jogo) => jogo.provedor === fontes.primaria.nome,
  )
  for (const jogo of jogos) {
    try {
      const resultado = await sincronizarEscalacao(db, fontes.primaria, jogo, agora)
      somar(contagens, 'escalacao', resultado.gravados)
    } catch (erro) {
      if (erro instanceof CapacidadeNaoSuportadaError) {
        somar(contagens, 'capacidades_indisponiveis', 1)
        break
      }
      throw erro
    }
  }
  return contagens
}

/** Atualiza os snapshots atuais antes de o motor observar o banco. */
export async function executarJobAoVivo(
  db: Db,
  fontes: FontesConfiguradas,
  dataReferencia: string,
  agora: Date,
): Promise<ContagensJob> {
  const contagens: ContagensJob = {}
  await sincronizarIdentidadesDeJogo(db, fontes, dataReferencia, agora, contagens)
  await sincronizarSnapshotsDaData(db, fontes, dataReferencia, agora, contagens, ['AO_VIVO'])
  return contagens
}

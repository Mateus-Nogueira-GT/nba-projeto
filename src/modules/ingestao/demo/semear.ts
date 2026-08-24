import { readFile } from 'node:fs/promises'
import { eq, inArray } from 'drizzle-orm'

import {
  estatisticasJogo,
  estatisticasQuarto,
  fireLiveExecucoes,
  jogadores,
  jogos,
  lesoesEscalacao,
  mapaJogadores,
  mediasJogador,
  times,
} from '../../dominio/db/schema'
import type { Db } from '../../dominio/db/tipos'
import { temporadaDe } from '../../dominio/temporada'
import { ativarVersaoNiveis } from '../../dominio/repositorios/niveis'
import { executarCiclo } from '../../entrega/fire-live/ciclo'
import { FilaEmMemoria } from '../../entrega/fila/memoria'
import { publicarListaSecreta } from '../../entrega/lista-secreta'
import type { Ruleset } from '../../motor/ruleset/schema'
import { lerListaDeNiveis } from '../niveis/parser'
import { importarListaDeNiveis } from '../niveis/importar'
import { historicoOscilacao, mediaDe, posicaoDe } from './dados'

export const ARQUIVO_LISTA = 'data/fontes/introducao-ia-nba.md'
const PROVEDOR_DEMO = 'demo'

export type ResumoDemo = {
  times: number
  jogadores: number
  versaoNiveis: string
  jogosHoje: number
  itensListaSecreta: number
  apitosFireLive: number
}

/**
 * SEMEIA A DEMONSTRAÇÃO — fatos, nunca resultados.
 *
 * Escreve matéria-prima (elencos do CJ, médias, box scores, escalação, quarto
 * ao vivo) e depois chama o pipeline REAL: publicarListaSecreta e
 * executarCiclo. Os apitos que aparecem na tela foram calculados pelo motor
 * com o ruleset homologado — a demo é prova do motor, não maquete.
 *
 * Os cenários são os exemplos numéricos do próprio documento: Luka fora
 * abrindo OPD para Reaves/Grimes/Kessler, a oscilação do LeBron, o turbo do
 * MVP em nível 3, e um MVP cruzando o alvo do 1º quarto até o modo fire.
 *
 * Idempotente: reexecutar não duplica nada.
 */
export async function semearDemo(db: Db, ruleset: Ruleset, agora: Date): Promise<ResumoDemo> {
  const conteudo = await readFile(ARQUIVO_LISTA, 'utf8')
  const analise = lerListaDeNiveis(conteudo)

  // 1 · Times e jogadores canônicos. Na demo, a lista do CJ é a autoridade
  //     sobre quem existe — e o vínculo é confirmado aqui, no lugar da
  //     curadoria humana que a produção exige.
  const siglas = [...new Set(analise.jogadores.map((j) => j.timeSigla).filter((s): s is string => s !== null))]
  for (const sigla of siglas) {
    const nome = analise.jogadores.find((j) => j.timeSigla === sigla)?.timeNaLista ?? sigla
    await db.insert(times).values({ sigla, nome }).onConflictDoNothing({ target: times.sigla })
  }
  const timePorSigla = new Map((await db.select().from(times)).map((t) => [t.sigla, t.id] as const))

  const jaExistentes = new Map(
    (await db.select().from(jogadores)).map((j) => [j.nomeCompleto, j.id] as const),
  )
  for (const j of analise.jogadores) {
    if (jaExistentes.has(j.nomeNaLista)) continue
    const timeId = j.timeSigla ? timePorSigla.get(j.timeSigla) : undefined
    const [novo] = await db
      .insert(jogadores)
      .values({
        nomeCompleto: j.nomeNaLista,
        // ATENÇÃO: jogadores.time_id é o time REAL do provedor e alimenta a aba
        // de estatísticas. Na demo não há provedor, então espelha a lista.
        timeId: timeId ?? null,
        posicao: posicaoDe(j.nomeNaLista),
      })
      .returning()
    if (novo) jaExistentes.set(j.nomeNaLista, novo.id)
  }

  for (const j of analise.jogadores) {
    const jogadorId = jaExistentes.get(j.nomeNaLista)
    if (!jogadorId) continue
    await db
      .insert(mapaJogadores)
      .values({
        nomeNaLista: j.nomeNaLista,
        provedor: PROVEDOR_DEMO,
        jogadorId,
        confirmadoPor: 'demo-seed',
        confirmadoEm: agora,
      })
      .onConflictDoUpdate({
        target: [mapaJogadores.nomeNaLista, mapaJogadores.provedor],
        set: { jogadorId, confirmadoPor: 'demo-seed', confirmadoEm: agora },
      })
  }

  const relatorio = await importarListaDeNiveis(db, conteudo, {
    provedor: PROVEDOR_DEMO,
    origemArquivo: ARQUIVO_LISTA,
    importadoPor: 'demo-seed',
  })
  await ativarVersaoNiveis(db, relatorio.versaoId)

  // 2 · Médias da temporada — a MESMA que montarFatos vai consultar.
  const temporada = temporadaDe(agora, {
    mesInicio: ruleset.temporada.mes_inicio,
    formato: ruleset.temporada.formato,
  })
  const nivelPorNome = new Map(analise.jogadores.map((j) => [j.nomeNaLista, j.nivel] as const))
  for (const [nome, jogadorId] of jaExistentes) {
    const nivel = nivelPorNome.get(nome)
    if (!nivel) continue
    const m = mediaDe(nome, nivel)
    await db
      .insert(mediasJogador)
      .values({
        jogadorId,
        temporada,
        janela: 'TEMPORADA',
        jogos: 40,
        ppg: m.ppg.toFixed(2),
        rpg: m.rpg.toFixed(2),
        apg: m.apg.toFixed(2),
        atualizadoEm: agora,
      })
      .onConflictDoUpdate({
        target: [mediasJogador.jogadorId, mediasJogador.temporada, mediasJogador.janela],
        set: { ppg: m.ppg.toFixed(2), rpg: m.rpg.toFixed(2), apg: m.apg.toFixed(2), atualizadoEm: agora },
      })
  }

  const dataReferencia = agora.toISOString().slice(0, 10)
  const idDoTime = (sigla: string) => timePorSigla.get(sigla)

  async function criarJogo(
    casa: string,
    visitante: string,
    quandoUtc: Date,
    dia: string,
    extra: { status?: 'AGENDADO' | 'AO_VIVO' | 'ENCERRADO'; quartoAtual?: number | null } = {},
  ): Promise<string | null> {
    const timeCasaId = idDoTime(casa)
    const timeVisitanteId = idDoTime(visitante)
    if (!timeCasaId || !timeVisitanteId) return null
    const [linha] = await db
      .insert(jogos)
      .values({
        dataHoraUtc: quandoUtc,
        dataReferencia: dia,
        timeCasaId,
        timeVisitanteId,
        status: extra.status ?? 'AGENDADO',
        quartoAtual: extra.quartoAtual ?? null,
      })
      .onConflictDoUpdate({
        target: [jogos.dataReferencia, jogos.timeCasaId, jogos.timeVisitanteId],
        set: { status: extra.status ?? 'AGENDADO', quartoAtual: extra.quartoAtual ?? null },
      })
      .returning()
    return linha?.id ?? null
  }

  // 3 · Histórico — box scores moldados para os exemplos do documento.
  //     ATENÇÃO à regra do CJ: "randola e suporte não apitam o nível 1 de
  //     oscilação". LeBron, na lista projetada, é SUPORTE no Philadelphia —
  //     então ele precisa de DOIS jogos abaixo para aparecer. Quem demonstra o
  //     nível 1 (amarelo) tem que ser MVP ou All Star.
  const CENARIOS: { nome: string; jogosAbaixo: number }[] = [
    { nome: 'Brunson', jogosAbaixo: 1 }, // MVP · 1 jogo abaixo → amarelo
    { nome: 'LeBron James', jogosAbaixo: 2 }, // Suporte · 2 jogos → laranja
    { nome: 'stephen Curry', jogosAbaixo: 3 }, // MVP · 3 jogos → verde + turbo
  ]
  const abaixoPorNome = new Map(CENARIOS.map((c) => [c.nome, c.jogosAbaixo] as const))

  const DIAS = 6
  for (let i = 1; i <= DIAS; i++) {
    const dia = new Date(agora.getTime() - i * 24 * 60 * 60_000)
    const diaRef = dia.toISOString().slice(0, 10)
    const jogoId = await criarJogo('LAL', 'GSW', dia, diaRef, { status: 'ENCERRADO' })
    if (!jogoId) continue

    for (const [nome, jogadorId] of jaExistentes) {
      const nivel = nivelPorNome.get(nome)
      if (!nivel) continue
      const media = mediaDe(nome, nivel).ppg
      const delta = ruleset.oscilacao.delta[nivel] ?? 5
      const sequencia = historicoOscilacao(media, delta, abaixoPorNome.get(nome) ?? 0)
      const pontos = sequencia[i - 1] ?? Math.round(media)
      await db
        .insert(estatisticasJogo)
        .values({ jogoId, jogadorId, pontos, rebotesTotal: 4, assistencias: 3, minutos: '30.00' })
        .onConflictDoNothing()
    }
  }

  // 4 · Rodada de hoje.
  //     Os horários são ancorados no INÍCIO do dia de referência, nunca em
  //     `agora + N horas`: com o seed rodando às 22h UTC, "+3h" cairia no dia
  //     seguinte e o time inteiro sumiria da rodada sem aviso. É a mesma
  //     armadilha de fuso que o runbook de ingestão descreve.
  const inicioDoDia = new Date(`${dataReferencia}T00:00:00.000Z`).getTime()
  const hora = (h: number) => new Date(inicioDoDia + h * 60 * 60_000)

  const jogoAoVivo = await criarJogo('OKC', 'DEN', hora(20), dataReferencia, {
    status: 'AO_VIVO',
    quartoAtual: ruleset.fire_live.quarto,
  })
  const jogoOpd = await criarJogo('LAL', 'PHI', hora(21), dataReferencia, { status: 'AGENDADO' })
  await criarJogo('GSW', 'BOS', hora(22), dataReferencia)
  await criarJogo('MIA', 'NYK', hora(23), dataReferencia)

  // Luka FORA — o exemplo literal da OPD no documento do CJ.
  const lukaId = jaExistentes.get('Luka Doncic')
  if (jogoOpd && lukaId) {
    await db
      .insert(lesoesEscalacao)
      .values({ jogoId: jogoOpd, jogadorId: lukaId, status: 'FORA', motivo: 'demonstração', confirmado: true })
      .onConflictDoUpdate({
        target: [lesoesEscalacao.jogoId, lesoesEscalacao.jogadorId],
        set: { status: 'FORA' },
      })
  }

  // 1º quarto ao vivo: o MVP cruza o alvo e chega aos 75% da média (modo fire).
  const shaiId = jaExistentes.get('Shai')
  if (jogoAoVivo && shaiId) {
    const mediaShai = mediaDe('Shai', 'MVP').ppg
    const pontos1Q = Math.ceil(mediaShai * ruleset.fire_live.modo_fire.percentual_media)
    await db
      .insert(estatisticasQuarto)
      .values({ jogoId: jogoAoVivo, jogadorId: shaiId, quarto: ruleset.fire_live.quarto, pontos: pontos1Q })
      .onConflictDoUpdate({
        target: [estatisticasQuarto.jogoId, estatisticasQuarto.jogadorId, estatisticasQuarto.quarto],
        set: { pontos: pontos1Q },
      })
    await db
      .insert(fireLiveExecucoes)
      .values({ jogoId: jogoAoVivo, iniciadoEm: agora })
      .onConflictDoNothing()
  }

  // 5 · O MOTOR calcula. Nada abaixo desta linha escreve apito à mão.
  const publicacao = await publicarListaSecreta(db, ruleset, {
    dataReferencia,
    agora,
    ignorarAntecedencia: true,
  })

  let apitosFireLive = 0
  if (jogoAoVivo) {
    const ciclo = await executarCiclo(db, ruleset, new FilaEmMemoria(), {
      jogoId: jogoAoVivo,
      estadoAnterior: null,
      iniciadoEm: agora,
      agora,
    })
    if (!ciclo.encerrar) apitosFireLive = ciclo.apitosNovos
  }

  const contarJogosHoje = await db
    .select({ id: jogos.id })
    .from(jogos)
    .where(eq(jogos.dataReferencia, dataReferencia))

  return {
    times: timePorSigla.size,
    jogadores: jaExistentes.size,
    versaoNiveis: relatorio.versao,
    jogosHoje: contarJogosHoje.length,
    itensListaSecreta: publicacao.publicou ? publicacao.itens : 0,
    apitosFireLive,
  }
}

/**
 * Desfaz a demonstração. Apaga SOMENTE domínio: contas, sessões, assinaturas e
 * inscrições de push ficam intactas — quem testou o login não perde o acesso.
 */
export async function limparDemo(db: Db): Promise<Record<string, number>> {
  const { apitos, greens, feedSnapshot, niveis, niveisVersao, identidadesJogador, identidadesJogo } =
    await import('../../dominio/db/schema')

  const contagens: Record<string, number> = {}
  const apagar = async (nome: string, fn: () => Promise<unknown>) => {
    const antes = await fn()
    contagens[nome] = Array.isArray(antes) ? antes.length : 0
  }

  await apagar('feed_snapshot', () => db.delete(feedSnapshot).returning({ id: feedSnapshot.id }))
  await apagar('greens', () => db.delete(greens).returning({ id: greens.id }))
  await apagar('apitos', () => db.delete(apitos).returning({ id: apitos.id }))
  await apagar('fire_live_execucoes', () =>
    db.delete(fireLiveExecucoes).returning({ id: fireLiveExecucoes.id }),
  )
  await apagar('estatisticas_quarto', () =>
    db.delete(estatisticasQuarto).returning({ id: estatisticasQuarto.id }),
  )
  await apagar('estatisticas_jogo', () =>
    db.delete(estatisticasJogo).returning({ id: estatisticasJogo.id }),
  )
  await apagar('lesoes_escalacao', () =>
    db.delete(lesoesEscalacao).returning({ id: lesoesEscalacao.id }),
  )
  await apagar('medias_jogador', () => db.delete(mediasJogador).returning({ id: mediasJogador.id }))
  await apagar('niveis', () => db.delete(niveis).returning({ id: niveis.id }))
  await apagar('niveis_versao', () => db.delete(niveisVersao).returning({ id: niveisVersao.id }))
  await apagar('identidades_jogo', () =>
    db.delete(identidadesJogo).returning({ id: identidadesJogo.id }),
  )
  await apagar('identidades_jogador', () =>
    db.delete(identidadesJogador).returning({ id: identidadesJogador.id }),
  )
  await apagar('mapa_jogadores', () => db.delete(mapaJogadores).returning({ id: mapaJogadores.id }))
  await apagar('jogos', () => db.delete(jogos).returning({ id: jogos.id }))
  await apagar('jogadores', () => db.delete(jogadores).returning({ id: jogadores.id }))
  await apagar('times', () => db.delete(times).returning({ id: times.id }))

  return contagens
}

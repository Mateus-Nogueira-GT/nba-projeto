import { and, eq, inArray, sql } from 'drizzle-orm'

import {
  conflitosIdentidadeJogo,
  identidadesJogo,
  jogadores,
  jogos,
  times,
} from '../../dominio/db/schema'
import type { Db } from '../../dominio/db/tipos'
import type { FonteNBA } from '../nba/porta'
import { consultarComOrigem } from '../nba/failover'
import { garantirJogadores, mapaDeTimes, type Resumo } from './identidade'
import { excluded } from './upsert'

/**
 * TIMES.
 *
 * A sigla é a chave natural — LAL é LAL em qualquer provedor, o que dispensa
 * tabela de identidade. Nome, logo e conferência são atualizados; a sigla
 * nunca muda.
 */
export async function sincronizarTimes(db: Db, fonte: FonteNBA): Promise<Resumo> {
  const externos = await fonte.listarTimes()
  const validos = externos.filter((t) => t.sigla.length > 0)
  if (validos.length === 0) return { lidos: externos.length, gravados: 0 }

  const gravados = await db
    .insert(times)
    .values(
      validos.map((t) => ({
        sigla: t.sigla.toUpperCase(),
        nome: t.nome,
        logoUrl: t.logoUrl,
        conferencia: t.conferencia,
      })),
    )
    .onConflictDoUpdate({
      target: times.sigla,
      set: {
        nome: excluded('nome'),
        logoUrl: excluded('logo_url'),
        conferencia: excluded('conferencia'),
      },
    })
    .returning({ id: times.id })

  return { lidos: externos.length, gravados: gravados.length }
}

/**
 * JOGADORES.
 *
 * `jogadores.time_id` recebe o time REAL do provedor. Esta é a exceção
 * registrada no CLAUDE.md: o vínculo de ESTRATÉGIA vem de `niveis.time_id`,
 * a curadoria do CJ com elencos projetados. Aqui é dado canônico, e a aba de
 * estatísticas depende de o time ser o de verdade.
 */
export async function sincronizarJogadores(
  db: Db,
  fonte: FonteNBA,
  provedorEsperado?: string,
): Promise<Resumo> {
  const resposta = await consultarComOrigem(
    fonte,
    (fonteEfetiva) => fonteEfetiva.listarJogadores(),
    provedorEsperado,
  )
  const { provedor, modo, dados: externos } = resposta
  const validos = externos.filter((j) => j.idExterno.length > 0 && j.nomeCompleto.length > 0)
  if (validos.length === 0) return { lidos: externos.length, gravados: 0 }

  const porSigla = await mapaDeTimes(db)
  const timeDe = (sigla: string | null) =>
    sigla === null ? null : (porSigla.get(sigla.toUpperCase()) ?? null)

  const identidades = await garantirJogadores(
    db,
    provedor,
    validos.map((j) => ({
      idExterno: j.idExterno,
      nomeCompleto: j.nomeCompleto,
      timeId: timeDe(j.timeSiglaProvedor),
      posicao: j.posicao,
      alturaCm: j.alturaCm,
      numeroCamisa: j.numeroCamisa,
      fotoUrl: j.fotoUrl,
      ativo: j.ativo,
    })),
  )

  // Atualiza quem já existia. Perfil muda: troca de time, número, e sobretudo
  // `ativo` — Schröder foi dispensado durante a elaboração da lista e a tela
  // de mapeamento precisa mostrar esse estado.
  let gravados = 0
  for (const j of validos) {
    const id = identidades.get(j.idExterno)
    if (id === undefined) continue

    await db
      .update(jogadores)
      .set({
        nomeCompleto: j.nomeCompleto,
        timeId: timeDe(j.timeSiglaProvedor),
        posicao: j.posicao,
        alturaCm: j.alturaCm,
        numeroCamisa: j.numeroCamisa,
        fotoUrl: j.fotoUrl,
        ativo: j.ativo,
      })
      .where(eq(jogadores.id, id))
    gravados += 1
  }

  if (modo === 'SNAPSHOT') {
    const idsPresentes = new Set(validos.map((j) => j.idExterno))
    const ausentes = [...identidades]
      .filter(([idExterno]) => !idsPresentes.has(idExterno))
      .map(([, jogadorId]) => jogadorId)
    if (ausentes.length > 0) {
      await db.update(jogadores).set({ ativo: false }).where(inArray(jogadores.id, ausentes))
    }
  }

  return { lidos: externos.length, gravados }
}

/**
 * JOGOS do dia.
 *
 * Upsert pela chave natural (data, casa, visitante). O horário do tipoff é
 * atualizado — remarcação é rotina —, mas a data derivada é que identifica a
 * partida, então remarcar dentro do mesmo dia não cria jogo novo.
 *
 * Jogo cujo time não existe no banco é IGNORADO, não inventado: sem o time, o
 * confronto não tem chave natural. Acontece quando `sincronizarTimes` ainda não
 * rodou — por isso a ordem dos crons importa.
 */
export async function sincronizarJogos(
  db: Db,
  fonte: FonteNBA,
  dataIso: string,
  agora: Date,
  provedorEsperado?: string,
  atualizarCanonico = true,
): Promise<Resumo & { ignorados: number }> {
  const resposta = await consultarComOrigem(
    fonte,
    (fonteEfetiva) => fonteEfetiva.listarJogos(dataIso),
    provedorEsperado,
  )
  const { provedor, capturadoEm, dadoAtualizadoEm, dados: externos } = resposta
  const porSigla = await mapaDeTimes(db)
  let ignorados = 0
  let gravados = 0

  await db.transaction(async (tx) => {
    await tx.execute(sql`LOCK TABLE ${identidadesJogo} IN SHARE ROW EXCLUSIVE MODE`)
    for (const g of externos) {
      const casa = porSigla.get(g.timeCasaSigla.toUpperCase())
      const visitante = porSigla.get(g.timeVisitanteSigla.toUpperCase())

      if (!casa || !visitante) {
        ignorados += 1
        continue
      }

      const [identidadeExistente] = await tx
        .select({
          jogoId: identidadesJogo.jogoId,
          dataReferencia: jogos.dataReferencia,
          timeCasaId: jogos.timeCasaId,
          timeVisitanteId: jogos.timeVisitanteId,
        })
        .from(identidadesJogo)
        .innerJoin(jogos, eq(jogos.id, identidadesJogo.jogoId))
        .where(
          and(
            eq(identidadesJogo.provedor, provedor),
            eq(identidadesJogo.idExterno, g.idExterno),
          ),
        )
        .limit(1)

      const valores = {
        dataReferencia: g.dataReferencia,
        dataHoraUtc: new Date(g.dataHoraUtc),
        timeCasaId: casa,
        timeVisitanteId: visitante,
        status: g.status,
        quartoAtual: g.quartoAtual,
        tempoRestante: g.relogio,
        placarCasa: g.placarCasa,
        placarVisitante: g.placarVisitante,
        capturadoEm,
        origemAtualizadaEm: dadoAtualizadoEm,
        atualizadoEm: agora,
      }

      let jogoId = identidadeExistente?.jogoId
      if (jogoId) {
        if (
          identidadeExistente!.dataReferencia !== g.dataReferencia ||
          identidadeExistente!.timeCasaId !== casa ||
          identidadeExistente!.timeVisitanteId !== visitante
        ) {
          await tx
            .insert(conflitosIdentidadeJogo)
            .values({
              provedor,
              idExterno: g.idExterno,
              dataReferencia: g.dataReferencia,
              timeCasaSigla: g.timeCasaSigla,
              timeVisitanteSigla: g.timeVisitanteSigla,
              jogoCandidatoId: jogoId,
              motivo: 'ID_EXTERNO_APONTA_PARA_OUTRO_CONFRONTO',
            })
            .onConflictDoUpdate({
              target: [conflitosIdentidadeJogo.provedor, conflitosIdentidadeJogo.idExterno],
              set: {
                dataReferencia: g.dataReferencia,
                timeCasaSigla: g.timeCasaSigla,
                timeVisitanteSigla: g.timeVisitanteSigla,
                jogoCandidatoId: jogoId,
                motivo: 'ID_EXTERNO_APONTA_PARA_OUTRO_CONFRONTO',
                ocorrencias: sql`${conflitosIdentidadeJogo.ocorrencias} + 1`,
                ultimaOcorrenciaEm: agora,
              },
            })
          ignorados += 1
          continue
        }
        if (atualizarCanonico) {
          await tx.update(jogos).set(valores).where(eq(jogos.id, jogoId))
        }
      } else {
        if (!atualizarCanonico) {
          const [canonico] = await tx
            .select({ id: jogos.id })
            .from(jogos)
            .where(
              and(
                eq(jogos.dataReferencia, g.dataReferencia),
                eq(jogos.timeCasaId, casa),
                eq(jogos.timeVisitanteId, visitante),
              ),
            )
            .limit(1)
          jogoId = canonico?.id
        }

        if (!jogoId) {
          const [jogo] = await tx
            .insert(jogos)
            .values(valores)
            .onConflictDoUpdate({
              target: [jogos.dataReferencia, jogos.timeCasaId, jogos.timeVisitanteId],
              set: atualizarCanonico
                ? {
                    dataHoraUtc: excluded('data_hora_utc'),
                    status: excluded('status'),
                    quartoAtual: excluded('quarto_atual'),
                    tempoRestante: excluded('tempo_restante'),
                    placarCasa: excluded('placar_casa'),
                    placarVisitante: excluded('placar_visitante'),
                    capturadoEm,
                    origemAtualizadaEm: dadoAtualizadoEm,
                    atualizadoEm: agora,
                  }
                : { atualizadoEm: jogos.atualizadoEm },
            })
            .returning({ id: jogos.id })
          if (!jogo) throw new Error('não foi possível persistir jogo canônico')
          jogoId = jogo.id
        }

        const vinculada = await tx
          .insert(identidadesJogo)
          .values({
            jogoId,
            provedor,
            idExterno: g.idExterno,
            capturadoEm,
            origemAtualizadaEm: dadoAtualizadoEm,
            atualizadoEm: agora,
          })
          .onConflictDoNothing()
          .returning({ id: identidadesJogo.id })
        if (vinculada.length === 0) {
          const [vencedora] = await tx
            .select({ jogoId: identidadesJogo.jogoId })
            .from(identidadesJogo)
            .where(
              and(
                eq(identidadesJogo.provedor, provedor),
                eq(identidadesJogo.idExterno, g.idExterno),
              ),
            )
            .limit(1)
          if (vencedora?.jogoId === jogoId) {
            gravados += 1
            continue
          }
          await tx
            .insert(conflitosIdentidadeJogo)
            .values({
              provedor,
              idExterno: g.idExterno,
              dataReferencia: g.dataReferencia,
              timeCasaSigla: g.timeCasaSigla,
              timeVisitanteSigla: g.timeVisitanteSigla,
              jogoCandidatoId: jogoId,
              motivo: 'IDENTIDADE_DE_JOGO_JA_VINCULADA',
            })
            .onConflictDoUpdate({
              target: [conflitosIdentidadeJogo.provedor, conflitosIdentidadeJogo.idExterno],
              set: {
                jogoCandidatoId: jogoId,
                motivo: 'IDENTIDADE_DE_JOGO_JA_VINCULADA',
                ocorrencias: sql`${conflitosIdentidadeJogo.ocorrencias} + 1`,
                ultimaOcorrenciaEm: agora,
              },
            })
          ignorados += 1
          continue
        }
      }
      gravados += 1
    }
  })

  return { lidos: externos.length, gravados, ignorados }
}

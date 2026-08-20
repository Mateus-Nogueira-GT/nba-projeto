import { eq } from 'drizzle-orm'

import { jogadores, jogos, times } from '../../dominio/db/schema'
import type { Db } from '../../dominio/db/tipos'
import type { FonteNBA } from '../nba/porta'
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
  provedor: string,
): Promise<Resumo> {
  const externos = await fonte.listarJogadores()
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
): Promise<Resumo & { ignorados: number }> {
  const externos = await fonte.listarJogos(dataIso)
  const porSigla = await mapaDeTimes(db)

  const linhas = []
  let ignorados = 0

  for (const g of externos) {
    const casa = porSigla.get(g.timeCasaSigla.toUpperCase())
    const visitante = porSigla.get(g.timeVisitanteSigla.toUpperCase())

    if (!casa || !visitante) {
      ignorados += 1
      continue
    }

    linhas.push({
      dataHoraUtc: new Date(g.dataHoraUtc),
      timeCasaId: casa,
      timeVisitanteId: visitante,
      status: g.status,
      quartoAtual: g.quartoAtual,
      placarCasa: g.placarCasa,
      placarVisitante: g.placarVisitante,
      atualizadoEm: agora,
    })
  }

  if (linhas.length === 0) return { lidos: externos.length, gravados: 0, ignorados }

  const gravados = await db
    .insert(jogos)
    .values(linhas)
    .onConflictDoUpdate({
      target: [jogos.dataJogo, jogos.timeCasaId, jogos.timeVisitanteId],
      set: {
        dataHoraUtc: excluded('data_hora_utc'),
        status: excluded('status'),
        quartoAtual: excluded('quarto_atual'),
        placarCasa: excluded('placar_casa'),
        placarVisitante: excluded('placar_visitante'),
        atualizadoEm: agora,
      },
    })
    .returning({ id: jogos.id })

  return { lidos: externos.length, gravados: gravados.length, ignorados }
}


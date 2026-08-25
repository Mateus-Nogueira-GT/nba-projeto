import { sql } from 'drizzle-orm'
import { saudeProvedor } from '../../dominio/db/schema'
import type { Db } from '../../dominio/db/tipos'
import type { EventoSaude } from '../nba/failover'

/**
 * Limites do "alerta de dado parado".
 *
 * Os NÚMEROS vivem em `ruleset.avisos.dado_parado` (regra 1) — aqui só o
 * formato. Mais rígido durante a janela dos jogos: fora dela, dado de 30 min
 * atrás é normal; com a bola rolando, o Fire Live já perdeu a janela.
 */
export type LimitesFrescor = {
  foraDeJogoMs: number
  emJanelaDeJogoMs: number
}

/** Grava o batimento. Upsert por provedor: interessa o estado atual, não o log. */
export async function registrarBatimento(db: Db, evento: EventoSaude): Promise<void> {
  await db
    .insert(saudeProvedor)
    .values({
      provedor: evento.provedor,
      tipo: evento.tipo,
      ultimaRespostaOk: evento.ok ? evento.em : null,
      latenciaMs: evento.latenciaMs,
      status: evento.ok ? 'OK' : 'FALHA',
      dadoMaisRecenteEm: evento.ok ? (evento.dadoAtualizadoEm ?? null) : null,
    })
    .onConflictDoUpdate({
      target: saudeProvedor.provedor,
      set: {
        tipo: evento.tipo,
        latenciaMs: evento.latenciaMs,
        status: evento.ok ? 'OK' : 'FALHA',
        // Numa falha, PRESERVA o último sucesso: é a distância até ele que
        // mede há quanto tempo o dado está parado.
        ultimaRespostaOk: evento.ok ? evento.em : sql`${saudeProvedor.ultimaRespostaOk}`,
        // Resposta recebida não prova frescor esportivo. Se a fonte não
        // fornece updated_at, preservamos null/valor anterior honestamente.
        dadoMaisRecenteEm:
          evento.ok && evento.dadoAtualizadoEm
            ? evento.dadoAtualizadoEm
            : sql`${saudeProvedor.dadoMaisRecenteEm}`,
      },
    })
}

export type Alerta = {
  provedor: string
  paradoHaMs: number
  limiteMs: number
}

/**
 * Avalia quais provedores estão com dado parado.
 *
 * Função pura sobre as linhas já lidas — o tempo entra como argumento, para
 * que o alerta seja testável sem relógio.
 */
export function avaliarFrescor(
  linhas: { provedor: string; dadoMaisRecenteEm: Date | null }[],
  agora: Date,
  emJanelaDeJogo: boolean,
  limites: LimitesFrescor,
): Alerta[] {
  const limiteMs = emJanelaDeJogo ? limites.emJanelaDeJogoMs : limites.foraDeJogoMs

  return linhas
    .map((l) => ({
      provedor: l.provedor,
      // Provedor que nunca respondeu conta como parado desde sempre.
      paradoHaMs: l.dadoMaisRecenteEm ? agora.getTime() - l.dadoMaisRecenteEm.getTime() : Infinity,
      limiteMs,
    }))
    .filter((a) => a.paradoHaMs > limiteMs)
}

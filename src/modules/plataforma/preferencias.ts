import { eq } from 'drizzle-orm'

import { preferenciasUsuario } from '../dominio/db/schema'
import type { Db } from '../dominio/db/tipos'

/**
 * Preferências ESCALARES por conta — identidade 04.
 *
 * Como `jogadores_ocultos`, é recorte de LEITURA: a tela lê a preferência e
 * ordena/recorta o snapshot; motor e materialização não sabem que isto
 * existe. A diferença é a forma: uma linha por usuário, com colunas, em vez de
 * uma linha por item.
 *
 * A URL continua mandando quando diz algo (`?ordem=`, `?lente=`) — a
 * preferência é o que vale quando a URL não diz nada, e é o que sincroniza
 * entre dispositivos.
 */

export const ORDENS_LISTA = ['POR_JOGO', 'POR_NIVEL'] as const
export type OrdemLista = (typeof ORDENS_LISTA)[number]

export const LENTES = ['ULT5', 'MEDIA_LINHA', 'ODDS', 'HIERARQUIA'] as const
export type Lente = (typeof LENTES)[number]

export type PreferenciasUsuario = { ordemLista: OrdemLista; lente: Lente }

/** Por jogo (montar a noite) e últimos 5 na linha — as decisões do brainstorm de 07/09. */
export const PREFERENCIAS_PADRAO: PreferenciasUsuario = { ordemLista: 'POR_JOGO', lente: 'ULT5' }

const ehOrdem = (v: unknown): v is OrdemLista => ORDENS_LISTA.includes(v as OrdemLista)
const ehLente = (v: unknown): v is Lente => LENTES.includes(v as Lente)

/**
 * Valor guardado que deixou de existir (uma lente removida numa versão
 * futura) cai no padrão em vez de quebrar a tela — a coluna é texto livre de
 * propósito, e este é o preço de não ter migração a cada lente nova.
 */
export async function preferenciasDoUsuario(db: Db, usuarioId: string): Promise<PreferenciasUsuario> {
  const [linha] = await db
    .select({ ordemLista: preferenciasUsuario.ordemLista, lente: preferenciasUsuario.lente })
    .from(preferenciasUsuario)
    .where(eq(preferenciasUsuario.usuarioId, usuarioId))
    .limit(1)
  return {
    ordemLista: ehOrdem(linha?.ordemLista) ? linha.ordemLista : PREFERENCIAS_PADRAO.ordemLista,
    lente: ehLente(linha?.lente) ? linha.lente : PREFERENCIAS_PADRAO.lente,
  }
}

/** Grava só o que veio; o que não veio fica como estava (ou no padrão). */
export async function gravarPreferencias(
  db: Db,
  usuarioId: string,
  parcial: Partial<PreferenciasUsuario>,
): Promise<void> {
  const mudancas: { ordemLista?: OrdemLista; lente?: Lente; atualizadoEm: Date } = { atualizadoEm: new Date() }
  if (parcial.ordemLista !== undefined) mudancas.ordemLista = parcial.ordemLista
  if (parcial.lente !== undefined) mudancas.lente = parcial.lente

  await db
    .insert(preferenciasUsuario)
    .values({ usuarioId, ...mudancas })
    .onConflictDoUpdate({ target: preferenciasUsuario.usuarioId, set: mudancas })
}

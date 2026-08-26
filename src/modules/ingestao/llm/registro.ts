import { llmChamadas } from '../../dominio/db/schema'
import type { Db } from '../../dominio/db/tipos'
import type { PerfilLLM } from './porta'

export type DadosChamada = {
  perfil: PerfilLLM
  modelo: string | null
  tokensEntrada: number
  tokensSaida: number
  ok: boolean
  erro: string | null
  duracaoMs: number
}

/**
 * Grava a métrica da chamada. NUNCA lança.
 *
 * Se gravar observabilidade pudesse derrubar a publicação da lista, a
 * observabilidade viraria o risco que ela existe para reduzir. Falha ao
 * registrar é aceitável; falha ao publicar não é.
 */
export async function registrarChamada(db: Db, dados: DadosChamada): Promise<void> {
  try {
    await db.insert(llmChamadas).values(dados)
  } catch {
    // engolido de propósito — ver o comentário acima
  }
}

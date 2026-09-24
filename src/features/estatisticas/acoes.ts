'use server'

import { getDb } from '@/modules/dominio/db/cliente'
import { sessaoAtual } from '@/modules/plataforma/auth/cookies'
import { schemaAcompanhamento } from '@/modules/plataforma/experiencia/contrato'
import { definirAcompanhamento } from '@/modules/plataforma/experiencia/servico'

/**
 * Acompanhar jogador ou time. O front antigo chamava
 * `PUT /api/preferencias/acompanhamento` (a rota existe e continua servindo
 * os componentes antigos até a limpeza); o v2 é server action com o MESMO
 * contrato (`schemaAcompanhamento`) e a mesma `definirAcompanhamento` — a
 * identidade vem da sessão, nunca da entrada, e o Next já recusa a ação fora
 * da origem do app. Devolve o estado confirmado.
 */
export async function alternarAcompanhamento(entrada: {
  tipo: 'JOGADOR' | 'TIME'
  id: string
  acompanhar: boolean
}): Promise<{ ok: true; acompanhado: boolean } | { ok: false }> {
  const valido = schemaAcompanhamento.safeParse(entrada)
  if (!valido.success) return { ok: false }
  const sessao = await sessaoAtual()
  if (!sessao) return { ok: false }
  await definirAcompanhamento(getDb(), sessao.usuarioId, valido.data)
  return { ok: true, acompanhado: valido.data.acompanhar }
}

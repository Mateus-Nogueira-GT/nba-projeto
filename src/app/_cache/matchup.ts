import { unstable_cache } from 'next/cache'

import { getDb } from '@/modules/dominio/db/cliente'
import { perfisDoDia, type PerfilAdversario } from '@/modules/entrega/matchup'

/**
 * O MATCHUP, CALCULADO UMA VEZ POR DATA E TEMPORADA — não uma vez por painel.
 *
 * Os perfis saem de uma varredura de `estatisticas_time_jogo` da temporada
 * inteira, e a posição de um time depende de todos: abrir o painel de um
 * apito refazia a conta dos 30 times. O resultado só muda quando um jogo
 * ANTERIOR à data encerra — o que, para uma data de jogo, quase nunca
 * acontece depois do dia. Uma hora de revalidação cobre o caso raro (box
 * corrigido pelo provedor) sem precisar de invalidação por evento.
 *
 * Dado canônico, aberto a todo plano que vê o painel: o cache é
 * compartilhado. O valor é um objeto simples (sigla → perfil), sem `Date`.
 */
export const TAG_MATCHUP = 'matchup'

export const perfisDoDiaCacheado = unstable_cache(
  async (dataReferencia: string, inicioTemporada: string): Promise<Record<string, PerfilAdversario>> =>
    perfisDoDia(getDb(), dataReferencia, inicioTemporada),
  ['matchup-perfis-do-dia'],
  { tags: [TAG_MATCHUP], revalidate: 3600 },
)

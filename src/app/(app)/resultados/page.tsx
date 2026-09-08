import { redirect } from 'next/navigation'

import { getDb } from '@/modules/dominio/db/cliente'
import { dataDeReferencia } from '@/modules/dominio/rodada'
import { ultimaRodadaConferida } from '@/modules/entrega/resultados'
import { rulesetAtivo } from '@/modules/entrega/ruleset-ativo'

export const dynamic = 'force-dynamic'

/**
 * `/resultados` é um ATALHO para a ÚLTIMA rodada com conferência.
 *
 * A tela mora em `/resultados/[data]` (identidade 04, §4.4): a rodada está na
 * ROTA, e é isso que faz a seta de ontem, o link compartilhado e o botão
 * voltar do navegador funcionarem. Este arquivo continua existindo porque o
 * seletor HOJE · RESULTADOS e os links antigos apontam para cá.
 *
 * O destino é a noite que TERMINOU, não a rodada em curso: o recap da noite é
 * o da noite que acabou, e abrir a de hoje às 20h mostrava "APITOS 0" em cima
 * de trinta cards. A seta "próxima" leva até hoje. Sem nenhuma noite
 * conferida (banco recém-semeado), a rodada de hoje.
 *
 * O dia é o da RODADA, no fuso do ruleset — nunca o UTC do servidor da Vercel,
 * que às 21h de Brasília já virou amanhã.
 */
export default async function PaginaResultados() {
  const { fuso } = (await rulesetAtivo()).rodada
  const hoje = dataDeReferencia(new Date(), fuso)
  const ultima = process.env.DATABASE_URL ? await ultimaRodadaConferida(getDb(), hoje) : null
  redirect(`/resultados/${ultima ?? hoje}`)
}

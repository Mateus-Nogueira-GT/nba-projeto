import { redirect } from 'next/navigation'

import { dataDeReferencia } from '@/modules/dominio/rodada'
import { rulesetAtivo } from '@/modules/entrega/ruleset-ativo'

export const dynamic = 'force-dynamic'

/**
 * `/resultados` é um ATALHO para a rodada de hoje.
 *
 * A tela mora em `/resultados/[data]` (identidade 04, §4.4): a rodada está na
 * ROTA, e é isso que faz a seta de ontem, o link compartilhado e o botão
 * voltar do navegador funcionarem. Este arquivo continua existindo porque o
 * seletor HOJE · RESULTADOS e os links antigos apontam para cá.
 *
 * O dia é o da RODADA, no fuso do ruleset — nunca o UTC do servidor da Vercel,
 * que às 21h de Brasília já virou amanhã.
 */
export default async function PaginaResultados() {
  const { fuso } = (await rulesetAtivo()).rodada
  redirect(`/resultados/${dataDeReferencia(new Date(), fuso)}`)
}

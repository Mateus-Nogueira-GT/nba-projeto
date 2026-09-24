import { Painel } from '@/features/shell/Painel'
import { LateralDaRodada } from '@/features/lateral/LateralDaRodada'
import { exigirNivel } from '@/modules/plataforma/assinatura/guarda'

export const dynamic = 'force-dynamic'

/**
 * A coluna da rodada nesta seção: última noite conferida e classificação.
 *
 * Só dado grátis (resultado conferido, pelo cache da lateral), mas ela passa
 * pelo mesmo portão da tela, com o MESMO destino — o padrão de
 * `@painel/fire-live`. Só casa com `/estatisticas` exatamente; nas telas de
 * jogador, jogo e time o slot cai em `default.tsx` (nada), e `/metodologia`
 * fica fora da seção, então o redirecionamento do aceite não volta para cá.
 * Sessão e acesso são memorizados por requisição (`cache()`), então isto não
 * repete consulta da página nem da casca.
 */
export default async function PainelDaSecao() {
  await exigirNivel('GRATIS', '/estatisticas')
  return (
    <Painel modo="resumo" rota="/estatisticas" rotulo="Coluna da rodada">
      <LateralDaRodada />
    </Painel>
  )
}

import { Painel } from '@/features/shell/Painel'
import { LateralDaRodada } from '@/features/lateral/LateralDaRodada'
import { exigirNivel } from '@/modules/plataforma/assinatura/guarda'

export const dynamic = 'force-dynamic'

/**
 * A coluna da rodada nesta seção: última noite conferida e classificação.
 *
 * Só dado grátis (resultado conferido, pelo cache da lateral), mas ela passa
 * pelo mesmo portão da tela: a coluna da tela antiga só era montada depois do
 * `exigirNivel` (paywall.test.ts, "a lateral entra DEPOIS do portão"), e o
 * cerco de `telas-abrir.test.ts` não abre exceção para o `@painel`. Sessão e
 * acesso são memorizados por requisição (`cache()`), então isto não repete
 * consulta da página nem da casca.
 */
export default async function PainelDaSecao() {
  await exigirNivel('GRATIS', '/fire-live')
  return (
    <Painel modo="resumo" rota="/fire-live" rotulo="Coluna da rodada">
      <LateralDaRodada />
    </Painel>
  )
}

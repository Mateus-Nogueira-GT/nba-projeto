import { Painel } from '@/features/shell/Painel'
import { LateralDaRodada } from '@/features/lateral/LateralDaRodada'
import { filtrosResultadosDaUrl, rotaResultados } from '@/modules/entrega/resultados'
import { exigirNivel } from '@/modules/plataforma/assinatura/guarda'

export const dynamic = 'force-dynamic'

/**
 * A coluna da rodada nesta seção: última noite conferida e classificação.
 *
 * Mesmo portão e MESMO destino da página (`carregarResultados`): a rodada e
 * os filtros da URL, para o login e o aceite da metodologia voltarem para a
 * noite que a pessoa pediu — o padrão de `@painel/fire-live`.
 */
export default async function PainelDaSecao({
  params,
  searchParams,
}: {
  params: Promise<{ data: string }>
  searchParams?: Promise<Record<string, string | string[] | undefined>>
}) {
  const [{ data }, busca] = await Promise.all([params, searchParams])
  await exigirNivel('GRATIS', rotaResultados(data, filtrosResultadosDaUrl(busca ?? {})))
  return (
    <Painel modo="resumo" rota="/resultados" rotulo="Coluna da rodada">
      <LateralDaRodada />
    </Painel>
  )
}

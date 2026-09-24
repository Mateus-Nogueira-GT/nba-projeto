import { rulesetAtivo } from '@/modules/entrega/ruleset-ativo'
import { configuracaoProdutoPago } from '@/modules/plataforma/assinatura/configuracao'
import { exigirNivel } from '@/modules/plataforma/assinatura/guarda'
import { ehNivelPago } from '@/modules/plataforma/assinatura/nivel-do-plano'
import { precosDosPlanos } from '@/modules/plataforma/assinatura/precos'
import { ofertasDisponiveis } from '@/modules/plataforma/assinatura/sku'
import { TelaPlanos } from '@/features/assinatura/TelaPlanos'
import { caminhoInterno, parametro } from '@/features/publico/destino'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Planos' }

export default async function PaginaAssinar({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  // GRATIS: a comparação é para todo mundo, inclusive quem já paga.
  const { acesso } = await exigirNivel('GRATIS', '/assinar')
  const p = await searchParams
  const pedido = parametro(p.nivel)
  const config = configuracaoProdutoPago()
  const { fuso } = (await rulesetAtivo()).rodada
  const precos = precosDosPlanos(fuso)
  // Sem checkout habilitado não há o que vender; a página continua valendo como comparação.
  const ofertas = config.checkoutHabilitado && precos ? ofertasDisponiveis(acesso, new Date(), precos.fimDaTemporada) : []
  return (
    <TelaPlanos
      acesso={acesso}
      destacado={pedido && ehNivelPago(pedido) ? pedido : null}
      // Link, não redirect: qualquer caminho interno volta (o guarda manda
      // `voltar=/fire-live`, `/gestao`…), só o que sai do app é recusado.
      voltar={caminhoInterno(parametro(p.voltar), '/')}
      erro={parametro(p.erro)}
      precos={precos}
      ofertas={ofertas}
      checkoutHabilitado={config.checkoutHabilitado}
    />
  )
}

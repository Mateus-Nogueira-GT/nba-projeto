import Link from 'next/link'

import { MolduraConta } from '@/components/conta/MolduraConta'
import { BENEFICIOS_POR_NIVEL } from '@/components/planos/matriz'
import { precoEmReais } from '@/components/planos/preco'
import { componente } from '@/design-system/tokens/componente'
import { semantico } from '@/design-system/tokens/semantico'
import { rulesetAtivo } from '@/modules/entrega/ruleset-ativo'
import { configuracaoProdutoPago } from '@/modules/plataforma/assinatura/configuracao'
import { exigirNivel } from '@/modules/plataforma/assinatura/guarda'
import {
  ehNivelPago,
  ORDEM_DOS_NIVEIS,
  ROTULO_DA_MODALIDADE,
  ROTULO_DO_NIVEL,
} from '@/modules/plataforma/assinatura/nivel-do-plano'
import { precosDosPlanos } from '@/modules/plataforma/assinatura/precos'
import { ofertasDisponiveis } from '@/modules/plataforma/assinatura/sku'

import { contratar } from './acoes'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Planos' }

/**
 * Só caminho interno volta. Validar por prefixo não basta: `/\evil.com` passa
 * num teste de `//` porque o segundo caractere é `\` — e o parser de URL trata
 * `\` como `/` em http, então o navegador sai do domínio. Em vez de enumerar
 * as formas de escapar, resolvemos contra uma origem descartável e exigimos
 * que o host continue sendo ela.
 */
function caminhoDeVolta(bruto: string | string[] | undefined): string {
  const valor = Array.isArray(bruto) ? bruto[0] : bruto
  if (!valor) return '/'
  try {
    const base = 'https://interno.invalid'
    const url = new URL(valor, base)
    if (url.origin !== base) return '/'
    return `${url.pathname}${url.search}${url.hash}`
  } catch {
    return '/'
  }
}

export default async function PaginaAssinar({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  // GRATIS: a comparação é para todo mundo, inclusive quem já paga e quer
  // ver o de cima. Não há mais redirect de quem tem direito.
  const { acesso } = await exigirNivel('GRATIS', '/assinar')
  const parametros = await searchParams
  const pedido = Array.isArray(parametros.nivel) ? parametros.nivel[0] : parametros.nivel
  const destacado = pedido && ehNivelPago(pedido) ? pedido : null
  const voltar = caminhoDeVolta(parametros.voltar)
  const erro = Array.isArray(parametros.erro) ? parametros.erro[0] : parametros.erro

  const config = configuracaoProdutoPago()
  const { fuso } = (await rulesetAtivo()).rodada
  const precos = precosDosPlanos(fuso)
  const agora = new Date()
  // Sem preço configurado não há o que vender, e a página continua valendo
  // como comparação — que é o que ela é hoje em produção.
  const ofertas =
    config.checkoutHabilitado && precos ? ofertasDisponiveis(acesso, agora, precos.fimDaTemporada) : []
  const substitui = ofertas.some((oferta) => oferta.substituiPlanoAtual)

  return (
    <MolduraConta titulo="Planos" descricao="O que cada nível da NIP entrega." aba="conta">
      <div style={{ display: 'grid', gap: 18 }}>
        <p style={{ margin: 0, color: semantico.textoSecundario }}>
          Você está no plano <strong>{ROTULO_DO_NIVEL[acesso.nivel]}</strong>.{' '}
          <Link href={voltar}>Voltar</Link>
        </p>
        <div style={{ display: 'grid', gap: 14 }}>
          {ORDEM_DOS_NIVEIS.map((nivelDoPlano) => (
            <section
              key={nivelDoPlano}
              style={{
                padding: 16,
                borderRadius: 12,
                border: `2px solid ${nivelDoPlano === destacado ? componente.ctaFundo : semantico.divisor}`,
              }}
            >
              {/* aria-current no título, não na section: é o texto do nome do
                  plano que precisa estar marcado como "o atual" — a section
                  em volta carrega estilo, não rótulo. */}
              <h2
                aria-current={nivelDoPlano === destacado ? 'true' : undefined}
                style={{ margin: '0 0 8px', fontFamily: semantico.fonteTitulo }}
              >
                {ROTULO_DO_NIVEL[nivelDoPlano]}
              </h2>
              <ul style={{ margin: 0, paddingLeft: 20, lineHeight: 1.8 }}>
                {BENEFICIOS_POR_NIVEL[nivelDoPlano].map((b) => (
                  <li key={b}>{b}</li>
                ))}
              </ul>
            </section>
          ))}
        </div>

        {erro && (
          <p role="alert" style={{ margin: 0, color: semantico.alerta }}>
            {erro === 'limite'
              ? 'Muitas tentativas. Aguarde alguns minutos.'
              : 'O checkout está temporariamente indisponível.'}
          </p>
        )}
        {ofertas.length > 0 && precos ? (
          <section style={{ display: 'grid', gap: 12 }}>
            {/* O AVISO VEM ANTES DOS BOTÕES, não depois (spec §9). Depois de
                cobrar, avisar já não é avisar. */}
            {substitui && (
              <p role="note" style={{ margin: 0, fontSize: 14, color: semantico.textoSecundario }}>
                Ao contratar, o seu plano atual é encerrado assim que o pagamento for confirmado,
                sem devolução do período restante.
              </p>
            )}
            {ofertas.map((oferta) => {
              const preco = precos.porSku[oferta.sku]
              return (
                <form key={oferta.sku} action={contratar}>
                  <input type="hidden" name="sku" value={oferta.sku} />
                  <button
                    type="submit"
                    style={{
                      width: '100%',
                      display: 'grid',
                      gap: 4,
                      border: 0,
                      borderRadius: 10,
                      padding: 13,
                      background: componente.ctaFundo,
                      color: semantico.textoSobreAcento,
                      fontFamily: semantico.fonteTitulo,
                      cursor: 'pointer',
                      textAlign: 'left',
                    }}
                  >
                    <span style={{ letterSpacing: 0.5, textTransform: 'uppercase', fontWeight: 700 }}>
                      {ROTULO_DO_NIVEL[oferta.nivelDoPlano]} ·{' '}
                      {ROTULO_DA_MODALIDADE[oferta.modalidade]}
                    </span>
                    <span style={{ fontSize: 20 }}>
                      {preco.deCentavos && (
                        <s style={{ opacity: 0.7, fontSize: 15, marginRight: 8 }}>
                          {precoEmReais(preco.deCentavos)}
                        </s>
                      )}
                      {precoEmReais(preco.centavos)}
                      <span style={{ fontSize: 13, opacity: 0.85 }}>
                        {oferta.modalidade === 'MENSAL'
                          ? ' / mês'
                          : ' · até o fim da temporada'}
                      </span>
                    </span>
                  </button>
                </form>
              )
            })}
          </section>
        ) : (
          <p style={{ margin: 0, color: semantico.textoSecundario }}>
            {/* NUNCA afirmar que a pessoa está "no topo": a lista também fica vazia
                para quem NÃO está lá — MVP ou All Star temporada depois que a janela de
                venda fecha, já que "temporada não volta para mensal" (decisão 12) tira
                o único caminho de baixo. O que se sabe de fato é só que não há oferta
                para vender agora, nunca a posição da pessoa na hierarquia. */}
            {config.checkoutHabilitado && precos && acesso.nivel !== 'GRATIS'
              ? 'Não há plano para contratar acima do seu agora.'
              : 'A contratação pelo app chega em breve. Enquanto isso, fale com quem administra a sua conta.'}
          </p>
        )}
        <Link href="/conta" style={{ color: semantico.textoSecundario, fontSize: 13 }}>
          Ver minha conta
        </Link>
      </div>
    </MolduraConta>
  )
}

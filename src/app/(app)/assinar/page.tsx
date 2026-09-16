import Link from 'next/link'

import { MolduraConta } from '@/components/conta/MolduraConta'
import { BENEFICIOS_POR_NIVEL } from '@/components/planos/matriz'
import { componente } from '@/design-system/tokens/componente'
import { semantico } from '@/design-system/tokens/semantico'
import { configuracaoProdutoPago } from '@/modules/plataforma/assinatura/configuracao'
import { exigirNivel } from '@/modules/plataforma/assinatura/guarda'
import {
  ehNivelPago,
  ORDEM_DOS_NIVEIS,
  ROTULO_DO_NIVEL,
} from '@/modules/plataforma/assinatura/nivel-do-plano'
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
  const config = configuracaoProdutoPago()
  const parametros = await searchParams
  const pedido = Array.isArray(parametros.nivel) ? parametros.nivel[0] : parametros.nivel
  const destacado = pedido && ehNivelPago(pedido) ? pedido : null
  const voltar = caminhoDeVolta(parametros.voltar)
  const erro = Array.isArray(parametros.erro) ? parametros.erro[0] : parametros.erro

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

        {/* O checkout de UM SKU, como era. Fica atrás da flag até o Plano B
            trazer os quatro SKUs com preço; em produção a flag está
            desligada, então este bloco não aparece. */}
        {erro && (
          <p role="alert" style={{ margin: 0, color: semantico.alerta }}>
            {erro === 'limite'
              ? 'Muitas tentativas. Aguarde alguns minutos.'
              : 'O checkout está temporariamente indisponível.'}
          </p>
        )}
        {config.checkoutHabilitado && acesso.nivel === 'GRATIS' ? (
          <form action={contratar}>
            <p style={{ margin: '0 0 8px' }}>
              <strong style={{ fontSize: 24 }}>
                {(config.valorCentavos / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
              </strong>
              <span style={{ color: semantico.textoSecundario }}> / mês · {config.nomePlano}</span>
            </p>
            <button
              type="submit"
              style={{
                width: '100%',
                border: 0,
                borderRadius: 10,
                padding: 13,
                background: componente.ctaFundo,
                color: semantico.textoSobreCor,
                fontFamily: semantico.fonteTitulo,
                letterSpacing: 0.5,
                textTransform: 'uppercase',
                fontWeight: 700,
                cursor: 'pointer',
              }}
            >
              Continuar no Mercado Pago
            </button>
          </form>
        ) : (
          <p style={{ margin: 0, color: semantico.textoSecundario }}>
            A contratação pelo app chega em breve. Enquanto isso, fale com quem administra a sua conta.
          </p>
        )}
        <Link href="/conta" style={{ color: semantico.textoSecundario, fontSize: 13 }}>
          Ver minha conta
        </Link>
      </div>
    </MolduraConta>
  )
}

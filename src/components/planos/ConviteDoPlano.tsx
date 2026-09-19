import Link from 'next/link'

import { componente } from '@/design-system/tokens/componente'
import { semantico } from '@/design-system/tokens/semantico'
import { type NivelPago, ROTULO_DO_NIVEL } from '@/modules/plataforma/assinatura/nivel-do-plano'

/**
 * O CONVITE — o que o grátis vê no lugar do que não tem.
 *
 * Nunca uma tela vazia, nunca só um redirecionamento (spec de planos, §6): o
 * convite diz o que existe ali e qual nível libera, e leva para /assinar
 * sabendo de onde veio — é o `voltar` que faz o botão de retorno funcionar.
 *
 * DUAS VARIANTES desde a identidade 05:
 *
 *   `compacto` (padrão) é o cartão de sempre, revestido. Ele entra POR CIMA de
 *   uma silhueta nas seções pagas das Estatísticas e da Gestão, onde três
 *   convites podem aparecer em sequência na mesma página — três faixas azuis
 *   ali seriam um muro.
 *
 *   `faixa` é o banner azul do manual, para o topo das telas onde o grátis não
 *   tem nada: a Lista, o Fire Live e o topo da lateral. É o lugar onde o
 *   StatsHub põe a promo dele.
 */
export function ConviteDoPlano({
  minimo,
  recurso,
  voltar,
  variante = 'compacto',
  titulo,
}: {
  minimo: NivelPago
  recurso: string
  voltar: string
  variante?: 'compacto' | 'faixa'
  /**
   * A frase inteira da faixa, quando a montada não concorda ("Lista, Fire Live
   * e assistente COMEÇA no MVP"). Ausente, a faixa monta
   * `${recurso} começa no ${nível}`. O nome acessível segue o mesmo texto.
   */
  titulo?: string
}) {
  const href = `/assinar?nivel=${minimo}&voltar=${encodeURIComponent(voltar)}`
  const frase = titulo ?? `${recurso} começa no ${ROTULO_DO_NIVEL[minimo]}`
  const rotulo = titulo ?? `${recurso} começa no plano ${ROTULO_DO_NIVEL[minimo]}`

  if (variante === 'faixa') {
    return (
      <section
        aria-label={rotulo}
        style={{
          padding: '20px 20px 18px',
          borderRadius: componente.cardRaio,
          background: semantico.acento,
          color: semantico.textoSobreAcento,
        }}
      >
        {/* Em caixa-alta no TEXTO, não só no CSS: é o que o leitor de tela
            recebe, e é o que a asserção do teste lê. */}
        <p
          style={{
            margin: 0,
            fontFamily: semantico.fonteTitulo,
            fontSize: 24,
            letterSpacing: '0.02em',
            lineHeight: 1.1,
          }}
        >
          {frase.toUpperCase()}
        </p>
        <p style={{ margin: '8px 0 14px', fontSize: 14, opacity: 0.9 }}>
          Os apitos do dia, o Fire Live e o assistente, com a metodologia NIP.
        </p>
        {/* Botão BRANCO com texto no navy: sobre o azul do manual, o branco é o
            único preenchimento que se destaca sem inventar uma terceira cor. */}
        <Link
          href={href}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            minHeight: componente.ctaAltura,
            padding: '0 18px',
            borderRadius: componente.raioControle,
            background: semantico.textoSobreAcento,
            color: semantico.cromo,
            fontWeight: 700,
            textDecoration: 'none',
          }}
        >
          Ver planos
        </Link>
      </section>
    )
  }

  return (
    <section
      aria-label={rotulo}
      style={{
        marginTop: 18,
        padding: 18,
        borderRadius: componente.cardRaio,
        background: componente.cardFundo,
        border: `1px solid ${semantico.divisor}`,
      }}
    >
      <p style={{ margin: 0, fontFamily: semantico.fonteRotulo, letterSpacing: '0.02em' }}>
        {recurso} começa no <strong>{ROTULO_DO_NIVEL[minimo]}</strong>
      </p>
      <Link
        href={href}
        className="botao-primario"
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          marginTop: 12,
          minHeight: componente.ctaAltura,
          padding: '0 16px',
          borderRadius: componente.raioControle,
          fontWeight: 700,
          textDecoration: 'none',
        }}
      >
        Ver os planos
      </Link>
    </section>
  )
}

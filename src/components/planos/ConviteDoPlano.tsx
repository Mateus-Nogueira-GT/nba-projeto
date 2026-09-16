import Link from 'next/link'

import { componente } from '@/design-system/tokens/componente'
import { semantico } from '@/design-system/tokens/semantico'
import { type NivelPago, ROTULO_DO_NIVEL } from '@/modules/plataforma/assinatura/nivel-do-plano'

/**
 * O CONVITE — o que o grátis vê no lugar do que não tem.
 *
 * Nunca uma tela vazia, nunca só um redirecionamento (spec §6): o convite
 * diz o que existe ali e qual nível libera, e leva para /assinar sabendo
 * de onde veio — é o `voltar` que faz o botão de retorno funcionar.
 *
 * `semantico.borda` não existe no design system (conferido em semantico.ts);
 * o card da Lista Secreta usa `semantico.divisor` para a mesma borda, e é o
 * que este card veste também.
 */
export function ConviteDoPlano({
  minimo,
  recurso,
  voltar,
}: {
  minimo: NivelPago
  recurso: string
  voltar: string
}) {
  const href = `/assinar?nivel=${minimo}&voltar=${encodeURIComponent(voltar)}`
  return (
    <section
      aria-label={`${recurso} começa no plano ${ROTULO_DO_NIVEL[minimo]}`}
      style={{
        marginTop: 18,
        padding: 18,
        borderRadius: 12,
        background: componente.cardFundo,
        border: `1px solid ${semantico.divisor}`,
      }}
    >
      <p style={{ margin: 0, fontFamily: semantico.fonteRotulo, letterSpacing: 0.5 }}>
        {recurso} começa no <strong>{ROTULO_DO_NIVEL[minimo]}</strong>
      </p>
      <Link
        href={href}
        style={{
          display: 'inline-block',
          marginTop: 12,
          padding: '10px 16px',
          borderRadius: 10,
          background: componente.ctaFundo,
          color: semantico.textoSobreCor,
          fontWeight: 700,
          textDecoration: 'none',
        }}
      >
        Ver os planos
      </Link>
    </section>
  )
}

'use client'

import { useActionState, type ReactNode } from 'react'
import { ESTADO_INICIAL, type EstadoAcao } from './estado-acao'
import s from './Admin.module.css'

/**
 * Formulário que chama uma server action e MOSTRA o resultado ao lado dos
 * campos: erro textual (role=alert) ou confirmação. Enquanto envia, os botões
 * ficam inertes — nada de clique duplo gravando duas vezes.
 */
export function FormAcao({
  acao,
  children,
  className,
  compacto = false,
  rotulo,
}: {
  acao: (estado: EstadoAcao, dados: FormData) => Promise<EstadoAcao>
  children: ReactNode
  className?: string
  compacto?: boolean
  rotulo?: string
}) {
  const [estado, agir, pendente] = useActionState(acao, ESTADO_INICIAL)
  return (
    <form
      action={agir}
      className={className ?? (compacto ? s.formCompacto : s.formulario)}
      data-pendente={pendente}
      aria-busy={pendente}
      aria-label={rotulo}
    >
      {children}
      {estado.erro && (
        <p role="alert" className={s.erro}>
          {estado.erro}
        </p>
      )}
      {estado.ok && !estado.erro && (
        <p role="status" className={s.ok}>
          {estado.ok}
        </p>
      )}
    </form>
  )
}

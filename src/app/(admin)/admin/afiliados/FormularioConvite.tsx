'use client'

import { useActionState } from 'react'
import estilos from '@/components/afiliados/PainelComercial.module.css'
import { acaoCriarConvite, type EstadoConvite } from './acoes'

const INICIAL: EstadoConvite = { erro: null, link: null }

export function FormularioConvite() {
  const [estado, acao, pendente] = useActionState(acaoCriarConvite, INICIAL)
  return (
    <form action={acao} className={estilos.formulario}>
      <h3>Convidar parceiro</h3>
      <label>
        Nome público
        <input name="nomePublico" required minLength={2} />
      </label>
      <label>
        E-mail da conta
        <input name="email" type="email" required />
      </label>
      <button className={estilos.botao} disabled={pendente}>
        {pendente ? 'Criando…' : 'Criar convite por 7 dias'}
      </button>
      {estado.erro ? (
        <p role="alert" className={estilos.alerta}>
          {estado.erro}
        </p>
      ) : null}
      {estado.link ? (
        <p className={estilos.mensagem}>
          Copie e envie com segurança: <span className={estilos.codigo}>{estado.link}</span>
        </p>
      ) : null}
    </form>
  )
}

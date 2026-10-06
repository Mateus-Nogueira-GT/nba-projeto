'use client'

import { useActionState } from 'react'
import { CopiarLink } from '@/features/afiliados/CopiarLink'
import { ESTADO_INICIAL } from '../estado-acao'
import { acaoCriarConvite } from './acoes'
import s from '../Admin.module.css'

/**
 * Convite de parceiro: o link de uso único aparece aqui, uma vez, para copiar.
 * `parceirosSemConta` são os parceiros que o admin cadastrou e que ainda não
 * têm conta: apontar um deles faz o aceite ligar a conta a ele, em vez de
 * criar um parceiro novo.
 */
export function FormularioConvite({
  parceirosSemConta = [],
}: {
  parceirosSemConta?: { id: string; nomePublico: string }[]
}) {
  const [estado, acao, pendente] = useActionState(acaoCriarConvite, ESTADO_INICIAL)
  return (
    <form action={acao} className={`${s.formulario} ${s.cartaoForm}`} data-pendente={pendente} aria-label="Convidar parceiro">
      <h3 className={s.subtitulo}>Convidar parceiro</h3>
      <label className={s.campo}>
        <span className={s.campoRotulo}>Nome público</span>
        <input name="nomePublico" required minLength={2} />
      </label>
      <label className={s.campo}>
        <span className={s.campoRotulo}>E-mail da conta</span>
        <input name="email" type="email" required />
      </label>
      <label className={s.campo}>
        <span className={s.campoRotulo}>Parceiro já cadastrado</span>
        <select name="parceiroId" defaultValue="">
          <option value="">Nenhum — criar um parceiro novo no aceite</option>
          {parceirosSemConta.map((parceiro) => (
            <option key={parceiro.id} value={parceiro.id}>
              {parceiro.nomePublico}
            </option>
          ))}
        </select>
      </label>
      <div>
        <button className={s.botao} disabled={pendente}>
          {pendente ? 'Criando…' : 'Criar convite por 7 dias'}
        </button>
      </div>
      {estado.erro && (
        <p role="alert" className={s.erro}>
          {estado.erro}
        </p>
      )}
      {estado.ok && (
        <div role="status" className={s.aviso}>
          Copie e envie com segurança (uso único, 7 dias):
          <br />
          <code>{estado.ok}</code>
          <div style={{ marginTop: 8 }}>
            <CopiarLink caminho={estado.ok} />
          </div>
        </div>
      )}
    </form>
  )
}

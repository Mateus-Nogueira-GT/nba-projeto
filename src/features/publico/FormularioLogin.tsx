'use client'

import Link from 'next/link'
import { useActionState } from 'react'
import { entrar } from './acoes'
import { CampoSenha } from './CampoSenha'
import { impressaoDoDispositivo } from './dispositivo'
import s from './Formulario.module.css'

export function FormularioLogin({ destino }: { destino: string }) {
  // A impressão é lida no MOMENTO do envio: localStorage e navigator só
  // existem no cliente.
  const [erro, acao, enviando] = useActionState(async (estado: string | null, dados: FormData) => {
    dados.set('dispositivo', impressaoDoDispositivo())
    dados.set('ua', navigator.userAgent)
    return entrar(estado, dados)
  }, null)

  return (
    <form action={acao} className={s.form} noValidate={false}>
      <input type="hidden" name="destino" value={destino} />
      <div className={s.campo}>
        <label htmlFor="email" className={s.rotulo}>
          E-mail
        </label>
        <input
          id="email"
          name="email"
          type="email"
          required
          autoComplete="email"
          inputMode="email"
          placeholder="voce@email.com"
          className={s.entrada}
          aria-invalid={erro ? true : undefined}
          aria-describedby={erro ? 'erro-login' : undefined}
        />
      </div>
      <div className={s.campo}>
        <div className={s.linhaRotulo}>
          <label htmlFor="senha" className={s.rotulo}>
            Senha
          </label>
          <Link href="/redefinir" className={s.linkPequeno}>
            Esqueci minha senha
          </Link>
        </div>
        <CampoSenha id="senha" nome="senha" autoComplete="current-password" descritoPor={erro ? 'erro-login' : undefined} />
      </div>
      {erro && (
        <p id="erro-login" role="alert" className={s.erro}>
          {erro}
        </p>
      )}
      <button type="submit" disabled={enviando} className={s.primario}>
        {enviando ? 'Entrando…' : 'Entrar'}
      </button>
      {/* A regra que explica a sessão derrubada precisa ser dita ANTES de
          entrar — avisar depois não é avisar. */}
      <p className={s.regra}>
        Sua assinatura permite 2 aparelhos ativos. Ao entrar em um terceiro, a sessão mais antiga é
        encerrada.
      </p>
    </form>
  )
}

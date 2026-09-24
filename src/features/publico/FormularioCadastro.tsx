'use client'

import { useActionState } from 'react'
import { MENSAGEM_REGRA_SENHA } from '@/modules/plataforma/auth/senha'
import { cadastrar } from './acoes'
import { CampoSenha } from './CampoSenha'
import { impressaoDoDispositivo } from './dispositivo'
import s from './Formulario.module.css'

export function FormularioCadastro() {
  const [erro, acao, enviando] = useActionState(async (estado: string | null, dados: FormData) => {
    dados.set('dispositivo', impressaoDoDispositivo())
    dados.set('ua', navigator.userAgent)
    return cadastrar(estado, dados)
  }, null)

  return (
    <form action={acao} className={s.form}>
      <div className={s.campo}>
        <label htmlFor="nome" className={s.rotulo}>
          Nome
        </label>
        <input id="nome" name="nome" required minLength={2} maxLength={120} autoComplete="name" className={s.entrada} />
      </div>
      <div className={s.campo}>
        <label htmlFor="email" className={s.rotulo}>
          E-mail
        </label>
        <input id="email" name="email" type="email" required autoComplete="email" inputMode="email" placeholder="voce@email.com" className={s.entrada} />
      </div>
      <div className={s.campo}>
        <label htmlFor="senha" className={s.rotulo}>
          Senha
        </label>
        {/* A MESMA frase da regra em todo lugar (MENSAGEM_REGRA_SENHA): duas
            redações fariam a pessoa achar que são regras diferentes. */}
        {/* 12, como o back (`senhaSchema.min(12)`): o v2 pedia 10 e a
            própria frase abaixo diz 12. */}
        <CampoSenha id="senha" nome="senha" autoComplete="new-password" minLength={12} descritoPor="regra-senha" />
        <p id="regra-senha" className={s.ajuda}>
          {MENSAGEM_REGRA_SENHA}
        </p>
      </div>
      {erro && (
        <p role="alert" className={s.erro}>
          {erro}
        </p>
      )}
      <button type="submit" disabled={enviando} className={s.primario}>
        {enviando ? 'Criando conta…' : 'Criar conta'}
      </button>
    </form>
  )
}

'use client'

import { useActionState } from 'react'
// A MESMA impressão do app (mesma chave): o admin que entra pelo painel e
// pelo app é um aparelho só, não dois — senão gastaria as 2 vagas sozinho.
import { impressaoDoDispositivo } from '@/features/publico/dispositivo'
import { entrarNoPainel } from './acoes'
import s from '../Admin.module.css'

export function FormularioEntrarAdmin({ destino }: { destino: string }) {
  const [erro, acao, enviando] = useActionState(async (estado: string | null, dados: FormData) => {
    dados.set('dispositivo', impressaoDoDispositivo())
    dados.set('ua', navigator.userAgent)
    return entrarNoPainel(estado, dados)
  }, null)

  return (
    <form action={acao} className={s.formulario} data-pendente={enviando} aria-label="Entrar no painel">
      <input type="hidden" name="destino" value={destino} />
      <label className={s.campo}>
        <span className={s.campoRotulo}>E-mail</span>
        <input name="email" type="email" required autoComplete="email" aria-describedby={erro ? 'erro-entrar' : undefined} />
      </label>
      <label className={s.campo}>
        <span className={s.campoRotulo}>Senha</span>
        <input name="senha" type="password" required autoComplete="current-password" />
      </label>
      {erro && (
        <p role="alert" id="erro-entrar" className={s.erro}>
          {erro}
        </p>
      )}
      <button type="submit" className={s.botao} disabled={enviando}>
        {enviando ? 'Entrando…' : 'Entrar'}
      </button>
    </form>
  )
}

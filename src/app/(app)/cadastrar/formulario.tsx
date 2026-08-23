'use client'

import { useActionState } from 'react'

import { semantico } from '@/design-system/tokens/semantico'
import { cadastrar } from './acoes'

function impressaoDoDispositivo(): string {
  const chave = 'ia_nba_dispositivo'
  const existente = localStorage.getItem(chave)
  if (existente) return existente
  const nova = crypto.randomUUID()
  localStorage.setItem(chave, nova)
  return nova
}

export function FormularioCadastro() {
  const [erro, acao, enviando] = useActionState(
    async (estado: string | null, dados: FormData) => {
      dados.set('dispositivo', impressaoDoDispositivo())
      dados.set('ua', navigator.userAgent)
      return cadastrar(estado, dados)
    },
    null,
  )
  const campo = {
    width: '100%',
    padding: '11px 12px',
    borderRadius: 8,
    border: `1px solid ${semantico.divisor}`,
    background: semantico.superficie,
    color: semantico.textoPrimario,
    fontSize: 15,
  } as const

  return (
    <form action={acao} style={{ display: 'grid', gap: 13 }}>
      <label style={{ display: 'grid', gap: 5, fontSize: 13 }}>
        Nome
        <input name="nome" required minLength={2} maxLength={120} autoComplete="name" style={campo} />
      </label>
      <label style={{ display: 'grid', gap: 5, fontSize: 13 }}>
        E-mail
        <input name="email" required type="email" autoComplete="email" style={campo} />
      </label>
      <label style={{ display: 'grid', gap: 5, fontSize: 13 }}>
        Senha
        <input
          name="senha"
          required
          type="password"
          minLength={12}
          maxLength={128}
          autoComplete="new-password"
          aria-describedby="regra-senha"
          style={campo}
        />
      </label>
      <p id="regra-senha" style={{ margin: 0, color: semantico.textoSecundario, fontSize: 12 }}>
        Use pelo menos 12 caracteres, com letra e número.
      </p>
      {erro && (
        <p role="alert" style={{ margin: 0, color: semantico.alerta, fontSize: 13 }}>
          {erro}
        </p>
      )}
      <button
        type="submit"
        disabled={enviando}
        style={{
          ...campo,
          border: 0,
          background: semantico.textoPrimario,
          color: semantico.textoSobreCor,
          fontWeight: 700,
          cursor: 'pointer',
        }}
      >
        {enviando ? 'Criando conta…' : 'Criar conta'}
      </button>
    </form>
  )
}

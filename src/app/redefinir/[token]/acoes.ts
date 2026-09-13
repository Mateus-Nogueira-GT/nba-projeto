'use server'

import { redirect } from 'next/navigation'

import { getDb } from '@/modules/dominio/db/cliente'
import { concluirRedefinicao } from '@/modules/plataforma/auth/redefinicao'

export async function concluir(formulario: FormData): Promise<void> {
  const token = String(formulario.get('token') ?? '')
  const r = await concluirRedefinicao(getDb(), {
    token,
    novaSenha: String(formulario.get('novaSenha') ?? ''),
    agora: new Date(),
  })
  // `r.motivo` já É o código — 'token' | 'expirada' | 'usada' | 'senha', um
  // conjunto fechado que `concluirRedefinicao` decide, nunca texto livre. A
  // tela (page.tsx) que traduz para português, pelo mesmo motivo de
  // `conta/acoes.ts`: `?erro=` é URL, e a frase por extenso não pode ser o
  // que vai nela (achado da revisão final).
  if (!r.ok) redirect(`/redefinir/${encodeURIComponent(token)}?erro=${r.motivo}`)
  redirect('/entrar?aviso=senha-redefinida')
}

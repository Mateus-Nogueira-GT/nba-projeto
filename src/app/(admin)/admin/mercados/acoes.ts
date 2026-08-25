'use server'

import { revalidatePath } from 'next/cache'

import { getDb } from '@/modules/dominio/db/cliente'
import type { Atributo } from '@/modules/motor/tipos'
import { atributoEnum } from '@/modules/dominio/db/schema/enums'
import { confirmarMercado, vincularJogadorDaCasa } from '@/modules/ingestao/odds/reconciliar'
import { exigirAdmin } from '@/modules/plataforma/auth/cookies'

export async function confirmarVinculoDeMercado(formulario: FormData): Promise<void> {
  const casaId = String(formulario.get('casaId') ?? '')
  const nomeMercadoNaCasa = String(formulario.get('nomeMercadoNaCasa') ?? '')
  const atributo = String(formulario.get('atributo') ?? '')

  if (!casaId || !nomeMercadoNaCasa) return
  if (!(atributoEnum.enumValues as readonly string[]).includes(atributo)) return

  // Server action é endpoint POST chamável direto — proteger a página não
  // protege a ação. A checagem tem que estar aqui também.
  if (!(await exigirAdmin())) return

  await confirmarMercado(getDb(), {
    casaId,
    nomeMercadoNaCasa,
    atributo: atributo as Atributo,
  })
  revalidatePath('/admin/mercados')
}

export async function confirmarVinculoDeJogadorDaCasa(formulario: FormData): Promise<void> {
  const casaNome = String(formulario.get('casaNome') ?? '')
  const nomeNaCasa = String(formulario.get('nomeNaCasa') ?? '')
  const jogadorId = String(formulario.get('jogadorId') ?? '')
  const score = Number(formulario.get('score') ?? 0)

  if (!casaNome || !nomeNaCasa || !jogadorId) return

  const sessao = await exigirAdmin()
  if (!sessao) return

  await vincularJogadorDaCasa(getDb(), {
    casaNome,
    nomeNaCasa,
    jogadorId,
    score,
    // Trilha de auditoria real: quem confirmou, não a string 'admin'.
    confirmadoPor: sessao.email,
    agora: new Date(),
  })
  revalidatePath('/admin/mercados')
}

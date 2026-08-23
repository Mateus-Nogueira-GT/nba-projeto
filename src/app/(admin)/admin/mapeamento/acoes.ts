'use server'

import { revalidatePath } from 'next/cache'
import { getDb } from '@/modules/dominio/db/cliente'
import { exigirAdmin } from '@/modules/plataforma/auth/cookies'
import { confirmarMapeamento } from '@/modules/ingestao/niveis/importar'

export async function confirmarVinculo(formulario: FormData): Promise<void> {
  const nomeNaLista = String(formulario.get('nomeNaLista') ?? '')
  const jogadorId = String(formulario.get('jogadorId') ?? '')
  const provedorPlayerId = String(formulario.get('provedorPlayerId') ?? '')
  const provedor = String(formulario.get('provedor') ?? '')
  const score = Number(formulario.get('score') ?? 0)

  if (!nomeNaLista || !jogadorId || !provedor || !provedorPlayerId) return

  // Server action é endpoint POST chamável direto — proteger a página não
  // protege a ação. A checagem tem que estar aqui também.
  const sessao = await exigirAdmin()
  if (!sessao) return

  await confirmarMapeamento(getDb(), {
    nomeNaLista,
    provedor,
    jogadorId,
    provedorPlayerId,
    score,
    // Trilha de auditoria real: quem confirmou o vínculo, não a string 'admin'.
    confirmadoPor: sessao.email,
    agora: new Date(),
  })

  revalidatePath('/admin/mapeamento')
}

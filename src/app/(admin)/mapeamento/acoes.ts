'use server'

import { revalidatePath } from 'next/cache'
import { getDb } from '@/modules/dominio/db/cliente'
import { confirmarMapeamento } from '@/modules/ingestao/niveis/importar'

export async function confirmarVinculo(formulario: FormData): Promise<void> {
  const nomeNaLista = String(formulario.get('nomeNaLista') ?? '')
  const jogadorId = String(formulario.get('jogadorId') ?? '')
  const provedor = String(formulario.get('provedor') ?? '')
  const score = Number(formulario.get('score') ?? 0)

  if (!nomeNaLista || !jogadorId || !provedor) return

  await confirmarMapeamento(getDb(), {
    nomeNaLista,
    provedor,
    jogadorId,
    provedorPlayerId: jogadorId,
    score,
    // Substituir pelo usuário autenticado quando o prompt 6 entregar auth.
    confirmadoPor: 'admin',
    agora: new Date(),
  })

  revalidatePath('/mapeamento')
}

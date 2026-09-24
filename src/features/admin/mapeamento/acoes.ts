'use server'

import { revalidatePath } from 'next/cache'
import { getDb } from '@/modules/dominio/db/cliente'
import { exigirAdmin } from '@/modules/plataforma/auth/cookies'
import { confirmarMapeamento } from '@/modules/ingestao/niveis/importar'
import { falha, mensagemDeErro, sucesso, type EstadoAcao } from '../estado-acao'

export async function confirmarVinculo(_e: EstadoAcao, formulario: FormData): Promise<EstadoAcao> {
  const nomeNaLista = String(formulario.get('nomeNaLista') ?? '')
  const jogadorId = String(formulario.get('jogadorId') ?? '')
  const provedorPlayerId = String(formulario.get('provedorPlayerId') ?? '')
  const provedor = String(formulario.get('provedor') ?? '')
  const score = Number(formulario.get('score') ?? 0)

  // Antes voltava calado: o admin clicava "Confirmar" e nada acontecia.
  if (!nomeNaLista || !provedor || !provedorPlayerId) return falha('Dados do vínculo incompletos.')
  if (!jogadorId) {
    return falha('Este candidato ainda não tem jogador no banco — ingira o elenco do provedor antes de vincular.')
  }

  // Server action é endpoint POST chamável direto — a checagem fica aqui também.
  const sessao = await exigirAdmin()
  if (!sessao) return falha('Acesso restrito.')

  try {
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
  } catch (erro) {
    return falha(mensagemDeErro(erro))
  }

  revalidatePath('/admin/mapeamento')
  return sucesso(`"${nomeNaLista}" vinculado.`)
}

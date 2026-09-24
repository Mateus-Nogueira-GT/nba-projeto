'use server'

import { revalidatePath } from 'next/cache'
import { getDb } from '@/modules/dominio/db/cliente'
import type { Atributo } from '@/modules/motor/tipos'
import { atributoEnum } from '@/modules/dominio/db/schema/enums'
import { confirmarMercado, vincularJogadorDaCasa } from '@/modules/ingestao/odds/reconciliar'
import { exigirAdmin } from '@/modules/plataforma/auth/cookies'
import { falha, mensagemDeErro, sucesso, type EstadoAcao } from '../estado-acao'

export async function confirmarVinculoDeMercado(_e: EstadoAcao, formulario: FormData): Promise<EstadoAcao> {
  const casaId = String(formulario.get('casaId') ?? '')
  const nomeMercadoNaCasa = String(formulario.get('nomeMercadoNaCasa') ?? '')
  const atributo = String(formulario.get('atributo') ?? '')

  if (!casaId || !nomeMercadoNaCasa) return falha('Mercado incompleto.')
  if (!(atributoEnum.enumValues as readonly string[]).includes(atributo)) return falha('Escolha um atributo válido.')

  // Server action é endpoint POST chamável direto — a checagem fica aqui também.
  if (!(await exigirAdmin())) return falha('Acesso restrito.')

  try {
    await confirmarMercado(getDb(), { casaId, nomeMercadoNaCasa, atributo: atributo as Atributo })
  } catch (erro) {
    return falha(mensagemDeErro(erro))
  }
  revalidatePath('/admin/mercados')
  return sucesso('Mercado confirmado.')
}

/**
 * Vínculo do nome de jogador grafado pela casa. Ainda sem tela que o chame:
 * a fila de nomes das casas povoa quando a coleta de odds existir. Mantida
 * para o contrato do painel não perder a operação.
 */
export async function confirmarVinculoDeJogadorDaCasa(_e: EstadoAcao, formulario: FormData): Promise<EstadoAcao> {
  const casaNome = String(formulario.get('casaNome') ?? '')
  const nomeNaCasa = String(formulario.get('nomeNaCasa') ?? '')
  const jogadorId = String(formulario.get('jogadorId') ?? '')
  const score = Number(formulario.get('score') ?? 0)

  if (!casaNome || !nomeNaCasa || !jogadorId) return falha('Vínculo incompleto.')

  const sessao = await exigirAdmin()
  if (!sessao) return falha('Acesso restrito.')

  try {
    await vincularJogadorDaCasa(getDb(), {
      casaNome,
      nomeNaCasa,
      jogadorId,
      score,
      // Trilha de auditoria real: quem confirmou, não a string 'admin'.
      confirmadoPor: sessao.email,
      agora: new Date(),
    })
  } catch (erro) {
    return falha(mensagemDeErro(erro))
  }
  revalidatePath('/admin/mercados')
  return sucesso('Vínculo confirmado.')
}

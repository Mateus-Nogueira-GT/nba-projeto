'use server'

import { revalidatePath } from 'next/cache'

import { getDb } from '@/modules/dominio/db/cliente'
import { gravarCandidato } from '@/modules/entrega/backtest/candidatos'
import { exigirAdmin } from '@/modules/plataforma/auth/cookies'

export type EstadoCandidato = { erro: string | null }

export async function salvarCandidato(
  _anterior: EstadoCandidato,
  formulario: FormData,
): Promise<EstadoCandidato> {
  const versao = String(formulario.get('versao') ?? '').trim()
  const conteudoYaml = String(formulario.get('conteudoYaml') ?? '')
  if (!versao || !conteudoYaml) return { erro: 'Versão e YAML são obrigatórios.' }

  // Server action é endpoint POST chamável direto — proteger a página não
  // protege a ação. A checagem tem que estar aqui também.
  const sessao = await exigirAdmin()
  if (!sessao) return { erro: 'Acesso restrito.' }

  try {
    await gravarCandidato(getDb(), { versao, conteudoYaml, criadoPor: sessao.email })
  } catch (erro) {
    // A mensagem do zod diz exatamente qual campo do YAML está errado.
    return { erro: erro instanceof Error ? erro.message : 'Ruleset inválido.' }
  }

  revalidatePath('/admin/backtest')
  return { erro: null }
}

'use server'

import { revalidatePath } from 'next/cache'
import { getDb } from '@/modules/dominio/db/cliente'
import { gravarCandidato } from '@/modules/entrega/backtest/candidatos'
import { exigirAdmin } from '@/modules/plataforma/auth/cookies'
import { falha, sucesso, type EstadoAcao } from '../estado-acao'

export async function salvarCandidato(_anterior: EstadoAcao, formulario: FormData): Promise<EstadoAcao> {
  const versao = String(formulario.get('versao') ?? '').trim()
  const conteudoYaml = String(formulario.get('conteudoYaml') ?? '')
  if (!versao || !conteudoYaml) return falha('Versão e YAML são obrigatórios.')

  // Server action é endpoint POST chamável direto — proteger a página não
  // protege a ação. A checagem tem que estar aqui também.
  const sessao = await exigirAdmin()
  if (!sessao) return falha('Acesso restrito.')

  try {
    await gravarCandidato(getDb(), { versao, conteudoYaml, criadoPor: sessao.email })
  } catch (erro) {
    // A mensagem do zod diz exatamente qual campo do YAML está errado.
    return falha(erro instanceof Error ? erro.message : 'Ruleset inválido.')
  }

  revalidatePath('/admin/backtest')
  return sucesso(`Candidato "${versao}" salvo.`)
}

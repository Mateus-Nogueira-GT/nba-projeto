'use server'

import { revalidatePath } from 'next/cache'
import { getDb } from '@/modules/dominio/db/cliente'
import { sessaoAtual } from '@/modules/plataforma/auth/cookies'
import {
  schemaAcompanhamento,
  schemaExclusaoAlerta,
  schemaPreferenciasExperiencia,
} from '@/modules/plataforma/experiencia/contrato'
import {
  definirAcompanhamento,
  definirExclusaoAlerta,
  gravarPreferenciasExperiencia,
} from '@/modules/plataforma/experiencia/servico'

/**
 * As preferências de experiência (movimento, som, filtros de alerta,
 * acompanhamentos). O front anterior falava com `/api/preferencias/*`, rotas
 * que o pacote de front não tem; aqui são server actions sobre as MESMAS
 * funções e os MESMOS schemas do módulo — o contrato com o back não muda.
 */
type Resultado = { ok: boolean; mensagem?: string }

export async function salvarPreferencias(entrada: unknown): Promise<Resultado> {
  const sessao = await sessaoAtual()
  if (!sessao) return { ok: false, mensagem: 'Entre novamente para salvar.' }
  const dados = schemaPreferenciasExperiencia.safeParse(entrada)
  if (!dados.success) return { ok: false, mensagem: 'Preferência inválida.' }
  await gravarPreferenciasExperiencia(getDb(), sessao.usuarioId, dados.data)
  revalidatePath('/conta')
  return { ok: true }
}

export async function definirAlerta(entrada: unknown): Promise<Resultado> {
  const sessao = await sessaoAtual()
  if (!sessao) return { ok: false, mensagem: 'Entre novamente para salvar.' }
  const dados = schemaExclusaoAlerta.safeParse(entrada)
  if (!dados.success) return { ok: false, mensagem: 'Filtro de alerta inválido.' }
  await definirExclusaoAlerta(getDb(), sessao.usuarioId, dados.data)
  return { ok: true }
}

export async function definirAcompanhamentoDaConta(entrada: unknown): Promise<Resultado> {
  const sessao = await sessaoAtual()
  if (!sessao) return { ok: false, mensagem: 'Entre novamente para salvar.' }
  const dados = schemaAcompanhamento.safeParse(entrada)
  if (!dados.success) return { ok: false, mensagem: 'Acompanhamento inválido.' }
  await definirAcompanhamento(getDb(), sessao.usuarioId, dados.data)
  return { ok: true }
}

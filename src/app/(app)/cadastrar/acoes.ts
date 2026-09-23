'use server'

import { redirect } from 'next/navigation'
import { cookies, headers } from 'next/headers'
import { ZodError } from 'zod'

import { getDb } from '@/modules/dominio/db/cliente'
import { cadastrarUsuario } from '@/modules/plataforma/assinatura/cadastro'
import {
  configuracaoProdutoPago,
  origemPermitida,
} from '@/modules/plataforma/assinatura/configuracao'
import { gravarCookieDeSessao } from '@/modules/plataforma/auth/cookies'
import { ipDaRequisicao } from '@/modules/plataforma/auth/requisicao'
import { abrirSessao } from '@/modules/plataforma/auth/sessao'
import { COOKIE_VISITANTE_AFILIADO } from '@/modules/plataforma/afiliados/http'
import { associarVisitanteAoUsuario } from '@/modules/plataforma/afiliados/servico'

const DURACAO_MS = 30 * 24 * 3600_000

export async function cadastrar(
  _estado: string | null,
  formulario: FormData,
): Promise<string | null> {
  const agora = new Date()
  const email = String(formulario.get('email') ?? '')
  const senha = String(formulario.get('senha') ?? '')
  const nome = String(formulario.get('nome') ?? '')
  const ip = await ipDaRequisicao()
  const config = configuracaoProdutoPago()
  if (!origemPermitida((await headers()).get('origin'), config)) {
    return 'Origem da solicitação inválida.'
  }
  let resultado

  try {
    resultado = await cadastrarUsuario(getDb(), config, { email, senha, nome }, { ip, agora })
  } catch (erro) {
    if (erro instanceof ZodError) return erro.issues[0]?.message ?? 'Dados inválidos.'
    throw erro
  }

  if (!resultado.ok) {
    if (resultado.motivo === 'indisponivel') return 'Cadastro temporariamente indisponível.'
    if (resultado.motivo === 'limite') return 'Muitas tentativas. Aguarde antes de repetir.'
    return 'Não foi possível criar a conta com esses dados.'
  }

  // A conta acabou de ser criada com esta senha: conferir de novo seria um
  // segundo scrypt por cadastro, no pico do lançamento (auditoria 23/09).
  const login = await abrirSessao(
    getDb(),
    resultado.usuarioId,
    {
      fingerprint: String(formulario.get('dispositivo') ?? 'desconhecido'),
      tipo: /mobile|android|iphone/i.test(String(formulario.get('ua') ?? ''))
        ? 'MOBILE'
        : 'DESKTOP',
      userAgent: String(formulario.get('ua') ?? '') || null,
      ip,
    },
    agora,
    { duracaoMs: DURACAO_MS },
  )
  await gravarCookieDeSessao(login.token, new Date(agora.getTime() + DURACAO_MS))
  const visitante = (await cookies()).get(COOKIE_VISITANTE_AFILIADO)?.value
  if (visitante && login.usuarioId) {
    try {
      await associarVisitanteAoUsuario(getDb(), visitante, login.usuarioId, agora, 'CADASTRO')
    } catch (erro) {
      console.error('Falha ao associar atribuição de afiliado após cadastro', erro)
    }
  }
  redirect('/assinar')
}

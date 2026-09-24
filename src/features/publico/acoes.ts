'use server'

import { cookies, headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { ZodError } from 'zod'

import { getDb } from '@/modules/dominio/db/cliente'
import { COOKIE_VISITANTE_AFILIADO } from '@/modules/plataforma/afiliados/http'
import { associarVisitanteAoUsuario } from '@/modules/plataforma/afiliados/servico'
import { cadastrarUsuario } from '@/modules/plataforma/assinatura/cadastro'
import {
  configuracaoProdutoPago,
  origemPermitida,
} from '@/modules/plataforma/assinatura/configuracao'
import {
  gravarCookieDeSessao,
  limparCookieDeSessao,
  tokenDaSessaoAtual,
} from '@/modules/plataforma/auth/cookies'
import { concluirRedefinicao } from '@/modules/plataforma/auth/redefinicao'
import { ipDaRequisicao } from '@/modules/plataforma/auth/requisicao'
import { abrirSessao, autenticar, encerrarSessaoPorToken } from '@/modules/plataforma/auth/sessao'
import { destinoSeguro } from './destino'

const DURACAO_MS = 30 * 24 * 3600_000

function dadosDoAparelho(formulario: FormData, ip: string | null) {
  const ua = String(formulario.get('ua') ?? '')
  return {
    fingerprint: String(formulario.get('dispositivo') ?? 'desconhecido'),
    tipo: /mobile|android|iphone/i.test(ua) ? ('MOBILE' as const) : ('DESKTOP' as const),
    userAgent: ua || null,
    ip,
  }
}

async function associarAfiliado(usuarioId: string, agora: Date, origem: 'LOGIN' | 'CADASTRO') {
  const visitante = (await cookies()).get(COOKIE_VISITANTE_AFILIADO)?.value
  if (!visitante) return
  try {
    await associarVisitanteAoUsuario(getDb(), visitante, usuarioId, agora, origem)
  } catch (erro) {
    console.error(`Falha ao associar atribuição de afiliado após ${origem.toLowerCase()}`, erro)
  }
}

export async function entrar(_estado: string | null, formulario: FormData): Promise<string | null> {
  const email = String(formulario.get('email') ?? '')
  const senha = String(formulario.get('senha') ?? '')
  // Sem destino explícito, quem decide é a ABERTURA (Ao Vivo se há jogo no 1º
  // quarto, a Lista no resto do dia). Com destino, ele continua mandando.
  const destino = destinoSeguro(String(formulario.get('destino') ?? '/abrir'), '/abrir')
  const agora = new Date()
  const r = await autenticar(
    getDb(),
    { email, senha },
    dadosDoAparelho(formulario, await ipDaRequisicao()),
    agora,
    { duracaoMs: DURACAO_MS },
  )
  if (!r.ok) {
    // Mensagem única para credenciais: dizer "e-mail não existe" entrega a
    // base de assinantes para quem estiver testando endereços.
    return r.motivo === 'excesso-de-tentativas'
      ? 'Muitas tentativas. Aguarde alguns minutos.'
      : r.motivo === 'bloqueado'
        ? 'Conta bloqueada. Fale com o suporte.'
        : 'E-mail ou senha incorretos.'
  }
  await gravarCookieDeSessao(r.token, new Date(agora.getTime() + DURACAO_MS))
  if (r.usuarioId) await associarAfiliado(r.usuarioId, agora, 'LOGIN')
  redirect(destino)
}

export async function sair(): Promise<void> {
  const token = await tokenDaSessaoAtual()
  // Revoga primeiro: se o banco falhar, não fingimos logout só apagando o
  // cookie enquanto o token persistido continua válido.
  if (token) await encerrarSessaoPorToken(getDb(), token, 'logout solicitado pelo usuário', new Date())
  await limparCookieDeSessao()
  redirect('/entrar')
}

export async function cadastrar(_estado: string | null, formulario: FormData): Promise<string | null> {
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
  // A conta acabou de ser criada com esta senha: conferi-la de novo via
  // `autenticar` seria um segundo scrypt por cadastro, no pico do lançamento
  // (auditoria 23/09). A sessão abre direto para o id devolvido.
  const login = await abrirSessao(
    getDb(),
    resultado.usuarioId,
    dadosDoAparelho(formulario, ip),
    agora,
    { duracaoMs: DURACAO_MS },
  )
  await gravarCookieDeSessao(login.token, new Date(agora.getTime() + DURACAO_MS))
  await associarAfiliado(login.usuarioId, agora, 'CADASTRO')
  redirect('/assinar')
}

/** Os códigos que a tela de redefinição sabe traduzir — conjunto fechado. */
const MOTIVOS_DE_REDEFINICAO = ['token', 'expirada', 'usada', 'senha'] as const

export async function concluirNovaSenha(formulario: FormData): Promise<void> {
  const token = String(formulario.get('token') ?? '')
  const r = await concluirRedefinicao(getDb(), {
    token,
    novaSenha: String(formulario.get('novaSenha') ?? ''),
    agora: new Date(),
  })
  if (!r.ok) {
    // `?erro=` é URL: vai o CÓDIGO, nunca frase. Um motivo fora do conjunto
    // (a fachada devolve 'invalido') vira 'token' — link inválido.
    const bruto: string = r.motivo
    const motivo = MOTIVOS_DE_REDEFINICAO.find((m) => m === bruto) ?? 'token'
    redirect(`/redefinir/${encodeURIComponent(token)}?erro=${motivo}`)
  }
  redirect('/entrar?aviso=senha-redefinida')
}

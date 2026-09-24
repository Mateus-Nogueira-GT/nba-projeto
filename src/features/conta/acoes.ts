'use server'

import { eq } from 'drizzle-orm'
import { redirect } from 'next/navigation'
import { headers } from 'next/headers'
import { z } from 'zod'

import { AVATARES_PRONTOS } from './avatares'
import { getDb } from '@/modules/dominio/db/cliente'
import { usuarios } from '@/modules/dominio/db/schema'
import {
  cancelarAssinaturaDoUsuario,
  LimiteOperacaoError,
  SessaoRecenteObrigatoriaError,
} from '@/modules/plataforma/assinatura/checkout'
import { PagamentoMercadoPago, configDoAmbiente } from '@/modules/plataforma/assinatura/mercadopago'
import {
  configuracaoProdutoPago,
  origemPermitida,
} from '@/modules/plataforma/assinatura/configuracao'
import { limparCookieDeSessao, sessaoAtual } from '@/modules/plataforma/auth/cookies'
import { ipDaRequisicao } from '@/modules/plataforma/auth/requisicao'
import { conferirSenha, gerarHash, senhaSchema } from '@/modules/plataforma/auth/senha'
import {
  encerrarSessoesDoDispositivo,
  encerrarTodasAsSessoesNaTransacao,
} from '@/modules/plataforma/auth/sessao'

// Mesma coluna do cadastro (`assinatura/cadastro.ts`), mesmo limite — com
// mensagem em português própria, senão um e-mail longo demais vaza a
// mensagem genérica do Zod na URL de erro.
const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .max(254, 'E-mail inválido.')
  .email('E-mail inválido.')

// Formato de `dispositivos.id` (uuid) — recusa cedo um valor colado à mão,
// antes de gastar uma consulta no banco.
const dispositivoIdSchema = z.string().uuid('Dispositivo inválido.')

/**
 * Confere a senha atual antes de qualquer troca sensível (senha ou e-mail).
 * `null` cobre os dois jeitos de recusar sem dizer qual: usuário some (nunca
 * deveria acontecer, sessão já garante a FK) ou senha errada — a mesma
 * mensagem em ambos os casos, para não vazar se a conta existe.
 */
async function usuarioComSenhaConferida(
  usuarioId: string,
  senhaAtual: string,
): Promise<{ id: string } | null> {
  const [u] = await getDb()
    .select({ id: usuarios.id, senhaHash: usuarios.senhaHash })
    .from(usuarios)
    .where(eq(usuarios.id, usuarioId))
    .limit(1)
  if (!u || !(await conferirSenha(senhaAtual, u.senhaHash))) return null
  return { id: u.id }
}

// `preprocess` cai para string vazia quando o campo vem ausente ou não-string
// (FormData malformado) — assim o `min(2)` abaixo recusa esse caso com a
// MESMA mensagem em português das outras validações, em vez do inglês
// genérico que o Zod dá para um tipo errado ("Expected string, received...").
const nomeSchema = z.preprocess(
  (valor) => (typeof valor === 'string' ? valor : ''),
  z.string().trim().min(2, 'Nome muito curto.').max(60, 'Nome muito longo.'),
)

export async function cancelarAssinatura(): Promise<void> {
  const sessao = await sessaoAtual()
  if (!sessao) redirect('/entrar?destino=/conta')

  let destino = '/conta?cancelamento=confirmado'
  try {
    if (!origemPermitida((await headers()).get('origin'), configuracaoProdutoPago())) {
      throw new Error('OrigemInvalida')
    }
    const config = configDoAmbiente()
    if (!config) throw new Error('MercadoPagoNaoConfigurado')
    await cancelarAssinaturaDoUsuario(getDb(), new PagamentoMercadoPago(config), sessao, {
      ip: await ipDaRequisicao(),
      agora: new Date(),
    })
  } catch (erro) {
    destino =
      erro instanceof SessaoRecenteObrigatoriaError
        ? '/conta?cancelamento=reauth'
        : erro instanceof LimiteOperacaoError
          ? '/conta?cancelamento=limite'
          : '/conta?cancelamento=erro'
  }
  redirect(destino)
}

export async function atualizarNome(formulario: FormData): Promise<void> {
  const sessao = await sessaoAtual()
  if (!sessao) redirect('/entrar?destino=/conta')
  const nome = nomeSchema.safeParse(formulario.get('nome'))
  // Código, não a mensagem por extenso: `?erro=` é URL, e a tela (conta/page.tsx)
  // traduz pelo MESMO dicionário que `?aviso=` já usa — texto de atacante não
  // aparece dentro do `role="alert"` da própria NIP (achado da revisão final).
  if (!nome.success)
    redirect(`/conta?erro=${nome.error.issues[0]!.code === 'too_big' ? 'nome-longo' : 'nome-curto'}`)
  await getDb().update(usuarios).set({ nome: nome.data }).where(eq(usuarios.id, sessao.usuarioId))
  redirect('/conta?aviso=nome-ok')
}

export async function escolherAvatar(formulario: FormData): Promise<void> {
  const sessao = await sessaoAtual()
  if (!sessao) redirect('/entrar?destino=/conta')
  const fotoUrl = String(formulario.get('fotoUrl') ?? '')
  // Só o catálogo: caminho livre viraria injeção de imagem de fora.
  if (fotoUrl !== '' && !AVATARES_PRONTOS.includes(fotoUrl)) redirect('/conta?erro=avatar-invalido')
  await getDb()
    .update(usuarios)
    .set({ fotoUrl: fotoUrl || null })
    .where(eq(usuarios.id, sessao.usuarioId))
  redirect('/conta?aviso=avatar-ok')
}

export async function trocarSenha(formulario: FormData): Promise<void> {
  const sessao = await sessaoAtual()
  if (!sessao) redirect('/entrar?destino=/conta')
  const nova = senhaSchema.safeParse(formulario.get('novaSenha'))
  if (!nova.success) redirect('/conta?erro=senha-fraca')
  const u = await usuarioComSenhaConferida(
    sessao.usuarioId,
    String(formulario.get('senhaAtual') ?? ''),
  )
  if (!u) redirect('/conta?erro=senha-atual-incorreta')
  const agora = new Date()
  await getDb().transaction(async (tx) => {
    await tx.update(usuarios).set({ senhaHash: await gerarHash(nova.data) }).where(eq(usuarios.id, u.id))
    // Quem desconfia de invasão vem trocar a senha e espera CONTINUAR logado
    // aqui — por isso poupa a sessão atual (`excetoSessaoId`) e derruba só as
    // outras, ao contrário da redefinição por link (que não tem uma sessão
    // "de quem pediu" para poupar, e por isso derruba tudo). O evento de
    // auditoria já sai de dentro de `encerrarTodasAsSessoesNaTransacao`.
    await encerrarTodasAsSessoesNaTransacao(tx, u.id, 'troca de senha pelo perfil', agora, {
      excetoSessaoId: sessao.sessaoId,
    })
  })
  redirect('/conta?aviso=senha-ok')
}

export async function trocarEmail(formulario: FormData): Promise<void> {
  const sessao = await sessaoAtual()
  if (!sessao) redirect('/entrar?destino=/conta')
  // `String(... ?? '')` antes do Zod, para um campo ausente cair em ''
  // (recusada por `.email()` com a MESMA mensagem em português) em vez do
  // inglês genérico que o Zod dá para um tipo errado — mesmo cuidado de
  // `nomeSchema` acima.
  const novo = emailSchema.safeParse(String(formulario.get('novoEmail') ?? ''))
  if (!novo.success) redirect('/conta?erro=email-invalido')
  const u = await usuarioComSenhaConferida(
    sessao.usuarioId,
    String(formulario.get('senhaAtual') ?? ''),
  )
  if (!u) redirect('/conta?erro=senha-atual-incorreta')
  // Troca imediata: não existe provedor de e-mail no projeto (§5.3), então
  // não há como confirmar no endereço novo antes de valer. A tela avisa isso.
  const db = getDb()
  const [ocupado] = await db
    .select({ id: usuarios.id })
    .from(usuarios)
    .where(eq(usuarios.email, novo.data))
    .limit(1)
  if (ocupado && ocupado.id !== u.id) redirect('/conta?erro=email-em-uso')
  const agora = new Date()
  await db.transaction(async (tx) => {
    await tx.update(usuarios).set({ email: novo.data }).where(eq(usuarios.id, u.id))
    // Mesmo cuidado de trocarSenha, pelo mesmo motivo: quem troca o
    // identificador de login é quem mais precisa que as OUTRAS sessões
    // caiam, sem derrubar a própria sessão que fez a troca. Reaproveitar o
    // helper é também o que dá auditoria a esta troca — antes, nenhuma
    // existia (achado da revisão final).
    await encerrarTodasAsSessoesNaTransacao(tx, u.id, 'troca de e-mail pelo perfil', agora, {
      excetoSessaoId: sessao.sessaoId,
    })
  })
  redirect('/conta?aviso=email-ok')
}

export async function encerrarDispositivo(formulario: FormData): Promise<void> {
  const sessao = await sessaoAtual()
  if (!sessao) redirect('/entrar?destino=/conta')
  const dispositivoId = dispositivoIdSchema.safeParse(formulario.get('dispositivoId'))
  if (!dispositivoId.success) redirect('/conta?erro=dispositivo-invalido')

  // `sessao.dispositivoId` já é o dispositivo da sessão viva que autenticou
  // ESTA requisição (`validarSessao` preenche os dois pela mesma linha, na
  // mesma condição de vida) — não precisa de outra consulta para saber se o
  // alvo é o próprio aparelho em uso.
  const esteAparelho = sessao.dispositivoId === dispositivoId.data

  const encerradas = await encerrarSessoesDoDispositivo(
    getDb(),
    sessao.usuarioId,
    dispositivoId.data,
    'usuario',
    new Date(),
  )
  // Sem isso, colar o id de um dispositivo que não é seu (ou que já não tinha
  // sessão viva) diria "Sessão encerrada." sem ter encerrado nada.
  if (encerradas === 0) redirect('/conta?erro=dispositivo-invalido')

  if (esteAparelho) {
    // Encerrar o aparelho EM USO mata a própria sessão: mandar para /conta
    // devolveria alguém sem sessão, que a tela chutaria para /entrar sem
    // explicar por quê. Aqui o /entrar já chega com o aviso do que aconteceu.
    await limparCookieDeSessao()
    redirect('/entrar?aviso=sessao-encerrada')
  }
  redirect('/conta?aviso=sessao-ok')
}

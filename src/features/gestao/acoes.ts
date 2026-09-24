'use server'

import { redirect } from 'next/navigation'
import { z } from 'zod'
import { getDb } from '@/modules/dominio/db/cliente'
import { registrarEntradaRealizada } from '@/modules/entrega/gestao-realizadas'
import { sessaoAtual } from '@/modules/plataforma/auth/cookies'
import { avaliarAcesso } from '@/modules/plataforma/assinatura/direito'
import { atende } from '@/modules/plataforma/assinatura/nivel-do-plano'

// O que o usuário DIGITOU, não o que a NIP sugeriu: unidades e odd chegam por
// texto do teclado numérico do celular, daí `z.coerce`. Odd é opcional — nem
// toda casa mostra odd fixa no momento em que a pessoa registra.
const schema = z.object({
  dataReferencia: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  jogadorId: z.string().uuid(),
  atributo: z.enum(['PONTOS', 'REBOTES', 'ASSISTENCIAS']),
  linha: z.coerce.number().int().min(1),
  unidades: z.coerce.number().positive().max(100),
  odd: z
    .union([z.literal(''), z.coerce.number().min(1.01).max(100)])
    .transform((v) => (v === '' ? null : v)),
  // Sem `nome`: a fachada do v2 gravava o nome digitado junto do registro; no
  // nosso back o nome vem de `jogadores` na leitura (`entradasRealizadasDoDia`),
  // e um nome longo recusaria um registro válido.
})

/** Registra o que o usuário fez fora da NIP. Somente leitura continua valendo: nada daqui envia aposta. */
export async function registrarEntrada(formulario: FormData): Promise<void> {
  const sessao = await sessaoAtual()
  if (!sessao) redirect('/entrar?destino=/gestao')

  // Portão de ESCRITA, no servidor: a tela esconde o formulário do grátis, mas
  // isso não impede um POST direto. Registrar entrada começa no MVP; o
  // `nivel === null` cobre bloqueio administrativo.
  const acesso = await avaliarAcesso(getDb(), sessao.usuarioId)
  if (acesso.nivel === null || !atende(acesso.nivel, 'MVP')) {
    redirect('/assinar?nivel=MVP&voltar=%2Fgestao')
  }

  const dados = schema.safeParse(Object.fromEntries(formulario))
  // Código, não a frase por extenso — a tela traduz pelo dicionário; texto cru
  // na URL não vira alerta na própria NIP.
  if (!dados.success) {
    // O erro volta com o apito recusado, para a tela escrevê-lo JUNTO do
    // campo. Só ids no formato esperado atravessam — nada de texto livre.
    const volta = new URLSearchParams({ erro: 'entrada-invalida' })
    const jogadorId = String(formulario.get('jogadorId') ?? '')
    const atributo = String(formulario.get('atributo') ?? '')
    if (z.string().uuid().safeParse(jogadorId).success) volta.set('jogador', jogadorId)
    if (['PONTOS', 'REBOTES', 'ASSISTENCIAS'].includes(atributo)) volta.set('atributo', atributo)
    redirect(`/gestao?${volta}`)
  }
  await registrarEntradaRealizada(getDb(), { usuarioId: sessao.usuarioId, ...dados.data, agora: new Date() })
  redirect('/gestao?ver=realizadas')
}

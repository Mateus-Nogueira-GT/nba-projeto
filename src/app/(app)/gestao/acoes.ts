'use server'

import { redirect } from 'next/navigation'
import { z } from 'zod'

import { getDb } from '@/modules/dominio/db/cliente'
import { sessaoAtual } from '@/modules/plataforma/auth/cookies'
import { registrarEntradaRealizada } from '@/modules/entrega/gestao-realizadas'

// O que o usuário DIGITOU, não o que a NIP sugeriu: unidades e odd chegam por
// texto do teclado numérico do celular, daí `z.coerce`. Odd é opcional — nem
// toda casa mostra odd fixa no momento em que a pessoa registra.
const schema = z.object({
  dataReferencia: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  jogadorId: z.string().uuid(),
  atributo: z.enum(['PONTOS', 'REBOTES', 'ASSISTENCIAS']),
  linha: z.coerce.number().int().min(1),
  unidades: z.coerce.number().positive().max(100),
  odd: z.union([z.literal(''), z.coerce.number().min(1.01).max(100)]).transform((v) => (v === '' ? null : v)),
})

/** Registra o que o usuário fez fora da NIP. Somente leitura continua valendo: nada daqui envia aposta. */
export async function registrarEntrada(formulario: FormData): Promise<void> {
  const sessao = await sessaoAtual()
  if (!sessao) redirect('/entrar?destino=/gestao')
  const dados = schema.safeParse(Object.fromEntries(formulario))
  // Código, não a frase por extenso — a tela (gestao/page.tsx) traduz pelo
  // dicionário; texto cru na URL não vira alerta na própria NIP (achado da
  // revisão final, mesma correção de `conta/acoes.ts`).
  if (!dados.success) redirect('/gestao?erro=entrada-invalida')
  await registrarEntradaRealizada(getDb(), { usuarioId: sessao.usuarioId, ...dados.data, agora: new Date() })
  redirect('/gestao?ver=realizadas')
}

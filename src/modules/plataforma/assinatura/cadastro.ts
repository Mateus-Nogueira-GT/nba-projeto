import { eq } from 'drizzle-orm'
import { z } from 'zod'

import { usuarios } from '../../dominio/db/schema'
import type { Db } from '../../dominio/db/tipos'
import { gerarHash, senhaSchema } from '../auth/senha'
import type { ConfiguracaoProdutoPago } from './configuracao'
import { excedeuOperacoes, registrarOperacao } from './operacoes'

export const cadastroSchema = z
  .object({
    nome: z.string().trim().min(2).max(120),
    email: z.string().trim().toLowerCase().email().max(254),
    senha: senhaSchema,
  })
  .strict()

export type EntradaCadastro = z.infer<typeof cadastroSchema>

export type ResultadoCadastro =
  | { ok: true; usuarioId: string }
  | { ok: false; motivo: 'indisponivel' | 'limite' | 'email-em-uso' }

export async function cadastrarUsuario(
  db: Db,
  config: ConfiguracaoProdutoPago,
  entrada: EntradaCadastro,
  contexto: { ip: string | null; agora: Date },
): Promise<ResultadoCadastro> {
  if (!config.cadastroPublicoHabilitado) return { ok: false, motivo: 'indisponivel' }
  const dados = cadastroSchema.parse(entrada)

  if (await excedeuOperacoes(db, 'CADASTRO', dados.email, contexto.agora, undefined, contexto.ip)) {
    return { ok: false, motivo: 'limite' }
  }

  const [existente] = await db
    .select({ id: usuarios.id })
    .from(usuarios)
    .where(eq(usuarios.email, dados.email))
    .limit(1)
  if (existente) {
    await registrarOperacao(db, {
      operacao: 'CADASTRO',
      identificador: dados.email,
      ip: contexto.ip,
      sucesso: false,
      agora: contexto.agora,
    })
    return { ok: false, motivo: 'email-em-uso' }
  }

  const senhaHash = await gerarHash(dados.senha)
  const [usuario] = await db
    .insert(usuarios)
    .values({ email: dados.email, nome: dados.nome, senhaHash, criadoEm: contexto.agora })
    .onConflictDoNothing({ target: usuarios.email })
    .returning({ id: usuarios.id })

  await registrarOperacao(db, {
    operacao: 'CADASTRO',
    identificador: dados.email,
    ip: contexto.ip,
    sucesso: Boolean(usuario),
    agora: contexto.agora,
  })
  return usuario
    ? { ok: true, usuarioId: usuario.id }
    : { ok: false, motivo: 'email-em-uso' }
}

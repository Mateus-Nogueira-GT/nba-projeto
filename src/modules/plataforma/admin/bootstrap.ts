import { eq, sql } from 'drizzle-orm'
import { z } from 'zod'

import { logFalhas, usuarios } from '../../dominio/db/schema'
import type { Db } from '../../dominio/db/tipos'
import { gerarHash } from '../auth/senha'

const DadosBootstrap = z.object({
  email: z.email('e-mail inválido').transform((email) => email.trim().toLowerCase()),
  senha: z.string().min(14, 'a senha do primeiro ADMIN deve ter pelo menos 14 caracteres').max(256),
  nome: z.string().trim().min(1).max(160).optional(),
})

export type ResultadoBootstrap =
  | { criado: true; usuarioId: string }
  | { criado: false; motivo: 'admin-ja-existe'; usuarioId: string }

/**
 * Cria o primeiro administrador uma única vez.
 *
 * O lock de tabela é deliberado: num banco vazio não existe linha para usar
 * `FOR UPDATE`. Assim, duas execuções concorrentes não conseguem observar
 * simultaneamente "zero admins" e criar dois usuários privilegiados.
 */
export async function bootstrapPrimeiroAdmin(
  db: Db,
  entrada: { email: string; senha: string; nome?: string },
  agora = new Date(),
): Promise<ResultadoBootstrap> {
  const dados = DadosBootstrap.parse(entrada)
  const senhaHash = await gerarHash(dados.senha)

  return db.transaction(async (tx) => {
    await tx.execute(sql`LOCK TABLE ${usuarios} IN SHARE ROW EXCLUSIVE MODE`)

    const [adminExistente] = await tx
      .select({ id: usuarios.id })
      .from(usuarios)
      .where(eq(usuarios.papel, 'ADMIN'))
      .limit(1)

    if (adminExistente) {
      return { criado: false, motivo: 'admin-ja-existe', usuarioId: adminExistente.id }
    }

    const [emailExistente] = await tx
      .select({ id: usuarios.id })
      .from(usuarios)
      .where(eq(usuarios.email, dados.email))
      .limit(1)

    if (emailExistente) {
      throw new Error('o e-mail informado já pertence a outro usuário')
    }

    const [criado] = await tx
      .insert(usuarios)
      .values({
        email: dados.email,
        senhaHash,
        nome: dados.nome ?? null,
        papel: 'ADMIN',
        criadoEm: agora,
      })
      .returning({ id: usuarios.id })

    if (!criado) throw new Error('não foi possível criar o primeiro ADMIN')

    await tx.insert(logFalhas).values({
      origem: 'admin-bootstrap',
      severidade: 'INFO',
      mensagem: 'primeiro ADMIN criado',
      contextoJson: { usuarioId: criado.id },
      ocorridoEm: agora,
    })

    return { criado: true, usuarioId: criado.id }
  })
}

import { eq } from 'drizzle-orm'

import { fecharDb, getDb } from '../src/modules/dominio/db/cliente'
import { usuarios } from '../src/modules/dominio/db/schema'
import { adicionarUsuario } from '../src/modules/plataforma/admin/usuarios'
import { MENSAGEM_REGRA_SENHA, senhaSchema } from '../src/modules/plataforma/auth/senha'
import { avaliarAcesso, concederCortesia } from '../src/modules/plataforma/assinatura/direito'

/**
 * Conta de TESTE para a equipe do parceiro (pedido da call de 08/09): cria o
 * usuário se não existir e concede cortesia sem expiração — o brief não
 * definiu prazo, e CLAUDE.md regra 3 proíbe inventar um. A senha entra por
 * variável e nunca é impressa, logada ou gravada em arquivo.
 *
 * Reexecutar não duplica nada em nenhuma das duas tabelas: o usuário é
 * buscado por e-mail antes de criar, e `concederCortesia` já é um upsert pela
 * constraint única (origem, referencia_origem, produto) de `direitos_acesso`
 * — rodar de novo ATUALIZA a mesma cortesia, nunca empilha uma segunda linha
 * (mesmo padrão de `conceder-cortesia.ts`; a garantia está provada em
 * `plataforma/__tests__/avaliar-acesso.test.ts`).
 *
 *   CONTA_TESTE_EMAIL=equipe@nip.test CONTA_TESTE_SENHA='...12+ caract., letra e número...' \
 *   npx dotenv -e .env.local -- npm run conta:teste
 */
async function principal() {
  const email = (process.env.CONTA_TESTE_EMAIL ?? '').trim().toLowerCase()
  const senha = process.env.CONTA_TESTE_SENHA ?? ''
  const nome = process.env.CONTA_TESTE_NOME || 'Conta de teste'
  // Diminui o tempo em que a credencial fica acessível a código chamado
  // depois — ela nunca é impressa.
  delete process.env.CONTA_TESTE_SENHA

  if (!email) throw new Error('Defina CONTA_TESTE_EMAIL')
  if (!senhaSchema.safeParse(senha).success) {
    throw new Error(`CONTA_TESTE_SENHA inválida: ${MENSAGEM_REGRA_SENHA}`)
  }

  const db = getDb()
  const [existente] = await db
    .select({ id: usuarios.id })
    .from(usuarios)
    .where(eq(usuarios.email, email))
    .limit(1)
  const { id } = existente ?? (await adicionarUsuario(db, { email, senha, nome }))

  const agora = new Date()
  await concederCortesia(db, {
    usuarioId: id,
    referencia: `cortesia:teste:${email}`,
    inicio: agora,
    fim: null,
  })

  const acesso = await avaliarAcesso(db, id, agora)
  if (!acesso.permitido) throw new Error(`conta pronta mas acesso negado: ${acesso.motivo}`)

  console.log(`${existente ? 'Conta já existia' : 'Conta criada'}: ${email} · acesso ativo por cortesia.`)
}

principal()
  .catch((erro) => {
    console.error(erro instanceof Error ? erro.message : erro)
    process.exitCode = 1
  })
  .finally(() => fecharDb())

import { fecharDb, getDb } from '../src/modules/dominio/db/cliente'
import { bootstrapPrimeiroAdmin } from '../src/modules/plataforma/admin/bootstrap'

async function principal() {
  const email = process.env.ADMIN_BOOTSTRAP_EMAIL ?? ''
  const senha = process.env.ADMIN_BOOTSTRAP_PASSWORD ?? ''
  const nome = process.env.ADMIN_BOOTSTRAP_NAME || undefined

  // Diminui o tempo em que a credencial privilegiada fica acessível a código
  // chamado depois do bootstrap. Ela nunca é impressa.
  delete process.env.ADMIN_BOOTSTRAP_EMAIL
  delete process.env.ADMIN_BOOTSTRAP_PASSWORD
  delete process.env.ADMIN_BOOTSTRAP_NAME

  if (!email || !senha) {
    throw new Error('ADMIN_BOOTSTRAP_EMAIL e ADMIN_BOOTSTRAP_PASSWORD são obrigatórios')
  }

  const resultado = await bootstrapPrimeiroAdmin(getDb(), { email, senha, nome })
  process.stdout.write(
    resultado.criado ? 'Primeiro ADMIN criado.\n' : 'ADMIN já existe; nada alterado.\n',
  )
}

principal()
  .catch((erro: unknown) => {
    const mensagem = erro instanceof Error ? erro.message : 'falha desconhecida'
    process.stderr.write(`Bootstrap recusado: ${mensagem}\n`)
    process.exitCode = 1
  })
  .finally(fecharDb)

import { eq } from 'drizzle-orm'

import { fecharDb, getDb } from '../src/modules/dominio/db/cliente'
import { usuarios } from '../src/modules/dominio/db/schema'
import { avaliarAcesso, concederCortesia } from '../src/modules/plataforma/assinatura/direito'

/**
 * Concede direito de CORTESIA a uma conta existente — a ferramenta do
 * "backfill explícito de cortesia" do runbook de cobrança (equipe e piloto).
 *
 *   CORTESIA_EMAIL=alguem@x.com [CORTESIA_ATE=2026-12-31] npm run cortesia
 *
 * Sem CORTESIA_ATE a cortesia não expira. A referência é o próprio e-mail:
 * reexecutar ATUALIZA a mesma cortesia (e desfaz revogação), não duplica.
 * Nunca mexe em usuarios.status — bloqueio administrativo é outra coisa e
 * sempre prevalece (Spec 04, princípio 4).
 */
async function principal() {
  const email = process.env.CORTESIA_EMAIL ?? ''
  const ate = process.env.CORTESIA_ATE ?? ''
  if (!email) throw new Error('Defina CORTESIA_EMAIL')

  const fim = ate ? new Date(`${ate}T23:59:59.999Z`) : null
  if (fim && Number.isNaN(fim.getTime())) throw new Error('CORTESIA_ATE inválida (AAAA-MM-DD)')

  const db = getDb()
  const [usuario] = await db
    .select({ id: usuarios.id })
    .from(usuarios)
    .where(eq(usuarios.email, email.toLowerCase()))
    .limit(1)
  if (!usuario) throw new Error(`usuário ${email} não existe — crie a conta antes`)

  const agora = new Date()
  await concederCortesia(db, {
    usuarioId: usuario.id,
    referencia: `cortesia:${email.toLowerCase()}`,
    inicio: agora,
    fim,
    // Cortesia é para mostrar tudo (spec de planos, decisão 11).
    nivelDoPlano: 'ALL_STAR',
  })

  const acesso = await avaliarAcesso(db, usuario.id, agora)
  if (acesso.nivel === null || acesso.nivel === 'GRATIS') {
    throw new Error(
      `cortesia gravada mas acesso segue negado: ${acesso.nivel === null ? acesso.motivo : 'GRATIS'}`,
    )
  }

  console.log(
    `Cortesia ativa para ${email}${fim ? ` até ${ate}` : ' (sem expiração)'} · direito ${acesso.direitoId}`,
  )
}

principal()
  .catch((erro) => {
    console.error(erro instanceof Error ? erro.message : erro)
    process.exitCode = 1
  })
  .finally(() => fecharDb())

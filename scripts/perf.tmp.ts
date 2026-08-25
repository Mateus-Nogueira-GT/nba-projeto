import { eq } from 'drizzle-orm'
import { fecharDb, getDb } from '../src/modules/dominio/db/cliente'
import { usuarios } from '../src/modules/dominio/db/schema'
import { validarSessao } from '../src/modules/plataforma/auth/sessao'
import { avaliarAcesso } from '../src/modules/plataforma/assinatura/direito'
import { rulesetAtivo } from '../src/modules/entrega/ruleset-ativo'
import { lerFeed } from '../src/modules/entrega/lista-secreta'
import { dataDeReferencia } from '../src/modules/dominio/rodada'

const TOKEN = '6_gw711DZVsmpx8-lCB7jQmSYkBbRQqMbXVLnW_QkqU'

async function cronometrar<T>(nome: string, f: () => Promise<T>): Promise<T> {
  const t0 = performance.now()
  const r = await f()
  console.log(`${nome.padEnd(34)} ${(performance.now() - t0).toFixed(0)}ms`)
  return r
}

async function main() {
  const db = getDb()
  // 0 · o handshake: primeira consulta paga TCP+TLS+WS+auth
  await cronometrar('handshake + SELECT 1 (frio)', () => db.select().from(usuarios).limit(1))
  await cronometrar('SELECT 1 (conexão quente)', () => db.select().from(usuarios).limit(1))

  const ruleset = await rulesetAtivo()
  const hoje = dataDeReferencia(new Date(), ruleset.rodada.fuso)

  console.log('\n--- o que UMA navegação executa ---')
  const t0 = performance.now()
  const sessao = await cronometrar('1. validarSessao (SELECT+UPDATE)', () =>
    validarSessao(db, TOKEN, new Date(), { ip: '127.0.0.1' }),
  )
  const usuarioId = sessao.ok ? sessao.sessao.usuarioId : null
  await cronometrar('2. avaliarAcesso (2 SELECT)', () => avaliarAcesso(db, usuarioId))
  await cronometrar('3. rulesetAtivo (cache)', () => rulesetAtivo())
  await cronometrar('4. lerFeed', () => lerFeed(db, hoje))
  console.log(`${'TOTAL da cadeia'.padEnd(34)} ${(performance.now() - t0).toFixed(0)}ms`)
}
main().catch((e) => { console.error(e); process.exitCode = 1 }).finally(() => fecharDb())

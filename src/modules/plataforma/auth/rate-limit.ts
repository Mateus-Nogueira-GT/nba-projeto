import { and, eq, gte, sql, type SQL } from 'drizzle-orm'
import { tentativasLogin } from '../../dominio/db/schema'
import type { Db } from '../../dominio/db/tipos'

export type PoliticaRateLimit = {
  maxTentativas: number
  janelaMs: number
}

export const POLITICA_PADRAO: PoliticaRateLimit = {
  maxTentativas: 5,
  janelaMs: 15 * 60_000,
}

/**
 * Teto de FALHAS por IP. Folgado por causa do CGNAT (milhares atrás do mesmo
 * IPv4 no celular); o que ele freia é a lista de e-mails testada de um lugar
 * só, que antes não tinha freio nenhum (auditoria 23/09).
 */
export const POLITICA_POR_IP: PoliticaRateLimit = {
  maxTentativas: 50,
  janelaMs: 15 * 60_000,
}

export async function registrarTentativa(
  db: Db,
  dados: { identificador: string; ip: string | null; sucesso: boolean; agora: Date },
): Promise<string> {
  const [linha] = await db
    .insert(tentativasLogin)
    .values({
      identificador: dados.identificador.toLowerCase(),
      ip: dados.ip,
      sucesso: dados.sucesso,
      tentadoEm: dados.agora,
    })
    .returning({ id: tentativasLogin.id })
  if (!linha) throw new Error('não foi possível registrar a tentativa de login')
  return linha.id
}

async function contarFalhas(db: Db, filtro: SQL, desde: Date): Promise<number> {
  const [linha] = await db
    .select({ total: sql<number>`count(*)::int` })
    .from(tentativasLogin)
    .where(and(filtro, eq(tentativasLogin.sucesso, false), gte(tentativasLogin.tentadoEm, desde)))
  return linha?.total ?? 0
}

/**
 * RESERVA ANTES DE CONFERIR.
 *
 * A tentativa é gravada como falha PRESUMIDA e só depois se conta — a própria
 * tentativa entra na conta, por isso a comparação é `>` e não `>=`: cinco
 * falhas anteriores mais a atual barram, o mesmo limiar de antes. Contar
 * primeiro e gravar depois deixava N logins paralelos lerem a mesma contagem
 * zerada e passarem todos (auditoria 23/09). Quem acerta a senha tem a linha
 * virada para sucesso em seguida.
 *
 * Tentativa BARRADA não fica: a linha reservada é apagada. Se contasse como
 * falha, quem insiste durante o bloqueio o prolongaria para sempre — e, no
 * teto por IP, trancaria todo o CGNAT, inclusive quem acerta a senha. Apagar
 * não reabre a corrida: linha que passou para a conferência nunca é apagada,
 * então a última a contar sempre enxerga todas as que passaram antes dela.
 */
export async function reservarTentativaDeLogin(
  db: Db,
  dados: { identificador: string; ip: string | null; agora: Date },
  politica: PoliticaRateLimit = POLITICA_PADRAO,
  politicaIp: PoliticaRateLimit = POLITICA_POR_IP,
): Promise<{ id: string; excedeu: boolean }> {
  const identificador = dados.identificador.toLowerCase()
  const id = await registrarTentativa(db, {
    identificador,
    ip: dados.ip,
    sucesso: false,
    agora: dados.agora,
  })
  const porIdentificador = await contarFalhas(
    db,
    eq(tentativasLogin.identificador, identificador),
    new Date(dados.agora.getTime() - politica.janelaMs),
  )
  const excedeu =
    porIdentificador > politica.maxTentativas ||
    (!!dados.ip &&
      (await contarFalhas(
        db,
        eq(tentativasLogin.ip, dados.ip),
        new Date(dados.agora.getTime() - politicaIp.janelaMs),
      )) > politicaIp.maxTentativas)
  if (excedeu) await db.delete(tentativasLogin).where(eq(tentativasLogin.id, id))
  return { id, excedeu }
}

export async function marcarTentativaComoSucesso(db: Db, id: string): Promise<void> {
  await db.update(tentativasLogin).set({ sucesso: true }).where(eq(tentativasLogin.id, id))
}

/**
 * Bloqueia após N falhas na janela.
 *
 * Conta apenas FALHAS: login bem-sucedido não deve aproximar o usuário
 * legítimo de um bloqueio.
 */
export async function excedeuTentativas(
  db: Db,
  identificador: string,
  agora: Date,
  politica: PoliticaRateLimit = POLITICA_PADRAO,
): Promise<boolean> {
  const desde = new Date(agora.getTime() - politica.janelaMs)

  const [linha] = await db
    .select({ total: sql<number>`count(*)::int` })
    .from(tentativasLogin)
    .where(
      and(
        eq(tentativasLogin.identificador, identificador.toLowerCase()),
        eq(tentativasLogin.sucesso, false),
        gte(tentativasLogin.tentadoEm, desde),
      ),
    )

  return (linha?.total ?? 0) >= politica.maxTentativas
}

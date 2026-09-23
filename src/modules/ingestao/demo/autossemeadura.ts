import { sql } from 'drizzle-orm'

import { checkpointsIngestao } from '../../dominio/db/schema'
import type { Db } from '../../dominio/db/tipos'

/**
 * A guarda do re-seed automático da demonstração.
 *
 * O cron `/api/cron/demo` reancora a demo para a rodada do dia — o que é
 * exatamente o que se quer enquanto o banco é de DEMONSTRAÇÃO, e exatamente o
 * que NÃO se pode querer no dia em que um provedor real estiver escrevendo
 * ali. Por isso a autorização é uma variável explícita, e o padrão é
 * desligado: esquecer de ligar custa uma demo desatualizada; esquecer de
 * desligar custaria dado real sobrescrito por dado fictício.
 *
 * Comparação estrita com 'true' de propósito — '1', 'TRUE' e 'sim' não ligam
 * nada. Uma variável ambígua é como se liga o que não se queria ligar.
 */
export function autossemeaduraHabilitada(env: Record<string, string | undefined>): boolean {
  return env.DEMO_AUTOSSEMEADURA === 'true'
}

/**
 * A SEGUNDA GUARDA: o dado, não a variável.
 *
 * `DEMO_AUTOSSEMEADURA` sozinha dependia de alguém lembrar de apagá-la antes
 * do backfill da temporada real — e o cron roda todo dia às 6h de Brasília
 * (auditoria de 23/09). Aqui a rota olha o que importa: a ingestão real está
 * ligada, ou o backfill real já escreveu (só ele grava em
 * `checkpoints_ingestao`)? Então semear ficção por cima está fora de
 * questão, com ou sem a variável.
 */
export async function motivoParaNaoSemear(
  db: Db,
  env: Record<string, string | undefined>,
): Promise<'INGESTAO_REAL_HABILITADA' | 'DADO_REAL_PRESENTE' | null> {
  if (env.NBA_INGESTAO_HABILITADA === 'true') return 'INGESTAO_REAL_HABILITADA'
  const [linha] = await db.select({ n: sql<number>`count(*)::int` }).from(checkpointsIngestao)
  return (linha?.n ?? 0) > 0 ? 'DADO_REAL_PRESENTE' : null
}

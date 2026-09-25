import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { bancoDeTeste } from './ajuda-banco'

let banco: Awaited<ReturnType<typeof bancoDeTeste>>
beforeAll(async () => { banco = await bancoDeTeste() }, 30_000)
afterAll(async () => { await banco.fechar() })

describe('tabelas da temporada anterior', () => {
  it('as três existem e a chave de apito é a mesma de apitos, com NULL colidindo', async () => {
    // Verifica que as três tabelas existem
    for (const t of ['apitos_retroativos', 'greens_retroativos', 'feed_retroativo']) {
      const r = await banco.pg.query(`select 1 from information_schema.tables where table_name = $1`, [t])
      expect(r.rows).toHaveLength(1)
    }

    // Verifica a constraint UNIQUE NULLS NOT DISTINCT com as colunas corretas
    const constraintDef = await banco.pg.query<{ pg_get_constraintdef: string }>(
      `select pg_get_constraintdef(oid) from pg_constraint where conname = 'apitos_retroativos_dedup'`,
    )

    expect(constraintDef.rows).toHaveLength(1)
    const unico = constraintDef.rows[0]?.pg_get_constraintdef
    expect(unico).toBeDefined()
    expect(unico).toMatch(/jogo_id, jogador_id, atributo, estrategia, linha/)
    expect(unico).toMatch(/NULLS NOT DISTINCT/)
  })
})

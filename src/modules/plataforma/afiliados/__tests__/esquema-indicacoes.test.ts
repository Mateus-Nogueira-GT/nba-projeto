import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { bancoDeTeste } from '@/modules/dominio/__tests__/ajuda-banco'

/**
 * Task 1 do rastreamento de indicações: só o ESQUEMA. Nenhuma regra de
 * atribuição/serviço é exercida aqui — só que o banco aceita e recusa
 * exatamente o que o brief descreve, via SQL cru (mesmo caminho que uma
 * migração mal escrita atravessaria em produção).
 */
let banco: Awaited<ReturnType<typeof bancoDeTeste>>

beforeAll(async () => {
  banco = await bancoDeTeste()
}, 30_000)

afterAll(async () => {
  await banco?.fechar()
})

/** Um parceiro mínimo, só para servir de FK a campanhas. */
async function criarParceiro(sufixo: string) {
  const r = await banco.pg.query<{ id: string }>(
    `insert into parceiros_afiliados (codigo, nome_publico) values ($1, $2) returning id`,
    [`parceiro-${sufixo}`, `Parceiro ${sufixo}`],
  )
  return r.rows[0]!.id
}

async function criarCampanha(
  sufixo: string,
  parceiroId: string,
  opcoes: { finalidade?: string; ofertaId?: string | null } = {},
) {
  const r = await banco.pg.query<{ id: string }>(
    `insert into campanhas_afiliados (parceiro_id, oferta_id, nome, canal, finalidade)
     values ($1, $2, $3, 'SOCIAL', $4) returning id`,
    [parceiroId, opcoes.ofertaId ?? null, `Campanha ${sufixo}`, opcoes.finalidade ?? 'CASA'],
  )
  return r.rows[0]!.id
}

async function criarLink(sufixo: string, campanhaId: string, tipoDestino: string) {
  const r = await banco.pg.query<{ id: string }>(
    `insert into links_afiliados (campanha_id, codigo, tipo_destino)
     values ($1, $2, $3) returning id`,
    [campanhaId, `codigo-${sufixo}`, tipoDestino],
  )
  return r.rows[0]!.id
}

async function criarAtribuicao(sufixo: string, parceiroId: string, linkId: string) {
  const inicio = new Date('2026-09-01T00:00:00.000Z')
  const expiraEm = new Date('2026-10-01T00:00:00.000Z')
  const r = await banco.pg.query<{ id: string }>(
    `insert into atribuicoes_afiliados (visitante_hash, parceiro_id, link_origem_id, inicio, expira_em)
     values ($1, $2, $3, $4, $5) returning id`,
    [`visitante-${sufixo}`, parceiroId, linkId, inicio.toISOString(), expiraEm.toISOString()],
  )
  return r.rows[0]!.id
}

async function criarUsuario(sufixo: string) {
  const r = await banco.pg.query<{ id: string }>(
    `insert into usuarios (email, senha_hash) values ($1, 'x') returning id`,
    [`usuario-${sufixo}@teste.com`],
  )
  return r.rows[0]!.id
}

describe('esquema de rastreamento de indicações', () => {
  it('campanha de INDICACAO não exige oferta; de CASA exige', async () => {
    const parceiroId = await criarParceiro('camp-1')

    await expect(
      criarCampanha('indicacao', parceiroId, { finalidade: 'INDICACAO', ofertaId: null }),
    ).resolves.toBeDefined()

    await expect(
      criarCampanha('casa-sem-oferta', parceiroId, { finalidade: 'CASA', ofertaId: null }),
    ).rejects.toThrow(/campanhas_afiliados_oferta_por_finalidade/)
  })

  it('link CADASTRO é aceito e não exige caminho_nip', async () => {
    const parceiroId = await criarParceiro('link-1')
    const campanhaId = await criarCampanha('link-1', parceiroId, {
      finalidade: 'INDICACAO',
      ofertaId: null,
    })

    await expect(criarLink('cadastro-1', campanhaId, 'CADASTRO')).resolves.toBeDefined()
  })

  it('ASSINATURA_NIP exige nível do plano e modalidade e é único por atribuição', async () => {
    const parceiroId = await criarParceiro('assin-1')
    const campanhaId = await criarCampanha('assin-1', parceiroId, {
      finalidade: 'INDICACAO',
      ofertaId: null,
    })
    const linkId = await criarLink('assin-1', campanhaId, 'CADASTRO')
    const atribuicaoId = await criarAtribuicao('assin-1', parceiroId, linkId)
    const usuarioId = await criarUsuario('assin-1')

    await expect(
      banco.pg.query(
        `insert into eventos_afiliados
           (visitante_hash, usuario_id, link_id, atribuicao_id, tipo, nivel_do_plano, modalidade, ocorrido_em)
         values ($1, $2, $3, $4, 'ASSINATURA_NIP', 'MVP', 'MENSAL', now())`,
        ['visitante-assin-1', usuarioId, linkId, atribuicaoId],
      ),
    ).resolves.toBeDefined()

    // Segunda assinatura para a MESMA atribuição: viola o índice único parcial.
    await expect(
      banco.pg.query(
        `insert into eventos_afiliados
           (visitante_hash, usuario_id, link_id, atribuicao_id, tipo, nivel_do_plano, modalidade, ocorrido_em)
         values ($1, $2, $3, $4, 'ASSINATURA_NIP', 'ALL_STAR', 'TEMPORADA', now())`,
        ['visitante-assin-1b', usuarioId, linkId, atribuicaoId],
      ),
    ).rejects.toThrow(/eventos_afiliados_assinatura_unica/)

    // Outra atribuição, mas sem nível do plano: viola o CHECK.
    const atribuicaoId2 = await criarAtribuicao('assin-2', parceiroId, linkId)
    await expect(
      banco.pg.query(
        `insert into eventos_afiliados
           (visitante_hash, usuario_id, link_id, atribuicao_id, tipo, modalidade, ocorrido_em)
         values ($1, $2, $3, $4, 'ASSINATURA_NIP', 'MENSAL', now())`,
        ['visitante-assin-2', usuarioId, linkId, atribuicaoId2],
      ),
    ).rejects.toThrow(/eventos_afiliados_assinatura_com_plano/)
  })

  it('apagar a conta de um indicado que ASSINOU não esbarra no CHECK (revisão final, item 1)', async () => {
    // `eventos_afiliados.usuario_id` é `ON DELETE SET NULL`: um CHECK que
    // exigisse `usuario_id is not null` na ASSINATURA_NIP tornaria a conta
    // impossível de apagar. A atribuição continua obrigatória.
    const parceiroId = await criarParceiro('apagar-1')
    const campanhaId = await criarCampanha('apagar-1', parceiroId, {
      finalidade: 'INDICACAO',
      ofertaId: null,
    })
    const linkId = await criarLink('apagar-1', campanhaId, 'CADASTRO')
    const atribuicaoId = await criarAtribuicao('apagar-1', parceiroId, linkId)
    const usuarioId = await criarUsuario('apagar-1')
    await banco.pg.query(
      `insert into eventos_afiliados
         (visitante_hash, usuario_id, link_id, atribuicao_id, tipo, nivel_do_plano, modalidade, ocorrido_em)
       values ($1, $2, $3, $4, 'ASSINATURA_NIP', 'MVP', 'MENSAL', now())`,
      ['visitante-apagar-1', usuarioId, linkId, atribuicaoId],
    )

    await expect(banco.pg.query(`delete from usuarios where id = $1`, [usuarioId])).resolves.toBeDefined()
    const sobra = await banco.pg.query<{ usuario_id: string | null }>(
      `select usuario_id from eventos_afiliados where atribuicao_id = $1 and tipo = 'ASSINATURA_NIP'`,
      [atribuicaoId],
    )
    expect(sobra.rows).toEqual([{ usuario_id: null }])

    // Sem atribuição continua recusado.
    await expect(
      banco.pg.query(
        `insert into eventos_afiliados
           (visitante_hash, link_id, tipo, nivel_do_plano, modalidade, ocorrido_em)
         values ('visitante-apagar-2', $1, 'ASSINATURA_NIP', 'MVP', 'MENSAL', now())`,
        [linkId],
      ),
    ).rejects.toThrow(/eventos_afiliados_assinatura_com_plano/)
  })

  it('links_afiliados tem índice em campanha_id (revisão final, item 7)', async () => {
    const r = await banco.pg.query<{ indexdef: string }>(
      `select indexdef from pg_indexes where tablename = 'links_afiliados'`,
    )
    expect(r.rows.some((l) => /\(campanha_id\)/.test(l.indexdef))).toBe(true)
  })

  it('parceiro tem tipo PARCEIRO por padrão e aceita USUARIO; outro valor falha', async () => {
    const r = await banco.pg.query<{ tipo: string }>(
      `insert into parceiros_afiliados (codigo, nome_publico) values ('tipo-padrao', 'X') returning tipo`,
    )
    expect(r.rows[0]!.tipo).toBe('PARCEIRO')

    await expect(
      banco.pg.query(
        `insert into parceiros_afiliados (codigo, nome_publico, tipo) values ('tipo-usuario', 'Y', 'USUARIO')`,
      ),
    ).resolves.toBeDefined()

    await expect(
      banco.pg.query(
        `insert into parceiros_afiliados (codigo, nome_publico, tipo) values ('tipo-invalido', 'Z', 'ADMIN')`,
      ),
    ).rejects.toThrow(/parceiros_afiliados_tipo_valido/)
  })
})

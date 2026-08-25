import { describe, expect, it } from 'vitest'

import { config } from '../../../../vercel'

/**
 * A FUNÇÃO PRECISA RODAR ONDE O BANCO ESTÁ.
 *
 * Sem `regions`, a Vercel usa `iad1` (Washington) por padrão — e foi o que
 * esteve em produção enquanto o Neon vivia em `sa-east-1` (São Paulo). O
 * cabeçalho `x-vercel-id: gru1::iad1` denunciava: requisição entrando em São
 * Paulo, função executando nos EUA.
 *
 * O custo não é uma travessia por página, é uma POR CONSULTA — e cada tela
 * autenticada faz de 4 a 6 em sequência. Medição de 25/08: /offline (nenhuma
 * consulta) 78ms, /estatisticas 430ms, /gestao (cadeia completa) 920ms.
 *
 * Este teste não conversa com a Vercel; ele trava a decisão para que a linha
 * não desapareça num refactor sem alguém precisar reencontrar a medição.
 */
const REGIAO_DO_BANCO = 'gru1' // sa-east-1 · São Paulo — igual ao host do Neon

describe('região da função', () => {
  it('roda na MESMA região do banco', () => {
    expect(config.regions).toEqual([REGIAO_DO_BANCO])
  })

  it('uma região só — o plano Hobby recusa mais de uma', () => {
    // Deploy com mais regiões do que o plano permite falha ANTES do build,
    // como já aconteceu com o cron sub-diário.
    expect(config.regions).toHaveLength(1)
  })
})

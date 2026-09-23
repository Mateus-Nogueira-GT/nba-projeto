import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import { bancoDeTeste } from '../../dominio/__tests__/ajuda-banco'
import { tentativasOperacaoConta, usuarios } from '../../dominio/db/schema'
import { cadastrarUsuario } from '../assinatura/cadastro'
import type { ConfiguracaoProdutoPago } from '../assinatura/configuracao'
import { excedeuOperacoes, registrarOperacao } from '../assinatura/operacoes'

/**
 * O CADASTRO ATRÁS DO CGNAT (auditoria de 23/09).
 *
 * No Brasil o celular sai por CGNAT: milhares de pessoas atrás do mesmo IPv4.
 * O teto antigo somava e-mail e IP num limite só de 5 por hora, contando os
 * cadastros que DERAM CERTO — a sexta pessoa de uma operadora não comprava.
 */

const AGORA = new Date('2026-10-02T15:00:00.000Z')
const IP_CGNAT = '177.20.0.1'
const config: ConfiguracaoProdutoPago = {
  checkoutHabilitado: true,
  cadastroPublicoHabilitado: true,
  frequencia: 1,
  tipoFrequencia: 'months',
  moeda: 'BRL',
  urlPublica: 'https://app.example.com',
  hostsPermitidos: new Set(['app.example.com']),
}

let banco: Awaited<ReturnType<typeof bancoDeTeste>>
beforeAll(async () => {
  banco = await bancoDeTeste()
})
afterAll(async () => banco.fechar())
beforeEach(async () => {
  await banco.db.delete(tentativasOperacaoConta)
  await banco.db.delete(usuarios)
})

const cadastrar = (n: number, ip = IP_CGNAT) =>
  cadastrarUsuario(
    banco.db,
    config,
    { nome: `Pessoa ${n}`, email: `pessoa${n}@exemplo.com`, senha: 'senha-forte-123' },
    { ip, agora: AGORA },
  )

describe('limite de cadastro atrás do mesmo IP (CGNAT)', () => {
  it('a sexta pessoa do mesmo IP se cadastra', async () => {
    for (let n = 1; n <= 6; n++) expect((await cadastrar(n)).ok).toBe(true)
  })

  it('o teto por IP existe: a 31ª do mesmo IP na hora é barrada', async () => {
    for (let n = 1; n <= 30; n++) expect((await cadastrar(n)).ok).toBe(true)
    expect(await cadastrar(31)).toEqual({ ok: false, motivo: 'limite' })
  }, 60_000)

  it('o teto por e-mail continua estrito, mesmo trocando de IP', async () => {
    for (let n = 1; n <= 5; n++) {
      await registrarOperacao(banco.db, {
        operacao: 'CADASTRO',
        identificador: 'alvo@exemplo.com',
        ip: `10.0.0.${n}`,
        sucesso: false,
        agora: AGORA,
      })
    }
    expect(
      await excedeuOperacoes(banco.db, 'CADASTRO', 'alvo@exemplo.com', AGORA, undefined, '10.0.0.99'),
    ).toBe(true)
  })
})

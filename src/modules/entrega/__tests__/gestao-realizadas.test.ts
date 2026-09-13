import { readFileSync } from 'node:fs'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { bancoDeTeste } from '../../dominio/__tests__/ajuda-banco'
import { usuarios } from '../../dominio/db/schema'
import { simularAte } from '../../ingestao/demo/temporada'
import { carregarRuleset } from '../../motor/ruleset/carregar'
import { lerFeed } from '../lista-secreta'
import type { ItemFeed } from '../lista-secreta'
import { entradasRealizadasDoDia, registrarEntradaRealizada } from '../gestao-realizadas'

/**
 * ENTRADAS REALIZADAS — o que o usuário registra ter feito em outro lugar,
 * separado do que a NIP sugeriu (spec 12/09, §5.5). A chave natural
 * (usuário, dia, jogador, atributo, linha) é o que faz o segundo toque em
 * "Registrei" ATUALIZAR em vez de duplicar.
 */

const ruleset = carregarRuleset(readFileSync('config/ruleset.v1.yaml', 'utf8'))
const AGORA = new Date('2026-09-05T18:00:00.000Z')
const HOJE = '2026-09-05'

let banco: Awaited<ReturnType<typeof bancoDeTeste>>
let USUARIO: string
let item: ItemFeed

beforeAll(async () => {
  banco = await bancoDeTeste()
  await simularAte(banco.db, ruleset, AGORA, { diasDeHistorico: 7 })

  const [usuario] = await banco.db
    .insert(usuarios)
    .values({ email: 'gestao-realizadas@teste.com', senhaHash: 'x' })
    .returning()
  USUARIO = usuario!.id

  const feed = await lerFeed(banco.db, HOJE)
  item = feed!.conteudo.itens.find((i) => i.linha !== null)!
}, 300_000)

afterAll(async () => banco.fechar())

describe('registrar e listar entradas realizadas', () => {
  it('registrar duas vezes a mesma entrada atualiza, não duplica; e a lista do dia traz o nome do jogador', async () => {
    const e = {
      usuarioId: USUARIO,
      dataReferencia: HOJE,
      jogadorId: item.jogadorId,
      atributo: item.atributo,
      linha: item.linha!,
      unidades: 1.5,
      odd: 1.62,
      agora: new Date(),
    }
    await registrarEntradaRealizada(banco.db, e)
    await registrarEntradaRealizada(banco.db, { ...e, unidades: 2 })
    const lista = await entradasRealizadasDoDia(banco.db, USUARIO, HOJE)
    expect(lista).toHaveLength(1)
    expect(lista[0]).toMatchObject({ nome: item.nome, unidades: 2, odd: 1.62, linha: item.linha })
  })

  it('a lista é por usuário e por dia', async () => {
    expect(
      await entradasRealizadasDoDia(banco.db, '00000000-0000-4000-8000-000000000099', HOJE),
    ).toEqual([])
    expect(await entradasRealizadasDoDia(banco.db, USUARIO, '2020-01-01')).toEqual([])
  })
})

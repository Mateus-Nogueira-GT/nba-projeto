import { readFileSync } from 'node:fs'
import { afterAll, beforeAll, expect, it } from 'vitest'
import { bancoDeTeste } from '../../../dominio/__tests__/ajuda-banco'
import { jogadores, usuarios } from '../../../dominio/db/schema'
import { jogadoresOcultosDe, ocultarJogador } from '../../jogadores-ocultos'
import { gravarPreferencias, preferenciasDoUsuario } from '../../preferencias'
import { atualizarPreferenciaPush, preferenciasPushDoUsuario } from '../../push/inscricoes'
import { definirAcompanhamento, estadoExperienciaDoUsuario } from '../servico'
import { estadoExperienciaPadrao } from '../contrato'

let banco: Awaited<ReturnType<typeof bancoDeTeste>>
beforeAll(async () => {
  banco = await bancoDeTeste()
})
afterAll(async () => {
  await banco?.fechar()
})

it('upgrade/rollback aditivo preserva dados anteriores de preferências, canais e ocultos', async () => {
  const [usuario] = await banco.db
    .insert(usuarios)
    .values({ email: 'migration@teste.com', senhaHash: 'x' })
    .returning()
  const [jogador] = await banco.db
    .insert(jogadores)
    .values({ nomeCompleto: 'Preservado' })
    .returning()
  const usuarioId = usuario!.id
  await gravarPreferencias(banco.db, usuarioId, { ordemLista: 'POR_NIVEL', lente: 'ODDS' })
  await ocultarJogador(banco.db, usuarioId, jogador!.id)
  await atualizarPreferenciaPush(banco.db, usuarioId, { canal: 'GREEN', habilitado: false })

  await banco.pg.exec(readFileSync('drizzle/down/0021_flashy_texas_twister.sql', 'utf8'))
  await banco.pg.exec(readFileSync('drizzle/down/0020_new_brood.sql', 'utf8'))
  await banco.pg.exec(readFileSync('drizzle/down/0019_demonic_silver_surfer.sql', 'utf8'))
  await banco.pg.exec(readFileSync('drizzle/down/0018_experiencia_por_conta.sql', 'utf8'))
  // 50 (era 49): a 0025 (entradas_realizadas, Task 10) não é descida aqui,
  // então soma à contagem de base como qualquer migration fora deste range.
  expect(await banco.contarTabelas()).toBe(50)
  expect(await preferenciasDoUsuario(banco.db, usuarioId)).toEqual({
    ordemLista: 'POR_NIVEL',
    lente: 'ODDS',
  })
  expect(await jogadoresOcultosDe(banco.db, usuarioId)).toEqual(new Set([jogador!.id]))
  expect((await preferenciasPushDoUsuario(banco.db, usuarioId)).GREEN).toBe(false)

  for (const sql of readFileSync('drizzle/0018_experiencia_por_conta.sql', 'utf8').split(
    '--> statement-breakpoint',
  ))
    await banco.pg.exec(sql)
  expect(await banco.contarTabelas()).toBe(54)
  const esperado = estadoExperienciaPadrao()
  esperado.canais.GREEN = false
  expect(await estadoExperienciaDoUsuario(banco.db, usuarioId)).toEqual(esperado)
  expect(await preferenciasDoUsuario(banco.db, usuarioId)).toEqual({
    ordemLista: 'POR_NIVEL',
    lente: 'ODDS',
  })

  for (const arquivo of [
    'drizzle/0019_demonic_silver_surfer.sql',
    'drizzle/0020_new_brood.sql',
    'drizzle/0021_flashy_texas_twister.sql',
  ]) {
    for (const sql of readFileSync(arquivo, 'utf8').split('--> statement-breakpoint')) {
      if (sql.trim()) await banco.pg.exec(sql)
    }
  }
  expect(await banco.contarTabelas()).toBe(70)
})

it('falha ao reexibir desfaz o acompanhamento na mesma transação', async () => {
  const [usuario] = await banco.db
    .insert(usuarios)
    .values({ email: 'rollback@teste.com', senhaHash: 'x' })
    .returning()
  const [jogador] = await banco.db
    .insert(jogadores)
    .values({ nomeCompleto: 'Atomicidade' })
    .returning()
  await ocultarJogador(banco.db, usuario!.id, jogador!.id)
  await banco.pg.exec(`
    CREATE FUNCTION impedir_reexibir_teste() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN RAISE EXCEPTION 'falha de armazenamento de teste'; END $$;
    CREATE TRIGGER impedir_reexibir_teste BEFORE DELETE ON jogadores_ocultos
    FOR EACH ROW EXECUTE FUNCTION impedir_reexibir_teste();
  `)
  try {
    await expect(
      definirAcompanhamento(banco.db, usuario!.id, {
        tipo: 'JOGADOR',
        id: jogador!.id,
        acompanhar: true,
      }),
    ).rejects.toThrow()
    expect((await estadoExperienciaDoUsuario(banco.db, usuario!.id)).jogadoresAcompanhados).toEqual(
      [],
    )
    expect(await jogadoresOcultosDe(banco.db, usuario!.id)).toEqual(new Set([jogador!.id]))
  } finally {
    await banco.pg.exec(
      'DROP TRIGGER impedir_reexibir_teste ON jogadores_ocultos; DROP FUNCTION impedir_reexibir_teste();',
    )
  }
})

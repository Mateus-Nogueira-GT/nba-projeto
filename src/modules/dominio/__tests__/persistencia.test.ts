import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { eq } from 'drizzle-orm'

import { bancoDeTeste } from './ajuda-banco'
import { jogadores, jogos, niveisVersao, times } from '../db/schema'
import { gravarApitos } from '../repositorios/apitos'
import { ativarVersaoNiveis, versaoAtiva } from '../repositorios/niveis'
import type { Apito } from '../../motor/tipos'

let banco: Awaited<ReturnType<typeof bancoDeTeste>>

/** Drizzle encapsula o erro do driver; a mensagem do Postgres fica em `cause`. */
function cadeiaDeMensagens(erro: unknown): string {
  const partes: string[] = []
  let atual: unknown = erro
  while (atual instanceof Error) {
    partes.push(atual.message)
    atual = atual.cause
  }
  return partes.join(' | ')
}

beforeAll(async () => {
  banco = await bancoDeTeste()
})

afterAll(async () => {
  await banco.fechar()
})

// ---------------------------------------------------------------------------

describe('migrations sobem e descem limpas', () => {
  it('a subida cria as 27 tabelas dos 6 grupos', async () => {
    expect(await banco.contarTabelas()).toBe(27)
  })

  it('desce zerando o schema e sobe de novo sem resíduo', async () => {
    await banco.descer()
    expect(await banco.contarTabelas()).toBe(0)

    await banco.subir()
    expect(await banco.contarTabelas()).toBe(27)
  })
})

// ---------------------------------------------------------------------------

describe('idempotência do apito — o banco rejeita duplicata', () => {
  async function semear() {
    const [casa] = await banco.db
      .insert(times)
      .values({ sigla: `LAL${Math.random().toString(36).slice(2, 7)}`, nome: 'Lakers' })
      .returning()
    const [visitante] = await banco.db
      .insert(times)
      .values({ sigla: `ADV${Math.random().toString(36).slice(2, 7)}`, nome: 'Adversário' })
      .returning()
    const [jogador] = await banco.db
      .insert(jogadores)
      .values({ nomeCompleto: 'Grimes', timeId: casa!.id })
      .returning()
    const [jogo] = await banco.db
      .insert(jogos)
      .values({
        dataHoraUtc: new Date('2026-08-18T23:00:00Z'),
        timeCasaId: casa!.id,
        timeVisitanteId: visitante!.id,
      })
      .returning()

    return { jogoId: jogo!.id, jogadorId: jogador!.id }
  }

  function apito(jogoId: string, jogadorId: string, over: Partial<Apito> = {}): Apito {
    return {
      chaveDeduplicacao: '',
      jogoId,
      jogadorId,
      atributo: 'PONTOS',
      estrategia: 'LISTA_SECRETA',
      metodo: 'OPD',
      nivelJogador: 'SUPORTE',
      nivelApito: 3,
      turbo: false,
      modoFire: false,
      opdOrigemNivel: 3,
      linha: 15,
      confianca: 86,
      alvo1Q: null,
      ...over,
    }
  }

  it('gravar o MESMO apito duas vezes insere uma vez só', async () => {
    const { jogoId, jogadorId } = await semear()
    const a = apito(jogoId, jogadorId)

    const primeira = await gravarApitos(banco.db, 'v1', [a])
    const segunda = await gravarApitos(banco.db, 'v1', [a])

    expect(primeira).toHaveLength(1)
    expect(segunda).toHaveLength(0) // conflito é caminho esperado, não erro
  })

  it('linhas diferentes do mesmo jogador são apitos distintos', async () => {
    const { jogoId, jogadorId } = await semear()

    const gravados = await gravarApitos(banco.db, 'v1', [
      apito(jogoId, jogadorId, { linha: 10 }),
      apito(jogoId, jogadorId, { linha: 15 }),
      apito(jogoId, jogadorId, { linha: 20 }),
    ])

    expect(gravados).toHaveLength(3)
  })

  /**
   * O caso que quase passou despercebido.
   *
   * Todo apito de Fire Live tem linha = NULL. Postgres, por padrão, considera
   * NULLs DISTINTOS num UNIQUE — sem NULLS NOT DISTINCT, os dois entrariam e
   * o assinante levaria push repetido justamente na estratégia ao vivo.
   */
  it('dois apitos de FIRE_LIVE com linha NULL colidem', async () => {
    const { jogoId, jogadorId } = await semear()
    const vivo = apito(jogoId, jogadorId, {
      estrategia: 'FIRE_LIVE',
      metodo: null,
      linha: null,
      confianca: null,
      nivelApito: 1,
      alvo1Q: 9,
    })

    const primeira = await gravarApitos(banco.db, 'v1', [vivo])
    const segunda = await gravarApitos(banco.db, 'v1', [vivo])

    expect(primeira).toHaveLength(1)
    expect(segunda).toHaveLength(0)
  })

  it('mesmo jogador e linha, mas estratégias diferentes, não colidem', async () => {
    const { jogoId, jogadorId } = await semear()

    const gravados = await gravarApitos(banco.db, 'v1', [
      apito(jogoId, jogadorId, { linha: 15, estrategia: 'LISTA_SECRETA' }),
      apito(jogoId, jogadorId, { linha: 15, estrategia: 'FIRE_LIVE', metodo: null }),
    ])

    expect(gravados).toHaveLength(2)
  })
})

// ---------------------------------------------------------------------------

describe('niveis_versao — só uma ativa, garantido pelo banco', () => {
  it('ativar uma versão desativa a anterior', async () => {
    const [v1] = await banco.db
      .insert(niveisVersao)
      .values({ versao: '2026-08-01', ativa: true })
      .returning()
    const [v2] = await banco.db
      .insert(niveisVersao)
      .values({ versao: '2026-08-18', ativa: false })
      .returning()

    expect((await versaoAtiva(banco.db))?.id).toBe(v1!.id)

    await ativarVersaoNiveis(banco.db, v2!.id)

    const ativa = await versaoAtiva(banco.db)
    expect(ativa?.id).toBe(v2!.id)
    expect(ativa?.versao).toBe('2026-08-18')

    const antiga = await banco.db
      .select()
      .from(niveisVersao)
      .where(eq(niveisVersao.id, v1!.id))
    expect(antiga[0]?.ativa).toBe(false)
  })

  it('o BANCO impede duas ativas, não a aplicação', async () => {
    await banco.db.insert(niveisVersao).values({ versao: '2026-09-01', ativa: false })

    // Tentativa crua, sem passar pelo repositório: tem que estourar no índice.
    const erro = await banco.db
      .update(niveisVersao)
      .set({ ativa: true })
      .where(eq(niveisVersao.versao, '2026-09-01'))
      .then(() => null)
      .catch((e: unknown) => e)

    expect(erro).not.toBeNull()
    // Drizzle encapsula o erro do Postgres; o nome do índice está na cadeia
    // de `cause`. Verificar o nome prova QUAL índice barrou, não só que falhou.
    expect(cadeiaDeMensagens(erro)).toMatch(/niveis_versao_unica_ativa/)
  })
})

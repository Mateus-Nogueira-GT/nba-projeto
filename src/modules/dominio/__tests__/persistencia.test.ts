import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { eq } from 'drizzle-orm'

import { bancoDeTeste } from './ajuda-banco'
import {
  feedSnapshot,
  checkpointsIngestao,
  conflitosIdentidadeJogador,
  execucoesIngestao,
  identidadesJogo,
  jogadores,
  jogos,
  locksIngestao,
  niveisVersao,
  times,
} from '../db/schema'
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
  it('a subida cria as 47 tabelas dos grupos persistidos', async () => {
    // 47 desde llm_chamadas e chat_mensagens (roteamento de LLM)
    expect(await banco.contarTabelas()).toBe(47)
  })

  it('desce zerando o schema e sobe de novo sem resíduo', async () => {
    await banco.descer()
    expect(await banco.contarTabelas()).toBe(0)

    await banco.subir()
    // 47 desde llm_chamadas e chat_mensagens (roteamento de LLM)
    expect(await banco.contarTabelas()).toBe(47)
  })
})

// ---------------------------------------------------------------------------

describe('persistência da ingestão real', () => {
  async function semearJogo() {
    const sufixo = Math.random().toString(36).slice(2, 8).toUpperCase()
    const [casa] = await banco.db
      .insert(times)
      .values({ sigla: `C${sufixo}`, nome: 'Casa' })
      .returning()
    const [visitante] = await banco.db
      .insert(times)
      .values({ sigla: `V${sufixo}`, nome: 'Visitante' })
      .returning()
    const capturadoEm = new Date('2026-08-19T00:31:00.000Z')
    const origemAtualizadaEm = new Date('2026-08-19T00:30:20.000Z')
    const [jogo] = await banco.db
      .insert(jogos)
      .values({
        dataHoraUtc: new Date('2026-08-19T00:30:00.000Z'),
        dataReferencia: '2026-08-18',
        timeCasaId: casa!.id,
        timeVisitanteId: visitante!.id,
        capturadoEm,
        origemAtualizadaEm,
      })
      .returning()

    return { jogo: jogo!, capturadoEm, origemAtualizadaEm }
  }

  it('preserva rodada, instante UTC, timestamps e namespace do id de jogo', async () => {
    const { jogo, capturadoEm, origemAtualizadaEm } = await semearJogo()

    expect(jogo.dataHoraUtc.toISOString()).toBe('2026-08-19T00:30:00.000Z')
    expect(jogo.dataReferencia).toBe('2026-08-18')
    expect(jogo.capturadoEm).toEqual(capturadoEm)
    expect(jogo.origemAtualizadaEm).toEqual(origemAtualizadaEm)

    await banco.db.insert(identidadesJogo).values([
      {
        jogoId: jogo.id,
        provedor: 'BALLDONTLIE',
        idExterno: 'game-101',
        capturadoEm,
        origemAtualizadaEm,
      },
      {
        jogoId: jogo.id,
        provedor: 'API-SPORTS',
        idExterno: 'game-9001',
        capturadoEm,
        origemAtualizadaEm,
      },
    ])

    const duplicata = await banco.db
      .insert(identidadesJogo)
      .values({ jogoId: jogo.id, provedor: 'BALLDONTLIE', idExterno: 'game-outro' })
      .then(() => null)
      .catch((erro: unknown) => erro)

    expect(cadeiaDeMensagens(duplicata)).toMatch(/identidades_jogo_provedor_unico/)
  })

  it('isola checkpoints por provedor e ancora lock na execução', async () => {
    const [execucao] = await banco.db
      .insert(execucoesIngestao)
      .values({
        job: 'sincronizar-rodada',
        janelaInicio: '2026-08-18',
        janelaFim: '2026-08-18',
        temporada: '2026-27',
        origem: 'CRON',
      })
      .returning()

    await banco.db.insert(locksIngestao).values({
      chave: 'sincronizar-rodada:2026-08-18:2026-08-18:2026-27',
      execucaoId: execucao!.id,
      leaseToken: '00000000-0000-4000-8000-000000000001',
      leaseExpiraEm: new Date('2026-08-19T00:35:00.000Z'),
    })

    await banco.db.insert(checkpointsIngestao).values([
      {
        job: 'sincronizar-rodada',
        janelaInicio: '2026-08-18',
        janelaFim: '2026-08-18',
        temporada: '2026-27',
        provedor: 'BALLDONTLIE',
        cursorJson: { cursor: 12 },
        execucaoId: execucao!.id,
      },
      {
        job: 'sincronizar-rodada',
        janelaInicio: '2026-08-18',
        janelaFim: '2026-08-18',
        temporada: '2026-27',
        provedor: 'API-SPORTS',
        cursorJson: { page: 2 },
        execucaoId: execucao!.id,
      },
    ])

    const checkpoints = await banco.db.select().from(checkpointsIngestao)
    expect(checkpoints.filter((c) => c.execucaoId === execucao!.id)).toHaveLength(2)

    const repetido = await banco.db
      .insert(checkpointsIngestao)
      .values({
        job: 'sincronizar-rodada',
        janelaInicio: '2026-08-18',
        janelaFim: '2026-08-18',
        temporada: '2026-27',
        provedor: 'BALLDONTLIE',
        execucaoId: execucao!.id,
      })
      .then(() => null)
      .catch((erro: unknown) => erro)

    expect(cadeiaDeMensagens(repetido)).toMatch(/checkpoints_ingestao_particao_unica/)
  })

  it('registra conflito sem fabricar vínculo canônico', async () => {
    const [conflito] = await banco.db
      .insert(conflitosIdentidadeJogador)
      .values({
        provedor: 'API-SPORTS',
        idExterno: 'player-77',
        nomeExterno: 'Jogador Homônimo',
        motivo: 'mais de um candidato canônico',
        payloadHash: 'sha256:sanitizado',
      })
      .returning()

    expect(conflito?.estado).toBe('PENDENTE')
    expect(conflito?.jogadorCandidatoId).toBeNull()
    expect(conflito?.jogadorResolvidoId).toBeNull()
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
        dataReferencia: '2026-08-18',
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

    const antiga = await banco.db.select().from(niveisVersao).where(eq(niveisVersao.id, v1!.id))
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

describe('feed_snapshot por jogo (spec 05, fatia 1)', () => {
  let jogoIdA: string
  let jogoIdB: string

  beforeAll(async () => {
    const sufixo = 'FS'
    const [casa] = await banco.db.insert(times).values({ sigla: `H${sufixo}`, nome: 'Casa' }).returning()
    const [vis] = await banco.db.insert(times).values({ sigla: `W${sufixo}`, nome: 'Visitante' }).returning()
    const valores = {
      dataHoraUtc: new Date('2026-08-22T23:00:00Z'),
      dataReferencia: '2026-08-22',
      timeCasaId: casa!.id,
      timeVisitanteId: vis!.id,
    }
    const [a] = await banco.db.insert(jogos).values(valores).returning()
    const [b] = await banco.db
      .insert(jogos)
      .values({ ...valores, timeCasaId: vis!.id, timeVisitanteId: casa!.id })
      .returning()
    jogoIdA = a!.id
    jogoIdB = b!.id
  })

  const base = {
    dataReferencia: '2026-08-22',
    conteudoJson: { itens: [] },
    hash: 'h1',
  }

  it('dois jogos gravam duas linhas FIRE_LIVE sem colidir', async () => {
    const [a] = await banco.db
      .insert(feedSnapshot)
      .values({ ...base, estrategia: 'FIRE_LIVE', jogoId: jogoIdA })
      .returning()
    const [b] = await banco.db
      .insert(feedSnapshot)
      .values({ ...base, estrategia: 'FIRE_LIVE', jogoId: jogoIdB })
      .returning()
    expect(a!.id).not.toBe(b!.id)
    await banco.db.delete(feedSnapshot)
  })

  it('mesmo (data, estrategia, jogo) conflita — chave de upsert', async () => {
    await banco.db.insert(feedSnapshot).values({ ...base, estrategia: 'FIRE_LIVE', jogoId: jogoIdA })
    const erro = await banco.db
      .insert(feedSnapshot)
      .values({ ...base, estrategia: 'FIRE_LIVE', jogoId: jogoIdA })
      .then(() => null)
      .catch((e: unknown) => e)
    expect(cadeiaDeMensagens(erro)).toMatch(/feed_snapshot_unico/)
    await banco.db.delete(feedSnapshot)
  })

  it('Lista Secreta continua uma linha por dia: NULL colide com NULL', async () => {
    await banco.db.insert(feedSnapshot).values({ ...base, estrategia: 'LISTA_SECRETA' })
    const erro = await banco.db
      .insert(feedSnapshot)
      .values({ ...base, estrategia: 'LISTA_SECRETA' })
      .then(() => null)
      .catch((e: unknown) => e)
    expect(cadeiaDeMensagens(erro)).toMatch(/feed_snapshot_unico/)
    await banco.db.delete(feedSnapshot)
  })
})

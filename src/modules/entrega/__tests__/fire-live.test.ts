import { readFileSync } from 'node:fs'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { eq } from 'drizzle-orm'

import { bancoDeTeste } from '../../dominio/__tests__/ajuda-banco'
import {
  apitos,
  estatisticasQuarto,
  fireLiveExecucoes,
  greens,
  jogadores,
  jogos,
  lesoesEscalacao,
  mediasJogador,
  niveis,
  niveisVersao,
  preferenciasNotificacao,
  pushInscricoes,
  times,
  usuarios,
} from '../../dominio/db/schema'
import { carregarRuleset } from '../../motor/ruleset/carregar'
import type { Nivel } from '../../motor/tipos'
import { executarCiclo } from '../fire-live/ciclo'
import type { EstadoObservado } from '../fire-live/ciclo'
import { APRESENTACAO, destinatariosDoCanal } from '../fire-live/push'
import { reservarJogosParaObservar } from '../fire-live/inicio'
import { FilaEmMemoria } from '../fila/memoria'

const ruleset = carregarRuleset(readFileSync('config/ruleset.v1.yaml', 'utf8'))

const TIPOFF = new Date('2026-08-19T23:00:00.000Z')
/** Um instante qualquer dentro da janela do 1Q. */
const DURANTE = new Date('2026-08-19T23:05:00.000Z')

/**
 * Elenco projetado dos Lakers (não é a NBA real — ver CLAUDE.md > Armadilhas).
 *
 * As médias foram escolhidas para produzir alvos redondos e verificáveis à mão
 * pela regra do ruleset — (média / 4) × multiplicador, arredondando no fim:
 *
 *   Luka   MVP       30,0 → 7,5 × 1,5 = 11,25 → alvo 11 · modo fire ≥ 22,5
 *   Reaves ALL_STAR  20,0 → 5,0 × 1,5 =  7,5  → alvo  8 · modo fire ≥ 15
 *   Grimes SUPORTE   12,0 → 3,0 × 1,5 =  4,5  → alvo  5
 *   Mamu   RANDOLA    8,0 → 2,0 × 2,5 =  5,0  → alvo  5
 */
const ELENCO: { nome: string; nivel: Nivel; ppg: string }[] = [
  { nome: 'Luka Doncic', nivel: 'MVP', ppg: '30.0' },
  { nome: 'Austin Reaves', nivel: 'ALL_STAR', ppg: '20.0' },
  { nome: 'Grimes', nivel: 'SUPORTE', ppg: '12.0' },
  { nome: 'Mamukelashvili', nivel: 'RANDOLA', ppg: '8.0' },
]

let banco: Awaited<ReturnType<typeof bancoDeTeste>>
let jogoId: string
let idPorNome: Map<string, string>
let fila: FilaEmMemoria

beforeAll(async () => {
  banco = await bancoDeTeste()
})
afterAll(async () => {
  await banco.fechar()
})

async function semear() {
  const db = banco.db

  await db.delete(greens)
  await db.delete(apitos)
  await db.delete(fireLiveExecucoes)
  await db.delete(estatisticasQuarto)
  await db.delete(lesoesEscalacao)
  await db.delete(niveis)
  await db.delete(niveisVersao)
  await db.delete(mediasJogador)
  await db.delete(jogos)
  await db.delete(jogadores)
  await db.delete(times)

  const [lal] = await db.insert(times).values({ sigla: 'LAL', nome: 'Lakers' }).returning()
  const [adv] = await db.insert(times).values({ sigla: 'ADV', nome: 'Adversário' }).returning()
  const [versao] = await db
    .insert(niveisVersao)
    .values({ versao: 'teste-fl', ativa: true })
    .returning()

  idPorNome = new Map()
  for (const [indice, { nome, nivel, ppg }] of ELENCO.entries()) {
    const [j] = await db.insert(jogadores).values({ nomeCompleto: nome }).returning()
    idPorNome.set(nome, j!.id)

    await db.insert(niveis).values({
      niveisVersaoId: versao!.id,
      jogadorId: j!.id,
      timeId: lal!.id,
      atributo: 'PONTOS',
      nivel,
      posicaoHierarquia: indice + 1,
    })
    await db.insert(mediasJogador).values({
      jogadorId: j!.id,
      temporada: '2026',
      janela: 'TEMPORADA',
      jogos: 40,
      ppg,
    })
  }

  const [jogo] = await db
    .insert(jogos)
    .values({ dataHoraUtc: TIPOFF, timeCasaId: lal!.id, timeVisitanteId: adv!.id, quartoAtual: 1 })
    .returning()
  jogoId = jogo!.id

  await db.insert(fireLiveExecucoes).values({ jogoId, iniciadoEm: TIPOFF })

  fila = new FilaEmMemoria()
}

beforeEach(semear)

// ===========================================================================
// A GRAVAÇÃO — um 1º quarto real, quadro a quadro
// ===========================================================================

type Quadro = {
  quarto: number | null
  /** pontos no 1Q, por nome. */
  pontos: Record<string, number>
}

/**
 * O jogo gravado. Cada quadro é uma leitura do provedor.
 *
 * O que ele exercita, na ordem:
 *   0 · ninguém perto do alvo
 *   1 · Luka crava 11 = alvo         → APITO
 *   2 · Reaves chega a 8 = alvo      → APITO   (Luka não mudou, nem é reavaliado)
 *   3 · Grimes passa do alvo dele    → NADA: bloco de topo, Luka está em quadra
 *   4 · Luka 23 (modo fire), Reaves 20 → GREEN de Reaves (marco ALL_STAR = 20)
 *   5 · nada muda                    → NADA
 */
const GRAVACAO: Quadro[] = [
  { quarto: 1, pontos: { 'Luka Doncic': 4, 'Austin Reaves': 2 } },
  { quarto: 1, pontos: { 'Luka Doncic': 11, 'Austin Reaves': 2 } },
  { quarto: 1, pontos: { 'Luka Doncic': 11, 'Austin Reaves': 8 } },
  { quarto: 1, pontos: { 'Luka Doncic': 11, 'Austin Reaves': 8, Grimes: 6 } },
  { quarto: 1, pontos: { 'Luka Doncic': 23, 'Austin Reaves': 20, Grimes: 6 } },
  { quarto: 1, pontos: { 'Luka Doncic': 23, 'Austin Reaves': 20, Grimes: 6 } },
]

/** Escreve um quadro no banco, como faria a ingestão. */
async function aplicarQuadro(quadro: Quadro, quarto = 1) {
  await banco.db.update(jogos).set({ quartoAtual: quadro.quarto }).where(eq(jogos.id, jogoId))

  for (const [nome, pontos] of Object.entries(quadro.pontos)) {
    await banco.db
      .insert(estatisticasQuarto)
      .values({ jogoId, jogadorId: idPorNome.get(nome)!, quarto, pontos })
      .onConflictDoUpdate({
        target: [estatisticasQuarto.jogoId, estatisticasQuarto.jogadorId, estatisticasQuarto.quarto],
        set: { pontos },
      })
  }
}

/** Reproduz a gravação inteira, encadeando o estado como o workflow faz. */
async function reproduzir(gravacao: Quadro[] = GRAVACAO) {
  let estado: EstadoObservado | null = null
  let ciclos = 0

  for (const quadro of gravacao) {
    await aplicarQuadro(quadro)
    const r = await executarCiclo(banco.db, ruleset, fila, {
      jogoId,
      estadoAnterior: estado,
      iniciadoEm: TIPOFF,
      agora: DURANTE,
    })
    if (r.encerrar) return { ciclos, encerrou: r.motivo }
    estado = r.estado
    ciclos += 1
  }
  return { ciclos, encerrou: null }
}

// ===========================================================================

describe('replay de um jogo gravado', () => {
  it('produz exatamente 3 pushes: 2 apitos e 1 green', async () => {
    await reproduzir()

    expect(fila.enviadas).toHaveLength(3)
    expect(fila.doCanal('FIRE_LIVE_APITO')).toHaveLength(2)
    expect(fila.doCanal('GREEN')).toHaveLength(1)

    const apitados = fila.doCanal('FIRE_LIVE_APITO').map((m) => m.titulo)
    expect(apitados).toEqual(
      expect.arrayContaining([
        expect.stringContaining('Luka Doncic'),
        expect.stringContaining('Austin Reaves'),
      ]),
    )

    const green = fila.doCanal('GREEN')[0]!
    expect(green.titulo).toContain('Austin Reaves')
    expect(green.dados.marco).toBe(20)
  })

  it('REPLAY DO MESMO JOGO produz ZERO pushes novos', async () => {
    await reproduzir()
    const naPrimeira = fila.enviadas.length
    expect(naPrimeira).toBe(3)

    fila.limpar()
    await reproduzir()

    expect(fila.enviadas).toHaveLength(0)
  })

  it('o alvo de cada apito é o do ruleset, calculado sobre a média', async () => {
    await reproduzir()

    const porNome = new Map(fila.doCanal('FIRE_LIVE_APITO').map((m) => [m.titulo, m.dados.alvo1Q]))
    expect(porNome.get('Luka Doncic apitou no 1Q')).toBe(11)
    expect(porNome.get('Austin Reaves apitou no 1Q')).toBe(8)
  })

  it('não apita Suporte com o bloco de topo em quadra, mesmo passando do alvo', async () => {
    await reproduzir()

    // Grimes fez 6, alvo dele é 5 — só não apita porque Luka (MVP) joga.
    const linhas = await banco.db
      .select()
      .from(apitos)
      .where(eq(apitos.jogadorId, idPorNome.get('Grimes')!))
    expect(linhas).toHaveLength(0)
  })

  it('marca modo fire quando o MVP chega a 75% da média no 1Q', async () => {
    await reproduzir()

    // Luka fechou com 23; 75% de 30 = 22,5. O apito nasceu com 11 e não é
    // regravado — o modo fire vale para o card do feed, não para um push novo.
    const [linha] = await banco.db
      .select()
      .from(apitos)
      .where(eq(apitos.jogadorId, idPorNome.get('Luka Doncic')!))
    expect(linha).toBeDefined()
    expect(linha!.alvo1q).toBe(11)
  })
})

describe('retry de passo do workflow', () => {
  it('reexecutar o mesmo ciclo não gera push duplicado', async () => {
    await reproduzir()
    expect(fila.enviadas).toHaveLength(3)

    // O workflow reexecuta o passo com EXATAMENTE a mesma entrada.
    fila.limpar()
    for (let i = 0; i < 3; i += 1) {
      await executarCiclo(banco.db, ruleset, fila, {
        jogoId,
        estadoAnterior: null,
        iniciadoEm: TIPOFF,
        agora: DURANTE,
      })
    }

    expect(fila.enviadas).toHaveLength(0)
  })

  it('falha da fila não perde o push: o ciclo seguinte reenvia', async () => {
    // Até o quadro 1 existe exatamente um apito para enfileirar.
    await aplicarQuadro(GRAVACAO[0]!)
    await executarCiclo(banco.db, ruleset, fila, {
      jogoId,
      estadoAnterior: null,
      iniciadoEm: TIPOFF,
      agora: DURANTE,
    })
    expect(fila.enviadas).toHaveLength(0)

    await aplicarQuadro(GRAVACAO[1]!)
    fila.falharNaProxima = true
    await expect(
      executarCiclo(banco.db, ruleset, fila, {
        jogoId,
        estadoAnterior: null,
        iniciadoEm: TIPOFF,
        agora: DURANTE,
      }),
    ).rejects.toThrow('fila indisponível')

    // O apito ficou gravado, mas não enfileirado — e não pode se perder.
    expect(fila.enviadas).toHaveLength(0)

    await executarCiclo(banco.db, ruleset, fila, {
      jogoId,
      estadoAnterior: null,
      iniciadoEm: TIPOFF,
      agora: DURANTE,
    })
    expect(fila.enviadas).toHaveLength(1)
    expect(fila.enviadas[0]!.titulo).toContain('Luka Doncic')
  })
})

describe('a janela do 1º quarto', () => {
  it('encerra quando o jogo entra no 2º quarto', async () => {
    await reproduzir()

    await aplicarQuadro({ quarto: 2, pontos: {} })
    const r = await executarCiclo(banco.db, ruleset, fila, {
      jogoId,
      estadoAnterior: null,
      iniciadoEm: TIPOFF,
      agora: DURANTE,
    })

    expect(r.encerrar).toBe(true)
    expect(r).toMatchObject({ motivo: 'fim-do-primeiro-quarto' })
  })

  it('jogador que atinge o alvo no 2Q NÃO gera apito', async () => {
    await reproduzir()
    fila.limpar()

    // Mamukelashvili nunca pontuou no 1Q. Estoura o alvo no 2Q.
    await banco.db.update(jogos).set({ quartoAtual: 2 }).where(eq(jogos.id, jogoId))
    await banco.db.insert(estatisticasQuarto).values({
      jogoId,
      jogadorId: idPorNome.get('Mamukelashvili')!,
      quarto: 2,
      pontos: 30,
    })

    const r = await executarCiclo(banco.db, ruleset, fila, {
      jogoId,
      estadoAnterior: null,
      iniciadoEm: TIPOFF,
      agora: DURANTE,
    })

    expect(r.encerrar).toBe(true)
    expect(fila.enviadas).toHaveLength(0)

    const linhas = await banco.db
      .select()
      .from(apitos)
      .where(eq(apitos.jogadorId, idPorNome.get('Mamukelashvili')!))
    expect(linhas).toHaveLength(0)
  })

  it('não observa antes do tipoff (quarto ainda nulo)', async () => {
    await aplicarQuadro({ quarto: null, pontos: {} })

    const r = await executarCiclo(banco.db, ruleset, fila, {
      jogoId,
      estadoAnterior: null,
      iniciadoEm: TIPOFF,
      agora: DURANTE,
    })

    expect(r.encerrar).toBe(true)
    expect(fila.enviadas).toHaveLength(0)
  })

  it('encerra pela trava dura mesmo com o provedor ainda dizendo 1º quarto', async () => {
    const depoisDoLimite = new Date(
      TIPOFF.getTime() + (ruleset.fire_live.observacao.limite_minutos + 1) * 60_000,
    )

    const r = await executarCiclo(banco.db, ruleset, fila, {
      jogoId,
      estadoAnterior: null,
      iniciadoEm: TIPOFF,
      agora: depoisDoLimite,
    })

    expect(r).toMatchObject({ encerrar: true, motivo: 'limite-de-tempo' })
  })
})

describe('avaliação direcionada', () => {
  it('avalia apenas os jogadores que mudaram, nunca o elenco inteiro', async () => {
    await aplicarQuadro(GRAVACAO[0]!)
    const primeiro = await executarCiclo(banco.db, ruleset, fila, {
      jogoId,
      estadoAnterior: null,
      iniciadoEm: TIPOFF,
      agora: DURANTE,
    })
    expect(primeiro.encerrar).toBe(false)
    // Sem estado anterior, o primeiro ciclo varre o elenco dos dois times.
    expect(primeiro).toMatchObject({ avaliados: ELENCO.length })

    await aplicarQuadro(GRAVACAO[1]!)
    const segundo = await executarCiclo(banco.db, ruleset, fila, {
      jogoId,
      estadoAnterior: (primeiro as { estado: EstadoObservado }).estado,
      iniciadoEm: TIPOFF,
      agora: DURANTE,
    })
    // Só Luka mudou de 4 para 11.
    expect(segundo).toMatchObject({ avaliados: 1 })
  })

  it('ciclo sem mudança nenhuma não avalia ninguém', async () => {
    await aplicarQuadro(GRAVACAO[0]!)
    const primeiro = await executarCiclo(banco.db, ruleset, fila, {
      jogoId,
      estadoAnterior: null,
      iniciadoEm: TIPOFF,
      agora: DURANTE,
    })

    const segundo = await executarCiclo(banco.db, ruleset, fila, {
      jogoId,
      estadoAnterior: (primeiro as { estado: EstadoObservado }).estado,
      iniciadoEm: TIPOFF,
      agora: DURANTE,
    })
    expect(segundo).toMatchObject({ avaliados: 0 })
  })
})

describe('formato do push', () => {
  it('apito e green têm formato E posição de tela diferentes', () => {
    expect(APRESENTACAO.FIRE_LIVE_APITO.formato).not.toBe(APRESENTACAO.GREEN.formato)
    expect(APRESENTACAO.FIRE_LIVE_APITO.posicao).not.toBe(APRESENTACAO.GREEN.posicao)
  })

  it('cada tipo sai pelo seu próprio canal', async () => {
    await reproduzir()

    for (const m of fila.doCanal('FIRE_LIVE_APITO')) {
      expect(m.formato).toBe(APRESENTACAO.FIRE_LIVE_APITO.formato)
      expect(m.posicao).toBe(APRESENTACAO.FIRE_LIVE_APITO.posicao)
    }
    for (const m of fila.doCanal('GREEN')) {
      expect(m.formato).toBe(APRESENTACAO.GREEN.formato)
      expect(m.posicao).toBe(APRESENTACAO.GREEN.posicao)
    }
  })

  it('o canal do push está entre os canais independentes do ruleset', async () => {
    await reproduzir()
    for (const m of fila.enviadas) {
      expect(ruleset.push.canais_independentes).toContain(m.canal)
    }
  })
})

describe('gatilho do tipoff', () => {
  it('reserva o jogo uma única vez, mesmo com o cron reexecutando', async () => {
    await banco.db.delete(fireLiveExecucoes)

    const primeira = await reservarJogosParaObservar(banco.db, ruleset, TIPOFF)
    expect(primeira).toHaveLength(1)
    expect(primeira[0]!.jogoId).toBe(jogoId)

    const segunda = await reservarJogosParaObservar(banco.db, ruleset, TIPOFF)
    expect(segunda).toHaveLength(0)
  })

  it('não reserva jogo que não está no quarto do Fire Live', async () => {
    await banco.db.delete(fireLiveExecucoes)
    await banco.db.update(jogos).set({ quartoAtual: 3 }).where(eq(jogos.id, jogoId))

    expect(await reservarJogosParaObservar(banco.db, ruleset, TIPOFF)).toHaveLength(0)
  })
})

// ===========================================================================
// PREFERÊNCIAS — o fan-out respeita o que o usuário desligou
// ===========================================================================

describe('preferencias_notificacao por canal', () => {
  async function assinante(email: string, status: 'ATIVO' | 'BLOQUEADO' = 'ATIVO') {
    const [u] = await banco.db
      .insert(usuarios)
      .values({ email, senhaHash: 'x', status })
      .returning()
    await banco.db.insert(pushInscricoes).values({
      usuarioId: u!.id,
      endpoint: `https://push.exemplo/${email}`,
      chaveP256dh: 'p',
      chaveAuth: 'a',
    })
    return u!.id
  }

  beforeEach(async () => {
    await banco.db.delete(preferenciasNotificacao)
    await banco.db.delete(pushInscricoes)
    await banco.db.delete(usuarios)
  })

  it('sem linha de preferência, o usuário RECEBE — o modelo é opt-out', async () => {
    const id = await assinante('sem-preferencia@teste.com')
    expect(await destinatariosDoCanal(banco.db, 'FIRE_LIVE_APITO')).toEqual([id])
  })

  it('quem desligou o canal não recebe daquele canal', async () => {
    const id = await assinante('desligou@teste.com')
    await banco.db
      .insert(preferenciasNotificacao)
      .values({ usuarioId: id, canal: 'FIRE_LIVE_APITO', habilitado: false })

    expect(await destinatariosDoCanal(banco.db, 'FIRE_LIVE_APITO')).toEqual([])
    // ...mas segue recebendo os outros canais: eles são independentes.
    expect(await destinatariosDoCanal(banco.db, 'GREEN')).toEqual([id])
  })

  it('usuário bloqueado não recebe push de canal nenhum', async () => {
    await assinante('bloqueado@teste.com', 'BLOQUEADO')

    expect(await destinatariosDoCanal(banco.db, 'FIRE_LIVE_APITO')).toEqual([])
    expect(await destinatariosDoCanal(banco.db, 'GREEN')).toEqual([])
  })

  it('sem inscrição de push, não há para onde enviar', async () => {
    const [u] = await banco.db
      .insert(usuarios)
      .values({ email: 'sem-dispositivo@teste.com', senhaHash: 'x' })
      .returning()
    expect(u).toBeDefined()

    expect(await destinatariosDoCanal(banco.db, 'GREEN')).toEqual([])
  })
})

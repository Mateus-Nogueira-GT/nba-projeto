import { readFileSync } from 'node:fs'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import { bancoDeTeste } from '../../dominio/__tests__/ajuda-banco'
import {
  apitos,
  estatisticasJogo,
  jogadores,
  jogos,
  lesoesEscalacao,
  mediasJogador,
  niveis,
  niveisVersao,
  times,
} from '../../dominio/db/schema'
import { carregarRuleset } from '../../motor/ruleset/carregar'
import type { Nivel } from '../../motor/tipos'
import { comparar, executarBacktest } from '../backtest/executar'
import { gerarCsv } from '../backtest/csv'
import { gravarCandidato, listarCandidatos } from '../backtest/candidatos'
import { rulesets } from '../../dominio/db/schema'

const ruleset = carregarRuleset(readFileSync('config/ruleset.v1.yaml', 'utf8'))

/**
 * TEMPORADA DE FIXTURE — três dias, dois mecanismos:
 *
 *   17/08 · J0: Reaves faz 10 (média 18, delta 5, limiar 13 → abaixo)
 *   18/08 · J1: oscilação apita Reaves (sequência 1 → nível 1, 3 linhas);
 *               box score do J1 (27 pontos) torna o apito CLASSIFICÁVEL
 *   19/08 · J2: Luka FORA → OPD apita Reaves/Grimes/Kessler (9 linhas);
 *               SEM box score → tudo INDETERMINADO, nunca erro
 */
const HIERARQUIA: { nome: string; nivel: Nivel }[] = [
  { nome: 'Luka Doncic', nivel: 'MVP' },
  { nome: 'Austin Reaves', nivel: 'ALL_STAR' },
  { nome: 'Grimes', nivel: 'SUPORTE' },
  { nome: 'Kessler', nivel: 'SUPORTE' },
  { nome: 'Mamukelashvili', nivel: 'RANDOLA' },
  { nome: 'Sexton', nivel: 'RANDOLA' },
]
const PERIODO = { de: '2026-08-18', ate: '2026-08-19' }

let banco: Awaited<ReturnType<typeof bancoDeTeste>>
let idPorNome: Map<string, string>

beforeAll(async () => {
  banco = await bancoDeTeste()
})
afterAll(async () => {
  await banco.fechar()
})

beforeEach(async () => {
  const db = banco.db
  await db.delete(apitos)
  await db.delete(estatisticasJogo)
  await db.delete(lesoesEscalacao)
  await db.delete(niveis)
  await db.delete(niveisVersao)
  await db.delete(mediasJogador)
  await db.delete(jogos)
  await db.delete(jogadores)
  await db.delete(times)

  const [lal] = await db.insert(times).values({ sigla: 'LAL', nome: 'Lakers' }).returning()
  const [adv] = await db.insert(times).values({ sigla: 'ADV', nome: 'Adversário' }).returning()
  const [versao] = await db.insert(niveisVersao).values({ versao: 'bt-1', ativa: true }).returning()

  idPorNome = new Map()
  for (const [indice, { nome, nivel }] of HIERARQUIA.entries()) {
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
      temporada: '2025-26',
      janela: 'TEMPORADA',
      jogos: 40,
      ppg: '18.0',
    })
  }

  const criarJogo = async (dia: string) => {
    const [j] = await db
      .insert(jogos)
      .values({
        dataHoraUtc: new Date(`${dia}T23:00:00.000Z`),
        dataReferencia: dia,
        timeCasaId: lal!.id,
        timeVisitanteId: adv!.id,
      })
      .returning()
    return j!.id
  }
  const j0 = await criarJogo('2026-08-17')
  const j1 = await criarJogo('2026-08-18')
  const j2 = await criarJogo('2026-08-19')

  // J0: Reaves abaixo do limiar; os demais na média
  for (const { nome } of HIERARQUIA) {
    await db.insert(estatisticasJogo).values({
      jogoId: j0,
      jogadorId: idPorNome.get(nome)!,
      pontos: nome === 'Austin Reaves' ? 10 : 18,
    })
  }
  // J1: box score existe -> apito de 18/08 é classificável (27 supera 15/20/25)
  await db.insert(estatisticasJogo).values({
    jogoId: j1,
    jogadorId: idPorNome.get('Austin Reaves')!,
    pontos: 27,
  })
  // J2: Luka fora -> OPD; sem box score -> indeterminado
  await db.insert(lesoesEscalacao).values({
    jogoId: j2,
    jogadorId: idPorNome.get('Luka Doncic')!,
    status: 'FORA',
  })
})

describe('backtest — parte A da spec 07', () => {
  it('reproduz a estratégia sobre o histórico e classifica contra o box score', async () => {
    const r = await executarBacktest(banco.db, ruleset, PERIODO)

    // 18/08: oscilação do Reaves (3 linhas) · 19/08: OPD (3 jogadores × 3 linhas)
    expect(r.apitos).toBe(12)
    expect(r.porMetodo.OSCILACAO).toBe(3)
    expect(r.porMetodo.OPD).toBe(9)
    expect(r.acertos).toBe(3) // 27 supera as linhas 15, 20 e 25
    expect(r.indeterminados).toBe(9) // sem box score não é erro
    expect(r.classificaveis).toBe(3)
  })

  it('o mesmo ruleset sobre o mesmo período devolve o mesmo resultado, sempre', async () => {
    const a = await executarBacktest(banco.db, ruleset, PERIODO)
    const b = await executarBacktest(banco.db, ruleset, PERIODO)
    expect(b).toEqual(a)
  })

  it('nenhuma linha é escrita em apitos durante a execução', async () => {
    await executarBacktest(banco.db, ruleset, PERIODO)
    expect(await banco.db.select().from(apitos)).toEqual([])
  })

  it('trocar o delta no ruleset candidato muda a contagem sem tocar em código', async () => {
    const candidato = structuredClone(ruleset)
    candidato.oscilacao.delta.ALL_STAR = 9 // limiar 9: os 10 pontos deixam de contar

    const base = await executarBacktest(banco.db, ruleset, PERIODO)
    const alternativo = await executarBacktest(banco.db, candidato, PERIODO)

    expect(alternativo.apitos).toBe(base.apitos - 3)
    expect(alternativo.acertos).toBe(0)
  })

  it('comparar explica a diferença entre dois rulesets', async () => {
    const candidato = structuredClone(ruleset)
    candidato.oscilacao.delta.ALL_STAR = 9

    const a = await executarBacktest(banco.db, ruleset, PERIODO)
    const b = await executarBacktest(banco.db, candidato, PERIODO)
    const d = comparar(a, b)

    expect(d.apitosDelta).toBe(-3)
    expect(d.acertosDelta).toBe(-3)
    // Reaves não sai por inteiro: continua apitado pela OPD de 19/08.
    expect(d.entraram).toEqual([])
    expect(d.sairam).toEqual([])
    // O tamanho da amostra viaja junto do resultado (risco declarado da spec).
    expect(d.amostra).toEqual({ a: 3, b: 0 })
  })
})

describe('painel do backtest (spec 07, fatia 6)', () => {
  it('CSV sai com cabeçalho em português e escapa separador e aspas', async () => {
    const a = await executarBacktest(banco.db, ruleset, PERIODO)
    const candidato = structuredClone(ruleset)
    candidato.oscilacao.delta.ALL_STAR = 9
    const b = await executarBacktest(banco.db, candidato, PERIODO)

    const csv = gerarCsv(a, b, comparar(a, b))

    expect(csv.startsWith('metrica;ruleset_a;ruleset_b;delta')).toBe(true)
    expect(csv).toContain('apitos;12;9;-3')
    expect(csv).toContain('acertos;3;0;-3')
    expect(csv).toContain('amostra classificavel;3;0')
    // Rodapé obrigatório: medição, nunca sugestão de aposta (P12)
    expect(csv).toContain('não é sugestão de aposta')
    // Valor com o separador dentro é envolto em aspas duplicadas
    const csvComRotulo = gerarCsv({ ...a, ruleset: 'v1;"x"' }, b, comparar(a, b))
    expect(csvComRotulo).toContain('"v1;""x"""')
  })

  it('candidato inválido é recusado pela mesma validação do ruleset ativo', async () => {
    await expect(
      gravarCandidato(banco.db, { versao: 'quebrado', conteudoYaml: 'version: -1' }),
    ).rejects.toThrow(/Ruleset inválido/)
    expect(await banco.db.select().from(rulesets)).toEqual([])
  })

  it('candidato válido entra como provisório e aparece na listagem', async () => {
    const yaml = readFileSync('config/ruleset.v1.yaml', 'utf8').replace('version: 1', 'version: 2')
    await gravarCandidato(banco.db, { versao: 'candidato-v2', conteudoYaml: yaml })

    const candidatos = await listarCandidatos(banco.db)
    expect(candidatos).toHaveLength(1)
    expect(candidatos[0]).toMatchObject({ versao: 'candidato-v2', status: 'provisorio' })
  })
})

describe('guarda do painel de backtest', () => {
  it('página e ações exigem admin', () => {
    const pagina = readFileSync('src/app/(admin)/admin/backtest/page.tsx', 'utf8')
    expect(pagina).toContain('negarSeNaoForAdmin')
    const acoes = readFileSync('src/app/(admin)/admin/backtest/acoes.ts', 'utf8')
    expect(acoes).toContain('exigirAdmin')
  })
})

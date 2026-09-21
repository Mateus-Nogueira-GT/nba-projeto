import { readFileSync } from 'node:fs'
import yamlBruto from '../../../../config/ruleset.v1.yaml?raw'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { eq } from 'drizzle-orm'

import { carregarRuleset } from '../../motor'
import { bancoDeTeste } from '../../dominio/__tests__/ajuda-banco'
import { jogadores, mapaJogadores, niveis, niveisVersao } from '../../dominio/db/schema'
import { ativarVersaoNiveis } from '../../dominio/repositorios/niveis'

import { FonteFake } from '../nba/adaptadores/fake'
import { consultarComOrigem, FonteComFailover, type EventoSaude } from '../nba/failover'
import { avaliarFrescor, registrarBatimento } from '../health/heartbeat'
import type { LimitesFrescor } from '../health/heartbeat'
import { lerListaDeNiveis } from '../niveis/parser'
import { pontuar, sugerir } from '../niveis/similaridade'
import {
  completarVersao,
  confirmarMapeamento,
  importarListaDeNiveis,
  nomesPendentes,
} from '../niveis/importar'
import type { JogadorExterno, TimeExterno } from '../nba/porta'

const ARQUIVO = 'data/fontes/introducao-ia-nba.md'
const conteudo = readFileSync(ARQUIVO, 'utf8')
const PROVEDOR = 'provedor-a'

let banco: Awaited<ReturnType<typeof bancoDeTeste>>

beforeAll(async () => {
  banco = await bancoDeTeste()
})
afterAll(async () => {
  await banco.fechar()
})

const TIMES: TimeExterno[] = [
  { idExterno: '1', sigla: 'LAL', nome: 'Los Angeles Lakers', conferencia: 'West', logoUrl: null },
]

function jogadorExterno(id: string, nome: string, ativo = true): JogadorExterno {
  return {
    idExterno: id,
    nomeCompleto: nome,
    timeSiglaProvedor: 'LAL',
    posicao: 'G',
    alturaCm: 200,
    numeroCamisa: 7,
    fotoUrl: null,
    ativo,
  }
}

// ===========================================================================
// 2 · FAILOVER
// ===========================================================================

describe('failover — o chamador não sabe qual provedor respondeu', () => {
  it('devolve explicitamente a identidade da fonte vencedora', async () => {
    const fonte = new FonteComFailover(
      new FonteFake('principal', {}, { falhaCom: new Error('HTTP 503') }),
      new FonteFake('reserva', { jogadores: [jogadorExterno('res-9', 'Reserva')] }),
      { timeoutMs: 1000 },
    )

    const resposta = await consultarComOrigem(fonte, (efetiva) => efetiva.listarJogadores())

    expect(resposta.provedor).toBe('reserva')
    expect(resposta.dados[0]?.idExterno).toBe('res-9')
  })

  it('id externo fixa a fonte que o emitiu e nunca cai no outro namespace', async () => {
    const principal = new FonteFake('principal', { boxScore: [] })
    const reserva = new FonteFake('reserva', { boxScore: [] })
    const fonte = new FonteComFailover(principal, reserva, { timeoutMs: 1000 })

    const resposta = await consultarComOrigem(
      fonte,
      (efetiva) => efetiva.boxScore('id-da-reserva'),
      'reserva',
    )

    expect(resposta.provedor).toBe('reserva')
    expect(principal.chamadas).toBe(0)
    expect(reserva.chamadas).toBe(1)
  })

  it('principal CAI → chamador recebe o dado do reserva, sem erro', async () => {
    const principal = new FonteFake('principal', {}, { falhaCom: new Error('HTTP 503') })
    const reserva = new FonteFake('reserva', { times: TIMES })

    const fonte = new FonteComFailover(principal, reserva, { timeoutMs: 1000 })

    await expect(fonte.listarTimes()).resolves.toEqual(TIMES)
    expect(reserva.chamadas).toBe(1)
  })

  it('principal ATRASA além do timeout → reserva assume', async () => {
    const principal = new FonteFake('principal', { times: [] }, { atrasoMs: 200 })
    const reserva = new FonteFake('reserva', { times: TIMES })

    const fonte = new FonteComFailover(principal, reserva, { timeoutMs: 30 })

    await expect(fonte.listarTimes()).resolves.toEqual(TIMES)
  })

  it('principal OK → reserva nem é consultado', async () => {
    const principal = new FonteFake('principal', { times: TIMES })
    const reserva = new FonteFake('reserva', { times: [] })

    const fonte = new FonteComFailover(principal, reserva, { timeoutMs: 1000 })

    await fonte.listarTimes()
    expect(reserva.chamadas).toBe(0)
  })

  it('os DOIS falham → erro sobe nomeando as duas causas', async () => {
    const fonte = new FonteComFailover(
      new FonteFake('principal', {}, { falhaCom: new Error('HTTP 503') }),
      new FonteFake('reserva', {}, { falhaCom: new Error('DNS') }),
      { timeoutMs: 1000 },
    )

    await expect(fonte.listarTimes()).rejects.toThrow(/principal: HTTP 503.*reserva: DNS/s)
  })

  it('cada tentativa emite batimento, inclusive a que falhou', async () => {
    const batimentos: EventoSaude[] = []
    const fonte = new FonteComFailover(
      new FonteFake('principal', {}, { falhaCom: new Error('HTTP 503') }),
      new FonteFake('reserva', { times: TIMES }),
      { timeoutMs: 1000, aoBater: (e) => batimentos.push(e) },
    )

    await fonte.listarTimes()

    expect(batimentos).toHaveLength(2)
    expect(batimentos[0]).toMatchObject({ provedor: 'principal', tipo: 'NBA_PRIMARIO', ok: false })
    expect(batimentos[1]).toMatchObject({ provedor: 'reserva', tipo: 'NBA_RESERVA', ok: true })
  })
})

// ===========================================================================
// 3 · HEARTBEAT / ALERTA DE DADO PARADO
// ===========================================================================

describe('heartbeat e alerta de dado parado', () => {
  it('grava o batimento e preserva o último sucesso quando falha depois', async () => {
    const sucesso = new Date('2026-08-18T22:00:00Z')

    await registrarBatimento(banco.db, {
      provedor: 'p-teste',
      tipo: 'NBA_PRIMARIO',
      ok: true,
      latenciaMs: 120,
      erro: null,
      em: sucesso,
    })
    await registrarBatimento(banco.db, {
      provedor: 'p-teste',
      tipo: 'NBA_PRIMARIO',
      ok: false,
      latenciaMs: 5000,
      erro: 'HTTP 503',
      em: new Date('2026-08-18T22:05:00Z'),
    })

    const linhas = await banco.db.query.saudeProvedor.findMany()
    const linha = linhas.find((l) => l.provedor === 'p-teste')

    expect(linha?.status).toBe('FALHA')
    // O último sucesso PRECISA sobreviver: é a distância até ele que mede
    // há quanto tempo o dado está parado.
    expect(linha?.ultimaRespostaOk?.toISOString()).toBe(sucesso.toISOString())
    expect(linha?.dadoMaisRecenteEm).toBeNull()
  })

  const ruleset = carregarRuleset(yamlBruto)
  const limitesDoRuleset: LimitesFrescor = {
    foraDeJogoMs: ruleset.avisos.dado_parado.fora_de_jogo_minutos * 60_000,
    emJanelaDeJogoMs: ruleset.avisos.dado_parado.em_janela_segundos * 1_000,
  }

  it('o limite é mais rígido dentro da janela dos jogos', async () => {
    const agora = new Date('2026-08-18T23:00:00Z')
    const linhas = [
      { provedor: 'p', dadoMaisRecenteEm: new Date('2026-08-18T22:55:00Z') }, // 5 min atrás
    ]

    expect(avaliarFrescor(linhas, agora, false, limitesDoRuleset)).toEqual([]) // fora de jogo: tolerável
    expect(avaliarFrescor(linhas, agora, true, limitesDoRuleset)).toHaveLength(1) // em jogo: alerta
  })

  it('provedor que nunca respondeu conta como parado', () => {
    const alertas = avaliarFrescor(
      [{ provedor: 'novo', dadoMaisRecenteEm: null }],
      new Date(),
      false,
      limitesDoRuleset,
    )
    expect(alertas[0]?.paradoHaMs).toBe(Infinity)
  })
})

// ===========================================================================
// 4 · PARSER DA LISTA DE NÍVEIS
// ===========================================================================

describe('parser da lista real do CJ', () => {
  const r = lerListaDeNiveis(conteudo)

  it('lê os 30 times', () => {
    expect(r.timesEncontrados).toHaveLength(30)
    expect(r.timesSemSigla).toEqual([])
  })

  it('lê os 230 jogadores sem nenhum problema de leitura', () => {
    expect(r.jogadores).toHaveLength(230)
    expect(r.problemas).toEqual([])
  })

  it('pega o time escrito como DOIS spans em negrito na mesma linha', () => {
    // "**Dallas** **Mavericks**" — um regex ingênuo perderia os 9 jogadores.
    expect(r.jogadores.filter((j) => j.timeSigla === 'DAL')).toHaveLength(9)
  })

  it('tolera os três separadores diferentes do arquivo', () => {
    // "4 \- Jarret Allen \- \- Suport principal"  (separador duplicado)
    expect(r.jogadores.find((j) => j.nomeNaLista === 'Jarret Allen')?.nivel).toBe('SUPORTE')
    // "6- \- Dany Wolf \- Randola"                (número colado, separador duplo)
    expect(r.jogadores.find((j) => j.nomeNaLista === 'Dany Wolf')?.nivel).toBe('RANDOLA')
    // "5-M wagner \- Randola"                     (número colado no nome)
    expect(r.jogadores.find((j) => j.nomeNaLista === 'M wagner')?.nivel).toBe('RANDOLA')
  })

  it('Philadelphia tem DOIS MVPs, nas posições 1 e 2 (P7)', () => {
    const phi = r.jogadores.filter((j) => j.timeSigla === 'PHI' && j.nivel === 'MVP')

    expect(phi.map((j) => j.posicaoHierarquia)).toEqual([1, 2])
  })

  it('o vínculo jogador↔time vem da LISTA, não da NBA real', () => {
    // Elencos projetados: a API diria outra coisa para os três.
    expect(r.jogadores.find((j) => j.nomeNaLista === 'Giannis')?.timeSigla).toBe('MIA')
    expect(r.jogadores.find((j) => j.nomeNaLista === 'LeBron James')?.timeSigla).toBe('PHI')
    expect(r.jogadores.find((j) => j.nomeNaLista === 'James Harden')?.timeSigla).toBe('CLE')
  })

  it('linha ilegível vira PROBLEMA relatado, nunca descarte silencioso', () => {
    const ruim = ['**Lista de Níveis(Pontos)**', '**Knicks**', '1 \\- Brunson', '']
    const saida = lerListaDeNiveis(ruim.join('\n'))

    expect(saida.jogadores).toHaveLength(0)
    expect(saida.problemas).toHaveLength(1)
    expect(saida.problemas[0]?.conteudo).toContain('Brunson')
  })
})

describe('parser · o negrito da seção de rebotes', () => {
  it('não confunde jogador em negrito com cabeçalho de time', () => {
    const conteudo = [
      '**Lista de Níveis(Rebotes)**',
      '',
      '**Knicks**',
      '',
      '**1 \\- Towns \\- MVP**',
      '**2 \\- Hart \\- All star**',
    ].join('\n')

    const r = lerListaDeNiveis(conteudo)

    expect(r.timesEncontrados).toEqual(['Knicks'])
    expect(r.jogadores.map((j) => j.nomeNaLista)).toEqual(['Towns', 'Hart'])
  })
})

describe('parser · as três seções', () => {
  it('dá a cada jogador o atributo da sua seção e para na Lista secreta', () => {
    const conteudo = [
      '**Lista de Níveis(Pontos)**',
      '**Knicks**',
      '1 \\- Brunson \\- MVP',
      '',
      '**Lista de Níveis(Rebotes)**',
      '**Knicks**',
      '**1 \\- Towns \\- MVP**',
      '',
      '**Assistências**',
      '**Knicks**',
      '1 \\- Josh Hart \\- Suporte',
      '',
      '**Lista secreta**',
      '1 \\- nao deve ser lido \\- MVP',
    ].join('\n')

    const r = lerListaDeNiveis(conteudo)

    expect(r.jogadores.map((j) => [j.nomeNaLista, j.atributo])).toEqual([
      ['Brunson', 'PONTOS'],
      ['Towns', 'REBOTES'],
      ['Josh Hart', 'ASSISTENCIAS'],
    ])
  })

  it('ignora as faixas de média sem chamá-las de time nem de problema', () => {
    const conteudo = [
      '**Lista de Níveis(Rebotes)**',
      'Classificação de jogadores rebotes',
      'Mvp \\- média de  10 rebotes em diante',
      'Alls star \\- media de 7 a 9,8 rebotes',
      '**Classificação de jogadores rebotes**',
      '**Mvp \\- média de  10 rebotes em diante**',
      '**Knicks**',
      '**1 \\- Towns \\- MVP**',
    ].join('\n')

    const r = lerListaDeNiveis(conteudo)

    expect(r.timesEncontrados).toEqual(['Knicks'])
    expect(r.timesSemSigla).toEqual([])
    expect(r.problemas).toEqual([])
    expect(r.jogadores).toHaveLength(1)
  })
})

// ===========================================================================
// 4b · IMPORT
// ===========================================================================

describe('import da lista — reexecutável e não destrutivo', () => {
  it('primeira execução cria versão INATIVA, com 30 times e todos os nomes pendentes', async () => {
    const rel = await importarListaDeNiveis(banco.db, conteudo, {
      provedor: PROVEDOR,
      origemArquivo: ARQUIVO,
      importadoPor: 'teste',
    })

    expect(rel.jaExistia).toBe(false)
    expect(rel.timesEncontrados).toBe(30)
    expect(rel.totalNaLista).toBe(230)
    expect(rel.problemas).toEqual([])

    // Nada de jogador confirmado ainda: TODOS ficam pendentes, nenhum some.
    expect(rel.casados).toBe(0)
    expect(new Set(rel.pendentes).size + rel.casados).toBeGreaterThan(220)

    const versoes = await banco.db.select().from(niveisVersao)
    expect(versoes.every((v) => !v.ativa)).toBe(true)
  })

  it('nenhum nome não-casado é descartado: todos ficam visíveis em mapa_jogadores', async () => {
    const pendentes = await nomesPendentes(banco.db, PROVEDOR)
    const nomesDaLista = new Set(lerListaDeNiveis(conteudo).jogadores.map((j) => j.nomeNaLista))

    // Todo nome distinto da lista está registrado como pendente.
    expect(new Set(pendentes)).toEqual(nomesDaLista)
  })

  it('rodar o import DUAS vezes não duplica nem corrompe a versão anterior', async () => {
    const antes = await banco.db.select().from(niveisVersao)
    const mapaAntes = await banco.db.select().from(mapaJogadores)

    const rel = await importarListaDeNiveis(banco.db, conteudo, {
      provedor: PROVEDOR,
      origemArquivo: ARQUIVO,
      importadoPor: 'teste',
    })

    const depois = await banco.db.select().from(niveisVersao)
    const mapaDepois = await banco.db.select().from(mapaJogadores)

    expect(rel.jaExistia).toBe(true)
    expect(depois).toHaveLength(antes.length)
    expect(mapaDepois).toHaveLength(mapaAntes.length)
  })

  it('confirmar mapeamento humano permite completar a versão', async () => {
    const [jogador] = await banco.db
      .insert(jogadores)
      .values({ nomeCompleto: 'Victor Wembanyama' })
      .returning()

    await confirmarMapeamento(banco.db, {
      nomeNaLista: 'Wembayama',
      provedor: PROVEDOR,
      jogadorId: jogador!.id,
      provedorPlayerId: 'ext-99',
      score: 0.91,
      confirmadoPor: 'admin',
      agora: new Date('2026-08-18T20:00:00Z'),
    })

    const versao = (await banco.db.select().from(niveisVersao))[0]!
    const r = await completarVersao(banco.db, versao.id, conteudo, PROVEDOR)

    expect(r.adicionados).toBe(1)

    const gravados = await banco.db
      .select()
      .from(niveis)
      .where(eq(niveis.niveisVersaoId, versao.id))
    expect(gravados).toHaveLength(1)
    expect(gravados[0]?.nivel).toBe('MVP')
    expect(gravados[0]?.posicaoHierarquia).toBe(1)
  })

  it('a versão só passa a valer por ativação explícita', async () => {
    const versao = (await banco.db.select().from(niveisVersao))[0]!

    await ativarVersaoNiveis(banco.db, versao.id)

    const depois = await banco.db.select().from(niveisVersao).where(eq(niveisVersao.id, versao.id))
    expect(depois[0]?.ativa).toBe(true)
  })
})

describe('importador · jogador repetido em dois times', () => {
  it('não grava nenhuma das duas e reporta o caso', async () => {
    // A colisão só é visível para o motor depois que o jogador já tem
    // jogadorId confirmado — é (jogadorId, atributo) que é a chave única de
    // `niveis`, não o nome bruto da lista. Isso reflete o cenário real: uma
    // versão anterior já tinha "Klay Thompson" confirmado num time, e a
    // versão NOVA do documento é que introduz a contradição.
    const versaoAnterior = [
      '**Lista de Níveis(Pontos)**',
      '**Dallas** **Mavericks**',
      '1 \\- Klay Thompson \\- Randola',
    ].join('\n')
    await importarListaDeNiveis(banco.db, versaoAnterior, {
      provedor: PROVEDOR,
      origemArquivo: 'teste-repetido-v1',
      importadoPor: 'teste',
    })

    const [jogador] = await banco.db
      .insert(jogadores)
      .values({ nomeCompleto: 'Klay Thompson' })
      .returning()
    await confirmarMapeamento(banco.db, {
      nomeNaLista: 'Klay Thompson',
      provedor: PROVEDOR,
      jogadorId: jogador!.id,
      provedorPlayerId: 'ext-klay',
      score: 1,
      confirmadoPor: 'admin',
      agora: new Date('2026-09-21T00:00:00Z'),
    })

    const conteudo = [
      '**Lista de Níveis(Pontos)**',
      '**Dallas** **Mavericks**',
      '1 \\- Klay Thompson \\- Randola',
      '**Miami Heat**',
      '1 \\- Klay Thompson \\- Suporte',
    ].join('\n')

    const r = await importarListaDeNiveis(banco.db, conteudo, {
      provedor: PROVEDOR,
      origemArquivo: 'teste-repetido',
      importadoPor: 'teste',
    })

    expect(r.casados).toBe(0)
    expect(r.problemas.map((p) => p.motivo)).toContain(
      'mesmo jogador em dois times no mesmo atributo',
    )
  })
})

describe('importador · o atributo não é literal', () => {
  it('não grava PONTOS cravado em lugar nenhum', () => {
    const fonte = readFileSync('src/modules/ingestao/niveis/importar.ts', 'utf8')
    // Tirar comentários ANTES de procurar: um `includes` cru casa dentro de
    // comentário e o teste passaria com a linha ainda lá.
    const semComentarios = fonte
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/^\s*\/\/.*$/gm, '')

    expect(semComentarios).not.toContain("atributo: 'PONTOS'")
    expect(semComentarios).toContain('atributo: j.atributo')
  })
})

// ===========================================================================
// 5 · SIMILARIDADE (base da tela de mapeamento)
// ===========================================================================

describe('sugestão de candidatos para confirmação humana', () => {
  const elenco = [
    jogadorExterno('1', 'Victor Wembanyama'),
    jogadorExterno('2', 'Jalen Brunson'),
    jogadorExterno('3', 'Jaylen Brown'),
    jogadorExterno('4', 'Cooper Flagg'),
    jogadorExterno('5', 'Dennis Schroder', false),
  ]

  it('grafia livre ainda casa: Wembayama → Wembanyama', () => {
    const s = sugerir('Wembayama', elenco)

    expect(s.candidatos[0]?.nomeCompleto).toBe('Victor Wembanyama')
    expect(s.inequivoco).toBe(true)
  })

  it('só o sobrenome casa com o nome completo', () => {
    expect(sugerir('Brunson', elenco).candidatos[0]?.nomeCompleto).toBe('Jalen Brunson')
  })

  it('erro de digitação casa: Cooper Fllag → Cooper Flagg', () => {
    expect(sugerir('Cooper Fllag', elenco).candidatos[0]?.nomeCompleto).toBe('Cooper Flagg')
  })

  it('ESTADO 1 — nome sem candidato nenhum', () => {
    const s = sugerir('chmaphagnie', elenco)

    expect(s.candidatos).toEqual([])
    expect(s.inequivoco).toBe(false)
  })

  it('ESTADO 2 — múltiplos candidatos plausíveis não são resolvidos sozinhos', () => {
    // "Bro" fica perto de Brunson e de Brown: a tela precisa perguntar.
    const s = sugerir('Jalen Brow', elenco)

    expect(s.candidatos.length).toBeGreaterThan(1)
    expect(s.inequivoco).toBe(false)
  })

  it('ESTADO 3 — jogador fora da liga aparece marcado, não some', () => {
    const s = sugerir('schooder', elenco)
    const schroder = s.candidatos.find((c) => c.nomeCompleto === 'Dennis Schroder')

    expect(schroder).toBeDefined()
    expect(schroder?.ativo).toBe(false)
  })

  it('pontuação é simétrica e limitada a [0,1]', () => {
    expect(pontuar('Brunson', 'Brunson')).toBe(1)
    expect(pontuar('Brunson', '')).toBe(0)
  })
})

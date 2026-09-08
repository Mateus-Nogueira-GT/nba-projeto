import { readFileSync } from 'node:fs'
import { and, eq } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { bancoDeTeste } from '../../dominio/__tests__/ajuda-banco'
import {
  estatisticasJogo,
  jogadores,
  jogos,
  lesoesEscalacao,
  mediasJogador,
  niveis,
  niveisVersao,
  times,
} from '../../dominio/db/schema'
import { calendarioDoRuleset, temporadaDe } from '../../dominio/temporada'
import { simularAte } from '../../ingestao/demo/temporada'
import { carregarRuleset } from '../../motor/ruleset/carregar'
import { conferirRodadas } from '../resultados'
import { apitosDoJogador, telaDoJogador } from '../estatisticas/jogador'
import { hierarquiaDoTime } from '../estatisticas/time'

const ruleset = carregarRuleset(readFileSync('config/ruleset.v1.yaml', 'utf8'))
const AGORA = new Date('2026-09-05T18:00:00.000Z')
const HOJE = '2026-09-05'
const TEMPORADA = temporadaDe(AGORA, calendarioDoRuleset(ruleset))

let banco: Awaited<ReturnType<typeof bancoDeTeste>>

beforeAll(async () => {
  banco = await bancoDeTeste()
  await simularAte(banco.db, ruleset, AGORA, { diasDeHistorico: 7 })
}, 300_000)
afterAll(async () => banco.fechar())

/**
 * ESTATÍSTICAS ENTIDADE-CÊNTRICAS (identidade 04). A aba continua sendo dado
 * canônico; o que entra é a leitura do que a ESTRATÉGIA fez com cada entidade
 * — rotulada como tal — e a hierarquia do CJ desenhada como o depth chart.
 */
describe('apitosDoJogador — a aba Games com ✓/✗', () => {
  it('lista os apitos conferidos do jogador, mais recente primeiro, com fez e bateu coerentes', async () => {
    const dias = await conferirRodadas(banco.db, HOJE, 7)
    const comHistorico = new Map<string, number>()
    for (const d of dias)
      for (const j of d.jogadores)
        if (j.valor !== null)
          comHistorico.set(j.jogadorId, (comHistorico.get(j.jogadorId) ?? 0) + 1)
    const [jogadorId, n] = [...comHistorico.entries()].sort((a, b) => b[1] - a[1])[0]!
    expect(n).toBeGreaterThan(0)

    const apitos = await apitosDoJogador(banco.db, jogadorId, 20)
    expect(apitos.length).toBe(
      dias.reduce((c, d) => c + d.jogadores.filter((j) => j.jogadorId === jogadorId).length, 0),
    )
    for (let i = 1; i < apitos.length; i++) {
      // Ordenado pelo INSTANTE da partida — a mesma coluna que a tabela jogo a
      // jogo ordena e formata, para que a mesma partida não saia com duas datas.
      expect(apitos[i - 1]!.data >= apitos[i]!.data).toBe(true)
    }
    for (const a of apitos) {
      expect(a.adversarioSigla).toMatch(/^[A-Z]{3}$/)
      expect(a.linhaMaisBaixa).toBeGreaterThan(0)
      if (a.fez === null) expect(a.bateu).toBeNull()
      else expect(a.bateu).toBe(a.fez >= a.linhaMaisBaixa)
    }
  })

  it('respeita o limite', async () => {
    const dias = await conferirRodadas(banco.db, HOJE, 7)
    const algum = dias.flatMap((d) => d.jogadores)[0]!
    expect((await apitosDoJogador(banco.db, algum.jogadorId, 1)).length).toBeLessThanOrEqual(1)
  })
})

describe('apitosDoJogador — os DOIS motivos de não haver veredito', () => {
  /** Um apito já conferido, com ✓ ou ✗ — o ponto de partida dos dois casos. */
  async function apitoConferido() {
    const dias = await conferirRodadas(banco.db, HOJE, 7)
    for (const j of dias.flatMap((d) => d.jogadores)) {
      const lista = await apitosDoJogador(banco.db, j.jogadorId, 20)
      const conferido = lista.find((a) => a.bateu !== null)
      if (conferido) return { jogadorId: j.jogadorId, apito: conferido }
    }
    throw new Error('a temporada simulada precisa de ao menos um apito conferido')
  }

  it('jogo ainda não encerrado é "aguardando dado oficial", nunca DNP', async () => {
    // O campo `estado` existe para isso: sem ele a tela chamaria de "não
    // jogou" o apito do jogo desta noite (spec §5.1, "nunca inferir de parcial").
    const { jogadorId, apito } = await apitoConferido()
    expect(apito.estado).toBe('CONFERIDO')

    const [jogo] = await banco.db.select().from(jogos).where(eq(jogos.id, apito.jogoId)).limit(1)
    try {
      await banco.db.update(jogos).set({ status: 'AGENDADO' }).where(eq(jogos.id, apito.jogoId))
      const depois = (await apitosDoJogador(banco.db, jogadorId, 20)).find(
        (a) => a.jogoId === apito.jogoId && a.atributo === apito.atributo,
      )!
      expect(depois.estado).toBe('AGUARDANDO_OFICIAL')
      expect(depois.fez).toBeNull()
      expect(depois.bateu).toBeNull()
    } finally {
      await banco.db.update(jogos).set({ status: jogo!.status }).where(eq(jogos.id, apito.jogoId))
    }
  })

  it('linha de box score com zero minuto é "não jogou", não "fez 0 ✗"', async () => {
    // O provedor manda a linha do reserva que NÃO ENTROU (0 min, 0 pts) e a
    // sincronização insere toda linha recebida. Tratar ausência de linha como
    // o único DNP pintava de vermelho quem nunca pisou na quadra.
    const { jogadorId, apito } = await apitoConferido()
    const [box] = await banco.db
      .select()
      .from(estatisticasJogo)
      .where(
        and(eq(estatisticasJogo.jogoId, apito.jogoId), eq(estatisticasJogo.jogadorId, jogadorId)),
      )
      .limit(1)
    expect(box, 'o apito conferido tem box score').toBeDefined()

    try {
      await banco.db
        .update(estatisticasJogo)
        .set({ minutos: '0.00', pontos: 0, rebotesTotal: 0, assistencias: 0 })
        .where(
          and(eq(estatisticasJogo.jogoId, apito.jogoId), eq(estatisticasJogo.jogadorId, jogadorId)),
        )
      const depois = (await apitosDoJogador(banco.db, jogadorId, 20)).find(
        (a) => a.jogoId === apito.jogoId && a.atributo === apito.atributo,
      )!
      expect(depois.estado).toBe('NAO_JOGOU')
      expect(depois.fez).toBeNull()
      expect(depois.bateu).toBeNull()
    } finally {
      await banco.db
        .update(estatisticasJogo)
        .set({
          minutos: box!.minutos,
          pontos: box!.pontos,
          rebotesTotal: box!.rebotesTotal,
          assistencias: box!.assistencias,
        })
        .where(
          and(eq(estatisticasJogo.jogoId, apito.jogoId), eq(estatisticasJogo.jogadorId, jogadorId)),
        )
    }
  })

  it('jogo ENCERRADO cujo box score ainda não chegou é "aguardando dado oficial", nunca DNP', async () => {
    // O TERCEIRO caso, e o que mais acontece na vida real: o jogo acabou às
    // 23h e o job de box score ainda não rodou. A ausência de linha não é
    // minuto zero — é dado que não chegou. É a mesma regra de `estadoDoCiclo`
    // (lista-por-jogo.ts): ENCERRADO sem box é AGUARDANDO_OFICIAL.
    const { jogadorId, apito } = await apitoConferido()
    const [box] = await banco.db
      .select()
      .from(estatisticasJogo)
      .where(
        and(eq(estatisticasJogo.jogoId, apito.jogoId), eq(estatisticasJogo.jogadorId, jogadorId)),
      )
      .limit(1)
    expect(box, 'o apito conferido tem box score').toBeDefined()

    try {
      await banco.db
        .delete(estatisticasJogo)
        .where(
          and(eq(estatisticasJogo.jogoId, apito.jogoId), eq(estatisticasJogo.jogadorId, jogadorId)),
        )
      const depois = (await apitosDoJogador(banco.db, jogadorId, 20)).find(
        (a) => a.jogoId === apito.jogoId && a.atributo === apito.atributo,
      )!
      const [jogo] = await banco.db.select().from(jogos).where(eq(jogos.id, apito.jogoId)).limit(1)
      expect(jogo!.status).toBe('ENCERRADO')
      expect(depois.estado).toBe('AGUARDANDO_OFICIAL')
      expect(depois.fez).toBeNull()
      expect(depois.bateu).toBeNull()
    } finally {
      await banco.db.insert(estatisticasJogo).values(box!)
    }
  })
})

describe('telaDoJogador — o número do jogador e as duas visões de time', () => {
  it('traz a nota média recente (3–10) e o time na lista do CJ, rotulado à parte do time atual', async () => {
    const dias = await conferirRodadas(banco.db, HOJE, 7)
    const algum = dias.flatMap((d) => d.jogadores).find((j) => j.valor !== null)!
    const tela = (await telaDoJogador(banco.db, algum.jogadorId, { temporada: TEMPORADA }))!
    expect(tela).not.toBeNull()
    expect(tela.notaMediaRecente).not.toBeNull()
    expect(tela.notaMediaRecente!).toBeGreaterThanOrEqual(3)
    expect(tela.notaMediaRecente!).toBeLessThanOrEqual(10)
    // Na temporada simulada as duas visões coincidem; o que se testa é que a
    // segunda EXISTE e vem de `niveis` (lista do CJ), não de `jogadores.time_id`.
    expect(tela.timeNaListaDoCj).not.toBeNull()
    expect(tela.timeNaListaDoCj!.sigla).toMatch(/^[A-Z]{3}$/)
    // O nível do JOGADOR em pontos vem na mesma linha da lista — é o que a
    // tela escreve no mesmo fôlego ("na lista do CJ MIA · Suporte em pontos").
    expect(['MVP', 'ALL_STAR', 'SUPORTE', 'RANDOLA']).toContain(tela.timeNaListaDoCj!.nivel)
  })
})

describe('hierarquiaDoTime — o depth chart do CJ com o desfalque em prefixo', () => {
  it('ordena pela posição do CJ e marca como fora quem está em lesoes_escalacao no jogo', async () => {
    const [versao] = await banco.db
      .select()
      .from(niveisVersao)
      .where(eq(niveisVersao.ativa, true))
      .limit(1)
    const [fora] = await banco.db
      .select()
      .from(lesoesEscalacao)
      .where(eq(lesoesEscalacao.status, 'FORA'))
      .limit(1)
    expect(fora, 'a temporada simulada sempre tem ao menos um desfalque').toBeDefined()
    const [vinculo] = await banco.db
      .select()
      .from(niveis)
      .where(
        and(
          eq(niveis.niveisVersaoId, versao!.id),
          eq(niveis.jogadorId, fora!.jogadorId),
          eq(niveis.atributo, 'PONTOS'),
        ),
      )
      .limit(1)

    const hierarquia = await hierarquiaDoTime(banco.db, vinculo!.timeId, 'PONTOS', fora!.jogoId)
    expect(hierarquia.length).toBeGreaterThanOrEqual(6)
    for (let i = 1; i < hierarquia.length; i++)
      expect(hierarquia[i]!.posicao).toBeGreaterThan(hierarquia[i - 1]!.posicao)
    const linhaDoFora = hierarquia.find((h) => h.jogadorId === fora!.jogadorId)!
    expect(linhaDoFora.fora).toBe(true)
    expect(hierarquia.filter((h) => h.fora).length).toBeGreaterThanOrEqual(1)
    for (const h of hierarquia) {
      expect(h.nome.length).toBeGreaterThan(0)
      expect(['MVP', 'ALL_STAR', 'SUPORTE', 'RANDOLA']).toContain(h.nivel)
    }
  })

  it('sem jogo, ninguém está fora — a hierarquia é só a lista', async () => {
    const [versao] = await banco.db
      .select()
      .from(niveisVersao)
      .where(eq(niveisVersao.ativa, true))
      .limit(1)
    const [algum] = await banco.db
      .select()
      .from(niveis)
      .where(eq(niveis.niveisVersaoId, versao!.id))
      .limit(1)
    const hierarquia = await hierarquiaDoTime(banco.db, algum!.timeId, 'REBOTES', null)
    expect(hierarquia.length).toBeGreaterThan(0)
    expect(hierarquia.every((h) => h.fora === false)).toBe(true)
  })
})

/**
 * A COSTURA DAS DUAS SEÇÕES DA MESMA TELA.
 *
 * `apitosDoJogador` e `telaDoJogador` alimentam duas seções que ficam a três
 * linhas de distância no perfil. Enquanto cada uma decidia mando e adversário
 * por uma fonte (a lista do CJ ali, `jogadores.time_id` aqui), a MESMA partida
 * saía "vs SAS" na de cima e "@ MIA" na de baixo.
 */
describe('mando e adversário — uma fonte só para a tela inteira', () => {
  /** Um jogador cuja MESMA partida aparece nas duas seções do perfil. */
  async function partidaNasDuasSecoes() {
    const dias = await conferirRodadas(banco.db, HOJE, 7)
    for (const j of dias.flatMap((d) => d.jogadores)) {
      const lista = await apitosDoJogador(banco.db, j.jogadorId, 20)
      const tela = (await telaDoJogador(banco.db, j.jogadorId, { temporada: TEMPORADA }))!
      const apito = lista.find((a) => tela.historico.some((l) => l.jogoId === a.jogoId))
      if (apito) return { jogadorId: j.jogadorId, jogoId: apito.jogoId }
    }
    throw new Error('a temporada simulada precisa de um apito com box score do mesmo jogo')
  }

  /** As duas leituras da MESMA partida, do jeito que a tela as imprime. */
  async function osDoisLados(jogadorId: string, jogoId: string) {
    const lista = await apitosDoJogador(banco.db, jogadorId, 20)
    const tela = (await telaDoJogador(banco.db, jogadorId, { temporada: TEMPORADA }))!
    const apito = lista.find((a) => a.jogoId === jogoId)!
    const linha = tela.historico.find((l) => l.jogoId === jogoId)!
    return {
      apito: { emCasa: apito.emCasa, adversario: apito.adversarioSigla },
      tabela: { emCasa: linha.emCasa, adversario: linha.adversarioSigla },
    }
  }

  it('a mesma partida sai igual nas duas seções quando a lista do CJ e o time real divergem', async () => {
    const { jogadorId, jogoId } = await partidaNasDuasSecoes()
    const [jogo] = await banco.db.select().from(jogos).where(eq(jogos.id, jogoId)).limit(1)
    const [original] = await banco.db
      .select()
      .from(jogadores)
      .where(eq(jogadores.id, jogadorId))
      .limit(1)
    const tela = (await telaDoJogador(banco.db, jogadorId, { temporada: TEMPORADA }))!
    const naLista = tela.timeNaListaDoCj!.id

    // O time REAL passa a ser o outro lado da MESMA partida: a divergência é
    // intencional no produto (elenco projetado do CJ × provedor) e rara na
    // temporada simulada, então é semeada aqui.
    const real = naLista === jogo!.timeCasaId ? jogo!.timeVisitanteId : jogo!.timeCasaId
    expect(real).not.toBe(naLista)

    try {
      await banco.db.update(jogadores).set({ timeId: real }).where(eq(jogadores.id, jogadorId))
      const { apito, tabela } = await osDoisLados(jogadorId, jogoId)

      expect(apito).toEqual(tabela)
      // E a fonte é o time REAL do provedor — a exceção da aba de estatísticas
      // (CLAUDE.md): aqui se exibe dado canônico, não o elenco da estratégia.
      expect(apito.emCasa).toBe(jogo!.timeCasaId === real)
    } finally {
      await banco.db
        .update(jogadores)
        .set({ timeId: original!.timeId })
        .where(eq(jogadores.id, jogadorId))
    }
  })

  it('sem o jogador em nenhum dos dois lados não há mando — nunca "@ o próprio time"', async () => {
    const { jogadorId, jogoId } = await partidaNasDuasSecoes()
    const [jogo] = await banco.db.select().from(jogos).where(eq(jogos.id, jogoId)).limit(1)
    const [original] = await banco.db
      .select()
      .from(jogadores)
      .where(eq(jogadores.id, jogadorId))
      .limit(1)
    const forasteiro = (await banco.db.select().from(times)).find(
      (t) => t.id !== jogo!.timeCasaId && t.id !== jogo!.timeVisitanteId,
    )!

    try {
      await banco.db
        .update(jogadores)
        .set({ timeId: forasteiro.id })
        .where(eq(jogadores.id, jogadorId))
      const { apito, tabela } = await osDoisLados(jogadorId, jogoId)

      // Chutar `emCasa: false` fazia a tela imprimir "@ <time da casa>" — que
      // pode ser o próprio time do jogador. Sem mando, não há vs nem @.
      for (const lado of [apito, tabela]) {
        expect(lado.emCasa).toBeNull()
        expect(lado.adversario).toBeNull()
      }
    } finally {
      await banco.db
        .update(jogadores)
        .set({ timeId: original!.timeId })
        .where(eq(jogadores.id, jogadorId))
    }
  })
})

describe('apitosDoJogador — minuto que não chegou não é minuto zero', () => {
  /** Um apito CONFERIDO com produção no atributo — o começo dos dois casos. */
  async function apitoComProducao() {
    const dias = await conferirRodadas(banco.db, HOJE, 7)
    for (const j of dias.flatMap((d) => d.jogadores)) {
      const conferido = (await apitosDoJogador(banco.db, j.jogadorId, 20)).find(
        (a) => a.estado === 'CONFERIDO' && a.fez !== null && a.fez > 0,
      )
      if (conferido) return { jogadorId: j.jogadorId, apito: conferido }
    }
    throw new Error('a temporada simulada precisa de um apito conferido com produção')
  }

  function ondeBox(jogoId: string, jogadorId: string) {
    return and(eq(estatisticasJogo.jogoId, jogoId), eq(estatisticasJogo.jogadorId, jogadorId))
  }

  it('box score sem minuto e com a linha inteira zerada fica sem veredito, nunca "fez 0 ✗"', async () => {
    // `minutos` é NULLABLE e o adaptador emite null sempre que o provedor manda
    // `min: null`. Comparar `numero(minutos) === 0` deixava a linha cair em
    // CONFERIDO: a tela escrevia "fez 0" com ✗ vermelho para quem talvez nem
    // tenha entrado em quadra. Sem minuto E com a linha toda zerada, nada ali
    // diz que ele entrou — e de ausência de dado não sai veredito (spec §5.1).
    const { jogadorId, apito } = await apitoComProducao()
    const onde = ondeBox(apito.jogoId, jogadorId)
    const [box] = await banco.db.select().from(estatisticasJogo).where(onde).limit(1)

    try {
      await banco.db
        .update(estatisticasJogo)
        .set({ minutos: null, pontos: 0, rebotesTotal: 0, assistencias: 0 })
        .where(onde)
      const depois = (await apitosDoJogador(banco.db, jogadorId, 20)).find(
        (a) => a.jogoId === apito.jogoId && a.atributo === apito.atributo,
      )!

      expect(depois.estado).toBe('AGUARDANDO_OFICIAL')
      expect(depois.fez).toBeNull()
      expect(depois.bateu).toBeNull()
    } finally {
      await banco.db
        .update(estatisticasJogo)
        .set({
          minutos: box!.minutos,
          pontos: box!.pontos,
          rebotesTotal: box!.rebotesTotal,
          assistencias: box!.assistencias,
        })
        .where(onde)
    }
  })

  it('sem minuto MAS com produção há veredito — e a conferência das rodadas não discorda', async () => {
    // O outro buraco do mesmo tipo. Mandar TODA linha de minuto nulo para
    // AGUARDANDO_OFICIAL fazia a seção de apitos dizer "aguardando dado
    // oficial" enquanto a tabela jogo a jogo, três linhas abaixo NA MESMA TELA,
    // imprimia "pts 18 · reb 10 · ast 2" para a MESMA partida. O dado oficial
    // CHEGOU; o que falta é o minuto — e o minuto não é o que a conferência lê.
    //
    // O corte é pelo dado que a conferência USA: `conferirRodadas` (a tela de
    // Resultados) decide `bateu` pelo valor do atributo, sem olhar minuto. As
    // duas telas falam da mesma (jogo, jogador, atributo) e não podem divergir.
    const { jogadorId, apito } = await apitoComProducao()
    const onde = ondeBox(apito.jogoId, jogadorId)
    const [box] = await banco.db.select().from(estatisticasJogo).where(onde).limit(1)

    try {
      // SÓ o minuto sai; a produção fica onde estava.
      await banco.db.update(estatisticasJogo).set({ minutos: null }).where(onde)
      const depois = (await apitosDoJogador(banco.db, jogadorId, 20)).find(
        (a) => a.jogoId === apito.jogoId && a.atributo === apito.atributo,
      )!

      expect(depois.estado).toBe('CONFERIDO')
      expect(depois.fez).toBe(apito.fez)
      expect(depois.bateu).toBe(apito.bateu)

      const naConferencia = (await conferirRodadas(banco.db, HOJE, 7))
        .flatMap((d) => d.jogadores)
        .find(
          (j) =>
            j.jogoId === apito.jogoId && j.jogadorId === jogadorId && j.atributo === apito.atributo,
        )!
      expect(naConferencia.fez).toBe(depois.fez)
      expect(naConferencia.bateuLinhaMaisBaixa).toBe(depois.bateu)
    } finally {
      await banco.db.update(estatisticasJogo).set({ minutos: box!.minutos }).where(onde)
    }
  })

  it('minuto ZERO com produção na linha também tem veredito — "não jogou" contradiria o box', async () => {
    // O mesmo argumento, do outro lado: o provedor que arredonda para baixo quem
    // entrou nos segundos finais manda 0 minuto com pontos na linha. Chamar isso
    // de DNP escreve "não jogou" bem em cima do "pts N" que a tabela imprime
    // três linhas abaixo. O DNP de verdade é a linha ZERADA, e continua sendo.
    const { jogadorId, apito } = await apitoComProducao()
    const onde = ondeBox(apito.jogoId, jogadorId)
    const [box] = await banco.db.select().from(estatisticasJogo).where(onde).limit(1)

    try {
      await banco.db.update(estatisticasJogo).set({ minutos: '0.00' }).where(onde)
      const depois = (await apitosDoJogador(banco.db, jogadorId, 20)).find(
        (a) => a.jogoId === apito.jogoId && a.atributo === apito.atributo,
      )!

      expect(depois.estado).toBe('CONFERIDO')
      expect(depois.fez).toBe(apito.fez)
    } finally {
      await banco.db.update(estatisticasJogo).set({ minutos: box!.minutos }).where(onde)
    }
  })
})

describe('telaDoJogador — o histórico diz quando foi cortado', () => {
  it('anuncia o corte no limite, para a tela não chamar de temporada o que é recorte', async () => {
    // O hero lê `jogosDisputados` de `medias_jogador` (a temporada inteira) e a
    // tabela lê o histórico, cortado no limite. Sem `historicoCortado` a tela
    // escrevia "68 jogos · temporada 2025-26" duas linhas acima de uma tabela
    // de 25 linhas rotulada "temporada 2025-26".
    const dias = await conferirRodadas(banco.db, HOJE, 7)
    const algum = dias.flatMap((d) => d.jogadores).find((j) => j.valor !== null)!

    const inteiro = (await telaDoJogador(banco.db, algum.jogadorId, { temporada: TEMPORADA }))!
    expect(inteiro.historicoCortado).toBe(false)
    expect(inteiro.historico.length).toBeGreaterThan(1)

    const cortado = (await telaDoJogador(banco.db, algum.jogadorId, {
      temporada: TEMPORADA,
      limiteHistorico: 1,
    }))!
    expect(cortado.historico.length).toBe(1)
    expect(cortado.historicoCortado).toBe(true)
    // O corte não muda o que o hero conta — é justamente por isso que ele
    // precisa estar escrito na seção.
    expect(cortado.jogosDisputados).toBe(inteiro.jogosDisputados)
    // E o limite continua sendo limite: nada de uma partida a mais na tabela.
    expect(cortado.historico[0]!.jogoId).toBe(inteiro.historico[0]!.jogoId)
    // Com a linha de médias no lugar, o hero segue contando a TEMPORADA: o
    // corte da tabela não torna falso o número dele.
    expect(cortado.jogosDisputadosDoRecorte).toBe(false)
  })

  it('sem linha de médias o hero conta a JANELA, e a leitura diz isso — o hero não pode nomear a temporada', async () => {
    // `jogosDisputados` cai em `linhasBox.length` quando `medias_jogador` não
    // tem linha para (jogador, temporada, TEMPORADA). É fallback deliberado
    // (0.5), não hipótese — e nele o número é o tamanho da janela JÁ CORTADA.
    // O hero escrevia "25 jogos · 2025-26" com ele: exatamente a afirmação
    // sobre a temporada que o recorte tirou da tabela, duas linhas abaixo.
    const dias = await conferirRodadas(banco.db, HOJE, 7)
    const algum = dias.flatMap((d) => d.jogadores).find((j) => j.valor !== null)!
    const onde = and(
      eq(mediasJogador.jogadorId, algum.jogadorId),
      eq(mediasJogador.temporada, TEMPORADA),
      eq(mediasJogador.janela, 'TEMPORADA'),
    )
    const [media] = await banco.db.select().from(mediasJogador).where(onde).limit(1)
    expect(media, 'a temporada simulada grava as médias do jogador').toBeDefined()

    try {
      await banco.db.delete(mediasJogador).where(onde)

      const cortado = (await telaDoJogador(banco.db, algum.jogadorId, {
        temporada: TEMPORADA,
        limiteHistorico: 1,
      }))!
      expect(cortado.historicoCortado).toBe(true)
      expect(cortado.jogosDisputados).toBe(1)
      expect(cortado.jogosDisputadosDoRecorte).toBe(true)

      // Sem médias E sem corte, o número é tudo o que existe: continua sendo
      // um retrato da temporada, e o hero pode nomeá-la.
      const inteiro = (await telaDoJogador(banco.db, algum.jogadorId, { temporada: TEMPORADA }))!
      expect(inteiro.historicoCortado).toBe(false)
      expect(inteiro.jogosDisputadosDoRecorte).toBe(false)
    } finally {
      await banco.db.insert(mediasJogador).values(media!)
    }
  })
})

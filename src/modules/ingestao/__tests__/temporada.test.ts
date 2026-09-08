import { readFileSync } from 'node:fs'
import { and, eq, inArray, lt } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { bancoDeTeste } from '../../dominio/__tests__/ajuda-banco'
import {
  apitos,
  estatisticasJogo,
  estatisticasQuarto,
  estatisticasTimeJogo,
  feedSnapshot,
  fireLiveExecucoes,
  jogos,
  lesoesEscalacao,
  mediasJogador,
  mapaJogadores,
  niveis,
  niveisVersao,
  oddsAgregada,
  oddsSnapshot,
  times,
} from '../../dominio/db/schema'
import type { Db } from '../../dominio/db/tipos'
import { somarDias } from '../../dominio/rodada'
import { lerFeedFireLive } from '../../entrega/fire-live/leitura'
import { lerFeed } from '../../entrega/lista-secreta'
import type { ConteudoFeed } from '../../entrega/lista-secreta'
import { conferirRodadas } from '../../entrega/resultados'
import { carregarRuleset } from '../../motor/ruleset/carregar'
import { LLMFake } from '../llm'
import { lerListaDeNiveis } from '../niveis/parser'
import { ARQUIVO_LISTA, chaveDeNome, PROVEDOR_DEMO } from '../demo/cadastro'
import { semearBoxScoreDoTime, semearPlacares } from '../demo/jogos'
import {
  boxScoreDoTime,
  desfalquesDoDia,
  elencosDaLista,
  gerarCalendario,
  MINUTOS_ALVO,
  SEMENTE_TEMPORADA,
} from '../demo/simulacao'
import type { LinhaBox } from '../demo/simulacao'
import { simularAte } from '../demo/temporada'

const ruleset = carregarRuleset(readFileSync('config/ruleset.v1.yaml', 'utf8'))

// 15:00 em Brasília de um sábado de setembro — dentro da temporada 2025-26.
const AGORA = new Date('2026-09-05T18:00:00.000Z')
const HOJE = '2026-09-05'

/**
 * QUANTOS DIAS A SUÍTE PRODUZ.
 *
 * Cinco, não três. `recalcularMedias` é a média AMOSTRAL dos jogos jogados: no
 * primeiro dia da janela ninguém tem média (e sem média não há apito), e no
 * segundo a média de cada um É o seu único jogo — nenhum jogo pode ficar
 * abaixo de si mesmo, então a oscilação também não existe ali. A estratégia só
 * tem o que morder a partir do terceiro dia, e a tela de Resultados só mostra
 * green E red quando há alguns dias apitados para conferir.
 *
 * Cada dia custa segundos de PGlite; cinco é o menor número que ainda prova a
 * propriedade.
 */
const DIAS = 5

type Atributo = 'PONTOS' | 'REBOTES' | 'ASSISTENCIAS'
type LinhaObservada = { dia: string; instante: number } & Record<Atributo, number>

/** O que cada jogador REALMENTE fez, por jogo — a verdade contra a qual a lista é medida. */
async function observadoPorJogador(db: Db): Promise<Map<string, LinhaObservada[]>> {
  const linhas = await db
    .select({
      jogadorId: estatisticasJogo.jogadorId,
      dia: jogos.dataReferencia,
      instante: jogos.dataHoraUtc,
      PONTOS: estatisticasJogo.pontos,
      REBOTES: estatisticasJogo.rebotesTotal,
      ASSISTENCIAS: estatisticasJogo.assistencias,
    })
    .from(estatisticasJogo)
    .innerJoin(jogos, eq(estatisticasJogo.jogoId, jogos.id))

  const porJogador = new Map<string, LinhaObservada[]>()
  for (const l of linhas) {
    const lista = porJogador.get(l.jogadorId) ?? []
    lista.push({ ...l, instante: l.instante.getTime() })
    porJogador.set(l.jogadorId, lista)
  }
  return porJogador
}

/**
 * A CONFERÊNCIA DE HONESTIDADE — o coração desta suíte.
 *
 * Para cada item publicado em cada dia: a média que o motor leu tem de ser a
 * média dos jogos ANTERIORES àquele dia, e o "últimos 5" do card só pode
 * conter jogos anteriores àquele dia. Se alguém trocar a ordem dos passos
 * (jogar antes de publicar), a média do dia passa a incluir o próprio jogo e
 * o `ultimos5[0]` vira o resultado que a lista deveria estar prevendo — e
 * estas duas asserções quebram.
 *
 * Devolve quantos itens conferiu, para que o chamador possa recusar um teste
 * vazio (zero itens passa em qualquer implementação).
 */
async function conferirHonestidade(db: Db): Promise<number> {
  const observado = await observadoPorJogador(db)
  const snapshots = await db
    .select()
    .from(feedSnapshot)
    .where(eq(feedSnapshot.estrategia, 'LISTA_SECRETA'))

  let conferidos = 0
  for (const s of snapshots) {
    const conteudo = s.conteudoJson as ConteudoFeed
    for (const item of conteudo.itens) {
      const atributo = item.atributo as Atributo
      const anteriores = (observado.get(item.jogadorId) ?? []).filter(
        (l) => l.dia < s.dataReferencia,
      )

      const esperada =
        anteriores.length === 0
          ? null
          : Number((anteriores.reduce((t, l) => t + l[atributo], 0) / anteriores.length).toFixed(2))

      if (esperada === null) {
        expect(item.mediaTemporada, `média de ${item.nome} em ${s.dataReferencia}`).toBeNull()
      } else {
        expect(item.mediaTemporada, `média de ${item.nome} em ${s.dataReferencia}`).toBeCloseTo(
          esperada,
          2,
        )
      }

      expect(
        item.ultimos5.length,
        `últimos 5 de ${item.nome} em ${s.dataReferencia}`,
      ).toBeLessThanOrEqual(Math.min(5, anteriores.length))

      if (item.ultimos5.length > 0) {
        const ultimo = [...anteriores].sort((a, b) => b.instante - a.instante)[0]!
        expect(
          item.ultimos5[0]!.valor,
          `jogo mais recente de ${item.nome} em ${s.dataReferencia}`,
        ).toBe(ultimo[atributo])
      }
      conferidos += 1
    }
  }
  return conferidos
}

describe('simularAte — dias passados (PGlite)', () => {
  let banco: Awaited<ReturnType<typeof bancoDeTeste>>
  let resumo: Awaited<ReturnType<typeof simularAte>>

  beforeAll(async () => {
    banco = await bancoDeTeste()
    resumo = await simularAte(banco.db, ruleset, AGORA, { diasDeHistorico: DIAS })
  }, 300_000)
  afterAll(async () => {
    await banco.fechar()
  })

  it('produz exatamente os dias da janela, nenhum a mais', async () => {
    expect(resumo.inicio).toBe(somarDias(HOJE, -DIAS))
    expect(resumo.hoje).toBe(HOJE)
    expect(resumo.diasProduzidos).toBe(DIAS)
    expect(resumo.diasRestantes).toBe(0)
    expect(resumo.times).toBe(30)
    expect(resumo.jogadores).toBeGreaterThan(200)

    const passados = await banco.db.select().from(jogos).where(lt(jogos.dataReferencia, HOJE))
    expect(new Set(passados.map((j) => j.dataReferencia)).size).toBe(DIAS)
    expect(passados.length).toBe(resumo.jogosCriados)
    for (const j of passados) {
      expect(j.dataReferencia >= resumo.inicio).toBe(true)
      expect(j.status).toBe('ENCERRADO')
      expect(j.placarCasa).not.toBeNull()
      expect(j.placarVisitante).not.toBeNull()
    }

    // HOJE também existe — rodada agendada, um jogo ao vivo, lista e odds. O
    // resumo do cron reporta esse bloco em campos próprios: `publicacoes` e
    // `jogosCriados` contam só os dias PASSADOS.
    const deHoje = await banco.db.select().from(jogos).where(eq(jogos.dataReferencia, HOJE))
    expect(deHoje.length).toBeGreaterThan(0)
    expect(resumo.jogosHoje).toBe(deHoje.length)
    expect(resumo.itensListaSecreta).toBeGreaterThan(0)
    expect(resumo.apitosFireLive).toBeGreaterThan(0)
    expect(resumo.linhasComOdd).toBeGreaterThan(0)
  })

  it('cada dia passado tem Lista Secreta publicada ANTES do primeiro jogo', async () => {
    const passados = await banco.db.select().from(jogos).where(lt(jogos.dataReferencia, HOJE))
    for (const dia of new Set(passados.map((j) => j.dataReferencia))) {
      const doDia = passados.filter((j) => j.dataReferencia === dia)
      const [snapshot] = await banco.db
        .select()
        .from(feedSnapshot)
        .where(
          and(eq(feedSnapshot.dataReferencia, dia), eq(feedSnapshot.estrategia, 'LISTA_SECRETA')),
        )
        .limit(1)
      expect(snapshot, `snapshot de ${dia}`).toBeDefined()

      const primeiro = Math.min(...doDia.map((j) => j.dataHoraUtc.getTime()))
      expect(snapshot!.geradoEm.getTime()).toBeLessThan(primeiro)

      const apitosDoDia = await banco.db
        .select()
        .from(apitos)
        .where(
          inArray(
            apitos.jogoId,
            doDia.map((j) => j.id),
          ),
        )
      expect(apitosDoDia.every((a) => a.estrategia === 'LISTA_SECRETA')).toBe(true)
    }
    expect(resumo.publicacoes).toBe(DIAS)
  })

  it('nenhum apito de um dia foi explicado por dado daquele dia', async () => {
    const conferidos = await conferirHonestidade(banco.db)
    // Um teste que confere zero itens passaria com qualquer implementação.
    expect(conferidos).toBeGreaterThan(0)
  })

  it('o placar é a soma do box, e todo jogo encerrado tem box dos dois lados', async () => {
    const passados = await banco.db.select().from(jogos).where(lt(jogos.dataReferencia, HOJE))
    // Só o box dos dias PASSADOS: o jogo AO VIVO de hoje também tem linhas em
    // `estatisticas_jogo` (o parcial do 1º quarto, que a tela de partida lê),
    // e elas não são jogo inteiro nem entram em `resumo.boxScores`.
    const box = await banco.db
      .select()
      .from(estatisticasJogo)
      .where(
        inArray(
          estatisticasJogo.jogoId,
          passados.map((j) => j.id),
        ),
      )
    for (const j of passados) {
      const doJogo = box.filter((b) => b.jogoId === j.id)
      // Mínimo de 6 em quadra por time (MINIMO_EM_QUADRA), dois times.
      expect(doJogo.length).toBeGreaterThanOrEqual(12)
      const total = doJogo.reduce((s, b) => s + b.pontos, 0)
      expect(total).toBe(j.placarCasa! + j.placarVisitante!)
      expect(doJogo.every((b) => Number(b.minutos) > 0)).toBe(true)
      expect(doJogo.every((b) => b.doisC * 2 + b.tresC * 3 + b.lanceC === b.pontos)).toBe(true)
    }
    expect(resumo.boxScores).toBe(box.length)
  })

  it('o box gravado é exatamente o que o gerador produz para a chave da convenção', async () => {
    /*
     * A LIGAÇÃO ENTRE O GERADOR E O BANCO — a única coisa que esta task
     * entrega e que nenhum teste do gerador puro pode cobrir.
     *
     * `simulacao.test.ts` prova as propriedades (distribuição, oscilação,
     * sequências) com chaves que ele mesmo monta. Aqui a chave é a de
     * produção, e ela é reconstruída fora do código que a escreve:
     *
     *     SEMENTE|dia|casaXvisitante|sigla
     *
     * Sem esta asserção, degenerar a chave (tirar o dia, tirar o confronto,
     * trocar a ordem casa/visitante) deixa a suíte inteira verde e produz uma
     * temporada em que quase todo jogador faz os MESMOS pontos em todo jogo —
     * e sem oscilação não há Lista Secreta honesta.
     */
    const dia = somarDias(HOJE, -1)
    const analise = lerListaDeNiveis(readFileSync(ARQUIVO_LISTA, 'utf8'))
    const elencos = elencosDaLista(analise.jogadores)
    const janela: string[] = []
    for (let d = somarDias(HOJE, -DIAS); d <= HOJE; d = somarDias(d, 1)) janela.push(d)
    const calendario = gerarCalendario({
      siglas: [...elencos.keys()],
      dias: janela,
      semente: SEMENTE_TEMPORADA,
    })
    const doDia = calendario.get(dia) ?? []
    expect(doDia.length).toBeGreaterThan(0)
    const fora = desfalquesDoDia({
      dia,
      jogos: doDia,
      elencos,
      semente: SEMENTE_TEMPORADA,
    })

    const idPorSigla = new Map(
      (await banco.db.select().from(times)).map((t) => [t.sigla, t.id] as const),
    )
    const idPorChave = new Map(
      (await banco.db.select().from(mapaJogadores))
        .filter(
          (vinculo): vinculo is typeof vinculo & { jogadorId: string } =>
            vinculo.provedor === PROVEDOR_DEMO && vinculo.jogadorId !== null,
        )
        .map((vinculo) => [chaveDeNome(vinculo.nomeNaLista), vinculo.jogadorId] as const),
    )
    // O mesmo vínculo que a simulação usa: `niveis.time_id` da versão ativa —
    // é ele que decide de quem é o homônimo (há dois "Wiggins" na lista).
    const timeDoJogador = new Map(
      (
        await banco.db
          .select({ jogadorId: niveis.jogadorId, timeId: niveis.timeId })
          .from(niveis)
          .innerJoin(niveisVersao, eq(niveis.niveisVersaoId, niveisVersao.id))
          .where(and(eq(niveisVersao.ativa, true), eq(niveis.atributo, 'PONTOS')))
      ).map((l) => [l.jogadorId, l.timeId] as const),
    )

    let conferidas = 0
    for (const jogo of doDia) {
      const timeCasaId = idPorSigla.get(jogo.casa)!
      const timeVisitanteId = idPorSigla.get(jogo.visitante)!
      const [linha] = await banco.db
        .select()
        .from(jogos)
        .where(
          and(
            eq(jogos.dataReferencia, dia),
            eq(jogos.timeCasaId, timeCasaId),
            eq(jogos.timeVisitanteId, timeVisitanteId),
          ),
        )
        .limit(1)
      expect(linha, `${jogo.casa} x ${jogo.visitante} em ${dia}`).toBeDefined()

      const esperado = new Map<string, LinhaBox>()
      for (const lado of ['casa', 'visitante'] as const) {
        const sigla = jogo[lado]
        const timeId = lado === 'casa' ? timeCasaId : timeVisitanteId
        const gerado = boxScoreDoTime({
          chave: `${SEMENTE_TEMPORADA}|${dia}|${jogo.casa}x${jogo.visitante}|${sigla}`,
          elenco: elencos.get(sigla) ?? [],
          fora: fora.get(sigla) ?? [],
        })
        for (const l of gerado) {
          const jogadorId = idPorChave.get(chaveDeNome(l.nome))
          if (!jogadorId || timeDoJogador.get(jogadorId) !== timeId) continue
          esperado.set(jogadorId, l)
        }
      }

      const box = await banco.db
        .select()
        .from(estatisticasJogo)
        .where(eq(estatisticasJogo.jogoId, linha!.id))
      expect(box.length, `linhas de ${jogo.casa} x ${jogo.visitante}`).toBe(esperado.size)
      for (const b of box) {
        const l = esperado.get(b.jogadorId)
        expect(l, `linha gravada sem origem no gerador (${b.jogadorId})`).toBeDefined()
        expect(b.pontos).toBe(l!.pontos)
        expect(b.rebotesTotal).toBe(l!.rebotes)
        expect(b.assistencias).toBe(l!.assistencias)
        expect(Number(b.minutos)).toBeCloseTo(l!.minutos, 2)
        conferidas += 1
      }
    }
    expect(conferidas).toBeGreaterThan(50)
  })

  it('a temporada oscila: repetir a mesma pontuação em todos os jogos é exceção', async () => {
    /*
     * Rede de segurança barata para a chave do box: uma chave que ignore o dia
     * ou o confronto faz cada jogador repetir a mesma linha em todo jogo. O
     * corte é folgado de propósito — o que se recusa aqui é a degeneração, não
     * uma coincidência de dois jogos iguais.
     */
    const linhas = await banco.db
      .select({ jogadorId: estatisticasJogo.jogadorId, pontos: estatisticasJogo.pontos })
      .from(estatisticasJogo)
    const porJogador = new Map<string, number[]>()
    for (const l of linhas)
      porJogador.set(l.jogadorId, [...(porJogador.get(l.jogadorId) ?? []), l.pontos])
    const comDois = [...porJogador.values()].filter((p) => p.length >= 2)
    expect(comDois.length).toBeGreaterThan(100)
    const cravados = comDois.filter((p) => p.every((v) => v === p[0]))
    expect(cravados.length / comDois.length).toBeLessThan(0.2)
  })

  it('quem está fora não recebe linha de box no jogo daquele dia', async () => {
    const fora = await banco.db
      .select()
      .from(lesoesEscalacao)
      .where(eq(lesoesEscalacao.status, 'FORA'))
    expect(fora.length).toBeGreaterThan(0)
    const box = await banco.db.select().from(estatisticasJogo)
    const comLinha = new Set(box.map((b) => `${b.jogoId}|${b.jogadorId}`))
    for (const f of fora) expect(comLinha.has(`${f.jogoId}|${f.jogadorId}`)).toBe(false)
  })

  it('o box do TIME é derivado do dia certo — dois times por jogo, batendo com o placar', async () => {
    const passados = await banco.db.select().from(jogos).where(lt(jogos.dataReferencia, HOJE))
    // Sem o jogo ao vivo de hoje: ele também tem duas linhas, mas só com o 1º
    // quarto (ver `semearJogoAoVivo`), e o placar dele é parcial.
    const porTime = await banco.db
      .select()
      .from(estatisticasTimeJogo)
      .where(
        inArray(
          estatisticasTimeJogo.jogoId,
          passados.map((j) => j.id),
        ),
      )
    expect(porTime.length).toBe(passados.length * 2)
    for (const j of passados) {
      const doJogo = porTime.filter((t) => t.jogoId === j.id)
      expect(doJogo).toHaveLength(2)
      const casa = doJogo.find((t) => t.timeId === j.timeCasaId)
      const visitante = doJogo.find((t) => t.timeId === j.timeVisitanteId)
      expect(casa?.pontos).toBe(j.placarCasa)
      expect(visitante?.pontos).toBe(j.placarVisitante)
      // Os quartos fecham a conta, sempre (o Q4 recebe o resto).
      for (const t of doJogo) {
        expect(t.pontosQ1 + t.pontosQ2 + t.pontosQ3 + t.pontosQ4).toBe(t.pontos)
      }
    }
  })

  it('as médias em medias_jogador são as amostrais dos jogos simulados', async () => {
    const medias = await banco.db
      .select()
      .from(mediasJogador)
      .where(eq(mediasJogador.janela, 'TEMPORADA'))
    expect(medias.length).toBeGreaterThan(100)
    const observado = await observadoPorJogador(banco.db)
    for (const m of medias) {
      // `recalcularMedias` só olha jogos ENCERRADOS — o parcial do 1º quarto
      // do jogo ao vivo de hoje NÃO entra na média (e não pode entrar: a
      // lista de hoje foi publicada contra o que se sabia até ontem).
      const doJogador = (observado.get(m.jogadorId) ?? []).filter((l) => l.dia < HOJE)
      expect(m.jogos).toBe(doJogador.length)
      const ppg = doJogador.reduce((s, l) => s + l.PONTOS, 0) / doJogador.length
      expect(Number(m.ppg)).toBeCloseTo(ppg, 1)
    }
    // Ninguém sem jogo tem média: `recalcularMedias` apaga essas linhas.
    expect(medias.every((m) => m.jogos > 0)).toBe(true)
  })

  it('a conferência (leitura) vê os dias passados e há green E red', async () => {
    const dias = await conferirRodadas(banco.db, HOJE, DIAS)
    const cards = dias.flatMap((d) => d.jogadores).filter((j) => j.valor !== null)
    expect(cards.length).toBeGreaterThan(0)
    expect(cards.some((j) => j.maiorLinhaBatida !== null)).toBe(true)
    expect(cards.some((j) => j.maiorLinhaBatida === null)).toBe(true)
  })

  it('rodar de novo no mesmo instante não muda nada', async () => {
    const contar = async () => ({
      jogos: (await banco.db.select().from(jogos)).length,
      box: (await banco.db.select().from(estatisticasJogo)).length,
      boxTime: (await banco.db.select().from(estatisticasTimeJogo)).length,
      apitos: (await banco.db.select().from(apitos)).length,
      lesoes: (await banco.db.select().from(lesoesEscalacao)).length,
      medias: (await banco.db.select().from(mediasJogador)).length,
      snapshots: (await banco.db.select().from(feedSnapshot)).length,
    })
    const antes = await contar()
    const segunda = await simularAte(banco.db, ruleset, AGORA, { diasDeHistorico: DIAS })
    expect(segunda.diasProduzidos).toBe(0)
    expect(segunda.diasRestantes).toBe(0)
    expect(await contar()).toEqual(antes)
  }, 180_000)

  it('apagar o box de um dia refaz só aquele dia — sem republicar a lista com o que veio depois', async () => {
    const dia = somarDias(HOJE, -2)
    const doDia = await banco.db.select().from(jogos).where(eq(jogos.dataReferencia, dia))
    const ids = doDia.map((j) => j.id)
    const chaves = doDia.map((j) => `${j.timeCasaId}|${j.timeVisitanteId}`).sort()
    // CONTEÚDO, não contagem: um dia refeito tem de sair com os MESMOS
    // números. Contar linhas aprovaria uma temporada que se reescreve inteira
    // a cada execução do cron.
    const assinaturaBox = (linhas: (typeof estatisticasJogo.$inferSelect)[]) =>
      linhas
        .map(
          (b) =>
            `${b.jogoId}|${b.jogadorId}|${b.minutos}|${b.pontos}|${b.rebotesTotal}|${b.assistencias}`,
        )
        .sort()
    const placares = (linhas: (typeof jogos.$inferSelect)[]) =>
      linhas.map((j) => `${j.id}|${j.placarCasa}|${j.placarVisitante}`).sort()
    const boxAntes = assinaturaBox(
      await banco.db.select().from(estatisticasJogo).where(inArray(estatisticasJogo.jogoId, ids)),
    )
    const placaresAntes = placares(doDia)
    const [antesDoSnapshot] = await banco.db
      .select()
      .from(feedSnapshot)
      .where(
        and(eq(feedSnapshot.dataReferencia, dia), eq(feedSnapshot.estrategia, 'LISTA_SECRETA')),
      )
      .limit(1)

    await banco.db.delete(estatisticasJogo).where(inArray(estatisticasJogo.jogoId, ids))
    await banco.db
      .update(jogos)
      .set({ status: 'AGENDADO', placarCasa: null, placarVisitante: null })
      .where(inArray(jogos.id, ids))

    const terceira = await simularAte(banco.db, ruleset, AGORA, { diasDeHistorico: DIAS })
    expect(terceira.diasProduzidos).toBe(1)

    const refeito = await banco.db.select().from(jogos).where(eq(jogos.dataReferencia, dia))
    expect(refeito.map((j) => `${j.timeCasaId}|${j.timeVisitanteId}`).sort()).toEqual(chaves)
    expect(refeito.every((j) => j.status === 'ENCERRADO')).toBe(true)
    expect(refeito.every((j) => j.placarCasa !== null)).toBe(true)
    // Os mesmos jogos, os mesmos números: a chave do box é função do dia e do
    // confronto, não da ordem em que o dia foi produzido.
    expect(placares(refeito)).toEqual(placaresAntes)
    expect(
      assinaturaBox(
        await banco.db.select().from(estatisticasJogo).where(inArray(estatisticasJogo.jogoId, ids)),
      ),
    ).toEqual(boxAntes)

    // A LISTA DAQUELE DIA NÃO É REESCRITA. Quando o dia volta a ser produzido,
    // os dias SEGUINTES já aconteceram: republicar agora daria ao motor uma
    // média que inclui o futuro, e a taxa de acerto viraria ficção. A lista
    // honesta é a que já está lá.
    expect(terceira.publicacoes).toBe(0)
    const [depoisDoSnapshot] = await banco.db
      .select()
      .from(feedSnapshot)
      .where(
        and(eq(feedSnapshot.dataReferencia, dia), eq(feedSnapshot.estrategia, 'LISTA_SECRETA')),
      )
      .limit(1)
    expect(depoisDoSnapshot!.hash).toBe(antesDoSnapshot!.hash)
    expect(depoisDoSnapshot!.geradoEm.getTime()).toBe(antesDoSnapshot!.geradoEm.getTime())

    // E a propriedade continua valendo para a temporada inteira.
    expect(await conferirHonestidade(banco.db)).toBeGreaterThan(0)
  }, 180_000)

  it('sem a lista daquele dia e com o futuro já jogado, prefere o buraco à mentira', async () => {
    // O estado mais perigoso possível: o dia perdeu o snapshot E o box, mas os
    // dias seguintes já aconteceram. Publicar agora daria ao motor médias que
    // incluem o futuro. A regra é não publicar — quem olhar a tela vê um dia
    // sem lista, que é uma ausência visível, em vez de uma taxa de acerto
    // fabricada, que ninguém tem como notar.
    const dia = somarDias(HOJE, -3)
    const doDia = await banco.db.select().from(jogos).where(eq(jogos.dataReferencia, dia))
    const ids = doDia.map((j) => j.id)
    await banco.db
      .delete(feedSnapshot)
      .where(
        and(eq(feedSnapshot.dataReferencia, dia), eq(feedSnapshot.estrategia, 'LISTA_SECRETA')),
      )
    await banco.db.delete(estatisticasJogo).where(inArray(estatisticasJogo.jogoId, ids))

    const refeita = await simularAte(banco.db, ruleset, AGORA, { diasDeHistorico: DIAS })
    expect(refeita.diasProduzidos).toBe(1)
    expect(refeita.publicacoes).toBe(0)

    const semLista = await banco.db
      .select()
      .from(feedSnapshot)
      .where(eq(feedSnapshot.dataReferencia, dia))
    expect(semLista).toHaveLength(0)

    // Os FATOS do dia, esses, voltaram: o buraco é só na lista.
    const refeito = await banco.db.select().from(jogos).where(eq(jogos.dataReferencia, dia))
    expect(refeito.every((j) => j.status === 'ENCERRADO' && j.placarCasa !== null)).toBe(true)
    const box = await banco.db
      .select()
      .from(estatisticasJogo)
      .where(inArray(estatisticasJogo.jogoId, ids))
    expect(box.length).toBeGreaterThan(0)
    expect(await conferirHonestidade(banco.db)).toBeGreaterThan(0)
  }, 180_000)

  it('o próprio dia, já jogado em parte, também segura a lista — não só os dias seguintes', async () => {
    /*
     * A OUTRA METADE DA GUARDA. O teste acima cobre o futuro já jogado; este
     * cobre o PRÓPRIO dia, e é o último dia passado da janela justamente para
     * que não exista futuro nenhum para segurar a lista no lugar dele.
     *
     * O estado: um jogo do dia perdeu o box (o dia volta para a fila), os
     * outros seguem ENCERRADOS e já entraram em `medias_jogador`, e o snapshot
     * do dia sumiu. Publicar agora daria ao motor médias que já contêm o
     * próprio dia que a lista deveria estar prevendo — mediria a estratégia
     * contra o gabarito.
     */
    const dia = somarDias(HOJE, -1)
    const doDia = await banco.db.select().from(jogos).where(eq(jogos.dataReferencia, dia))
    expect(doDia.length).toBeGreaterThan(1)
    const perdido = doDia[0]!

    await banco.db.delete(estatisticasJogo).where(eq(estatisticasJogo.jogoId, perdido.id))
    await banco.db
      .delete(feedSnapshot)
      .where(
        and(eq(feedSnapshot.dataReferencia, dia), eq(feedSnapshot.estrategia, 'LISTA_SECRETA')),
      )
    // Os outros jogos do dia continuam ENCERRADOS — é isso que a guarda vê.
    const restantes = await banco.db
      .select()
      .from(jogos)
      .where(and(eq(jogos.dataReferencia, dia), eq(jogos.status, 'ENCERRADO')))
    expect(restantes.length).toBe(doDia.length)

    const refeita = await simularAte(banco.db, ruleset, AGORA, { diasDeHistorico: DIAS })
    expect(refeita.diasProduzidos).toBe(1)
    expect(refeita.publicacoes).toBe(0)
    expect(
      await banco.db.select().from(feedSnapshot).where(eq(feedSnapshot.dataReferencia, dia)),
    ).toHaveLength(0)

    // Os fatos voltaram; o buraco é só na lista.
    const refeito = await banco.db.select().from(jogos).where(eq(jogos.dataReferencia, dia))
    expect(refeito.every((j) => j.status === 'ENCERRADO' && j.placarCasa !== null)).toBe(true)
    const box = await banco.db
      .select()
      .from(estatisticasJogo)
      .where(eq(estatisticasJogo.jogoId, perdido.id))
    expect(box.length).toBeGreaterThan(0)
    expect(await conferirHonestidade(banco.db)).toBeGreaterThan(0)
  }, 180_000)

  it('no dia seguinte, o cron só produz o dia que faltava — o passado não é reescrito', async () => {
    const antes = await banco.db.select().from(jogos)
    const assinatura = (linhas: typeof antes) =>
      linhas
        .map(
          (j) =>
            `${j.dataReferencia}|${j.timeCasaId}|${j.timeVisitanteId}|${j.dataHoraUtc.toISOString()}`,
        )
        .sort()
    // A chave inclui estratégia e jogo: o dia de hoje tem DOIS snapshots (a
    // Lista Secreta do dia e o Fire Live do jogo ao vivo), e indexar só pela
    // data faria um esconder o outro.
    const chaveSnapshot = (s: typeof feedSnapshot.$inferSelect) =>
      `${s.dataReferencia}|${s.estrategia}|${s.jogoId ?? ''}`
    const snapshotsAntes = new Map(
      (await banco.db.select().from(feedSnapshot)).map((s) => [chaveSnapshot(s), s.hash] as const),
    )

    // A JANELA DESLIZA UM DIA. Se o calendário dependesse de onde a janela
    // começa (e não do dia absoluto), os mesmos 31/08 e 01/09 sairiam com
    // outros confrontos agora — todo dia passado ficaria eternamente
    // "incompleto" e cada execução empilharia um segundo jogo por cima do
    // primeiro. É o defeito que a errata da spec (§4b) descreve.
    const amanha = new Date(AGORA.getTime() + 24 * 60 * 60_000)
    const seguinte = await simularAte(banco.db, ruleset, amanha, { diasDeHistorico: DIAS })

    expect(seguinte.hoje).toBe(somarDias(HOJE, 1))
    expect(seguinte.diasProduzidos).toBe(1)
    // ZERO publicações: o dia que virou passado é o HOJE da execução anterior,
    // e a lista dele já saiu — na hora certa, antes de qualquer jogo. Refazer
    // os FATOS do dia não republica a LISTA do dia.
    expect(seguinte.publicacoes).toBe(0)

    const depois = await banco.db.select().from(jogos)
    const novos = depois.filter((j) => j.dataReferencia === HOJE)
    expect(novos.length).toBeGreaterThan(0)
    expect(novos.every((j) => j.status === 'ENCERRADO' && j.placarCasa !== null)).toBe(true)
    // Tudo o que já existia continua idêntico; o dia de HOJE não ganhou nem
    // perdeu jogo ao virar passado, e o dia novo entrou por cima.
    expect(assinatura(depois.filter((j) => j.dataReferencia <= HOJE))).toEqual(assinatura(antes))
    for (const s of await banco.db.select().from(feedSnapshot)) {
      const hashAntes = snapshotsAntes.get(chaveSnapshot(s))
      if (hashAntes !== undefined) expect(s.hash).toBe(hashAntes)
    }
    expect(await conferirHonestidade(banco.db)).toBeGreaterThan(0)
  }, 180_000)

  it('ontem, que ficou pela metade com um jogo AO VIVO, é refeito sem tocar na lista já publicada', async () => {
    /*
     * O CAMINHO REAL DO CRON, e o motivo de tudo isto existir.
     *
     * Ontem foi o "hoje" da execução anterior: rodada agendada, o primeiro
     * jogo AO_VIVO com box parcial do 1º quarto, lista publicada na hora
     * certa. Hoje o dia está incompleto e volta para a fila. Ele tem de ser
     * jogado até o fim — mas a lista dele NÃO pode ser republicada: ela já
     * saiu, no momento em que ninguém sabia o resultado.
     */
    const dia = HOJE // depois do teste anterior, HOJE já é um dia passado
    const amanha = new Date(AGORA.getTime() + 24 * 60 * 60_000)
    const doDia = await banco.db.select().from(jogos).where(eq(jogos.dataReferencia, dia))
    const ids = doDia.map((j) => j.id)
    const [snapshotAntes] = await banco.db
      .select()
      .from(feedSnapshot)
      .where(
        and(eq(feedSnapshot.dataReferencia, dia), eq(feedSnapshot.estrategia, 'LISTA_SECRETA')),
      )
      .limit(1)
    expect(snapshotAntes).toBeDefined()

    const aoVivo = [...doDia].sort((a, b) => a.dataHoraUtc.getTime() - b.dataHoraUtc.getTime())[0]!
    await banco.db
      .update(jogos)
      .set({ status: 'AGENDADO', placarCasa: null, placarVisitante: null })
      .where(inArray(jogos.id, ids))
    await banco.db
      .update(jogos)
      .set({ status: 'AO_VIVO', quartoAtual: ruleset.fire_live.quarto })
      .where(eq(jogos.id, aoVivo.id))
    await banco.db.delete(estatisticasJogo).where(
      inArray(
        estatisticasJogo.jogoId,
        ids.filter((id) => id !== aoVivo.id),
      ),
    )
    // Box PARCIAL do 1º quarto, e nele uma linha fantasma: alguém que a versão
    // anterior pôs em quadra e o dia refeito não põe. Um upsert a deixaria
    // para trás, contando na média para sempre.
    await banco.db
      .update(estatisticasJogo)
      .set({ minutos: '8.00', pontos: 4 })
      .where(eq(estatisticasJogo.jogoId, aoVivo.id))
    const doJogo = await banco.db
      .select()
      .from(estatisticasJogo)
      .where(eq(estatisticasJogo.jogoId, aoVivo.id))
    const forasteiro = (await banco.db.select().from(mediasJogador)).find(
      (m) => !doJogo.some((b) => b.jogadorId === m.jogadorId),
    )!
    await banco.db
      .insert(estatisticasJogo)
      .values({ jogoId: aoVivo.id, jogadorId: forasteiro.jogadorId, minutos: '9.00', pontos: 99 })

    const refeito = await simularAte(banco.db, ruleset, amanha, { diasDeHistorico: DIAS })
    expect(refeito.diasProduzidos).toBe(1)
    expect(refeito.publicacoes).toBe(0)

    const [snapshotDepois] = await banco.db
      .select()
      .from(feedSnapshot)
      .where(
        and(eq(feedSnapshot.dataReferencia, dia), eq(feedSnapshot.estrategia, 'LISTA_SECRETA')),
      )
      .limit(1)
    expect(snapshotDepois!.hash).toBe(snapshotAntes!.hash)
    expect(snapshotDepois!.geradoEm.getTime()).toBe(snapshotAntes!.geradoEm.getTime())

    const depois = await banco.db.select().from(jogos).where(eq(jogos.dataReferencia, dia))
    expect(depois.every((j) => j.status === 'ENCERRADO' && j.placarCasa !== null)).toBe(true)
    const boxDoJogo = await banco.db
      .select()
      .from(estatisticasJogo)
      .where(eq(estatisticasJogo.jogoId, aoVivo.id))
    // O box do jogo inteiro substituiu o do 1º quarto, e a linha fantasma sumiu.
    expect(boxDoJogo.every((b) => Number(b.minutos) >= 10)).toBe(true)
    expect(boxDoJogo.some((b) => b.jogadorId === forasteiro.jogadorId)).toBe(false)
    expect(await conferirHonestidade(banco.db)).toBeGreaterThan(0)
  }, 180_000)

  describe('filtroDeJogos — o caminho que só a temporada exercita', () => {
    it('lista vazia é "nenhum jogo", não "todos os jogos"', async () => {
      expect(await semearPlacares(banco.db, [])).toBe(0)
      expect(await semearBoxScoreDoTime(banco.db, AGORA, [])).toBe(0)
    })

    it('com ids, mexe só nos jogos pedidos', async () => {
      // Só os ENCERRADOS: a rodada de hoje está agendada (e um jogo ao vivo),
      // e as duas funções ignoram partida que ainda não acabou.
      const encerrados = await banco.db.select().from(jogos).where(eq(jogos.status, 'ENCERRADO'))
      const alvo = encerrados[0]!
      expect(await semearPlacares(banco.db, [alvo.id])).toBe(1)
      expect(await semearBoxScoreDoTime(banco.db, AGORA, [alvo.id])).toBe(2)
      // Sem filtro, todos os encerrados.
      expect(await semearPlacares(banco.db)).toBe(encerrados.length)
    })
  })
})

/**
 * O DIA DE HOJE — a rodada que ainda vai acontecer.
 *
 * Banco próprio e TRÊS SEMANAS de história, não os cinco dias do describe
 * acima: o Fire Live compara o 1º quarto contra a média da temporada, a taxa
 * de acerto da tela de Resultados olha sete dias para trás, e a variedade de
 * níveis de apito (1, 2, 3) só aparece quando cada jogador tem jogos o
 * bastante para oscilar. Vinte e um dias dão ~9 jogos por jogador — o menor
 * número que ainda prova cada uma dessas propriedades.
 */
describe('simularAte — o dia de HOJE (PGlite)', () => {
  const DIAS_HOJE = 21

  let banco: Awaited<ReturnType<typeof bancoDeTeste>>
  let resumo: Awaited<ReturnType<typeof simularAte>>

  beforeAll(async () => {
    banco = await bancoDeTeste()
    resumo = await simularAte(banco.db, ruleset, AGORA, {
      diasDeHistorico: DIAS_HOJE,
      llm: new LLMFake(),
    })
  }, 600_000)
  afterAll(async () => {
    await banco.fechar()
  })

  const jogosDoDia = (dia: string) =>
    banco.db.select().from(jogos).where(eq(jogos.dataReferencia, dia))

  it('hoje tem rodada agendada e exatamente UM jogo ao vivo — o primeiro do dia', async () => {
    const hoje = await jogosDoDia(HOJE)
    expect(hoje.length).toBeGreaterThanOrEqual(4)
    expect(resumo.jogosHoje).toBe(hoje.length)

    const aoVivo = hoje.filter((j) => j.status === 'AO_VIVO')
    expect(aoVivo).toHaveLength(1)
    expect(aoVivo[0]!.quartoAtual).toBe(ruleset.fire_live.quarto)
    expect(hoje.filter((j) => j.status === 'AGENDADO')).toHaveLength(hoje.length - 1)

    // O jogo ao vivo é o PRIMEIRO da rodada: é o que dá à demonstração um
    // Fire Live e uma Lista Secreta ao mesmo tempo (spec §1).
    const primeiro = Math.min(...hoje.map((j) => j.dataHoraUtc.getTime()))
    expect(aoVivo[0]!.dataHoraUtc.getTime()).toBe(primeiro)

    // 1º quarto parcial gravado — é o que o Fire Live observa.
    const quartos = await banco.db
      .select()
      .from(estatisticasQuarto)
      .where(eq(estatisticasQuarto.jogoId, aoVivo[0]!.id))
    expect(quartos.length).toBeGreaterThanOrEqual(10)
    expect(quartos.every((q) => q.quarto === ruleset.fire_live.quarto)).toBe(true)
  })

  it('a Lista Secreta de hoje sai com narrativa e com odd; a de ontem, sem narrativa', async () => {
    const feed = await lerFeed(banco.db, HOJE)
    expect(feed).not.toBeNull()
    expect(feed!.conteudo.itens.length).toBeGreaterThan(0)
    expect(resumo.itensListaSecreta).toBe(feed!.conteudo.itens.length)
    expect(feed!.conteudo.itens.some((i) => i.narrativa)).toBe(true)

    // A ODD ENTROU NO CARD. A ordem é obrigatória (a odd depende da linha, a
    // linha depende do motor), e sem a REPUBLICAÇÃO depois das odds o rodapé
    // do card fica sem faixa: o snapshot teria sido materializado com
    // `odds_agregada` ainda vazia.
    expect(feed!.conteudo.itens.some((i) => i.oddFaixa !== null)).toBe(true)
    expect(resumo.linhasComOdd).toBeGreaterThan(0)
    expect((await banco.db.select().from(oddsAgregada)).length).toBe(resumo.linhasComOdd)

    // SÓ HOJE RECEBE A PORTA DE LLM (spec §3): 50 dias × ~50 itens seriam
    // ~2.500 chamadas pagas por textos que ninguém abre.
    const ontem = await lerFeed(banco.db, somarDias(HOJE, -1))
    expect(ontem).not.toBeNull()
    expect(ontem!.conteudo.itens.length).toBeGreaterThan(0)
    expect(ontem!.conteudo.itens.every((i) => !i.narrativa)).toBe(true)
    expect(ontem!.conteudo.resumoDoDia ?? null).toBeNull()
  })

  it('hoje tem uma OPD por desfalque em prefixo e um apito em modo fire', async () => {
    /*
     * OS DOIS CENÁRIOS FORÇADOS da spec §3 — os únicos pontos da temporada
     * inteira em que a simulação escolhe o resultado, e por isso os únicos que
     * um teste pode exigir de um dia específico.
     */
    const feed = await lerFeed(banco.db, HOJE)
    const opd = feed!.conteudo.itens.filter((i) => i.metodo === 'OPD')
    expect(opd.length).toBeGreaterThan(0)

    // O desfalque é PREFIXO: quem apita é gente ABAIXO de quem está fora, e o
    // nº 1 do time apitado tem de estar entre os desfalcados daquele jogo.
    const foraNoJogo = new Set(
      (
        await banco.db
          .select()
          .from(lesoesEscalacao)
          .where(
            and(eq(lesoesEscalacao.jogoId, opd[0]!.jogoId), eq(lesoesEscalacao.status, 'FORA')),
          )
      ).map((l) => l.jogadorId),
    )
    const hierarquia = await banco.db
      .select({ jogadorId: niveis.jogadorId, posicao: niveis.posicaoHierarquia })
      .from(niveis)
      .innerJoin(niveisVersao, eq(niveis.niveisVersaoId, niveisVersao.id))
      .innerJoin(times, eq(niveis.timeId, times.id))
      .where(
        and(
          eq(niveisVersao.ativa, true),
          eq(niveis.atributo, 'PONTOS'),
          eq(times.sigla, opd[0]!.timeSigla),
        ),
      )
    const numeroUm = [...hierarquia].sort((a, b) => a.posicao - b.posicao)[0]!
    expect(foraNoJogo.has(numeroUm.jogadorId)).toBe(true)
    expect(foraNoJogo.has(opd[0]!.jogadorId)).toBe(false)

    const fire = await lerFeedFireLive(banco.db, HOJE, ruleset.fire_live.quarto)
    expect(fire.itens.length).toBeGreaterThan(0)
    expect(resumo.apitosFireLive).toBe(fire.itens.length)
    const emFire = fire.itens.filter((i) => i.modoFire)
    expect(emFire.length).toBeGreaterThan(0)
    // Modo fire é de MVP e All Star — o ruleset diz quais, nunca este teste.
    expect(emFire.every((i) => ruleset.fire_live.modo_fire.aplica_a.includes(i.nivelJogador))).toBe(
      true,
    )
  })

  it('ao longo de três semanas a estratégia produz apitos de níveis diferentes', async () => {
    const todos = await banco.db.select().from(apitos).where(eq(apitos.estrategia, 'LISTA_SECRETA'))
    const niveisApito = new Set(todos.map((a) => a.nivelApito))
    // Os três níveis do documento do CJ, produzidos pelas regras — nenhum
    // deles foi escrito por este seed.
    expect([...niveisApito].sort()).toEqual([1, 2, 3])
    expect(todos.some((a) => a.metodo === 'OSCILACAO')).toBe(true)
    expect(todos.some((a) => a.metodo === 'OPD')).toBe(true)
  })

  it('a taxa de acerto de 7 dias existe e não é 0% nem 100%', async () => {
    const dias = await conferirRodadas(banco.db, HOJE, 7)
    const conferidos = dias.reduce((s, d) => s + d.conferidos, 0)
    const acertos = dias.reduce((s, d) => s + d.acertos, 0)
    expect(conferidos).toBeGreaterThan(20)
    expect(acertos).toBeGreaterThan(0)
    expect(acertos).toBeLessThan(conferidos)
  })

  it('rodar de novo não duplica apito, odd, lesão nem execução do Fire Live', async () => {
    const contar = async () => ({
      jogos: (await banco.db.select().from(jogos)).length,
      box: (await banco.db.select().from(estatisticasJogo)).length,
      quartos: (await banco.db.select().from(estatisticasQuarto)).length,
      apitos: (await banco.db.select().from(apitos)).length,
      odds: (await banco.db.select().from(oddsAgregada)).length,
      cotacoes: (await banco.db.select().from(oddsSnapshot)).length,
      lesoes: (await banco.db.select().from(lesoesEscalacao)).length,
      execucoes: (await banco.db.select().from(fireLiveExecucoes)).length,
      snapshots: (await banco.db.select().from(feedSnapshot)).length,
    })
    const antes = await contar()
    const segunda = await simularAte(banco.db, ruleset, AGORA, {
      diasDeHistorico: DIAS_HOJE,
      llm: new LLMFake(),
    })
    expect(segunda.diasProduzidos).toBe(0)
    expect(await contar()).toEqual(antes)
    // O resumo do bloco de hoje é contagem de ESTADO, não de novidade: o cron
    // reporta o mesmo número na segunda execução do dia.
    expect(segunda.jogosHoje).toBe(resumo.jogosHoje)
    expect(segunda.itensListaSecreta).toBe(resumo.itensListaSecreta)
    expect(segunda.apitosFireLive).toBe(resumo.apitosFireLive)
    expect(segunda.linhasComOdd).toBe(resumo.linhasComOdd)

    // A narrativa sobreviveu: republicar sem mudança de hash não regrava o
    // snapshot, e portanto não paga a LLM de novo.
    const feed = await lerFeed(banco.db, HOJE)
    expect(feed!.conteudo.itens.some((i) => i.narrativa)).toBe(true)
  }, 300_000)

  it('no dia seguinte o jogo ao vivo vira encerrado com box de jogo INTEIRO, e nasce outra rodada', async () => {
    /*
     * O CAMINHO QUE O CRON PERCORRE TODA NOITE. O jogo que estava AO_VIVO com
     * box PARCIAL do 1º quarto volta para a fila como dia incompleto: o box do
     * jogo inteiro tem de SUBSTITUIR o parcial (não somar, não duplicar, não
     * deixar linha fantasma), o status vira ENCERRADO, e o dia seguinte nasce
     * com uma rodada nova e um jogo novo ao vivo.
     */
    const aoVivo = (await jogosDoDia(HOJE)).find((j) => j.status === 'AO_VIVO')!
    const parcial = await banco.db
      .select()
      .from(estatisticasJogo)
      .where(eq(estatisticasJogo.jogoId, aoVivo.id))
    const minutosParciais = parcial.reduce((s, b) => s + Number(b.minutos), 0)

    const amanha = new Date(AGORA.getTime() + 24 * 60 * 60_000)
    const r = await simularAte(banco.db, ruleset, amanha, {
      diasDeHistorico: DIAS_HOJE,
      llm: new LLMFake(),
    })
    expect(r.diasProduzidos).toBe(1)
    // A lista de HOJE já tinha saído, na hora certa: não se republica.
    expect(r.publicacoes).toBe(0)

    const ontem = await jogosDoDia(HOJE)
    expect(ontem.every((j) => j.status === 'ENCERRADO' && j.placarCasa !== null)).toBe(true)

    const inteiro = await banco.db
      .select()
      .from(estatisticasJogo)
      .where(eq(estatisticasJogo.jogoId, aoVivo.id))
    // Sem duplicata: uma linha por jogador, e minutos de JOGO INTEIRO — a
    // faixa do nível (`MINUTOS_ALVO`), não a fração de quarto do parcial.
    expect(new Set(inteiro.map((b) => b.jogadorId)).size).toBe(inteiro.length)
    expect(
      inteiro.every(
        (b) =>
          Number(b.minutos) >= MINUTOS_ALVO.RANDOLA[0] && Number(b.minutos) <= MINUTOS_ALVO.MVP[1],
      ),
    ).toBe(true)
    expect(inteiro.reduce((s, b) => s + Number(b.minutos), 0)).toBeGreaterThan(minutosParciais * 2)
    // SUBSTITUIU, não somou: o box gravado é exatamente o que o gerador
    // produz para a chave da convenção, com os desfalques que o BANCO tem
    // (inclusive o forçado da OPD de hoje).
    const esperado = await boxEsperado(banco.db, HOJE, aoVivo)
    expect(inteiro.length).toBe(esperado.size)
    for (const b of inteiro) {
      const l = esperado.get(b.jogadorId)
      expect(l, `linha gravada sem origem no gerador (${b.jogadorId})`).toBeDefined()
      expect(b.pontos).toBe(l!.pontos)
      expect(Number(b.minutos)).toBeCloseTo(l!.minutos, 2)
    }

    const novoHoje = await jogosDoDia(somarDias(HOJE, 1))
    expect(novoHoje.filter((j) => j.status === 'AO_VIVO')).toHaveLength(1)
    expect(r.jogosHoje).toBe(novoHoje.length)
    expect(r.itensListaSecreta).toBeGreaterThan(0)
    expect(r.apitosFireLive).toBeGreaterThan(0)
    expect(await conferirHonestidade(banco.db)).toBeGreaterThan(0)
  }, 300_000)
})

/**
 * O box que o gerador produz para um jogo — reconstruído FORA do código que o
 * escreve, com os desfalques lidos do banco (o sorteio do dia mais o forçado
 * da OPD de hoje, que `desfalquesDoDia` sozinho não conhece).
 */
async function boxEsperado(
  db: Db,
  dia: string,
  jogo: typeof jogos.$inferSelect,
): Promise<Map<string, LinhaBox>> {
  const analise = lerListaDeNiveis(readFileSync(ARQUIVO_LISTA, 'utf8'))
  const elencos = elencosDaLista(analise.jogadores)
  const siglaPorId = new Map((await db.select().from(times)).map((t) => [t.id, t.sigla] as const))
  const idPorChave = new Map(
    (await db.select().from(mapaJogadores))
      .filter(
        (vinculo): vinculo is typeof vinculo & { jogadorId: string } =>
          vinculo.provedor === PROVEDOR_DEMO && vinculo.jogadorId !== null,
      )
      .map((vinculo) => [chaveDeNome(vinculo.nomeNaLista), vinculo.jogadorId] as const),
  )
  const timeDoJogador = new Map(
    (
      await db
        .select({ jogadorId: niveis.jogadorId, timeId: niveis.timeId })
        .from(niveis)
        .innerJoin(niveisVersao, eq(niveis.niveisVersaoId, niveisVersao.id))
        .where(and(eq(niveisVersao.ativa, true), eq(niveis.atributo, 'PONTOS')))
    ).map((l) => [l.jogadorId, l.timeId] as const),
  )
  const fora = new Set(
    (
      await db
        .select()
        .from(lesoesEscalacao)
        .where(and(eq(lesoesEscalacao.jogoId, jogo.id), eq(lesoesEscalacao.status, 'FORA')))
    ).map((l) => l.jogadorId),
  )

  const casa = siglaPorId.get(jogo.timeCasaId)!
  const visitante = siglaPorId.get(jogo.timeVisitanteId)!
  const esperado = new Map<string, LinhaBox>()
  for (const lado of ['casa', 'visitante'] as const) {
    const sigla = lado === 'casa' ? casa : visitante
    const timeId = lado === 'casa' ? jogo.timeCasaId : jogo.timeVisitanteId
    const elenco = elencos.get(sigla) ?? []
    const gerado = boxScoreDoTime({
      chave: `${SEMENTE_TEMPORADA}|${dia}|${casa}x${visitante}|${sigla}`,
      elenco,
      fora: elenco
        .filter((j) => fora.has(idPorChave.get(chaveDeNome(j.nome)) ?? ''))
        .map((j) => j.nome),
    })
    for (const l of gerado) {
      const jogadorId = idPorChave.get(chaveDeNome(l.nome))
      if (!jogadorId || timeDoJogador.get(jogadorId) !== timeId) continue
      esperado.set(jogadorId, l)
    }
  }
  return esperado
}

describe('simularAte — orçamento', () => {
  it('para entre dias, informa o que falta, e a chamada seguinte continua de onde parou', async () => {
    const banco = await bancoDeTeste()
    try {
      // 1 · Orçamento zerado: nenhum dia produzido, e o resumo diz quantos
      //     faltam. É a aritmética, e é determinística.
      const nenhum = await simularAte(banco.db, ruleset, AGORA, {
        diasDeHistorico: DIAS,
        orcamentoMs: 0,
      })
      expect(nenhum.diasProduzidos).toBe(0)
      expect(nenhum.diasRestantes).toBe(DIAS)
      expect(await banco.db.select().from(jogos)).toHaveLength(0)

      /*
       * 2 · O CORTE NO MEIO. O orçamento SOBE até cortar, em vez de ser
       *     previsto: qualquer número de milissegundos escolhido de antemão
       *     vale só nesta máquina neste instante — a suíte roda com trinta
       *     arquivos disputando CPU, e medir a carga inteira para dividir por
       *     dois foi o que falhou aqui (o cadastro frio da medição custa
       *     muito mais do que o cadastro morno da execução orçada).
       *
       *     Cada tentativa que não produz nada custa só o custo fixo, porque
       *     o orçamento estoura antes do primeiro dia. Dobrando, a primeira
       *     que atravessa o custo fixo compra um ou dois dias e para — que é
       *     exatamente o cenário do cron com `maxDuration` curto.
       */
      let orcamentoMs = 32
      let parcial = await simularAte(banco.db, ruleset, AGORA, {
        diasDeHistorico: DIAS,
        orcamentoMs,
      })
      while (parcial.diasProduzidos === 0 && orcamentoMs < 60_000) {
        orcamentoMs *= 2
        parcial = await simularAte(banco.db, ruleset, AGORA, { diasDeHistorico: DIAS, orcamentoMs })
      }
      expect(parcial.diasProduzidos).toBeGreaterThan(0)
      expect(parcial.diasRestantes).toBeGreaterThan(0)
      expect(parcial.diasProduzidos + parcial.diasRestantes).toBe(DIAS)
      // Só o que coube foi produzido; o resto do passado continua por fazer.
      const noCorte = await banco.db.select().from(jogos).where(lt(jogos.dataReferencia, HOJE))
      expect(new Set(noCorte.map((j) => j.dataReferencia)).size).toBe(parcial.diasProduzidos)
      // E o dia de HOJE não nasce com o passado pela metade: a lista de hoje
      // lê `medias_jogador`, e média com buraco não é a média que o motor
      // leria na véspera. Ele nasce na execução que fecha o passado.
      expect(
        await banco.db.select().from(jogos).where(eq(jogos.dataReferencia, HOJE)),
      ).toHaveLength(0)

      // 3 · A execução seguinte continua de onde parou.
      const completo = await simularAte(banco.db, ruleset, AGORA, { diasDeHistorico: DIAS })
      expect(completo.diasProduzidos).toBe(parcial.diasRestantes)
      expect(completo.diasRestantes).toBe(0)

      const passados = await banco.db.select().from(jogos).where(lt(jogos.dataReferencia, HOJE))
      expect(new Set(passados.map((j) => j.dataReferencia)).size).toBe(DIAS)
      expect(passados.every((j) => j.status === 'ENCERRADO')).toBe(true)
    } finally {
      await banco.fechar()
    }
  }, 600_000)
})

/**
 * O BANCO QUE JÁ TINHA JOGOS DE OUTRA ORIGEM — o caminho da TROCA de seed.
 *
 * Toda a suíte acima parte de banco vazio, e é por isso que ela não via nada
 * disto. Em produção a simulação estreia num banco que já rodou `semearDemo`:
 * há jogos ENCERRADOS nas datas da janela que o calendário da simulação não
 * marcou. São linhas de outra origem — não são a rodada da simulação, e não
 * podem nem bloquear a publicação das listas passadas nem condenar o dia a ser
 * refeito em toda execução do cron.
 */
describe('simularAte — banco que já tinha jogos de outra origem', () => {
  let banco: Awaited<ReturnType<typeof bancoDeTeste>>
  let primeira: Awaited<ReturnType<typeof simularAte>>
  const intrusos: string[] = []
  const dias: string[] = []

  beforeAll(async () => {
    banco = await bancoDeTeste()

    // Orçamento zero: semeia só o cadastro (times, jogadores, níveis) e não
    // produz dia nenhum. É o banco "antes da troca".
    const vazio = await simularAte(banco.db, ruleset, AGORA, {
      diasDeHistorico: DIAS,
      orcamentoMs: 0,
    })
    for (let d = vazio.inicio; d <= vazio.hoje; d = somarDias(d, 1)) dias.push(d)

    const listaTimes = await banco.db.select().from(times)
    const idPorSigla = new Map(listaTimes.map((t) => [t.sigla, t.id] as const))
    const calendario = gerarCalendario({
      siglas: listaTimes.map((t) => t.sigla),
      dias,
      semente: SEMENTE_TEMPORADA,
    })
    const ocupados = (dia: string) =>
      new Set((calendario.get(dia) ?? []).flatMap((j) => [j.casa, j.visitante]))

    for (const dia of dias) {
      // Dois times que a simulação NÃO escalou nem no dia nem na véspera — a
      // véspera entra porque um jogo das 22h30 de Brasília cai no dia UTC
      // seguinte, e `jogos` também é único por (data_jogo, casa, visitante).
      const escalados = [...ocupados(dia), ...ocupados(somarDias(dia, -1))]
      const folgados = listaTimes
        .map((t) => t.sigla)
        .filter((s) => !escalados.includes(s))
        .sort()
      const [casa, visitante] = folgados
      const [linha] = await banco.db
        .insert(jogos)
        .values({
          dataHoraUtc: new Date(`${dia}T23:00:00.000Z`),
          dataReferencia: dia,
          timeCasaId: idPorSigla.get(casa!)!,
          timeVisitanteId: idPorSigla.get(visitante!)!,
          status: 'ENCERRADO',
          placarCasa: 101,
          placarVisitante: 99,
        })
        .returning({ id: jogos.id })
      intrusos.push(linha!.id)
    }

    primeira = await simularAte(banco.db, ruleset, AGORA, { diasDeHistorico: DIAS })
  }, 300_000)
  afterAll(async () => {
    await banco.fechar()
  })

  it('publica a lista de cada dia passado — jogo alheio não é o passado da simulação', async () => {
    expect(intrusos).toHaveLength(DIAS + 1)
    expect(primeira.diasProduzidos).toBe(DIAS)
    // A guarda que impede publicar com o futuro dentro da média olha para os
    // jogos DA SIMULAÇÃO. Se ela olhasse para qualquer linha ENCERRADA da
    // janela, a temporada nasceria com centenas de jogos e nenhuma Lista
    // Secreta — o feed vazio, e a tela de Resultados sem green nem red.
    expect(primeira.publicacoes).toBe(DIAS)
    for (const dia of dias.filter((d) => d < primeira.hoje)) {
      const [snapshot] = await banco.db
        .select()
        .from(feedSnapshot)
        .where(
          and(eq(feedSnapshot.dataReferencia, dia), eq(feedSnapshot.estrategia, 'LISTA_SECRETA')),
        )
        .limit(1)
      expect(snapshot, `lista de ${dia}`).toBeDefined()
    }
  })

  it('o dia não fica pendente para sempre por causa dele', async () => {
    const box = async () =>
      (await banco.db.select().from(estatisticasJogo))
        .map((b) => `${b.jogoId}|${b.jogadorId}|${b.minutos}|${b.pontos}`)
        .sort()
    const antes = await box()

    const segunda = await simularAte(banco.db, ruleset, AGORA, { diasDeHistorico: DIAS })
    expect(segunda.diasProduzidos).toBe(0)
    expect(segunda.diasRestantes).toBe(0)
    // Nada foi reescrito: o box do passado é o mesmo, linha por linha.
    expect(await box()).toEqual(antes)
  }, 180_000)

  it('um dia cujos confrontos mudaram não passa por pronto', async () => {
    /*
     * "Pronto" é sobre QUAIS confrontos aconteceram, não sobre quantos. Contar
     * os prontos aprovaria um dia em que o calendário marcou A × B e o banco
     * tem B × A — mando trocado, chave do box trocada, temporada diferente da
     * que a semente promete. O dia volta para a fila e é refeito.
     */
    const dia = dias[0]!
    const doDia = await banco.db
      .select()
      .from(jogos)
      .where(and(eq(jogos.dataReferencia, dia), eq(jogos.status, 'ENCERRADO')))
    const alvo = doDia.find((j) => !intrusos.includes(j.id))!
    await banco.db
      .update(jogos)
      .set({ timeCasaId: alvo.timeVisitanteId, timeVisitanteId: alvo.timeCasaId })
      .where(eq(jogos.id, alvo.id))

    const terceira = await simularAte(banco.db, ruleset, AGORA, { diasDeHistorico: DIAS })
    expect(terceira.diasProduzidos).toBe(1)

    const depois = await banco.db.select().from(jogos).where(eq(jogos.dataReferencia, dia))
    const voltou = depois.find(
      (j) => j.timeCasaId === alvo.timeCasaId && j.timeVisitanteId === alvo.timeVisitanteId,
    )
    expect(voltou, 'o confronto do calendário voltou').toBeDefined()
    expect(voltou!.status).toBe('ENCERRADO')
    expect(voltou!.placarCasa).not.toBeNull()
  }, 180_000)

  it('não adota o jogo alheio: ele fica como estava, sem box e sem virar rodada', async () => {
    const linhas = await banco.db.select().from(jogos).where(inArray(jogos.id, intrusos))
    expect(linhas).toHaveLength(DIAS + 1)
    for (const j of linhas) {
      expect(j.placarCasa).toBe(101)
      expect(j.placarVisitante).toBe(99)
      expect(j.status).toBe('ENCERRADO')
    }
    const box = await banco.db
      .select()
      .from(estatisticasJogo)
      .where(inArray(estatisticasJogo.jogoId, intrusos))
    expect(box).toHaveLength(0)
  })
})

/**
 * A ABERTURA DA TEMPORADA (spec §1). A janela de 49 dias recua até antes de 1º
 * de outubro no começo da temporada; `recalcularMedias` respeita a fronteira e
 * ignoraria os jogos do outro lado, e a demo ficaria com box sem média. O
 * caminho de produção é este — a suíte acima roda com 5 dias em setembro, onde
 * a trava nunca chega a valer.
 */
describe('simularAte — a abertura da temporada', () => {
  it('a janela nunca começa antes do mês de início do ruleset', async () => {
    const banco = await bancoDeTeste()
    try {
      // Orçamento zero: só a aritmética da janela, sem produzir dia nenhum.
      // Sem `diasDeHistorico`, para que o padrão de produção (49) também conte.
      const resumo = await simularAte(banco.db, ruleset, new Date('2026-10-20T18:00:00.000Z'), {
        orcamentoMs: 0,
      })
      expect(resumo.hoje).toBe('2026-10-20')
      expect(resumo.inicio).toBe('2026-10-01')
      expect(resumo.diasRestantes).toBe(19)
      expect(await banco.db.select().from(jogos)).toHaveLength(0)
    } finally {
      await banco.fechar()
    }
  }, 120_000)
})

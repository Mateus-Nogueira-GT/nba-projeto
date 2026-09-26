import { createHash } from 'node:crypto'
import { eq, inArray } from 'drizzle-orm'

import {
  apitosRetroativos,
  feedRetroativo,
  greensRetroativos,
  jogadores,
  niveisVersao,
  times,
} from '../../dominio/db/schema'
import type { Db } from '../../dominio/db/tipos'
import { identidadesDeApresentacao } from '../../dominio/identidade-apresentacao'
import { montarFatosRetroativos } from '../../dominio/retroativo/fatos'
import { calendarioDoRuleset, temporadaDe, type ConfigTemporada } from '../../dominio/temporada'
import { avaliar, avaliarFireLive, type Green } from '../../motor'
import type { Ruleset } from '../../motor/ruleset/schema'
import type { Apito, NivelApito } from '../../motor/tipos'
import { datasDoPeriodo, type PeriodoBacktest } from '../backtest/executar'
import type { ConteudoFeed } from '../tipos-feed'
import { montarItensRetroativos, type IdentidadeItem } from './feed'
import { ehTemporadaAnterior } from './temporada'

/**
 * EXECUTOR DA TEMPORADA ANTERIOR (spec 25/09) — o motor de sempre, sem mudar
 * uma linha, rodado dia a dia sobre os fatos de uma temporada que já acabou.
 *
 * NUNCA PUSH — este módulo não importa `entrega/push` nem `entrega/fila`, e a
 * regra `retroativo-sem-push` do dependency-cruiser garante. Também nunca
 * grava em `apitos`, `greens` ou `feed_snapshot`: nada daqui foi publicado na
 * época, e o que vai para as tabelas do app ao vivo vira push, Placar e
 * histórico de assinante (decisão 5).
 *
 * Cada dia é APAGAR E REGRAVAR numa transação. É isso que faz a troca da lista
 * do CJ regravar o dia com a versão nova em vez de somar a ela, e o que torna
 * reexecutar seguro: o resultado depende só dos fatos e do ruleset.
 */

export type ResultadoDiaRetroativo = { apitos: number; greens: number; jogos: number }

const ZERADO: ResultadoDiaRetroativo = { apitos: 0, greens: 0, jogos: 0 }

/** Mesmo recorte de `publicarListaSecreta`: o item inteiro, sem o horário de geração. */
function hashDe(conteudo: ConteudoFeed): string {
  return createHash('sha256').update(JSON.stringify(conteudo.itens)).digest('hex').slice(0, 16)
}

/** O rótulo da temporada de um dia — meio-dia UTC, para não depender do fuso de quem roda. */
function temporadaDoDia(dataReferencia: string, calendario: ConfigTemporada): string {
  return temporadaDe(new Date(`${dataReferencia}T12:00:00Z`), calendario)
}

function recusarTemporadaDoCalendario(temporada: string, doCalendario: string): void {
  if (temporada === doCalendario) {
    throw new Error(
      `motor:retroativo só roda em temporada anterior — a temporada do calendário (${doCalendario}) ` +
        'é publicada pelo job diário',
    )
  }
  // Uma temporada FUTURA ainda não aconteceu: não há o que reproduzir.
  if (!ehTemporadaAnterior(temporada, doCalendario)) {
    throw new Error(
      `motor:retroativo só roda em temporada anterior — ${temporada} é posterior à do calendário (${doCalendario})`,
    )
  }
}

/**
 * A temporada de um intervalo do `motor:retroativo`: o intervalo INTEIRO tem
 * de ser uma temporada só, e anterior à do calendário. Como uma temporada é
 * um trecho contínuo do calendário, as duas pontas na mesma temporada
 * garantem que todo dia do meio também está nela.
 */
export function temporadaDoIntervalo(
  de: string,
  ate: string,
  calendario: ConfigTemporada,
  agora: Date,
): string {
  const temporadaDe_ = temporadaDoDia(de, calendario)
  const temporadaAte = temporadaDoDia(ate, calendario)
  if (temporadaDe_ !== temporadaAte) {
    throw new Error(
      `motor:retroativo roda uma temporada só por vez — --de é de ${temporadaDe_} e --ate é de ${temporadaAte}`,
    )
  }
  recusarTemporadaDoCalendario(temporadaDe_, temporadaDe(agora, calendario))
  return temporadaDe_
}

export async function executarDiaRetroativo(
  db: Db,
  ruleset: Ruleset,
  dataReferencia: string,
  opcoes: { agora?: Date } = {},
): Promise<ResultadoDiaRetroativo> {
  const calendario = calendarioDoRuleset(ruleset)
  const temporada = temporadaDoDia(dataReferencia, calendario)
  // Defesa em profundidade, além do script: um dia da temporada do calendário
  // nunca vai para as tabelas retroativas — é da temporada paga, publicada
  // ao vivo. O relógio entra como opção para o teste poder fixá-lo.
  recusarTemporadaDoCalendario(temporada, temporadaDe(opcoes.agora ?? new Date(), calendario))

  const { niveisVersaoId, ...fatos } = await montarFatosRetroativos(db, dataReferencia, {
    calendario,
    janela: ruleset.media.janela,
    // O quarto sai do ruleset, nunca de um literal: "Fire Live é só 1º quarto"
    // é regra do yaml.
    quartoFireLive: ruleset.fire_live.quarto,
  })
  if (niveisVersaoId === null || fatos.jogos.length === 0) return ZERADO

  // Lista Secreta e Fire Live — o mesmo `avaliar` do backtest.
  const apitos = avaliar(fatos, ruleset)

  // Greens: o Fire Live com a OPD da Lista do próprio dia, como o ao vivo
  // recebe a OPD publicada.
  const timesPorId = new Map(fatos.times.map((t) => [t.id, t] as const))
  const greens: Green[] = []
  for (const jogo of fatos.jogos) {
    const opdPreLive = new Map<string, NivelApito>(
      apitos
        .filter(
          (a) => a.jogoId === jogo.id && a.estrategia === 'LISTA_SECRETA' && a.metodo === 'OPD',
        )
        .map((a) => [a.jogadorId, a.nivelApito] as const),
    )
    for (const timeId of [jogo.timeCasaId, jogo.timeVisitanteId]) {
      const time = timesPorId.get(timeId)
      if (!time) continue
      greens.push(...avaliarFireLive(time, jogo, ruleset, { opdPreLive }).greens)
    }
  }

  const daLista = apitos.filter((a) => a.estrategia === 'LISTA_SECRETA')
  const [versao, nomes] = await Promise.all([
    db
      .select({ versao: niveisVersao.versao })
      .from(niveisVersao)
      .where(eq(niveisVersao.id, niveisVersaoId))
      .then((r) => r[0]),
    identidadesDoDia(db, daLista, fatos.times),
  ])

  const rulesetVersao = `v${ruleset.version}`
  const conteudo: ConteudoFeed = {
    dataReferencia,
    geradoEm: new Date().toISOString(),
    rulesetVersao: versao ? `${rulesetVersao}+${versao.versao}` : rulesetVersao,
    itens: montarItensRetroativos(daLista, fatos, nomes, ruleset),
  }

  await db.transaction(async (tx) => {
    await tx.delete(apitosRetroativos).where(eq(apitosRetroativos.dataReferencia, dataReferencia))
    await tx.delete(greensRetroativos).where(eq(greensRetroativos.dataReferencia, dataReferencia))
    await tx.delete(feedRetroativo).where(eq(feedRetroativo.dataReferencia, dataReferencia))

    if (apitos.length > 0) {
      await tx
        .insert(apitosRetroativos)
        .values(
          apitos.map((a) =>
            linhaDeApito(a, { temporada, dataReferencia, niveisVersaoId, rulesetVersao }),
          ),
        )
    }
    if (greens.length > 0) {
      await tx.insert(greensRetroativos).values(
        greens.map((g) => ({
          temporada,
          dataReferencia,
          jogoId: g.jogoId,
          jogadorId: g.jogadorId,
          atributo: g.atributo,
          nivelJogador: g.nivelJogador,
          marco: g.marco,
          valor: g.valor,
        })),
      )
    }
    await tx.insert(feedRetroativo).values({
      temporada,
      dataReferencia,
      niveisVersaoId,
      conteudoJson: conteudo,
      hash: hashDe(conteudo),
    })
  })

  return { apitos: apitos.length, greens: greens.length, jogos: fatos.jogos.length }
}

function linhaDeApito(
  a: Apito,
  dia: { temporada: string; dataReferencia: string; niveisVersaoId: string; rulesetVersao: string },
) {
  return {
    ...dia,
    jogoId: a.jogoId,
    jogadorId: a.jogadorId,
    atributo: a.atributo,
    estrategia: a.estrategia,
    metodo: a.metodo,
    nivelJogador: a.nivelJogador,
    nivelApito: a.nivelApito,
    turbo: a.turbo,
    modoFire: a.modoFire,
    opdOrigemNivel: a.opdOrigemNivel,
    linha: a.linha,
    confianca: a.confianca === null ? null : String(a.confianca),
    alvo1q: a.alvo1Q,
  }
}

/**
 * Nome, foto, posição e TIME DO DIA de cada apitado. O time é o `TimeFato`
 * que contém o jogador — o que ele jogou naquela data —, nunca o vínculo da
 * lista do CJ, que é o de hoje.
 */
async function identidadesDoDia(
  db: Db,
  apitos: Apito[],
  timesDoDia: { id: string; jogadores: { id: string }[] }[],
): Promise<Map<string, IdentidadeItem>> {
  const ids = [...new Set(apitos.map((a) => a.jogadorId))]
  if (ids.length === 0) return new Map()

  const timeDoJogador = new Map<string, string>()
  for (const t of timesDoDia) for (const j of t.jogadores) timeDoJogador.set(j.id, t.id)
  const idsTime = [...new Set(ids.flatMap((id) => timeDoJogador.get(id) ?? []))]

  const [elenco, listaTimes, identidades] = await Promise.all([
    db.select().from(jogadores).where(inArray(jogadores.id, ids)),
    idsTime.length > 0
      ? db.select().from(times).where(inArray(times.id, idsTime))
      : Promise.resolve([]),
    identidadesDeApresentacao(db, ids),
  ])
  const timePorId = new Map(listaTimes.map((t) => [t.id, t] as const))

  return new Map(
    elenco.map((j) => {
      const time = timePorId.get(timeDoJogador.get(j.id) ?? '')
      return [
        j.id,
        {
          nome: identidades.get(j.id)?.nome ?? j.nomeCompleto,
          fotoUrl: j.fotoUrl,
          timeSigla: time?.sigla ?? '—',
          timeNome: time?.nome ?? '—',
          posicao: j.posicao,
        },
      ] as const
    }),
  )
}

/**
 * A temporada inteira (ou um trecho), dia a dia, somando os contadores.
 * `aoConcluirDia` existe para o script dar progresso — são ~200 dias.
 */
export async function executarTemporadaRetroativa(
  db: Db,
  ruleset: Ruleset,
  opcoes: PeriodoBacktest & {
    aoConcluirDia?: (data: string, resultado: ResultadoDiaRetroativo) => void | Promise<void>
    agora?: Date
  },
): Promise<ResultadoDiaRetroativo> {
  const agora = opcoes.agora ?? new Date()
  // Antes do primeiro dia: um intervalo inválido não grava metade da temporada.
  temporadaDoIntervalo(opcoes.de, opcoes.ate, calendarioDoRuleset(ruleset), agora)
  const total = { ...ZERADO }
  for (const data of datasDoPeriodo({ de: opcoes.de, ate: opcoes.ate })) {
    const r = await executarDiaRetroativo(db, ruleset, data, { agora })
    total.apitos += r.apitos
    total.greens += r.greens
    total.jogos += r.jogos
    await opcoes.aoConcluirDia?.(data, r)
  }
  return total
}

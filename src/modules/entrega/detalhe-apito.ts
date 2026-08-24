import { and, desc, eq, inArray, lt } from 'drizzle-orm'

import {
  estatisticasJogo,
  jogadores,
  jogos,
  lesoesEscalacao,
  mediasJogador,
  niveis,
  niveisVersao,
  times,
} from '../dominio/db/schema'
import type { Db } from '../dominio/db/tipos'
import { calendarioDoRuleset, temporadaDe } from '../dominio/temporada'
import { deltaOscilacao } from '../motor/atributos'
import type { Ruleset } from '../motor/ruleset/schema'
import type { Atributo } from '../motor/tipos'
import type { ItemFeed } from './lista-secreta'

export type BlocoJogo = { adversarioSigla: string; valor: number; bateu: boolean }

export type DetalheApito = {
  mediaTemporada: number | null
  bateu: { acertos: number; total: number }
  minutosRecentes: number | null
  blocos: BlocoJogo[]
  porQueEntrou: string[]
}

const UNIDADE: Record<Atributo, string> = {
  PONTOS: 'pontos',
  REBOTES: 'rebotes',
  ASSISTENCIAS: 'assistências',
}

/** Número no padrão pt-BR: vírgula decimal, uma casa. */
function fmt(n: number): string {
  return n.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })
}

function colunaMedia(row: typeof mediasJogador.$inferSelect, atributo: Atributo): string | null {
  switch (atributo) {
    case 'PONTOS':
      return row.ppg
    case 'REBOTES':
      return row.rpg
    case 'ASSISTENCIAS':
      return row.apg
  }
}

function valorHistorico(
  row: { pontos: number; rebotesTotal: number; assistencias: number },
  atributo: Atributo,
): number {
  switch (atributo) {
    case 'PONTOS':
      return row.pontos
    case 'REBOTES':
      return row.rebotesTotal
    case 'ASSISTENCIAS':
      return row.assistencias
  }
}

// Leitura DERIVADA: descreve o que o motor já decidiu, não decide nada novo.
// Por isso vive na entrega e não no motor — nenhuma regra nova nasce aqui.
export async function detalheDoApito(
  db: Db,
  ruleset: Ruleset,
  item: ItemFeed,
): Promise<DetalheApito> {
  // 1º passo obrigatório: buscar o jogo do item — dele saem a data (para a
  // temporada e para recortar o histórico) e os dois times (para o adversário).
  const [jogo] = await db.select().from(jogos).where(eq(jogos.id, item.jogoId)).limit(1)
  if (!jogo) {
    throw new Error(`detalheDoApito: jogo não encontrado para o item ${item.chave}`)
  }

  const temporada = temporadaDe(jogo.dataHoraUtc, calendarioDoRuleset(ruleset))

  // 1 · Média da TEMPORADA — a que o motor usou para decidir, não "5 jogos".
  const [mediaRow] = await db
    .select()
    .from(mediasJogador)
    .where(
      and(
        eq(mediasJogador.jogadorId, item.jogadorId),
        eq(mediasJogador.janela, 'TEMPORADA'),
        eq(mediasJogador.temporada, temporada),
      ),
    )
    .limit(1)

  const valorMedia = mediaRow ? colunaMedia(mediaRow, item.atributo) : null
  const mediaTemporada = valorMedia !== null ? Number(valorMedia) : null

  // 2 · Últimos 5 jogos anteriores ao jogo do item, do mais recente pro mais antigo.
  const historico = await db
    .select({
      pontos: estatisticasJogo.pontos,
      rebotesTotal: estatisticasJogo.rebotesTotal,
      assistencias: estatisticasJogo.assistencias,
      minutos: estatisticasJogo.minutos,
      dataHoraUtc: jogos.dataHoraUtc,
      timeCasaId: jogos.timeCasaId,
      timeVisitanteId: jogos.timeVisitanteId,
    })
    .from(estatisticasJogo)
    .innerJoin(jogos, eq(estatisticasJogo.jogoId, jogos.id))
    .where(and(eq(estatisticasJogo.jogadorId, item.jogadorId), lt(jogos.dataHoraUtc, jogo.dataHoraUtc)))
    .orderBy(desc(jogos.dataHoraUtc))
    .limit(5)

  const minutosRecentes = historico[0]?.minutos != null ? Number(historico[0].minutos) : null

  // 3 · Time do jogador vem de `niveis` (versão ativa) — a curadoria do CJ,
  //     nunca `jogadores.time_id`. Os elencos são projetados: usar o time real
  //     do provedor diria que o jogador enfrentou um adversário contra o qual
  //     ele nunca jogou nesta plataforma.
  const [versaoAtiva] = await db.select().from(niveisVersao).where(eq(niveisVersao.ativa, true)).limit(1)
  const [vinculo] = versaoAtiva
    ? await db
        .select()
        .from(niveis)
        .where(and(eq(niveis.niveisVersaoId, versaoAtiva.id), eq(niveis.jogadorId, item.jogadorId)))
        .limit(1)
    : []
  const timeDoJogadorId = vinculo?.timeId ?? null

  const idsTimes = new Set<string>()
  for (const h of historico) {
    idsTimes.add(h.timeCasaId)
    idsTimes.add(h.timeVisitanteId)
  }
  const listaTimes =
    idsTimes.size > 0 ? await db.select().from(times).where(inArray(times.id, [...idsTimes])) : []
  const timePorId = new Map(listaTimes.map((t) => [t.id, t] as const))

  // 4 · Blocos: valor conferido contra a linha (Lista Secreta) ou o alvo do 1Q
  //     (Fire Live, que não tem linha). Mais antigo primeiro na saída.
  //     Sem linha e sem alvo não há o que conferir — não é "0 de 5", é nada.
  const linhaOuAlvo = item.linha ?? item.alvo1Q
  const blocosRecenteParaAntigo: BlocoJogo[] = historico.map((h) => {
    const valor = valorHistorico(h, item.atributo)
    const adversarioId = timeDoJogadorId === h.timeCasaId ? h.timeVisitanteId : h.timeCasaId
    return {
      adversarioSigla: timePorId.get(adversarioId)?.sigla ?? '—',
      valor,
      bateu: linhaOuAlvo !== null && valor >= linhaOuAlvo,
    }
  })
  const blocos = [...blocosRecenteParaAntigo].reverse()

  const bateu =
    linhaOuAlvo === null
      ? { acertos: 0, total: 0 }
      : {
          acertos: blocosRecenteParaAntigo.filter((b) => b.bateu).length,
          total: blocosRecenteParaAntigo.length,
        }

  // 5 · O porquê — nomeia a regra que disparou, não uma frase genérica.
  const porQueEntrou = await construirPorque(db, ruleset, item, mediaTemporada, historico)

  return { mediaTemporada, bateu, minutosRecentes, blocos, porQueEntrou }
}

async function construirPorque(
  db: Db,
  ruleset: Ruleset,
  item: ItemFeed,
  mediaTemporada: number | null,
  historico: { pontos: number; rebotesTotal: number; assistencias: number }[],
): Promise<string[]> {
  if (item.metodo === 'OSCILACAO') {
    const delta = deltaOscilacao(item.nivelJogador, item.atributo, item.jogadorId, ruleset)
    if (mediaTemporada === null || delta === undefined) return []

    const limiar = mediaTemporada - delta
    let n = 0
    for (const h of historico) {
      if (valorHistorico(h, item.atributo) <= limiar) n++
      else break
    }

    const unidade = UNIDADE[item.atributo]
    return [
      `◆ ${n} jogo${n === 1 ? '' : 's'} seguido${n === 1 ? '' : 's'} abaixo de ${fmt(limiar)} ${unidade}.`,
      `Média da temporada: ${fmt(mediaTemporada)}.`,
    ]
  }

  if (item.metodo === 'OPD') {
    const fora = await db
      .select({ nome: jogadores.nomeCompleto })
      .from(lesoesEscalacao)
      .innerJoin(jogadores, eq(lesoesEscalacao.jogadorId, jogadores.id))
      .where(and(eq(lesoesEscalacao.jogoId, item.jogoId), eq(lesoesEscalacao.status, 'FORA')))

    const nomes = fora.map((f) => f.nome)
    if (nomes.length === 0) return []
    return [`◆ ${nomes.join(', ')} fora da partida — oportunidade nível ${item.opdOrigemNivel} pela hierarquia do time.`]
  }

  // metodo null = Fire Live: não nasce de oscilação nem de OPD.
  return [`◆ Cruzou o alvo do 1º quarto (${item.alvo1Q}).`]
}

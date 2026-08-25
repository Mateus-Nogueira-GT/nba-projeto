import { and, asc, eq, inArray } from 'drizzle-orm'

import {
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
import { colunaMedia, jogosRecentes, valorDoJogo } from './historico-na-linha'
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

  // 2 · Últimos 5 jogos anteriores ao do item — a consulta COMPARTILHADA com a
  //     materialização do feed (historico-na-linha.ts): card e detalhe nunca
  //     discordam sobre o que aconteceu nos últimos 5.
  const historico = await jogosRecentes(db, item.jogadorId, jogo.dataHoraUtc, 5)

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
    const valor = valorDoJogo(h, item.atributo)
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
  const porQueEntrou = await construirPorque(db, ruleset, item, mediaTemporada, historico, {
    timeDoJogadorId,
    niveisVersaoId: versaoAtiva?.id ?? null,
  })

  return { mediaTemporada, bateu, minutosRecentes, blocos, porQueEntrou }
}

async function construirPorque(
  db: Db,
  ruleset: Ruleset,
  item: ItemFeed,
  mediaTemporada: number | null,
  historico: { pontos: number; rebotesTotal: number; assistencias: number }[],
  /** Time e versão de níveis do apitado — a OPD só existe dentro deles. */
  contexto: { timeDoJogadorId: string | null; niveisVersaoId: string | null },
): Promise<string[]> {
  if (item.metodo === 'OSCILACAO') {
    const delta = deltaOscilacao(item.nivelJogador, item.atributo, item.jogadorId, ruleset)
    if (mediaTemporada === null || delta === undefined) return []

    const limiar = mediaTemporada - delta
    let n = 0
    for (const h of historico) {
      if (valorDoJogo(h, item.atributo) <= limiar) n++
      else break
    }

    const unidade = UNIDADE[item.atributo]
    return [
      `◆ ${n} jogo${n === 1 ? '' : 's'} seguido${n === 1 ? '' : 's'} abaixo de ${fmt(limiar)} ${unidade}.`,
      `Média da temporada: ${fmt(mediaTemporada)}.`,
    ]
  }

  if (item.metodo === 'OPD') {
    // A OPD trabalha sobre a hierarquia do PRÓPRIO time do apitado, e só o
    // PREFIXO contíguo de desfalques a partir do topo abre a regra (motor/
    // lista-secreta/opd.ts). Listar todo mundo que está FORA da partida
    // nomearia jogadores do adversário e desfalques que não participam de
    // nada — o assinante leria uma justificativa que não é a dele.
    if (contexto.timeDoJogadorId === null || contexto.niveisVersaoId === null) return []

    const hierarquia = await db
      .select({ jogadorId: niveis.jogadorId, nome: jogadores.nomeCompleto })
      .from(niveis)
      .innerJoin(jogadores, eq(niveis.jogadorId, jogadores.id))
      .where(
        and(
          eq(niveis.niveisVersaoId, contexto.niveisVersaoId),
          eq(niveis.timeId, contexto.timeDoJogadorId),
          eq(niveis.atributo, item.atributo),
        ),
      )
      .orderBy(asc(niveis.posicaoHierarquia))

    const desfalcados = new Set(
      (
        await db
          .select({ jogadorId: lesoesEscalacao.jogadorId })
          .from(lesoesEscalacao)
          .where(and(eq(lesoesEscalacao.jogoId, item.jogoId), eq(lesoesEscalacao.status, 'FORA')))
      ).map((l) => l.jogadorId),
    )

    // Mesmo laço do motor: para no primeiro que NÃO está fora.
    const nomes: string[] = []
    for (const j of hierarquia) {
      if (!desfalcados.has(j.jogadorId)) break
      nomes.push(j.nome)
    }

    if (nomes.length === 0) return []
    return [`◆ ${nomes.join(', ')} fora da partida — oportunidade nível ${item.opdOrigemNivel} pela hierarquia do time.`]
  }

  // metodo null = Fire Live: não nasce de oscilação nem de OPD.
  return [`◆ Cruzou o alvo do 1º quarto (${item.alvo1Q}).`]
}

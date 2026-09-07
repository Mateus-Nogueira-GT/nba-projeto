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
import type { Atributo, Nivel } from '../motor/tipos'
import { colunaMedia, jogosRecentes, valorDoJogo } from './historico-na-linha'
import type { ItemFeed } from './lista-secreta'

export type BlocoJogo = { adversarioSigla: string; valor: number; bateu: boolean }

/**
 * Um fator do "por que entrou" — identidade 04. Ordem FIXA na tela: nível do
 * jogador, depois o método com o FATO que o sustenta, depois modo fire e turbo
 * quando houver, e o nível do apito por último. Cada texto cita o fato (os
 * jogos abaixo, com os valores; quem do topo está fora), nunca o peso do
 * ruleset: mostrar a fórmula expõe o CJ e faz o % parecer soma de
 * probabilidades. A narrativa da LLM é legenda desta lista, não substituto.
 */
export type Fator = {
  chave: 'NIVEL' | 'OSCILACAO' | 'OPD' | 'FIRE_LIVE' | 'MODO_FIRE' | 'TURBO' | 'NIVEL_APITO'
  titulo: string
  texto: string
}

export type DetalheApito = {
  mediaTemporada: number | null
  bateu: { acertos: number; total: number }
  minutosRecentes: number | null
  blocos: BlocoJogo[]
  /** O texto plano de sempre — derivado dos fatores do método. */
  porQueEntrou: string[]
  /** Os fatores estruturados (identidade 04). */
  fatores: Fator[]
}

export type OpcoesDetalhe = {
  /** Quantos jogos entram nos blocos e na conferência. Padrão 5 (o card); o detalhe da 04 pede 10. */
  blocos?: number
}

const UNIDADE: Record<Atributo, string> = {
  PONTOS: 'pontos',
  REBOTES: 'rebotes',
  ASSISTENCIAS: 'assistências',
}

const ROTULO_NIVEL: Record<Nivel, string> = {
  MVP: 'MVP',
  ALL_STAR: 'All Star',
  SUPORTE: 'Suporte',
  RANDOLA: 'Randola',
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
  opcoes: OpcoesDetalhe = {},
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
  const historico = await jogosRecentes(db, item.jogadorId, jogo.dataHoraUtc, opcoes.blocos ?? 5)

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

  // 5 · O porquê — nomeia a regra que disparou, não uma frase genérica. Os
  //     FATOS são levantados uma vez; deles saem o texto plano (o de sempre) e
  //     os fatores estruturados da identidade 04.
  const fatos = await fatosDoPorque(db, ruleset, item, mediaTemporada, historico, {
    timeDoJogadorId,
    niveisVersaoId: versaoAtiva?.id ?? null,
  })
  const porQueEntrou = textoPlano(item, fatos)
  const fatores = montarFatores(item, fatos)

  return { mediaTemporada, bateu, minutosRecentes, blocos, porQueEntrou, fatores }
}

type FatosDoPorque = {
  /** Oscilação: quantos jogos seguidos abaixo, o limiar, a média e os valores desses jogos. */
  oscilacao: { n: number; limiar: number; media: number; valores: number[] } | null
  /** OPD: o prefixo da hierarquia que está fora, do topo para baixo. */
  opd: { nomes: string[] } | null
}

async function fatosDoPorque(
  db: Db,
  ruleset: Ruleset,
  item: ItemFeed,
  mediaTemporada: number | null,
  historico: { pontos: number; rebotesTotal: number; assistencias: number }[],
  /** Time e versão de níveis do apitado — a OPD só existe dentro deles. */
  contexto: { timeDoJogadorId: string | null; niveisVersaoId: string | null },
): Promise<FatosDoPorque> {
  const fatos: FatosDoPorque = { oscilacao: null, opd: null }

  if (item.metodo === 'OSCILACAO') {
    const delta = deltaOscilacao(item.nivelJogador, item.atributo, item.jogadorId, ruleset)
    if (mediaTemporada !== null && delta !== undefined) {
      const limiar = mediaTemporada - delta
      const valores: number[] = []
      for (const h of historico) {
        const v = valorDoJogo(h, item.atributo)
        if (v <= limiar) valores.push(v)
        else break
      }
      fatos.oscilacao = { n: valores.length, limiar, media: mediaTemporada, valores }
    }
  }

  if (item.metodo === 'OPD' && contexto.timeDoJogadorId !== null && contexto.niveisVersaoId !== null) {
    // A OPD trabalha sobre a hierarquia do PRÓPRIO time do apitado, e só o
    // PREFIXO contíguo de desfalques a partir do topo abre a regra (motor/
    // lista-secreta/opd.ts). Listar todo mundo que está FORA da partida
    // nomearia jogadores do adversário e desfalques que não participam de
    // nada — o assinante leria uma justificativa que não é a dele.
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
    fatos.opd = { nomes }
  }

  return fatos
}

/** O texto plano que a tela e o chat já leem — inalterado na forma. */
function textoPlano(item: ItemFeed, fatos: FatosDoPorque): string[] {
  if (item.metodo === 'OSCILACAO') {
    if (!fatos.oscilacao) return []
    const { n, limiar, media } = fatos.oscilacao
    const unidade = UNIDADE[item.atributo]
    return [
      `◆ ${n} jogo${n === 1 ? '' : 's'} seguido${n === 1 ? '' : 's'} abaixo de ${fmt(limiar)} ${unidade}.`,
      `Média da temporada: ${fmt(media)}.`,
    ]
  }
  if (item.metodo === 'OPD') {
    if (!fatos.opd || fatos.opd.nomes.length === 0) return []
    return [`◆ ${fatos.opd.nomes.join(', ')} fora da partida — oportunidade nível ${item.opdOrigemNivel} pela hierarquia do time.`]
  }
  // metodo null = Fire Live: não nasce de oscilação nem de OPD.
  return [`◆ Cruzou o alvo do 1º quarto (${item.alvo1Q}).`]
}

/**
 * Os fatores da identidade 04, em ordem fixa. Só fatos, nunca pesos: nada de
 * bônus de nível, de "+N do turbo" nem de percentual — o % já está no card e
 * o ruleset é do CJ.
 */
function montarFatores(item: ItemFeed, fatos: FatosDoPorque): Fator[] {
  const unidade = UNIDADE[item.atributo]
  const fatores: Fator[] = [
    {
      chave: 'NIVEL',
      titulo: 'Nível',
      texto: `${ROTULO_NIVEL[item.nivelJogador]} em ${unidade} na lista do CJ.`,
    },
  ]

  if (item.metodo === 'OSCILACAO' && fatos.oscilacao) {
    const { n, limiar, media, valores } = fatos.oscilacao
    const lista = valores.map((v) => String(v)).join(', ')
    fatores.push({
      chave: 'OSCILACAO',
      titulo: 'Oscilação',
      texto:
        n === 0
          ? `Média da temporada: ${fmt(media)} ${unidade}.`
          : `${n} jogo${n === 1 ? '' : 's'} seguido${n === 1 ? '' : 's'} abaixo de ${fmt(limiar)} ${unidade}: ${lista}. A média da temporada é ${fmt(media)}.`,
    })
  }

  if (item.metodo === 'OPD' && fatos.opd && fatos.opd.nomes.length > 0) {
    const { nomes } = fatos.opd
    fatores.push({
      chave: 'OPD',
      titulo: 'Desfalque',
      texto: `${nomes.join(', ')} fora da partida — o topo da hierarquia do time abre volume de jogo para quem vem logo abaixo.`,
    })
  }

  if (item.metodo === null && item.alvo1Q !== null) {
    fatores.push({
      chave: 'FIRE_LIVE',
      titulo: '1º quarto',
      texto: `Cruzou o alvo do 1º quarto: ${item.alvo1Q} ${unidade}.`,
    })
  }

  if (item.modoFire) {
    fatores.push({
      chave: 'MODO_FIRE',
      titulo: 'Modo fire',
      texto: 'Do bloco de topo do time e já na fatia da média que o ruleset define para o 1º quarto.',
    })
  }

  if (item.turbo) {
    fatores.push({
      chave: 'TURBO',
      titulo: 'Turbo',
      texto: 'Oscilação e desfalque se reforçam no mesmo jogador — o destaque que atravessa os dois métodos.',
    })
  }

  fatores.push({
    chave: 'NIVEL_APITO',
    titulo: 'Nível do apito',
    texto: textoDoNivelDoApito(item, fatos),
  })

  return fatores
}

function textoDoNivelDoApito(item: ItemFeed, fatos: FatosDoPorque): string {
  const n = `N${item.nivelApito}`
  if (item.metodo === 'OSCILACAO' && fatos.oscilacao) {
    const seguidos =
      fatos.oscilacao.n >= 3 ? 'três ou mais jogos abaixo' : fatos.oscilacao.n === 2 ? 'dois jogos abaixo' : 'um jogo abaixo'
    const cerca =
      item.nivelJogador === 'SUPORTE' || item.nivelJogador === 'RANDOLA'
        ? ` ${ROTULO_NIVEL[item.nivelJogador]} não apita em N1.`
        : ''
    return `${n} — ${seguidos}.${cerca}`
  }
  if (item.metodo === 'OPD') {
    return `${n} — pela posição do desfalque na hierarquia do time.`
  }
  return `${n} — o sinal do 1º quarto.`
}

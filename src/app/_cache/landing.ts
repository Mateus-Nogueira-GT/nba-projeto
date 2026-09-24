import { unstable_cache } from 'next/cache'

import { getDb } from '@/modules/dominio/db/cliente'
import { somarDias } from '@/modules/dominio/rodada'
import { agruparPorJogador, lerFeed } from '@/modules/entrega/lista-secreta'
import { recapDaNoite, ultimaRodadaConferida } from '@/modules/entrega/resultados'
import type { Atributo, Nivel } from '@/modules/motor/tipos'

import { TAG_FEED, tagDoFeed } from './feed'
import { TAG_LATERAL } from './lateral'

/**
 * A VITRINE DA LANDING, UMA VEZ POR HORA — e SEM NADA PAGO DE HOJE.
 *
 * `/conheca` é pública, sem login, e é a página que mais gente abre sem ter
 * conta. O v2 a montava com o feed pago de hoje (`lerFeed`), o Fire Live ao
 * vivo e o plano de banca do dia — tudo que o portão de nível protege no app.
 * A decisão D2 (23/09) fecha isso: a landing mostra a última noite
 * CONFERIDA (só quem bateu, com o placar do jogo), que é dado que Resultados
 * já abre a todo nível, e de hoje UM número — quantos apitos há.
 *
 * O recorte é feito AQUI, antes do cache, e não na tela: o que sai desta
 * função é o máximo que a landing pode dizer. Nenhum `jogadorId` (a tela não
 * tem link de apito para dar), nenhum item, linha ou odd de hoje.
 *
 * O valor guardado não tem `Date` (o recap traz datas em `porJogo` e em
 * `atualizacao`, que a vitrine não mostra): o que atravessa o JSON do
 * `unstable_cache` volta igual, sem reidratação — mesma doutrina de
 * `rodada.ts`.
 *
 * Três tags: a da lateral (os crons que fecham a rodada), a do feed e a do
 * feed DO DIA (a publicação da Lista muda o número de hoje). A tag por data
 * obriga a construir o wrapper por chamada, como em `feed.ts`.
 */
export type AcertoDaVitrine = {
  /** Só para a lista do React: `nome|atributo|posição` — sem id nenhum. */
  chave: string
  nome: string
  fotoUrl: string | null
  timeSigla: string
  atributo: Atributo
  nivelJogador: Nivel
  nivelApito: number
  turbo: boolean
  /** A linha MAIS BAIXA que a lista ofereceu — a que o card confere. */
  linha: number
  fez: number
  confianca: number | null
  /** A faixa da nota, para a pílula de confiança; null sem nota ou fora das faixas. */
  grau: 1 | 2 | 3 | 4 | 5 | null
  placar: { visitanteSigla: string; casaSigla: string; placarVisitante: number | null; placarCasa: number | null }
}

export type NoiteDaVitrine = {
  dataReferencia: string
  bateram: number
  conferidos: number
  taxa: number | null
  /** Só quem bateu, do mais forte ao menos forte, no máximo `ACERTOS_NA_VITRINE`. */
  acertos: AcertoDaVitrine[]
}

export type VitrineDaLanding = {
  /** null sem noite conferida (temporada recém-começada ou hiato). */
  noite: NoiteDaVitrine | null
  /** Um card por jogador e atributo, como a Lista conta. 0 sem lista publicada. */
  totalDeApitosHoje: number
}

/** A landing mostra poucos; guardar a noite inteira seria pagar por nada. */
const ACERTOS_NA_VITRINE = 6

/** O recorte do ruleset que a vitrine usa — e a chave do cache. */
type FaixaDaVitrine = { de: number; grau: number }

async function montarVitrine(hoje: string, faixas: FaixaDaVitrine[]): Promise<VitrineDaLanding> {
  const db = getDb()
  // `ate` é INCLUSIVO em `ultimaRodadaConferida`: até ontem, nunca hoje —
  // mesmo que um jogo de hoje já tenha acabado, a noite de hoje é paga.
  const [ultima, feed] = await Promise.all([ultimaRodadaConferida(db, somarDias(hoje, -1)), lerFeed(db, hoje)])
  const totalDeApitosHoje = feed ? agruparPorJogador(feed.conteudo.itens).length : 0
  if (ultima === null) return { noite: null, totalDeApitosHoje }

  const recap = await recapDaNoite(db, ultima)
  const ordenadas = [...faixas].sort((a, b) => b.de - a.de)
  const grauDe = (confianca: number | null): AcertoDaVitrine['grau'] => {
    if (confianca === null) return null
    const faixa = ordenadas.find((f) => confianca >= f.de)
    return faixa ? (faixa.grau as AcertoDaVitrine['grau']) : null
  }
  const acertos = recap.porJogo
    .flatMap(({ jogo, cards }) =>
      cards
        .filter((c) => c.bateuLinhaMaisBaixa === true && c.fez !== null && c.linhaConferida !== null)
        .map((c) => {
          // A confiança da linha conferida (a mais baixa) — é a que bateu.
          const linha = c.linhas.find((l) => l.linha === c.linhaConferida) ?? c.linhas[0]
          const confianca = linha?.confianca ?? null
          return {
            nome: c.nome,
            fotoUrl: c.fotoUrl,
            timeSigla: c.timeSigla,
            atributo: c.atributo,
            nivelJogador: c.nivelJogador,
            nivelApito: c.nivelApito,
            turbo: c.turbo,
            linha: c.linhaConferida!,
            fez: c.fez!,
            confianca,
            grau: grauDe(confianca),
            placar: {
              visitanteSigla: jogo.visitanteSigla,
              casaSigla: jogo.casaSigla,
              placarVisitante: jogo.placarVisitante,
              placarCasa: jogo.placarCasa,
            },
          }
        }),
    )
    // Do mais forte ao menos forte: turbo, nível do apito, confiança — a
    // mesma ordem que decide o apito da noite em Resultados.
    .sort(
      (a, b) =>
        Number(b.turbo) - Number(a.turbo) ||
        b.nivelApito - a.nivelApito ||
        (b.confianca ?? 0) - (a.confianca ?? 0) ||
        a.nome.localeCompare(b.nome),
    )
    .slice(0, ACERTOS_NA_VITRINE)
    // A chave é só para o React: nome, atributo e posição. A do recap
    // (`jogoId|jogadorId|atributo`) carregaria os ids que esta vitrine
    // promete não ter.
    .map((a, i) => ({ chave: `${a.nome}|${a.atributo}|${i}`, ...a }))

  return {
    noite: {
      dataReferencia: recap.dataReferencia,
      bateram: recap.bateram,
      conferidos: recap.conferidos,
      taxa: recap.taxa,
      acertos,
    },
    totalDeApitosHoje,
  }
}

export function landingCacheada(hoje: string, faixas: readonly FaixaDaVitrine[]): Promise<VitrineDaLanding> {
  return unstable_cache(montarVitrine, ['landing'], {
    tags: [TAG_LATERAL, TAG_FEED, tagDoFeed(hoje)],
    revalidate: 3600,
  })(
    hoje,
    // Os argumentos são a chave: o recorte das faixas que a vitrine usa, não
    // o objeto do ruleset inteiro (mesma regra de `placar.ts`).
    faixas.map((f) => ({ de: f.de, grau: f.grau })),
  )
}

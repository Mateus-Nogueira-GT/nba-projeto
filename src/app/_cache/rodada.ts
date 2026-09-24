import { unstable_cache } from 'next/cache'

import { getDb } from '@/modules/dominio/db/cliente'
import type { Atributo } from '@/modules/motor/tipos'
import {
  estadoDaTemporada,
  type EstadoDaTemporada,
  type RulesetDeTemporada,
} from '@/modules/entrega/estatisticas/temporadas'
import { recapDaNoite, ultimaRodadaConferida } from '@/modules/entrega/resultados'

import { TAG_LATERAL } from './lateral'

/**
 * A ÚLTIMA NOITE E O PONTO DO CALENDÁRIO, UMA VEZ POR HORA — não por visita.
 *
 * O resumo da coluna da Lista (`features/lista/ResumoDaRodada.tsx`) abre em
 * TODA visita a `/` — inclusive no celular, onde o CSS esconde a coluna — e
 * `ultimaRodadaConferida` (GROUP BY sobre o histórico inteiro de apitos) mais
 * `recapDaNoite` (conferência + 4 consultas) custavam ~6 consultas iguais para
 * todo mundo. Com 2k simultâneos no lançamento, isso é o banco (revisão da
 * Tarefa 3). A home antiga lia o recap pela lateral cacheada; aqui volta a ser
 * cache, com a MESMA tag da lateral: os crons que fecham a rodada já a
 * invalidam.
 *
 * Só dado grátis (resultado conferido), como a lateral — por isso o cache pode
 * ser compartilhado entre níveis.
 *
 * O valor guardado é o RECORTE que a tela usa, sem nenhum `Date`: o que
 * atravessa o JSON do `unstable_cache` volta igual, sem reidratação (o recap
 * inteiro traz datas aninhadas em `porJogo` e `atualizacao`, que a coluna não
 * mostra).
 */
export type ResumoDaNoite = {
  /** A última rodada com conferência até hoje; null sem nenhuma. */
  ultima: string | null
  recap: {
    dataReferencia: string
    noiteEncerrada: boolean
    bateram: number
    conferidos: number
    taxa: number | null
    apitoDaNoite: { nome: string; fotoUrl: string | null; fez: number | null; atributo: Atributo } | null
  } | null
}

export const resumoDaNoiteCacheado = unstable_cache(
  async (hoje: string): Promise<ResumoDaNoite> => {
    const db = getDb()
    const ultima = await ultimaRodadaConferida(db, hoje)
    if (ultima === null) return { ultima, recap: null }
    const r = await recapDaNoite(db, ultima)
    const destaque = r.apitoDaNoite
    return {
      ultima,
      recap: {
        dataReferencia: r.dataReferencia,
        noiteEncerrada: r.noiteEncerrada,
        bateram: r.bateram,
        conferidos: r.conferidos,
        taxa: r.taxa,
        apitoDaNoite: destaque
          ? { nome: destaque.nome, fotoUrl: destaque.fotoUrl, fez: destaque.fez, atributo: destaque.atributo }
          : null,
      },
    }
  },
  ['resumo-da-noite'],
  { tags: [TAG_LATERAL], revalidate: 3600 },
)

/**
 * O hiato entre temporadas na Lista vazia. O lançamento (02/10) acontece
 * DENTRO do hiato da NBA: sem jogo hoje, toda visita à Lista passava por aqui
 * (GROUP BY de temporadas com dados + o próximo jogo agendado).
 *
 * `hoje` só entra na chave — é o que vira o cache no dia seguinte. O recorte
 * do ruleset entra solto (quatro campos), não o ruleset inteiro: os
 * argumentos SÃO a chave. `EstadoDaTemporada` só tem strings, boolean e null.
 */
const estadoDaTemporadaGuardado = unstable_cache(
  async (_hoje: string, ruleset: RulesetDeTemporada): Promise<EstadoDaTemporada> =>
    estadoDaTemporada(getDb(), ruleset, new Date()),
  ['estado-da-temporada'],
  { tags: [TAG_LATERAL], revalidate: 3600 },
)

export function estadoDaTemporadaCacheado(
  hoje: string,
  ruleset: RulesetDeTemporada,
): Promise<EstadoDaTemporada> {
  return estadoDaTemporadaGuardado(hoje, {
    temporada: {
      mes_inicio: ruleset.temporada.mes_inicio,
      formato: ruleset.temporada.formato,
      minimo_jogos_para_exibir: ruleset.temporada.minimo_jogos_para_exibir,
    },
    rodada: { fuso: ruleset.rodada.fuso },
  })
}

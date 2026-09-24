import { unstable_cache } from 'next/cache'

import { getDb } from '@/modules/dominio/db/cliente'
import { conferirRodadas } from '@/modules/entrega/resultados'
import { DIAS_DO_PLACAR, montarPlacar, type PlacarDoNip } from '@/features/resultados/placar'

import { TAG_LATERAL } from './lateral'

/**
 * O PLACAR DO NIP, UMA VEZ POR HORA — não uma vez por visita.
 *
 * `conferirRodadas` confere 30 dias de apitos contra o box (apitos × jogos ×
 * estatísticas) e rodava em TODA abertura de Resultados, para um número que
 * só muda quando um jogo fecha. A página pública `/placar` (Tarefa 11 do
 * front v2) mostra o mesmo placar e usa este mesmo cache. A tag é a da
 * lateral: os crons que fecham a rodada já a invalidam.
 *
 * Só dado grátis (resultado conferido, agregado por faixa e por nível), como
 * a lateral — por isso o cache é compartilhado entre níveis.
 *
 * O valor guardado é o PLACAR montado (contagens e rótulos), não os 30 dias
 * conferidos: é pequeno, e não tem `Date` para reidratar do JSON.
 *
 * Os argumentos são a chave: `ate` (exclusivo, como na entrega), o recorte
 * das faixas que o placar usa — não o objeto do ruleset — e a janela.
 */
type FaixaDoPlacar = { de: number; grau: number; rotulo_curto: string }
type FaixaDoRuleset = { de: number; grau: number; rotulo: string; rotulo_curto?: string }

const placarGuardado = unstable_cache(
  async (ate: string, faixas: FaixaDoPlacar[], dias: number): Promise<PlacarDoNip> =>
    montarPlacar(await conferirRodadas(getDb(), ate, dias), faixas),
  ['placar-do-nip'],
  { tags: [TAG_LATERAL], revalidate: 3600 },
)

export function placarCacheado(
  ate: string,
  faixas: readonly FaixaDoRuleset[],
  dias: number = DIAS_DO_PLACAR,
): Promise<PlacarDoNip> {
  return placarGuardado(
    ate,
    // `rotulo_curto` é opcional no ruleset real (schema.ts): sem ele, o placar
    // usa o `rotulo` inteiro, como o detalhe do apito — nada fatia texto de
    // ruleset (correção da Tarefa 1).
    faixas.map((f) => ({ de: f.de, grau: f.grau, rotulo_curto: f.rotulo_curto ?? f.rotulo })),
    dias,
  )
}

/**
 * O QUE CADA APITADO FEZ NA JANELA, UMA VEZ POR HORA — o "Seu mês" da Gestão.
 *
 * A retrospectiva da banca cruza os registros da pessoa com a MESMA
 * conferência dos Resultados (`conferirRodadas`), e essa conferência é igual
 * para todo usuário na mesma rodada. Por visita, era a consulta pesada do
 * placar repetida para cada assinante (revisão da Tarefa 6). Mesma tag e
 * mesma hora do placar: fecha quando os crons fecham a rodada.
 *
 * Guarda só o recorte que a retrospectiva lê — `dia|jogador|atributo` → o
 * que ele fez (null = não jogou) —, e não os 30 dias conferidos com nomes,
 * fotos e linhas: menor, e sem nada para reidratar (a conferência não traz
 * `Date`).
 */
export type RealizadoDaJanela = Record<string, number | null>

export const chaveDoRealizado = (dataReferencia: string, jogadorId: string, atributo: string) =>
  `${dataReferencia}|${jogadorId}|${atributo}`

export const realizadoDaJanelaCacheado = unstable_cache(
  async (ate: string, dias: number): Promise<RealizadoDaJanela> => {
    const feito: RealizadoDaJanela = {}
    for (const dia of await conferirRodadas(getDb(), ate, dias)) {
      for (const j of dia.jogadores) feito[chaveDoRealizado(dia.dataReferencia, j.jogadorId, j.atributo)] = j.fez
    }
    return feito
  },
  ['realizado-da-janela'],
  { tags: [TAG_LATERAL], revalidate: 3600 },
)

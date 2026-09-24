import { getDb } from '@/modules/dominio/db/cliente'
import { dataDeReferencia } from '@/modules/dominio/rodada'
import { BANCA_PADRAO, planoDoDia, type PlanoDoDia } from '@/modules/entrega/gestao'
import { rulesetAtivo } from '@/modules/entrega/ruleset-ativo'
import { precosDosPlanos, type PrecosDosPlanos } from '@/modules/plataforma/assinatura/precos'
import { landingCacheada, type NoiteDaVitrine } from '@/app/_cache/landing'

export type { AcertoDaVitrine, NoiteDaVitrine } from '@/app/_cache/landing'

export type DadosDaLanding = {
  /**
   * A última noite CONFERIDA: só quem bateu, com o placar do jogo. É o dado
   * que Resultados já abre a todo nível — a prova social, não a lista.
   */
  noite: NoiteDaVitrine | null
  /** De hoje, SÓ este número. Nenhum item, nome, linha ou odd (decisão D2, 23/09). */
  totalDeApitos: number
  /**
   * O modelo de gestão sobre a banca padrão — aritmética do ruleset, sem
   * feed: o plano de HOJE (as entradas) é pago e fica fora.
   */
  gestao: Pick<PlanoDoDia, 'banca' | 'unidade' | 'limites'>
  precos: PrecosDosPlanos | null
}

/**
 * A landing é PÚBLICA: nada aqui passa pelo portão de nível, então nada aqui
 * pode ler o que o portão protege. O v2 lia o feed pago de hoje, o Fire Live
 * ao vivo e o plano do dia; agora a vitrine vem inteira de um cache
 * (`landingCacheada`) que já sai recortado — a página não vê o feed.
 */
export async function carregarLanding(): Promise<DadosDaLanding> {
  const ruleset = await rulesetAtivo()
  const hoje = dataDeReferencia(new Date(), ruleset.rodada.fuso)
  const [vitrine, plano] = await Promise.all([
    landingCacheada(hoje, ruleset.confianca_exibicao.faixas),
    // `feedLido: null` — o plano NÃO lê o feed: só a unidade e os limites,
    // que dependem da banca e do ruleset. As entradas do dia ficam vazias.
    planoDoDia(getDb(), ruleset, hoje, BANCA_PADRAO, null),
  ])
  return {
    noite: vitrine.noite,
    totalDeApitos: vitrine.totalDeApitosHoje,
    gestao: { banca: plano.banca, unidade: plano.unidade, limites: plano.limites },
    precos: precosDosPlanos(ruleset.rodada.fuso),
  }
}

import type { AcessoComNivel } from '../assinatura/direito'
import type { NivelDoPlano } from '../assinatura/nivel-do-plano'

/**
 * O QUE UM MOCK DE `avaliarAcesso` DEVOLVE — num lugar só.
 *
 * Catorze suítes de tela simulam o acesso. Cada uma escrevendo o objeto à
 * mão é como o formato diverge em silêncio: uma esquece `modalidade`, outra
 * devolve `direitoId` para GRATIS, e a tela passa a testar um acesso que o
 * servidor nunca produz. Aqui o formato é o de `avaliarAcesso`, por tipo.
 */
export function acessoDeTeste(nivelDoPlano: NivelDoPlano): AcessoComNivel {
  return nivelDoPlano === 'GRATIS'
    ? { nivel: nivelDoPlano, direitoId: null, validoAte: null, modalidade: null }
    : {
        nivel: nivelDoPlano,
        direitoId: 'direito-de-teste',
        validoAte: null,
        modalidade: 'MENSAL',
      }
}

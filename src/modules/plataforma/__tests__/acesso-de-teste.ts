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
export function acessoDeTeste(
  nivelDoPlano: NivelDoPlano,
  /**
   * O aceite da metodologia. JÁ ACEITO por padrão, porque é o que um usuário
   * logado é depois da spec de 20/09 — as suítes de tela renderizam telas de
   * quem já está dentro. Quem quer exercitar o PORTÃO passa `null` de propósito
   * (`telas-metodologia.test.ts`).
   */
  metodologiaAceitaEm: Date | null = new Date('2026-09-20T12:00:00.000Z'),
): AcessoComNivel {
  return nivelDoPlano === 'GRATIS'
    ? {
        nivel: nivelDoPlano,
        direitoId: null,
        validoAte: null,
        modalidade: null,
        metodologiaAceitaEm,
      }
    : {
        nivel: nivelDoPlano,
        direitoId: 'direito-de-teste',
        validoAte: null,
        modalidade: 'MENSAL',
        metodologiaAceitaEm,
      }
}

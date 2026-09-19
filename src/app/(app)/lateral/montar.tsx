import type { ReactNode } from 'react'

import { Lateral } from '@/components/lateral'
import { dataDeReferencia } from '@/modules/dominio/rodada'
import { calendarioDoRuleset, temporadaDe } from '@/modules/dominio/temporada'
import { configuracaoChat } from '@/modules/entrega/chat-limites'
import { rulesetAtivo } from '@/modules/entrega/ruleset-ativo'

import { lerLateralCacheada } from './leitura'

/**
 * A LATERAL PADRÃO das telas de aba — um lugar só onde ela é montada.
 *
 * As oito telas de aba passariam a mesma sequência (ler o ruleset, achar o
 * "hoje" no fuso da rodada, derivar a temporada, ler a lateral cacheada); aqui
 * ela existe uma vez. A tela só diz o que ela sabe e a lateral não: se este
 * nível tem direito ao assistente e se é o grátis.
 *
 * Chamar isto DEPOIS do portão de nível da tela é o que mantém a ordem que o
 * `paywall.test.ts` vigia — e, ainda assim, nada aqui lê dado pago.
 */
export async function lateralPadrao({
  assistente,
  gratis,
  semClassificacao = false,
}: {
  assistente: boolean
  gratis: boolean
  /** O índice de Estatísticas passa `true`: a classificação já está na página. */
  semClassificacao?: boolean
}): Promise<ReactNode> {
  const ruleset = await rulesetAtivo()
  const config = calendarioDoRuleset(ruleset)
  const agora = new Date()
  const hoje = dataDeReferencia(agora, ruleset.rodada.fuso)
  const dados = await lerLateralCacheada(hoje, temporadaDe(agora, config), config)

  // Duas perguntas, como na Moldura: `assistente` diz se ESTE nível tem
  // direito; `configuracaoChat().habilitado` diz se o chat EXISTE (flag +
  // cotas). Sem a segunda, a doca mandava o assinante para um /chat que
  // responde 404 — enquanto o botão flutuante, que já perguntava, sumia.
  return (
    <Lateral
      dados={dados}
      assistente={assistente && configuracaoChat().habilitado}
      gratis={gratis}
      mostrarClassificacao={!semClassificacao}
    />
  )
}

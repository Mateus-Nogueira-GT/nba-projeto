import type { DadosDaLateral } from '@/modules/entrega/lateral'
import { ConviteDoPlano } from '@/components/planos/ConviteDoPlano'

import { ClassificacaoCompacta } from './ClassificacaoCompacta'
import { DocaDoAssistente } from './DocaDoAssistente'
import { UltimaNoite } from './UltimaNoite'
import estilos from './Lateral.module.css'

/**
 * A LATERAL DIREITA (identidade 05, §7) — três blocos, de cima para baixo.
 *
 *   1. a última noite conferida, com a taxa da temporada
 *   2. a classificação por conferência
 *   3. o assistente, em doca no rodapé da coluna
 *
 * Quem decide se ela APARECE é o CSS da Moldura (a partir de 1280 px) e a tela,
 * que só a monta quando é tela de aba. Aqui só se decide o que vai dentro.
 *
 * No GRÁTIS o topo é o convite, no lugar da promo que o StatsHub põe ali, e a
 * doca não existe — o assistente é MVP (spec de planos, decisão 7). A frase do
 * convite cobre os três recursos de uma vez, e é por isso que ela não se repete
 * inline na tela: acima de 1280 o banner mora aqui.
 */
export function Lateral({
  dados,
  assistente,
  gratis,
  mostrarClassificacao = true,
}: {
  dados: DadosDaLateral
  /** O nível tem direito ao assistente. A tela sabe; a lateral só recebe. */
  assistente: boolean
  gratis: boolean
  /**
   * `false` no índice de Estatísticas (correções UX 19/09): a página já mostra
   * a classificação inteira ao lado, e a compacta seria o mesmo dado duas
   * vezes na mesma dobra.
   */
  mostrarClassificacao?: boolean
}) {
  return (
    <div className={estilos.lateral}>
      {gratis && (
        <ConviteDoPlano
          variante="faixa"
          minimo="MVP"
          recurso="Lista, Fire Live e assistente"
          // São TRÊS recursos: a frase montada diria "assistente começa".
          titulo="Lista, Fire Live e assistente começam no MVP"
          voltar="/"
        />
      )}
      <UltimaNoite noite={dados.noite} temporada={dados.temporada} />
      {mostrarClassificacao && (
        <ClassificacaoCompacta
          conferencias={dados.classificacao.conferencias}
          temporada={dados.classificacao.temporada}
        />
      )}
      {!gratis && assistente && <DocaDoAssistente />}
    </div>
  )
}

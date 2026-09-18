import Link from 'next/link'

import { diaDaRodada } from '@/components/formato'
import type { DadosDaLateral } from '@/modules/entrega/lateral'

import { Bloco } from './Bloco'
import estilos from './Lateral.module.css'

/** Percentual inteiro. Nunca é, e nunca aparece ao lado de, % de confiança. */
const inteiro = (taxa: number) => `${Math.round(taxa * 100)}%`

function Numero({ rotulo, valor }: { rotulo: string; valor: string }) {
  return (
    <p className={estilos.numero}>
      <strong>{valor}</strong>
      <span>{rotulo}</span>
    </p>
  )
}

/**
 * A ÚLTIMA NOITE CONFERIDA — os três números da tela de Resultados, na lateral.
 *
 * É a prova social do produto: apitou tanto ontem, bateu tanto. Vale para todos
 * os níveis, porque Resultados é grátis inteiro (spec de planos, decisão 9).
 *
 * Com a noite em curso ele escreve "aguardando o fim da noite" no lugar da
 * taxa, exatamente como a tela cheia faz: uma parcial não é o resultado da
 * noite, e mostrá-la como se fosse seria vender um número que ainda vai mudar.
 */
export function UltimaNoite({
  noite,
  temporada,
}: {
  noite: DadosDaLateral['noite']
  temporada: DadosDaLateral['temporada']
}) {
  if (!noite) {
    return (
      <Bloco titulo="Última noite">
        <p className={estilos.apoio}>Ainda sem noite conferida nesta temporada.</p>
      </Bloco>
    )
  }

  const encerrada = noite.noiteEncerrada
  return (
    <Bloco titulo={`Noite de ${diaDaRodada(noite.data)}`}>
      <div className={estilos.numeros}>
        <Numero rotulo="Apitos" valor={String(noite.publicados)} />
        <Numero rotulo="Bateram" valor={encerrada ? String(noite.bateram) : '—'} />
        <Numero
          rotulo="Na noite"
          valor={encerrada && noite.taxa !== null ? inteiro(noite.taxa) : '—'}
        />
      </div>
      {!encerrada && <p className={estilos.apoio}>aguardando o fim da noite</p>}
      {temporada && temporada.conferidos > 0 && (
        <p className={estilos.apoio}>
          Temporada: {inteiro(temporada.acertos / temporada.conferidos)} em {temporada.conferidos}{' '}
          apitos
        </p>
      )}
      <Link className={estilos.link} href={`/resultados/${noite.data}`}>
        Ver a noite
      </Link>
    </Bloco>
  )
}

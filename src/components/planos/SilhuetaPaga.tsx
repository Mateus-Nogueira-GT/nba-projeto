import type { ReactNode } from 'react'

import estilos from './SilhuetaPaga.module.css'

export type FormaDaSilhueta = 'cards' | 'tabela' | 'numeros' | 'formulario'

/** Quantos blocos cada forma desenha. FIXO — a quantidade também seria sinal. */
const BLOCOS: Record<FormaDaSilhueta, number> = {
  cards: 2,
  tabela: 6,
  numeros: 6,
  formulario: 4,
}

/**
 * O QUE O GRÁTIS VÊ NO LUGAR DO CONTEÚDO PAGO (identidade 05, §8).
 *
 * O StatsHub borra as próprias linhas abaixo das duas primeiras. Aqui isso não
 * pode ser feito assim: `paywall.test.ts` exige que o feed pago NUNCA seja lido
 * antes do portão, e um conteúdo real com desfoque por cima entregaria nome,
 * nível e confiança no código-fonte a quem não paga — desfoque é CSS, e CSS o
 * leitor desliga.
 *
 * Então a silhueta é FORMA PURA: a única prop é `forma`, ela não recebe dado
 * nenhum, e o número de blocos é o mesmo em todo jogo e em toda seção. Quantos
 * apitos existem hoje também é sinal, e uma silhueta que variasse com a rodada
 * o estaria contando.
 *
 * Estática de propósito: sem o brilho do `Esqueleto`. Uma forma pulsando diria
 * "carregando" para sempre, e o que ela diz é "aqui tem conteúdo, e ele é pago".
 */
export function SilhuetaPaga({ forma, children }: { forma: FormaDaSilhueta; children?: ReactNode }) {
  return (
    <div className={estilos.moldura}>
      <div className={`${estilos.silhueta} ${estilos[forma]}`} aria-hidden="true">
        {Array.from({ length: BLOCOS[forma] }, (_, i) => (
          <div key={i} className={estilos.bloco} />
        ))}
      </div>
      <div className={estilos.veu} aria-hidden="true">
        <svg
          width="20"
          height="20"
          viewBox="0 0 20 20"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
        >
          <rect x="4" y="9" width="12" height="8" rx="2" />
          <path d="M7 9V6a3 3 0 0 1 6 0v3" />
        </svg>
      </div>
      {/* O nome acessível de tudo isto é o do convite: a silhueta e o véu são
          `aria-hidden`, e quem ouve a tela recebe a frase, não a forma. */}
      {children && <div className={estilos.convite}>{children}</div>}
    </div>
  )
}

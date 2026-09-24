import s from './AoVivo.module.css'

/**
 * O QUE O GRÁTIS VÊ NO LUGAR DOS APITOS.
 *
 * FORMA PURA: não recebe dado nenhum e desenha sempre o mesmo número de
 * blocos. Borrar conteúdo real entregaria nome, nível e alvo no código-fonte a
 * quem não paga — e desfoque é CSS, que o leitor desliga. Quantos apitos
 * existem hoje também é sinal; por isso a silhueta não varia com a rodada.
 *
 * Estática de propósito: sem o brilho do esqueleto de carregamento. Uma forma
 * pulsando diria "carregando" para sempre; o que ela diz é "aqui tem conteúdo,
 * e ele é pago".
 */
export function SilhuetaPaga() {
  return (
    <div className={s.silhueta}>
      <div className={s.silhuetaBlocos} aria-hidden="true">
        {[0, 1].map((i) => (
          <div key={i} className={s.silhuetaBloco} />
        ))}
      </div>
      <span className={s.cadeado} aria-hidden="true">
        <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5">
          <rect x="4" y="9" width="12" height="8" rx="2" />
          <path d="M7 9V6a3 3 0 0 1 6 0v3" />
        </svg>
      </span>
    </div>
  )
}

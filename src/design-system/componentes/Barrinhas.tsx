import { semantico } from '../tokens/semantico'

export type BarrinhasProps = {
  /**
   * Na ordem em que a fileira é LIDA, da esquerda para a direita — quem monta
   * a fileira decide; nem o card nem este componente invertem. `valor` é o
   * número do jogo; `bateu`, contra a linha.
   */
  jogos: { valor: number; bateu: boolean }[]
  /** Rótulo opcional antes dos quadrados (o card usa "ÚLT. 5 NA LINHA"). */
  rotulo?: string
  /**
   * Contorna a ÚLTIMA barrinha — identidade 04, tela de Resultados.
   *
   * O card conferido acrescenta ao fim da fileira o jogo que ACABOU de
   * acontecer. Sem marcá-lo, a fileira parece a mesma de ontem e o assinante
   * não descobre qual quadrado é o resultado da rodada que ele veio conferir.
   * Quem monta a fileira decide a ordem; aqui só se sabe que a nova é a última.
   */
  destacarUltima?: boolean
}

/**
 * O histórico com VALOR — identidade 03. Substitui o antigo `Historico` de
 * barras booleanas: a proposta comercial pede o desempenho recente no próprio
 * card, e um quadrado verde sem número obriga o leitor a abrir o detalhe para
 * saber "bateu por quanto".
 *
 * As cores são o par PRÓPRIO das barrinhas (`barrinhaBateu`/`barrinhaFalhou`),
 * nunca as categóricas do apito — ver o teste de colisão de canais.
 */
export function Barrinhas({ jogos, rotulo, destacarUltima = false }: BarrinhasProps) {
  const acertos = jogos.filter((j) => j.bateu).length
  const nova = destacarUltima ? jogos.length - 1 : -1

  return (
    <div
      style={{ display: 'flex', alignItems: 'center', gap: 5 }}
      role="img"
      // O contorno da nova não é o único sinal: quem ouve a tela também
      // recebe qual quadrado acabou de entrar.
      aria-label={
        `Últimas ${jogos.length} partidas: bateu a linha em ${acertos}` +
        (nova >= 0 ? '; a última é a desta rodada' : '')
      }
    >
      {rotulo && (
        <span
          style={{
            fontFamily: semantico.fonteRotulo,
            fontSize: 10,
            letterSpacing: 1,
            color: semantico.textoSecundario,
            textTransform: 'uppercase',
            marginRight: 3,
          }}
        >
          {rotulo}
        </span>
      )}
      {jogos.map((j, i) => (
        <span
          key={i}
          style={{
            width: 18,
            height: 18,
            borderRadius: 5,
            display: 'grid',
            placeItems: 'center',
            background: j.bateu ? semantico.barrinhaBateu : semantico.barrinhaFalhou,
            color: j.bateu ? semantico.textoSobreCor : semantico.textoPrimario,
            fontFamily: semantico.fonteRotulo,
            fontSize: 10,
            fontWeight: 800,
            fontVariantNumeric: 'tabular-nums',
            outline: i === nova ? `2px solid ${semantico.texto100}` : undefined,
            outlineOffset: i === nova ? 1 : undefined,
          }}
        >
          {j.valor}
        </span>
      ))}
    </div>
  )
}

import { semantico } from '../tokens/semantico'

export type BarrinhasProps = {
  /** Mais recente primeiro. `valor` é o número do jogo; `bateu`, contra a linha. */
  jogos: { valor: number; bateu: boolean }[]
  /** Rótulo opcional antes dos quadrados (o card usa "ÚLT. 5 NA LINHA"). */
  rotulo?: string
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
export function Barrinhas({ jogos, rotulo }: BarrinhasProps) {
  const acertos = jogos.filter((j) => j.bateu).length

  return (
    <div
      style={{ display: 'flex', alignItems: 'center', gap: 5 }}
      role="img"
      aria-label={`Últimas ${jogos.length} partidas: bateu a linha em ${acertos}`}
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
          }}
        >
          {j.valor}
        </span>
      ))}
    </div>
  )
}

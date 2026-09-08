import { semantico } from '../tokens/semantico'

export type JogoNaForma = {
  /** Quanto o jogador fez no atributo naquele jogo. */
  valor: number
  /** Conferido contra a LINHA do apito. Sem linha, ninguém conferiu nada. */
  bateu: boolean
  adversarioSigla: string
}

export type FormaNoAtributoProps = {
  /** Do mais ANTIGO para o mais recente — a ordem em que a oscilação se lê. */
  jogos: JogoNaForma[]
  /**
   * A linha do apito: a régua horizontal contra a qual tudo é comparado.
   *
   * `null` quando o apito NÃO tem linha — o que nasce ao vivo tem alvo do 1º
   * quarto, e alvo não é linha: os valores das barras são de jogo inteiro e o
   * alvo é de doze minutos. Sem linha a forma sai sem régua, sem veredito por
   * cor e sem contagem de acertos.
   */
  linha: number | null
}

/** Dez colunas fixas: a grade não muda de passo quando faltam jogos. */
const COLUNAS = 10
/** Altura útil da barra mais alta, em px. */
const ALTURA_BARRA = 80
/** Faixa reservada embaixo para a sigla do adversário, em px. */
const BASE = 22
/** Zero é UM jogo, não um buraco: o traço mínimo mantém a coluna legível. */
const ALTURA_MINIMA = 3

/**
 * FORMA NO ATRIBUTO — os últimos 10 jogos com a LINHA marcada (spec 04, §4.3).
 *
 * É a oscilação visualizada: a comparação que importa para o apostador é
 * contra a *linha*, não contra outro jogador. As `Barrinhas` de 5 continuam
 * sendo o resumo do card; esta é a leitura de análise, e por isso mora só no
 * detalhe do apito.
 *
 * Cores: o par PRÓPRIO das barrinhas (`barrinhaBateu`/`barrinhaFalhou`), nunca
 * as categóricas do apito — o verde do nível 3 significa outra coisa no mesmo
 * produto. E a cor não é o único canal: o valor vai escrito em cima de cada
 * barra e a régua diz de que linha se está falando.
 *
 * A escala é relativa ao TETO (maior valor ou a própria linha), não absoluta:
 * 8 rebotes e 35 pontos ocupam a mesma altura útil, e a régua acompanha. Uma
 * escala fixa em px por unidade estouraria o gráfico em pontos.
 */
export function FormaNoAtributo({ jogos, linha }: FormaNoAtributoProps) {
  // Do FIM da lista: ela chega do mais antigo para o mais recente, e a seção
  // se chama ÚLTIMOS 10. Cortar pelo começo guardaria os dez mais VELHOS e
  // descartaria o jogo de ontem — justamente o que a oscilação mostra.
  const visiveis = jogos.slice(-COLUNAS)
  const acertos = visiveis.filter((j) => j.bateu).length
  // Com menos de dez jogos a grade mantém o passo (as barras não engordam),
  // mas o vão vai para a esquerda: a leitura é antigo → recente, e uma coluna
  // vazia na DIREITA diria "o jogo de ontem está faltando" — exatamente o
  // oposto do que a seção existe para mostrar.
  const vazias = Math.max(0, COLUNAS - visiveis.length)

  // O `1` evita divisão por zero quando não há jogo nenhum e a linha é 0 —
  // e `Math.max(...[])` seria -Infinity sem os dois primeiros argumentos.
  const teto = Math.max(linha ?? 0, 1, ...visiveis.map((j) => j.valor))
  const escalar = (valor: number) => Math.round((Math.max(valor, 0) / teto) * ALTURA_BARRA)
  const alturaDaBarra = (valor: number) => Math.max(ALTURA_MINIMA, escalar(valor))
  const resumo = linha === null
    ? `${visiveis.length} jogos no atributo, sem linha para conferir`
    : `bateu ${acertos} de ${visiveis.length}`
  const sequencia = visiveis.map((j) => `${j.adversarioSigla}: ${j.valor}`).join('; ')

  return (
    <div
      role="img"
      aria-label={`${resumo}${sequencia ? `. Do mais antigo ao mais recente: ${sequencia}` : ''}`}
      style={{
        position: 'relative',
        height: ALTURA_BARRA + 40,
        boxSizing: 'border-box',
        display: 'grid',
        gridTemplateColumns: `repeat(${COLUNAS}, minmax(0, 1fr))`,
        gap: 6,
        alignItems: 'end',
        paddingBottom: BASE,
      }}
    >
      {linha !== null && (
        <div
          aria-hidden
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            bottom: BASE + escalar(linha),
            borderTop: `1.5px dashed ${semantico.texto70}`,
          }}
        >
          <span
            style={{
              position: 'absolute',
              right: 0,
              top: -16,
              fontFamily: semantico.fonteRotulo,
              fontSize: 10,
              fontWeight: 700,
              letterSpacing: 1,
              textTransform: 'uppercase',
              color: semantico.texto70,
              // O fundo do tema atrás do rótulo: sem ele o texto cai em cima da
              // barra mais alta e as duas informações se apagam.
              background: semantico.fundo,
              padding: '0 4px',
              fontVariantNumeric: 'tabular-nums',
            }}
          >
            {/* Linha SEMPRE inteira com "+": a régua marca a fronteira e o
                que está acima dela é a região de N ou mais. */}
            LINHA {linha}+
          </span>
        </div>
      )}

      {visiveis.map((jogo, i) => (
        <div
          key={i}
          style={{
            position: 'relative',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 4,
            gridColumnStart: i === 0 && vazias > 0 ? vazias + 1 : undefined,
          }}
        >
          <span
            style={{
              fontFamily: semantico.fonteRotulo,
              fontSize: 11,
              fontWeight: 700,
              // Altura FIXA do rótulo: a coluna é barra (80) + gap (4) +
              // rótulo (14) = 98, exatamente a área útil (120 − 22 da base).
              // Com a altura de linha da fonte, a coluna mais alta transbordava
              // uns 2 px para cima do contêiner.
              lineHeight: '14px',
              color: semantico.texto100,
              fontVariantNumeric: 'tabular-nums',
            }}
          >
            {/* Redundância obrigatória (docs/04, Acessibilidade): o veredito
                não pode depender só do verde/vermelho. A posição do topo da
                barra contra a régua resolve quase tudo, MENOS a igualdade —
                valor 4 na linha 4 bateu e desenha o topo em cima da régua. */}
            {linha === null ? jogo.valor : `${jogo.bateu ? '✓' : '·'} ${jogo.valor}`}
          </span>
          <div
            style={{
              width: '100%',
              height: alturaDaBarra(jogo.valor),
              borderRadius: '4px 4px 2px 2px',
              // Sem linha não há veredito: a barra fica no cinza do apoio.
              // Pintar de verde ou vermelho afirmaria uma conferência que
              // ninguém fez.
              background:
                linha === null
                  ? semantico.texto40
                  : jogo.bateu
                    ? semantico.barrinhaBateu
                    : semantico.barrinhaFalhou,
            }}
          />
          <span
            style={{
              position: 'absolute',
              // Encostada na base do contêiner, como no artboard: a faixa de
              // 22 px embaixo é dela.
              bottom: -22,
              left: 0,
              right: 0,
              textAlign: 'center',
              fontFamily: semantico.fonteRotulo,
              fontSize: 9,
              letterSpacing: 0.5,
              textTransform: 'uppercase',
              color: semantico.texto40,
            }}
          >
            {jogo.adversarioSigla}
          </span>
        </div>
      ))}
    </div>
  )
}

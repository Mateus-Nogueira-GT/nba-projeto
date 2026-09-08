import { numeroPtBr } from '../formato'
import { componente } from '../tokens/componente'
import { semantico } from '../tokens/semantico'

/**
 * Um marco no eixo da barra — uma referência escrita, não uma regra.
 *
 * `valor` posiciona o traço proporcionalmente ao alvo; `rotulo` é o NOME do
 * marco, e a legenda escreve `rotulo · valor` ("75% da média · 8"). O rótulo
 * chega pronto de propósito: o percentual do modo fire é regra de estratégia
 * (ruleset) e quem escreve o texto é a entrega — a barra nunca soletra um
 * número que o YAML pode mudar amanhã.
 */
export type MarcoDaBarra = {
  valor: number
  rotulo: string
  /** Cor do traço e do texto dele na legenda. Sem ela, o marco é neutro. */
  cor?: string
}

export type BarraAlvoProps = {
  /** Valor já feito no 1º quarto. */
  observado: number
  /** Alvo do apito no 1º quarto. */
  alvo: number
  /**
   * Unidade escrita na contagem e no ponto do apito ("pts", "reb", "ast"). A
   * barra não conhece atributo: quem sabe do que se trata é o card.
   */
  unidade?: string | null
  /**
   * Marcos intermediários — no Fire Live, o do modo fire. O alvo é sempre o
   * último marco e a barra o desenha sozinha: ele é a régua.
   */
  marcos?: MarcoDaBarra[]
  /**
   * Onde o jogador estava no instante do push. `rotulo` nomeia o ponto
   * ("apitou aqui") e a legenda escreve `rotulo · valor unidade`.
   *
   * Três estados, e a diferença entre os dois últimos importa:
   * - objeto → o ponto no trilho e a frase na legenda;
   * - `null` → quem monta AFIRMA que o push ainda não veio, e a legenda
   *   escreve "ainda sem apito" (o alvo aguardando o 1º quarto);
   * - ausente → ninguém sabe, e a barra **cala**. O Fire Live de hoje lista
   *   apitos: dizer "ainda sem apito" embaixo de um apito seria mentira na
   *   tela do assinante. Silêncio é o padrão seguro.
   */
  apitouEm?: { valor: number; rotulo: string } | null
}

/**
 * A caixa do trilho, medida no artboard (FireLive.dc.html, `.trilho`): 9 px
 * totais — 1 px de borda de cada lado e 7 px de miolo, que é a altura do
 * preenchimento laranja.
 *
 * O artboard não tem reset de box-sizing e por isso escreve `height:7px`; o app
 * tem (`src/app/globals.css`, `*{box-sizing:border-box}`), então aqui o mesmo
 * desenho se escreve com a altura TOTAL. Copiar os 7 px de lá deixaria a barra
 * 2 px mais fina que o aprovado e desalinharia todos os filhos absolutos, que
 * se resolvem contra o miolo.
 */
const TRILHO_ALTURA = 9
const TRILHO_BORDA = 1
/** Traço do marco: 2 px de largura por 13 px de altura (`.marco` do artboard). */
const MARCO_LARGURA = 2
const MARCO_ALTURA = 13
/** `.apitou`: 13 px totais com 2 px de anel — o núcleo branco tem 9 px. */
const APITO_DIAMETRO = 13
const APITO_ANEL = 2

/**
 * O `top` que centra no trilho um filho absoluto de `altura` px. `top` conta a
 * partir do miolo, que começa uma borda abaixo do topo do trilho — daí o
 * desconto. Com 13 px sobre 9 px dá -3: sobra 2 px acima e 2 px abaixo, a
 * simetria que o artboard mostra.
 */
const centradoNoTrilho = (altura: number) => -(altura - TRILHO_ALTURA) / 2 - TRILHO_BORDA

/**
 * A barra "rumo ao alvo" do Fire Live. Preenchimento quente com brilho, os
 * marcos como traços verticais, o ponto do apito e a contagem escrita ao lado:
 * a cor nunca é o único sinal — tudo que a barra desenha, a legenda escreve.
 *
 * Identidade 04 (spec §4.2): dois marcos visíveis — o do modo fire, que vem do
 * item, e o alvo no fim do trilho — mais o ponto "apitou aqui", o instante do
 * push. Depois de FIM 1º Q ela congela: não há animação nenhuma aqui, e o teste
 * vigia o arquivo.
 */
export function BarraAlvo({ observado, alvo, unidade, marcos, apitouEm }: BarraAlvoProps) {
  // Alvo desconhecido/zero NÃO é alvo batido: barra vazia, nunca cheia. E sem
  // régua não há onde pôr marco nem ponto — some tudo, em vez de dividir por
  // zero e desenhar contra um eixo que não existe.
  const temAlvo = alvo > 0
  const fracao = (valor: number) => Math.min(1, Math.max(0, valor / alvo))
  const posicao = (valor: number) => `${Math.round(fracao(valor) * 1000) / 10}%`
  // O traço nasce CENTRADO no valor; nos extremos ele encosta por dentro do
  // trilho — é o que o artboard faz com o marco do alvo (`margin-left:-2px`),
  // porque centrado ali metade dele cairia sobre a borda direita.
  const deslocamentoDoMarco = (valor: number) => {
    const f = fracao(valor)
    return f >= 1 ? -MARCO_LARGURA : f <= 0 ? 0 : -MARCO_LARGURA / 2
  }

  const sufixo = unidade ? ` ${unidade}` : ''
  // O alvo é o último marco — e o único que a barra nomeia sozinha.
  const todosOsMarcos: MarcoDaBarra[] = temAlvo
    ? [...(marcos ?? []), { valor: alvo, rotulo: 'alvo' }]
    : []
  // Tudo que a barra escreve passa por `numeroPtBr`: o marco do modo fire é
  // fração da média por construção (0,75 × 25,7 = 19,275) e sairia "19.275".
  const textoDoApito = apitouEm
    ? `${apitouEm.rotulo} · ${numeroPtBr(apitouEm.valor)}${sufixo}`
    : undefined
  // A coluna do apito na legenda: a frase do ponto, ou a negativa quando quem
  // monta AFIRMA que o push não veio (`null`). Sem notícia nenhuma
  // (`undefined`) a coluna não existe — "ainda sem apito" embaixo de um card
  // que já É um apito seria informação falsa na tela.
  const legendaDoApito = textoDoApito ?? (apitouEm === null ? 'ainda sem apito' : undefined)

  return (
    <div>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'baseline',
          marginBottom: 6,
        }}
      >
        <span
          style={{
            fontFamily: semantico.fonteRotulo,
            fontSize: 10,
            letterSpacing: 1,
            fontWeight: 600,
            color: semantico.textoSecundario,
            textTransform: 'uppercase',
          }}
        >
          Rumo ao alvo
        </span>
        <span
          style={{
            fontFamily: semantico.fonteRotulo,
            fontSize: 11,
            fontWeight: 700,
            color: semantico.texto100,
            fontVariantNumeric: 'tabular-nums',
          }}
        >
          {`${numeroPtBr(observado)} / ${numeroPtBr(alvo)}${sufixo}`}
        </span>
      </div>
      {/* Sem `overflow: hidden`: os marcos passam do trilho de propósito (13px
          num trilho de 9px) — é o que os torna legíveis a 390px. */}
      <div
        style={{
          height: TRILHO_ALTURA,
          borderRadius: 4,
          background: componente.barraAlvoFundo,
          border: `${TRILHO_BORDA}px solid ${componente.contextoQuente.borda}`,
          boxSizing: 'border-box',
          position: 'relative',
        }}
      >
        <div
          style={{
            position: 'absolute',
            left: 0,
            top: 0,
            width: temAlvo ? posicao(observado) : '0%',
            height: '100%',
            borderRadius: 4,
            background: componente.barraAlvoPreenchido,
            boxShadow: componente.contextoQuente.brilho,
          }}
        />
        {todosOsMarcos.map((marco) => (
          <div
            key={`${marco.rotulo}-${marco.valor}`}
            aria-hidden
            style={{
              position: 'absolute',
              left: posicao(marco.valor),
              marginLeft: deslocamentoDoMarco(marco.valor),
              top: centradoNoTrilho(MARCO_ALTURA),
              width: MARCO_LARGURA,
              height: MARCO_ALTURA,
              background: marco.cor ?? semantico.texto100,
            }}
          />
        ))}
        {temAlvo && apitouEm && (
          <span
            role="img"
            aria-label={textoDoApito}
            style={{
              position: 'absolute',
              left: posicao(apitouEm.valor),
              marginLeft: -APITO_DIAMETRO / 2,
              top: centradoNoTrilho(APITO_DIAMETRO),
              width: APITO_DIAMETRO,
              height: APITO_DIAMETRO,
              borderRadius: '50%',
              background: semantico.texto100,
              border: `${APITO_ANEL}px solid ${semantico.superficieQuente2}`,
              boxSizing: 'border-box',
            }}
          />
        )}
      </div>
      {temAlvo && (
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            marginTop: 6,
            fontFamily: semantico.fonteRotulo,
            fontSize: 10,
            letterSpacing: 0.8,
            textTransform: 'uppercase',
            // A tela ao vivo se recarrega a cada 30 s: sem largura fixa de
            // dígito a legenda pula a cada refresh (`body{font-variant-numeric:
            // tabular-nums}` no artboard).
            fontVariantNumeric: 'tabular-nums',
            color: semantico.texto55,
          }}
        >
          {/* A COLUNA DO APITO EXISTE SEMPRE — vazia quando não há notícia
              do push. É ela que segura o `space-between` do artboard: sem a
              coluna, o rótulo do marco intermediário (traço em 72,7%) iria
              para a extremidade ESQUERDA do trilho e o "alvo · 11" deixaria a
              direita, onde ele está nos três cards. Rótulo que não aponta
              para o que descreve é pior que rótulo nenhum. */}
          <span>{legendaDoApito}</span>
          {todosOsMarcos.map((marco) => (
            <span key={`${marco.rotulo}-${marco.valor}`} style={{ color: marco.cor }}>
              {marco.rotulo} · {numeroPtBr(marco.valor)}
            </span>
          ))}
        </div>
      )}
    </div>
  )
}

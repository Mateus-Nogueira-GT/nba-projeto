import Link from 'next/link'

import type { EstadoDoCiclo } from '../../modules/entrega/lista-por-jogo'
import type { Atributo, Nivel, NivelApito } from '../../modules/motor/tipos'
import type { Lente } from '../../modules/plataforma/preferencias'
import { decimalPtBr } from '../formato'
import { componente } from '../tokens/componente'
import { CONFIANCA_GRAU, MODO_FIRE, NIVEL_JOGADOR, TURBO } from '../tokens/css'
import { semantico } from '../tokens/semantico'
import { Avatar } from './Avatar'
import { BarraAlvo } from './BarraAlvo'
import { Barrinhas } from './Barrinhas'
import { IconeVeredito } from './IconeVeredito'
import { Pilula } from './Pilula'
import { Selo } from './Selo'

const ATRIBUTO_ROTULO: Record<Atributo, string> = {
  PONTOS: 'PONTOS',
  REBOTES: 'REBOTES',
  ASSISTENCIAS: 'ASSISTÊNCIAS',
}
const ATRIBUTO_CURTO: Record<Atributo, string> = {
  PONTOS: 'PTS',
  REBOTES: 'REB',
  ASSISTENCIAS: 'AST',
}

/**
 * O dicionário de status de largura fixa (spec 04, §4.2). FT é "o jogo acabou"
 * — vale tanto para o encerrado ainda sem box (AGUARDANDO_OFICIAL) quanto
 * para o conferido; quem foi conferido e não jogou recebe DNP. Um valor fora
 * do dicionário imprime "—", nunca um estado inventado.
 */
const ROTULO_ESTADO: Record<EstadoDoCiclo, string> = {
  PRE: 'PRÉ',
  Q1: '1º Q',
  FIM_Q1: 'FIM 1º Q',
  AGUARDANDO_OFICIAL: 'FT',
  CONFERIDO: 'FT',
}

export type CardEntradaProps = {
  nome: string
  /**
   * Destino da tela de estatísticas do jogador.
   *
   * É o SEGUNDO caminho de entrada da aba (docs/00-visao.md): pelo menu, ou
   * pelo nome do jogador dentro de qualquer card. Opcional porque o card é
   * usado também na galeria do design system, onde não há rota para navegar.
   */
  jogadorHref?: string | null
  fotoUrl?: string | null
  timeSigla: string
  /**
   * Sigla do time ADVERSÁRIO, quando a tela sabe contra quem é o jogo.
   *
   * Opcional de propósito: quem não sabe o confronto (a curadoria do CJ pode
   * pôr o jogador num time que não está em campo) simplesmente não fala nele
   * — melhor que um "vs —" que não informa nada.
   */
  adversarioSigla?: string | null
  /**
   * De que lado o jogador está: `true` escreve "vs ADV" (mandante), `false`
   * escreve "@ ADV" (visitante) — a alternância do artboard. Ausente, o card
   * mantém o "vs" de sempre: a tela que não sabe o mando não inventa um.
   */
  emCasa?: boolean | null
  posicao: string | null
  atributo: Atributo
  nivelJogador: Nivel
  nivelApito: NivelApito
  /** Nota de confiança. Nunca "probabilidade". */
  confianca: number | null
  /** Grau visual (1..5), materializado no item do feed. */
  grauConfianca: 1 | 2 | 3 | 4 | 5 | null
  turbo?: boolean
  modoFire?: boolean
  /** Nível de origem quando o jogador já vinha apitado em OPD pré-live. */
  opdOrigemNivel?: NivelApito | null
  /** Linha do apito. Exibida SEMPRE inteira, com sufixo "+" — nunca meio ponto. */
  linha?: number | null
  /** Alvo do 1º quarto, no Fire Live. */
  alvo1Q?: number | null
  /**
   * Marco do MODO FIRE na barra (spec 04, §4.2) — o valor e o rótulo vêm do
   * item, calculados pela entrega a partir do ruleset. O card não sabe que o
   * marco é "75% da média": se o percentual mudar no YAML, o texto muda com
   * ele sem tocar em componente nenhum (regra 1 do CLAUDE.md).
   */
  alvoFire?: { valor: number; rotulo: string } | null
  /**
   * Quanto o jogador tinha no atributo no instante do push — o ponto "apitou
   * aqui" da barra.
   *
   * `null` é a AFIRMAÇÃO de que o push ainda não veio (o alvo aguardando o 1º
   * quarto, terceiro card do artboard) e vira "ainda sem apito" na legenda.
   * AUSENTE é "não sei", e aí a barra cala: o card do Fire Live já É um apito,
   * e a frase embaixo dele seria informação falsa na tela do assinante.
   */
  apitouEm?: number | null
  /** Selo VIVO — fire live em andamento. */
  vivo?: boolean
  /** Progresso observado no 1º quarto, contra o alvo. */
  progresso1Q?: { observado: number; alvo: number } | null
  /** Últimos 5 conferidos contra a linha — as barrinhas da zona 2 (pré-live). */
  ultimos5?: { valor: number; bateu: boolean }[]
  /** Média da temporada, do item do feed — o rodapé mostra sem chamar o motor. */
  mediaTemporada?: number | null
  /** Faixa de odds entre casas; com `media`, o rodapé escreve ODD MÉDIA. */
  oddFaixa?: { min: number; max: number; qtdCasas: number; media?: number } | null
  /**
   * Temperatura do contexto. O Fire Live INTEIRO é quente — não só o modo
   * fire: urgência é da tela ao vivo, não do estado do jogador. Pré-live
   * nunca passa 'quente'; o teste transversal vigia.
   */
  temperatura?: 'frio' | 'quente'
  /**
   * Análise gerada por LLM a partir dos fatos do card. Ausente é o caso
   * NORMAL — sem chave, LLM fora ou texto reprovado pelo validador. Ausência
   * não abre espaço: um bloco vazio anunciaria defeito onde há degradação
   * prevista.
   */
  narrativa?: string | null

  // -- Identidade 04 · o card fecha o ciclo -----------------------------------
  /**
   * Ponto da noite em que o card está (spec 04, §5.1) — derivado do jogo e do
   * box score na ENTREGA, nunca digitado. Vira o badge de largura FIXA no
   * canto: PRÉ · 1º Q · FIM 1º Q · FT (DNP quando conferido sem jogar).
   * Ausente, o card é exatamente o de antes: Fire Live, Resultados e gestão
   * de hoje não mudam.
   */
  estado?: EstadoDoCiclo
  /** Quanto o jogador fez, quando CONFERIDO. `null` = não jogou. */
  fez?: number | null
  /** Bateu a linha? `null` = não jogou → neutro, nem ✓ nem ✗. */
  bateu?: boolean | null
  /**
   * Contorna a ÚLTIMA barrinha da fileira — o jogo desta rodada, nos
   * Resultados, que a tela põe no fim.
   *
   * É EXPLÍCITA de propósito. Derivar de `estado === 'CONFERIDO'` marcaria a
   * fileira de todo chamador conferido, inclusive os que não acrescentaram o
   * jogo da rodada (a galeria), e o contorno cairia num jogo antigo afirmando
   * ser o de agora. Quem monta a fileira decide a ordem e sabe qual é a nova;
   * o card só repassa a `Barrinhas.destacarUltima`.
   */
  destacarUltima?: boolean
  /**
   * Abas PTS · REB · AST no rodapé: o mesmo jogador com dois ou três
   * atributos é UM card, e as abas trocam o mercado — no lugar do rótulo
   * longo do atributo. A entrega decide quem ganha abas; o card só desenha.
   */
  atributos?: {
    atributo: Atributo
    /** `null` quando o mercado ainda não veio das casas: a aba escreve só o atributo. */
    linha: number | null
    ativo: boolean
    href: string
  }[]
  /**
   * Lente da zona 2, trocada para TODOS os cards pelo cabeçalho da tela.
   * ULT5 (padrão) são as barrinhas de sempre; as outras escrevem o dado em
   * texto tabular — e, sem dado, o rótulo com "—", nunca um número inventado.
   */
  lente?: Lente
  /** Posição do jogador na hierarquia do time no atributo — dado da lente HIERARQUIA. */
  hierarquia?: { posicao: number; total: number } | null
  /**
   * Destino do CARD INTEIRO (spec 04, §4.1): a análise do apito. É o que
   * aposenta o link "linhas e confiança →" que ficava entre os cards.
   *
   * Renderiza como uma âncora que COBRE o card, irmã do conteúdo — nunca um
   * `<a>` em volta dele: o nome e as abas já são links, e âncora dentro de
   * âncora é HTML inválido. Por isso o nome e as abas sobem uma camada
   * (`zIndex: 1`) e seguem clicáveis por cima da cobertura.
   */
  detalheHref?: string | null
}

/**
 * Card de entrada — identidade 03 "broadcast", em TRÊS zonas:
 *   1 · cabeçalho — avatar (anel = nível do APITO), nome, apoio, % grande
 *   2 · contexto  — barrinhas (pré-live) OU barra rumo ao alvo (fire live)
 *   3 · rodapé    — faixa translúcida com linha · média · odd
 *
 * Os canais da identidade continuam os de sempre:
 *   faixa metálica curta = nível do JOGADOR (+ rótulo escrito)
 *   anel do avatar       = nível do APITO   (+ numeral N{n}/T)
 *   borda lateral 3px    = grau de CONFIANÇA (+ % escrito na mesma cor)
 *
 * Três brilhos, três donos, nunca o único sinal:
 *   grau 5 de confiança → brilho do card na cor do grau
 *   turbo               → turboBrilho (+ selo ⚡ TURBO escrito)
 *   modo fire           → brilho do universo quente (+ selo 🔥 MODO FIRE)
 *
 * Temperatura por contexto: pré-live veste contextoFrio; modo fire, o quente.
 *
 * Identidade 04 — o MESMO card na Lista, no Fire Live e nos Resultados: o
 * badge de status no canto conta em que ponto da noite ele está; conferido,
 * o rodapé direito vira o veredito "fez N" com ✓/✗ (ou neutro para quem não
 * jogou); as abas de atributo e a lente da zona 2 são opcionais.
 */
export function CardEntrada(props: CardEntradaProps) {
  const nivel = NIVEL_JOGADOR[props.nivelJogador]
  const grau = props.grauConfianca
  const corGrau = grau === null ? semantico.divisor : CONFIANCA_GRAU[grau]
  const brilhaConfianca = grau === 5 // regra da identidade: só o máximo brilha
  // A pele vem SÓ da temperatura (da TELA). modoFire é estado do jogador:
  // rende selo e brilho, nunca troca a pele — um item pré-live em modo fire
  // continua mostrando barrinhas, média e odd (errata 25/08).
  const quente = props.temperatura === 'quente'
  const contexto = quente ? componente.contextoQuente : componente.contextoFrio
  // E o brilho quente vem SÓ do modo fire, não da tela: no artboard do Fire
  // Live o card sem a pílula leva `box-shadow:none`. Brilhar todo card quente
  // seria um quarto canal de cor — e o brilho deixaria de dizer "modo fire".
  const brilhoDoCard = brilhaConfianca
    ? `0 0 16px 1px ${corGrau}55`
    : props.turbo
      ? componente.turboBrilho
      : props.modoFire
        ? componente.contextoQuente.brilho
        : undefined
  const corPercentual = props.turbo ? TURBO.cor : corGrau

  // Na tela ao vivo o assunto é o ALVO do 1º quarto (artboard, `.rodape` do
  // card quente): a linha é do jogo inteiro e volta a mandar no pré-live.
  // ALVO ZERO NÃO É ALVO. A barra já se recusa a desenhar contra régua zero
  // (`alvo > 0` em BarraAlvo: sem marco, sem ponto, sem legenda) e o card
  // inteiro precisa dizer a mesma coisa: "ALVO 1º Q · 0" e, do outro lado,
  // "ALVO BATIDO" com 0 de 0 — ou "FALTA 0" — são a régua inventada que a
  // errata pós-merge existe para impedir.
  const rotuloAlvo1Q =
    props.alvo1Q != null && props.alvo1Q > 0
      ? `ALVO 1º Q · ${props.alvo1Q} ${ATRIBUTO_CURTO[props.atributo]}`
      : null
  const rotuloLinha =
    quente && rotuloAlvo1Q != null
      ? rotuloAlvo1Q
      : props.linha != null
        ? `${ATRIBUTO_ROTULO[props.atributo]} ${props.linha}+`
        : (rotuloAlvo1Q ?? ATRIBUTO_ROTULO[props.atributo])
  const p = props.progresso1Q != null && props.progresso1Q.alvo > 0 ? props.progresso1Q : null
  const faltam = p ? Math.max(0, p.alvo - p.observado) : 0

  const rodapeDireita = quente
    ? p
      ? // "ALVO BATIDO", nunca "linha batida": cruzar o alvo do 1º quarto não
        // é bater a linha do jogo — e a contagem da barra já diz quanto fez.
        p.observado >= p.alvo
        ? 'ALVO BATIDO'
        : `FALTA ${faltam} ${ATRIBUTO_CURTO[props.atributo]}`
      : null
    : [
        props.mediaTemporada != null ? `MÉDIA ${decimalPtBr(props.mediaTemporada, 1)}` : null,
        // QUEM DECIDE MÉDIA OU FAIXA É O RULESET, não o card. `odds.exibicao`
        // (decisão do parceiro, 25/08) é aplicada na materialização, que
        // suprime `media` do item quando a chave é 'faixa' — ver
        // lista-secreta.ts, "a tela não decide". Escolher a forma aqui faria
        // virar a chave no YAML deixar de mudar o produto: é a regra 1 do
        // CLAUDE.md. A pergunta "média ou faixa" está reaberta com o CJ; ela se
        // responde no ruleset, não neste arquivo.
        props.oddFaixa != null
          ? props.oddFaixa.media != null
            ? `ODD MÉDIA ${decimalPtBr(props.oddFaixa.media, 2)}`
            : `ODD ${decimalPtBr(props.oddFaixa.min, 2)}–${decimalPtBr(props.oddFaixa.max, 2)}`
          : null,
      ]
        .filter(Boolean)
        .join(' · ') || null

  // A aba ativa herda a cor do nível do apito DESTE card (o anel do avatar diz
  // a mesma coisa); turbo tem par próprio.
  const corDaAba = props.turbo
    ? componente.abaAtributo.ativaTurbo
    : componente.abaAtributo.ativaPorNivel[props.nivelApito]

  // -- ciclo do card (04) -----------------------------------------------------
  const conferido = props.estado === 'CONFERIDO'
  const naoJogou = conferido && props.bateu === null
  const rotuloEstado = props.estado
    ? naoJogou
      ? 'DNP'
      : ((ROTULO_ESTADO as Record<string, string>)[props.estado] ?? '—')
    : null
  // Só o quarto em andamento veste a tinta do ao vivo. FIM 1º Q congela no
  // estado final — o apito não some, mas também não pisca (spec §4.2).
  const badgeAoVivo = props.estado === 'Q1'
  // Com badge no canto e confiança nula (Fire Live), o "—" do % seria ruído
  // embaixo do status; sem badge, o "—" segue como sempre.
  const mostraPercentual = props.confianca !== null || rotuloEstado === null
  const veredito = conferido
    ? naoJogou
      ? { texto: 'não jogou · neutro', cor: componente.conferido.neutro, icone: null }
      : props.fez != null && props.bateu != null
        ? props.bateu
          ? { texto: `fez ${props.fez}`, cor: componente.conferido.bateu, icone: 'bateu' as const }
          : {
              texto: `fez ${props.fez}`,
              cor: componente.conferido.falhou,
              icone: 'falhou' as const,
            }
        : null
    : null

  // -- lente da zona 2 (04) ---------------------------------------------------
  const lente: Lente = props.lente ?? 'ULT5'
  const barrinhas = !quente && lente === 'ULT5' && (props.ultimos5?.length ?? 0) > 0
  const textoDaLente = !quente && lente !== 'ULT5' ? lenteEmTexto(lente, props) : null

  const abas = props.atributos && props.atributos.length > 0 ? props.atributos : null

  return (
    <div style={{ position: props.detalheHref ? 'relative' : undefined }}>
      {/* faixa metálica CURTA = nível do jogador */}
      <div
        aria-hidden
        style={{
          width: 56,
          height: componente.faixaNivelAltura,
          borderRadius: 2,
          background: nivel.cor,
          marginBottom: 4,
          // Recuada 14px: alinha com o avatar em vez de encostar na borda
          // lateral do grau (artboard, `.faixa-nivel`). Forma LONGA de
          // propósito: é assim que o teste afirma o recuo.
          marginLeft: 14,
        }}
      />
      <article
        style={{
          borderRadius: componente.cardRaio,
          background: contexto.cardGradiente,
          color: componente.cardTexto,
          border: `1px solid ${contexto.borda}`,
          borderLeft: `${componente.cardBordaLateral} solid ${corGrau}`,
          boxShadow: brilhoDoCard,
          overflow: 'hidden',
          // Quem não jogou não conta — o card recua um pouco, sem sumir.
          opacity: naoJogou ? 0.75 : undefined,
        }}
      >
        {/* zona 1 · cabeçalho */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '13px 14px 8px' }}>
          <Avatar
            nome={props.nome}
            fotoUrl={props.fotoUrl ?? null}
            timeSigla={props.timeSigla}
            nivelApito={props.nivelApito}
            turbo={props.turbo}
          />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <strong
                style={{
                  fontFamily: semantico.fonteTitulo,
                  fontSize: 17,
                  letterSpacing: 0.6,
                  textTransform: 'uppercase',
                }}
              >
                {props.jogadorHref ? (
                  <Link
                    href={props.jogadorHref}
                    style={{
                      color: 'inherit',
                      textUnderlineOffset: 3,
                      position: 'relative',
                      zIndex: 1,
                    }}
                  >
                    {props.nome}
                  </Link>
                ) : (
                  props.nome
                )}
              </strong>
              {props.vivo && <Pilula texto="VIVO" cor={semantico.vivoSelo} />}
            </div>
            <div
              style={{
                fontFamily: semantico.fonteRotulo,
                fontSize: 12,
                letterSpacing: 1.2,
                color: componente.cardTextoApoio,
                textTransform: 'uppercase',
                marginTop: 2,
              }}
            >
              {nivel.rotulo} · N{props.nivelApito}
              {props.posicao ? ` · ${props.posicao}` : ''} · {props.timeSigla}
              {props.adversarioSigla
                ? ` · ${props.emCasa === false ? '@' : 'vs'} ${props.adversarioSigla}`
                : ''}
            </div>
            <div style={{ display: 'flex', gap: 6, marginTop: 4, flexWrap: 'wrap' }}>
              {props.turbo && <Selo icone="⚡" rotulo="TURBO" cor={TURBO.cor} />}
              {props.modoFire && <Selo icone="🔥" rotulo="MODO FIRE" cor={MODO_FIRE.cor} />}
              {props.opdOrigemNivel != null && (
                <Selo icone="↗" rotulo={`OPD nível ${props.opdOrigemNivel}`} />
              )}
            </div>
          </div>
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'flex-end',
              gap: 4,
              flexShrink: 0,
              // Com badge, a coluna gruda no canto superior (o status fica sempre
              // no mesmo lugar); sem ele, o % centra com o avatar como antes.
              alignSelf: rotuloEstado ? 'flex-start' : 'center',
            }}
          >
            {rotuloEstado && (
              <span
                style={{
                  width: componente.statusCiclo.largura,
                  boxSizing: 'border-box',
                  textAlign: 'center',
                  padding: '3px 0',
                  borderRadius: 6,
                  fontFamily: semantico.fonteRotulo,
                  fontSize: 10,
                  letterSpacing: 1.5,
                  textTransform: 'uppercase',
                  fontWeight: 700,
                  whiteSpace: 'nowrap',
                  color: badgeAoVivo
                    ? componente.statusCiclo.textoAoVivo
                    : componente.statusCiclo.textoNeutro,
                  background: badgeAoVivo
                    ? componente.statusCiclo.fundoAoVivo
                    : componente.statusCiclo.fundoNeutro,
                  border: `1px solid ${badgeAoVivo ? componente.statusCiclo.bordaAoVivo : componente.statusCiclo.bordaNeutra}`,
                }}
              >
                {rotuloEstado}
              </span>
            )}
            {mostraPercentual && (
              <span
                style={{
                  fontFamily: semantico.fonteTitulo,
                  fontSize: 30,
                  letterSpacing: 0.5,
                  color: corPercentual,
                  fontVariantNumeric: 'tabular-nums',
                  textShadow: brilhaConfianca ? `0 0 18px ${corGrau}73` : undefined,
                }}
              >
                {/* Número puro: "Probabilidade: 92%" ❌ · "Confiança: 92" ✅
                    (docs/04-design-system.md, artboard da identidade 04). */}
                {props.confianca === null ? '—' : Math.round(props.confianca)}
              </span>
            )}
          </div>
        </div>

        {/* zona 2 · contexto — barrinhas no pré-live, barra rumo ao alvo no fire */}
        {quente && p && (
          <div style={{ padding: '0 14px 12px' }}>
            <BarraAlvo
              observado={p.observado}
              alvo={p.alvo}
              unidade={ATRIBUTO_CURTO[props.atributo].toLowerCase()}
              // O marco do modo fire veste a cor DELE (a mesma do selo 🔥); o
              // alvo, a barra desenha sozinha em texto cheio.
              marcos={props.alvoFire ? [{ ...props.alvoFire, cor: MODO_FIRE.cor }] : undefined}
              // Os três estados chegam inteiros à barra: valor, "não veio"
              // (`null`) e "não sei" (ausente) são coisas diferentes na tela.
              apitouEm={
                props.apitouEm == null
                  ? props.apitouEm
                  : { valor: props.apitouEm, rotulo: 'apitou aqui' }
              }
            />
          </div>
        )}
        {barrinhas && (
          <div style={{ padding: '0 14px 10px' }}>
            {/* A fileira sai na ORDEM EM QUE CHEGA: quem a monta decide a
                direção — a Lista passa a ordem canônica da entrega; os
                Resultados montam a cronológica, com o jogo da rodada no fim
                (artboard). O card não inverte: inverter aqui mudaria todo
                chamador, inclusive a galeria congelada. */}
            <Barrinhas
              jogos={props.ultimos5!}
              rotulo="ÚLT. 5 NA LINHA"
              destacarUltima={props.destacarUltima ?? false}
            />
          </div>
        )}
        {textoDaLente && (
          <div
            style={{
              display: 'flex',
              alignItems: 'baseline',
              gap: 8,
              padding: '0 14px 10px',
              fontFamily: semantico.fonteRotulo,
              textTransform: 'uppercase',
            }}
          >
            <span
              style={{
                fontSize: 10,
                letterSpacing: 1,
                fontWeight: 600,
                color: semantico.textoSecundario,
              }}
            >
              {textoDaLente.rotulo}
            </span>
            <span
              style={{
                fontSize: 13,
                letterSpacing: 1,
                fontWeight: 700,
                color: semantico.texto100,
                fontVariantNumeric: 'tabular-nums',
              }}
            >
              {textoDaLente.valor}
            </span>
          </div>
        )}

        {props.narrativa ? (
          <p
            style={{
              margin: '0 14px 10px',
              fontSize: 12.5,
              lineHeight: 1.5,
              color: semantico.textoSecundario,
              fontStyle: 'italic',
            }}
          >
            {props.narrativa}
          </p>
        ) : null}

        {/* zona 3 · rodapé — faixa translúcida na temperatura do contexto */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: 12,
            padding: '8px 14px',
            background: contexto.faixaFundo,
            borderTop: `1px solid ${contexto.borda}`,
            fontFamily: semantico.fonteRotulo,
            letterSpacing: 1.2,
            textTransform: 'uppercase',
          }}
        >
          {abas ? (
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {abas.map((aba) => (
                <Link
                  key={aba.atributo}
                  href={aba.href}
                  aria-current={aba.ativo ? 'true' : undefined}
                  style={{
                    padding: '3px 9px',
                    borderRadius: componente.abaAtributo.raio,
                    fontSize: 12,
                    fontWeight: 600,
                    letterSpacing: 1,
                    textDecoration: 'none',
                    whiteSpace: 'nowrap',
                    fontVariantNumeric: 'tabular-nums',
                    // Acima da cobertura do card: a aba troca o atributo,
                    // não abre a análise.
                    position: 'relative',
                    zIndex: 1,
                    color: aba.ativo
                      ? componente.abaAtributo.textoAtiva
                      : componente.abaAtributo.textoInativa,
                    border: `1px solid ${aba.ativo ? corDaAba.borda : componente.abaAtributo.bordaInativa}`,
                    background: aba.ativo ? corDaAba.fundo : 'transparent',
                  }}
                >
                  {/* Sem linha, só o atributo: "REB 0+" seria número inventado,
                      e esconder a aba apagaria o apito da tela inteira. */}
                  {aba.linha === null
                    ? ATRIBUTO_CURTO[aba.atributo]
                    : `${ATRIBUTO_CURTO[aba.atributo]} ${aba.linha}+`}
                </Link>
              ))}
            </div>
          ) : (
            <span
              style={{
                fontSize: 13,
                fontWeight: 600,
                color: componente.cardTexto,
                fontVariantNumeric: 'tabular-nums',
              }}
            >
              {rotuloLinha}
            </span>
          )}
          {veredito ? (
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                fontSize: 14,
                fontWeight: 700,
                letterSpacing: 0.8,
                color: veredito.cor,
                fontVariantNumeric: 'tabular-nums',
                whiteSpace: 'nowrap',
              }}
            >
              {veredito.icone && <IconeVeredito tipo={veredito.icone} cor={veredito.cor} />}
              {veredito.texto}
            </span>
          ) : (
            rodapeDireita && (
              <span
                style={{
                  fontSize: 12,
                  color: componente.cardTextoApoio,
                  // O "FALTA n" muda a cada refresh de 30 s: dígito de largura
                  // fixa impede o rodapé de pular (artboard, `body`).
                  fontVariantNumeric: 'tabular-nums',
                }}
              >
                {rodapeDireita}
              </span>
            )
          )}
        </div>
      </article>
      {props.detalheHref && (
        <Link
          href={props.detalheHref}
          aria-label={`Análise do apito de ${props.nome}`}
          style={{ position: 'absolute', inset: 0, borderRadius: componente.cardRaio }}
        />
      )}
    </div>
  )
}

/**
 * O que a zona 2 escreve em cada lente que não é ULT5. Sem dado, "—": a
 * lente mostra o que a entrega materializou, nunca calcula nem inventa.
 */
function lenteEmTexto(
  lente: Exclude<Lente, 'ULT5'>,
  props: Pick<
    CardEntradaProps,
    'mediaTemporada' | 'linha' | 'oddFaixa' | 'hierarquia' | 'atributo'
  >,
): { rotulo: string; valor: string } {
  switch (lente) {
    case 'MEDIA_LINHA': {
      const media = props.mediaTemporada != null ? decimalPtBr(props.mediaTemporada, 1) : '—'
      const linha = props.linha != null ? `${props.linha}+` : '—'
      return { rotulo: 'MÉDIA × LINHA', valor: `${media} × ${linha}` }
    }
    case 'ODDS': {
      const o = props.oddFaixa
      if (!o) return { rotulo: 'ODD', valor: '—' }
      const casas = `${o.qtdCasas} ${o.qtdCasas === 1 ? 'CASA' : 'CASAS'}`
      return {
        rotulo: 'ODD',
        valor: `${decimalPtBr(o.min, 2)}–${decimalPtBr(o.max, 2)} · ${casas}`,
      }
    }
    case 'HIERARQUIA': {
      const h = props.hierarquia
      if (!h) return { rotulo: 'HIERARQUIA', valor: '—' }
      return {
        rotulo: 'HIERARQUIA',
        valor: `Nº ${h.posicao} DE ${h.total} · ${ATRIBUTO_CURTO[props.atributo]}`,
      }
    }
  }
}

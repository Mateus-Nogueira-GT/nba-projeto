import { semantico as s } from './semantico'

/**
 * CAMADA 3 · COMPONENTE — aplicação específica.
 *
 * Só referencia SEMÂNTICO. Nunca primitivo.
 */
export const componente = {
  cardFundo: s.superficie,
  cardTexto: s.textoPrimario,
  cardTextoApoio: s.textoSecundario,
  cardDivisor: s.divisor,
  cardBordaLargura: '2px',

  anelTexto: s.textoSobreCor,
  anelDiametro: '56px',
  anelEspessura: '4px',

  marcadorOpdFundo: s.superficieElevada,
  marcadorOpdTexto: s.textoSecundario,

  oddTexto: s.textoSecundario,

  pilulaBordaLargura: '1.5px',
  // Identidade 06: o anel engrossou. Com a moldura inteira do card vestindo o
  // metálico, o canal do APITO precisa de peso próprio para não virar detalhe.
  avatarAnelEspessura: '3px',
  // A faixa metálica saiu do CARD na identidade 06 (virou a moldura), mas segue
  // viva na HIERARQUIA DO TIME, onde ela marca o nível de cada jogador da lista
  // do CJ e não tem moldura para vestir.
  faixaNivelAltura: '3px',

  // -- Identidade 05 · o botão primário do manual ---------------------------
  // CHAPADO, não mais em degradê: o manual pede azul sólido, texto branco,
  // 48 px de altura mínima e um hover mais claro. O degradê laranja da
  // identidade 02 saiu junto com o laranja de interface.
  ctaFundo: s.acento,
  ctaFundoHover: s.acentoClaro,
  ctaTexto: s.textoSobreAcento,
  ctaAltura: '48px',
  /** Canto de controle (botão, campo, chip). O manual pede 8 px. */
  raioControle: '8px',
  /**
   * O anel de foco, num token só. Ele é BRANCO em todo o app: o acento é o
   * azul do manual, que tem o matiz do turbo, e um foco azul acenderia um
   * sinal de apito em volta de um campo de texto.
   */
  foco: `2px solid ${s.focoAnel}`,
  /**
   * A pílula das duas barras de navegação (topo e inferior). A ativa é
   * PREENCHIDA no acento com texto branco — o estado do StatsHub e a única
   * forma que o azul do manual pode ter. A inativa não tem fundo; o hover
   * ganha a superfície elevada, não uma cor.
   */
  pilulaNav: {
    fundoAtiva: s.acento,
    textoAtiva: s.textoSobreAcento,
    textoInativa: s.textoSecundario,
    fundoHover: s.superficieElevada,
    raio: '999px',
  },
  /**
   * A MOLDURA em três regiões (identidade 05). As medidas em px vivem aqui; os
   * pontos de QUEBRA vivem no semântico, porque o CSS precisa repeti-los numa
   * media query e um teste compara os dois.
   */
  moldura: {
    alturaTopo: '64px',
    larguraLateral: '320px',
    /** Conteúdo (1040) + lateral (320) + o vão entre eles (32). */
    larguraComLateral: '1392px',
    respiroCelular: '16px',
    respiroDesktop: '24px',
  },

  // -- Identidade 03 · broadcast -------------------------------------------
  // Fim do fundo chapado: a tela inteira respira num gradiente sutil.
  fundoTela: `linear-gradient(175deg, ${s.fundo} 60%, ${s.fundoTelaFim})`,
  // Temperatura por contexto — a regra central da identidade. Pré-live é
  // FRIO (análise); o Fire Live esquenta (urgência). Cada tela declara um
  // dos dois; o teste transversal garante que nenhuma tela pré-live usa o
  // universo quente.
  contextoFrio: {
    cardGradiente: `linear-gradient(135deg, ${s.superficieFria1}, ${s.superficieFria2} 55%)`,
    faixaFundo: s.veuFrio,
    borda: s.divisor,
  },
  contextoQuente: {
    cardGradiente: `linear-gradient(135deg, ${s.superficieQuente1}, ${s.superficieQuente2} 55%)`,
    faixaFundo: s.veuQuente,
    borda: s.bordaQuente,
    destaque: s.acento,
    brilho: `0 0 24px ${s.veuFire}`,
  },
  // Três brilhos, três donos (nunca se confundem):
  //   confiança grau 5 → pílula/% (já existente no CardEntrada)
  //   turbo            → card do turbo
  //   modo fire        → card quente do Fire Live (contextoQuente.brilho)
  turboBrilho: `0 0 22px ${s.veuTurbo}`,
  // Borda lateral esquerda do card. Era 3 px na cor do grau de confiança; na
  // identidade 06 virou 6 px na cor do metálico do NÍVEL DO JOGADOR.
  cardBordaLateral: '6px',
  // 12 px: o canto de CARTÃO do manual (controle é 8, em `raioControle`).
  cardRaio: '12px',
  // Barra rumo ao alvo (Fire Live)
  barraAlvoFundo: s.superficieQuente1,
  barraAlvoPreenchido: `linear-gradient(90deg, ${s.acento}, ${s.acentoClaro})`,

  // Nota da partida — as 5 faixas como {fundo, texto}, na ordem da maior
  // nota para a menor. NotaPartida.tsx é dono do `minimo` de cada faixa (não
  // é cor, é regra de apresentação da UI, fica no componente de React).
  notaFaixaExcepcional: { fundo: s.notaExcepcionalFundo, texto: s.notaExcepcionalTexto },
  notaFaixaOtima: { fundo: s.notaOtimaFundo, texto: s.notaOtimaTexto },
  notaFaixaBoa: { fundo: s.notaBoaFundo, texto: s.notaBoaTexto },
  notaFaixaMediana: { fundo: s.notaMedianaFundo, texto: s.notaMedianaTexto },
  notaFaixaFraca: { fundo: s.notaFracaFundo, texto: s.notaFracaTexto },

  // -- Identidade 04 · varredura e análise ---------------------------------
  // Selo de contexto no canto do cabeçalho — PRÉ-LIVE laranja, ■ AO VIVO
  // vermelho. Pendência anotada desde a 03; aqui vira token para os dois
  // universos vestirem o mesmo componente.
  seloContexto: {
    preLive: { fundo: s.acento, texto: s.textoSobreAcento },
    aoVivo: { fundo: s.vivoSelo, texto: s.textoSobreAcento },
  },
  // Cabeçalho de jogo — a ÚNICA fronteira de seção da Lista e do Fire Live.
  // Veste o gradiente do universo da tela; o de dentro é sigla forte, nada de
  // escudo.
  cabecalhoJogo: {
    fundoFrio: `linear-gradient(135deg, ${s.superficieFria1}, ${s.superficieFria2} 55%)`,
    fundoQuente: `linear-gradient(135deg, ${s.superficieQuente1}, ${s.superficieQuente2} 55%)`,
    bordaFria: s.divisor,
    bordaQuente: s.bordaQuente,
  },
  // Badge de status do ciclo do card (PRÉ · 1º Q · FIM 1º Q · FT · —). A
  // largura é FIXA para o card não pular a cada refresh de 30 s — e é isso, não
  // uma animação, que faz o ao vivo parecer estável.
  statusCiclo: {
    largura: '60px',
    fundoAoVivo: s.aoVivoTinta,
    bordaAoVivo: s.aoVivoBorda,
    textoAoVivo: s.aoVivoSolido,
    fundoNeutro: s.superficieElevada,
    bordaNeutra: s.divisor,
    textoNeutro: s.texto55,
  },
  // Abas de atributo no rodapé do card — um jogador com dois ou três
  // atributos vira UM card, e as abas trocam o mercado sem repetir o card.
  abaAtributo: {
    /**
     * A aba ATIVA veste a cor do nível do apito DAQUELE card. O artboard a
     * desenha verde porque o card desenhado é N3; fixar o verde faria um card
     * N1 exibir o sinal de N3 no rodapé — um quarto canal de cor dizendo o que
     * o anel já diz, e dizendo errado.
     */
    ativaPorNivel: {
      1: { borda: s.apitoNivel1, fundo: s.apitoNivel1Tinta },
      2: { borda: s.apitoNivel2, fundo: s.apitoNivel2Tinta },
      3: { borda: s.apitoNivel3, fundo: s.apitoNivel3Tinta },
    },
    ativaTurbo: { borda: s.apitoTurbo, fundo: s.apitoTurboTinta },
    /**
     * Par NEUTRO, para o seletor que não pertence a um apito — o de atributo
     * na tela do time, por exemplo. Sem nível para vestir, ele usa o azul de
     * UI dos outros seletores de tela, e não empresta a cor de um nível que
     * não existe ali. PREENCHIDO (identidade 05): o azul não vira contorno.
     */
    ativaNeutra: { borda: s.acento, fundo: s.acento },
    textoAtiva: s.texto100,
    bordaInativa: s.divisor,
    textoInativa: s.textoSecundario,
    raio: '6px',
  },
  // -- Identidade 06 · a moldura veste o nível do jogador -------------------
  /**
   * A MOLDURA do card, por nível do jogador. Mesmo molde de
   * `abaAtributo.ativaPorNivel`: o componente consulta o mapa, nunca decide a
   * cor com um `if`.
   *
   * O Randola tem BORDA própria — o branco a 55%, não o cheio — pela razão
   * escrita em `semantico.nivelRandolaBorda`: branco cheio na moldura
   * inverteria a ordem de peso visual dos quatro níveis.
   */
  molduraNivel: {
    MVP: { borda: s.nivelMvp, veu: s.nivelMvpVeu },
    ALL_STAR: { borda: s.nivelAllStar, veu: s.nivelAllStarVeu },
    SUPORTE: { borda: s.nivelSuporte, veu: s.nivelSuporteVeu },
    RANDOLA: { borda: s.nivelRandolaBorda, veu: s.nivelRandolaVeu },
  },
  /** O rótulo do nível em Bebas — o tamanho que o feedback 02 pediu. */
  nivelRotuloTamanho: '20px',
  /**
   * A ODD no canto do card: o elemento de maior destaque, no lugar que era da
   * nota de confiança. `valorFaixa` é menor porque "1,47–1,62" tem o dobro de
   * caracteres de "1,55" e precisa caber a 320 px.
   */
  // 12 px no rótulo é o PISO do manual, não escolha de composição: um teste
  // varre a Lista renderizada atrás de qualquer texto abaixo disso. A
  // hierarquia vem da diferença (12 × 38), não de encolher o rótulo.
  odd: { rotulo: '12px', valorMedia: '38px', valorFaixa: '26px' },
  /**
   * A META do rodapé: o número maior que o rótulo que o nomeia ("REBOTES" 11,
   * "4+" 24). `aba*` é a mesma proporção dentro da aba de atributo.
   */
  meta: { rotulo: '12px', valor: '24px', abaRotulo: '12px', abaValor: '15px' },

  // Veredito do card CONFERIDO: "fez N" na cor das barrinhas — bateu, falhou —
  // e o neutro do DNP em texto40. Quem não jogou não ganha ✓ nem ✗.
  conferido: {
    bateu: s.barrinhaBateu,
    // Texto sobre fundo escuro exige o vermelho claro; barrinhaFalhou é FUNDO.
    falhou: s.alerta,
    neutro: s.texto40,
  },
} as const

export type Componente = typeof componente
